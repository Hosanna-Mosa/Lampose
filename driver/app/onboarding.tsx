/* ══════════════════════════════════════════════════════════════════════════
   Partner sign-up. Five steps, and every one of them writes to the server.

   This screen used to render a table of example values — "Arjun Kumar",
   "AP 05 CJ 4471" — as `<Text>`, and its last button set
   `hasCompletedOnboarding: true` against an account that had told the server
   nothing. A rider could walk the whole flow and arrive at a pending account
   with no name, no vehicle and no documents, which an administrator then had
   nothing to approve. That is what this rewrite fixes.

   ## Each step saves before it advances

   `Continue` is a PATCH, and the next step is drawn from the response. This
   costs one round trip per step and buys the thing a five-step form on a phone
   most needs: a rider whose battery dies at the documents step comes back to a
   form with their name, date of birth and vehicle already in it. The server
   accepts every field independently for exactly this reason.

   A save that fails leaves the rider on the step with the button live and the
   server's sentence underneath. Nothing advances on a failed write, because a
   step that advanced optimistically is a rider who reaches the end and is told
   the form is incomplete without being told which part of it did not save.

   ## What this screen may NOT decide

   Approval. `PATCH /me` will not accept `hasCompletedOnboarding` unless the
   server agrees the form is finished, and no route the rider holds can move
   `status` off `pending` or a document off `pending`. So the last step here is
   a submission, never a verdict — the verdict arrives from the admin console
   and this screen shows whatever the server currently says about it.

   ## The document step is the reason the flow exists

   Three documents are required — licence, RC, Aadhaar — and each is a
   photograph plus a number, uploaded one at a time and submitted one at a
   time. A rejected document comes back here with the approver's sentence
   attached, and resubmitting is the same control that submitted it: there is
   no separate "fix" path, because a rejection is not a different kind of
   upload.
   ══════════════════════════════════════════════════════════════════════════ */
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Btn,
  ChoiceField,
  Chip,
  DateField,
  Icon,
  Input,
  LocateButton,
  Notice,
  PhotoSlot,
  Rule,
  StepBars,
  Text,
  TopBar,
  type Choice,
} from "@/components/ui";
import {
  useDriverStore,
  type DocumentKind,
  type DriverDocument,
  type OnboardingStep,
  type Vehicle,
} from "@/store/driverStore";
import {
  DUMMY_DATA_ENABLED,
  DUMMY_DOCUMENTS,
  DUMMY_PAYOUT,
  DUMMY_PERSONAL,
  DUMMY_VEHICLE,
} from "@/constants/dummyPartner";
import { LocationRefused, locateMe } from "@/services/locateMe";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

/* ── The flow ─────────────────────────────────────────────────────────────── */

/** The welcome panel is not a step; it carries no bar and no counter. */
type Screen = "welcome" | OnboardingStep;

const STEPS: OnboardingStep[] = ["personal", "vehicle", "documents", "bank", "done"];
/** `done` is the outcome, not a step somebody fills in. */
const TOTAL_STEPS = 4;

const STEP_TITLE: Record<OnboardingStep, string> = {
  personal: "Your details",
  vehicle: "Your vehicle",
  documents: "Your documents",
  bank: "Where should we pay you?",
  done: "That is everything",
};

const VEHICLE_TYPES: Choice<NonNullable<Vehicle["type"]>>[] = [
  { value: "bike", label: "Motorcycle" },
  { value: "scooter", label: "Scooter" },
  { value: "cycle", label: "Bicycle" },
  { value: "auto", label: "Auto" },
];

const ACCOUNT_TYPES: Choice<"savings" | "current">[] = [
  { value: "savings", label: "Savings" },
  { value: "current", label: "Current" },
];

/** Which documents this step asks for, and what to say about each. */
const DOC_HINTS: Record<DocumentKind, string> = {
  licence: "Both sides, with the number and the expiry readable.",
  rc: "The RC book or card for the vehicle above.",
  aadhaar: "Any government photo ID works — Aadhaar, voter ID or passport.",
  pan: "Needed before we can pay you above ₹20,000 in a year.",
  insurance: "Third-party cover is enough. You can add this later.",
};

const DOC_TONE = {
  verified: "success",
  pending: "warning",
  rejected: "danger",
  missing: "muted",
} as const;

const DOC_STATUS_LABEL = {
  verified: "Verified",
  pending: "Under review",
  rejected: "Needs a new photo",
  missing: "Not sent",
} as const;

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();

  const token = useDriverStore((s) => s.token);
  const profile = useDriverStore((s) => s.profile);
  const updateProfile = useDriverStore((s) => s.updateProfile);
  const uploadImage = useDriverStore((s) => s.uploadImage);
  const submitDocument = useDriverStore((s) => s.submitDocument);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  /*
    Where the flow opens.

    A signed-out rider sees the welcome panel, whose button sends them to the
    real sign-in. A signed-in one resumes at the step the SERVER last recorded
    — `onboardingStep` is written by each save, so this is where they actually
    stopped rather than where this component happens to mount.
  */
  const [screen, setScreen] = useState<Screen>(() => {
    if (!token) return "welcome";
    return profile?.onboarding?.step ?? "personal";
  });

  /*
    …and moved off the welcome panel the moment a session appears.

    The initialiser above runs ONCE, and the persisted store hydrates from
    AsyncStorage asynchronously — so this screen can mount with `token` still
    null and pin itself to `welcome` for a rider who is in fact signed in.
    That is precisely how a rider ended up looking at "Create partner account"
    over a banner saying their documents were under review, with the two
    buttons leading back to a sign-in they had already done.
  */
  useEffect(() => {
    if (token && screen === "welcome") setScreen(profile?.onboarding?.step ?? "personal");
  }, [token, screen, profile]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* ── The draft ────────────────────────────────────────────────────────────
     Local, and seeded from the profile once. Typing straight into the store
     would mean a keystroke re-rendering the tab bar and the offer banner, and
     would make "what has been saved" and "what has been typed" the same
     value — which is exactly the distinction a form that saves per step
     needs to keep. */
  const [name, setName] = useState("");
  const [dob, setDob] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  /* Where the rider lives. Collected on the personal step rather than as a
     fifth screen: sign-up is already four steps and a rider who abandons does
     it at the step after the one they are on. */
  const [line1, setLine1] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");
  /* The pin, held apart from the words. A fix always yields coordinates;
     reverse geocoding is the half that can name nothing, and an address with
     a pin and no street still tells a rider's map where to go. */
  const [pin, setPin] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [photoUrl, setPhotoUrl] = useState("");

  const [vehicleType, setVehicleType] = useState<Vehicle["type"] | null>(null);
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");

  const [holder, setHolder] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upi, setUpi] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "current">("savings");

  const [uploading, setUploading] = useState<string>("");

  /* Seeded from whatever is already on file, and re-seeded whenever the
     server's copy changes underneath — a document decision arriving while the
     rider is on the bank step must not blank the boxes they are typing in, so
     this only ever fills fields the draft has not touched. */
  useEffect(() => {
    if (!profile) return;
    setName((v) => v || profile.name || "");
    setDob((v) => v || (profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : null));
    setCity((v) => v || profile.city || "");
    setEmail((v) => v || profile.email || "");
    setLine1((v) => v || profile.address?.line1 || "");
    setLandmark((v) => v || profile.address?.landmark || "");
    setPincode((v) => v || profile.address?.pincode || "");
    setPhotoUrl((v) => v || profile.profilePhotoUrl || "");
    setVehicleType((v) => v || profile.vehicle?.type || null);
    setPlate((v) => v || profile.vehicle?.plate || "");
    setModel((v) => v || profile.vehicle?.model || "");
    setHolder((v) => v || profile.payout?.accountHolderName || "");
    setIfsc((v) => v || profile.payout?.ifscCode || "");
    setUpi((v) => v || profile.payout?.upiId || "");
    setAccountType((v) => profile.payout?.accountType || v);
  }, [profile]);

  const documents = profile?.documents ?? [];
  const stepIndex = screen === "welcome" ? -1 : STEPS.indexOf(screen);

  /* ── Saving ──────────────────────────────────────────────────────────────
     One helper, because every step does the same three things: clear the
     errors, PATCH, and advance only if the server took it. */
  const save = async (patch: Parameters<typeof updateProfile>[0], next: Screen) => {
    setError("");
    setSaving(true);
    try {
      await updateProfile(patch);
      setScreen(next);
    } catch (err) {
      setError(readError(err, "That did not save. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  /* ── Per-step validation ─────────────────────────────────────────────────
     Only the things this screen can know are wrong — a blank box, a plate of
     four characters. Everything else (the IFSC shape, the age floor, whether
     the form is finished) is the server's answer, shown in the server's
     words, because a second copy of those rules here is a copy that drifts. */
  const useMyLocation = async () => {
    setError("");
    setLocating(true);
    try {
      const found = await locateMe();
      setPin(found.location);
      /* Only fills a box that is still empty. A rider who has typed their door
         number does not want it replaced by the road the phone is on. */
      const fill = (current: string, next: string) => (current.trim() ? current : next);
      setLine1((v) => fill(v, found.fields.line1));
      setLandmark((v) => fill(v, found.fields.landmark));
      setCity((v) => fill(v, found.fields.city));
      setPincode((v) => fill(v, found.fields.pincode));
      if (found.namedNothing) {
        setError("We saved the pin but could not name this spot — type the address.");
      }
    } catch (err) {
      setError(
        err instanceof LocationRefused
          ? err.message
          : readError(err, "We could not get your location."),
      );
    } finally {
      setLocating(false);
    }
  };

  const continuePersonal = () => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 3) errors.name = "Enter your full name, as printed on your licence.";
    if (!dob) errors.dob = "Enter your date of birth as DD / MM / YYYY.";
    if (!city.trim()) errors.city = "Which city do you ride in?";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    save(
      {
        name: name.trim(),
        dateOfBirth: dob!,
        city: city.trim(),
        email: email.trim(),
        /* Sent only when there is something to send. An empty object would
           still create an address row with a blank first line, which the
           server refuses — and refusing a rider's Continue over a field they
           deliberately left alone would be the form fighting them. */
        ...(line1.trim()
          ? {
              address: {
                kind: "home" as const,
                line1: line1.trim(),
                landmark: landmark.trim(),
                city: city.trim(),
                pincode: pincode.trim(),
                /* Omitted when the crosshair was not used, so a later edit
                   cannot silently drop a pin captured earlier. */
                ...(pin ? { location: pin } : null),
              },
            }
          : null),
        ...(photoUrl ? { profilePhotoUrl: photoUrl } : null),
        onboardingStep: "vehicle",
      },
      "vehicle",
    );
  };

  const continueVehicle = () => {
    const errors: Record<string, string> = {};
    if (!vehicleType) errors.vehicleType = "Pick what you ride.";
    /* A bicycle has no plate, and the server's completeness rule agrees —
       demanding one here would stop a bicycle rider at a step they cannot
       finish. */
    if (vehicleType !== "cycle" && plate.replace(/[\s-]/g, "").length < 6) {
      errors.plate = "Enter the registration number, like AP05CJ4471.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    save(
      {
        vehicle: {
          type: vehicleType!,
          plate: plate.replace(/[\s-]/g, "").toUpperCase(),
          model: model.trim(),
        },
        onboardingStep: "documents",
      },
      "documents",
    );
  };

  const continueDocuments = () => {
    const required = documents.filter((doc) => doc.required);
    const outstanding = required.filter((doc) => doc.status === "missing");
    if (outstanding.length) {
      setError(`Still to send: ${outstanding.map((d) => d.label).join(", ")}.`);
      return;
    }
    setError("");
    save({ onboardingStep: "bank" }, "bank");
  };

  /* ── "Fill with dummy data" ──────────────────────────────────────────────
     Each one writes the draft AND saves in the same call, passing the values
     straight to `save` rather than reading them back off state — a `setState`
     is not visible to the line after it, so filling and then calling the
     step's own Continue would PATCH the previous, empty values.

     The three real fields are never invented (see `dummyPartner.ts`), so each
     of these refuses if the one it needs is still blank, and points at it. */

  const fillPersonal = () => {
    /* The two real fields this step owns. Refused rather than filled: a date
       of birth is checked against the ID an approver reads, and an email
       address is where a payout statement goes. Both are collected once, by
       the person who actually owns them. */
    const missing: Record<string, string> = {};
    if (!dob) missing.dob = "Enter your real date of birth first — this one is not dummied.";
    if (!email.trim()) missing.email = "Enter your real email first — this one is not dummied.";
    if (Object.keys(missing).length) {
      setFieldErrors(missing);
      return;
    }
    setFieldErrors({});
    setName(DUMMY_PERSONAL.name);
    setCity(DUMMY_PERSONAL.city);
    setLine1(DUMMY_PERSONAL.address.line1);
    setLandmark(DUMMY_PERSONAL.address.landmark);
    setPincode(DUMMY_PERSONAL.address.pincode);
    const photo = photoUrl || DUMMY_PERSONAL.profilePhotoUrl;
    setPhotoUrl(photo);

    save(
      {
        name: DUMMY_PERSONAL.name,
        /* Non-null by the guard above — the whole point of this button is that
           it refuses rather than inventing one. */
        dateOfBirth: dob!,
        email: email.trim(),
        city: DUMMY_PERSONAL.city,
        address: { ...DUMMY_PERSONAL.address },
        profilePhotoUrl: photo,
        onboardingStep: "vehicle",
      },
      "vehicle",
    );
  };

  const fillVehicle = () => {
    setFieldErrors({});
    setVehicleType(DUMMY_VEHICLE.type);
    setPlate(DUMMY_VEHICLE.plate);
    setModel(DUMMY_VEHICLE.model);

    save({ vehicle: { ...DUMMY_VEHICLE }, onboardingStep: "documents" }, "documents");
  };

  /**
   * Submit the three required documents, then move on.
   *
   * Sequential rather than `Promise.all`: each call saves the whole rider
   * document, and three overlapping writes to one row is a lost update — the
   * last response would carry only the document it happened to add. Three
   * round trips is the correct cost of three separate submissions.
   */
  const fillDocuments = async () => {
    setError("");
    setSaving(true);
    try {
      for (const doc of DUMMY_DOCUMENTS) {
        setUploading(`${doc.kind}:front`);
        await submitDocument(doc);
      }
      await updateProfile({ onboardingStep: "bank" });
      setScreen("bank");
    } catch (err) {
      setError(readError(err, "We could not attach those. Please try again."));
    } finally {
      setUploading("");
      setSaving(false);
    }
  };

  const fillBank = () => {
    setFieldErrors({});
    setHolder(DUMMY_PAYOUT.accountHolderName);
    setAccount(DUMMY_PAYOUT.bankAccountNumber);
    setIfsc(DUMMY_PAYOUT.ifscCode);
    setUpi(DUMMY_PAYOUT.upiId);
    setAccountType(DUMMY_PAYOUT.accountType);

    save({ payout: { ...DUMMY_PAYOUT }, onboardingStep: "done" }, "done");
  };

  const continueBank = () => {
    const errors: Record<string, string> = {};
    const hasBank = !!account.trim() || !!profile?.payout?.accountLast4;
    if (!hasBank && !upi.trim()) {
      errors.account = "Add a bank account or a UPI id — either one is enough.";
    }
    if (account.trim()) {
      if (!holder.trim()) errors.holder = "Whose account is it?";
      if (!ifsc.trim()) errors.ifsc = "The IFSC code is on your cheque book and passbook.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    save(
      {
        payout: {
          ...(holder.trim() ? { accountHolderName: holder.trim() } : null),
          ...(account.trim() ? { bankAccountNumber: account.replace(/\s/g, "") } : null),
          ...(ifsc.trim() ? { ifscCode: ifsc.trim().toUpperCase() } : null),
          ...(upi.trim() ? { upiId: upi.trim() } : null),
          accountType,
        },
        onboardingStep: "done",
      },
      "done",
    );
  };

  /**
   * The last button. Asks the server to mark the form finished.
   *
   * It may say no — `PATCH /me` re-derives completeness rather than trusting
   * this screen — and when it does, its sentence names exactly what is left.
   * That refusal is shown here rather than paraphrased, because it is the one
   * message that tells a rider which step to go back to.
   */
  const finish = async () => {
    setError("");
    setSaving(true);
    try {
      await updateProfile({ hasCompletedOnboarding: true, onboardingStep: "done" });
      /* The root layout gates the tabs on `hasCompletedOnboarding`, so the
         redirect is that flag changing rather than a push from here. */
    } catch (err) {
      setError(readError(err, "We could not submit that. Please check the earlier steps."));
    } finally {
      setSaving(false);
    }
  };

  /* ── Photographs ─────────────────────────────────────────────────────────*/

  const pickImage = async (): Promise<{ uri: string; base64: string } | null> => {
    /* Asked at the moment it is needed, not at launch. A rider who has not
       yet seen why the app wants their camera roll is a rider who refuses. */
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("We need access to your photos to attach a document.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      /* Compressed before it leaves the phone. A modern handset's full-size
         photograph is several megabytes of detail nobody reading a licence
         number needs, and on a mobile connection it is the difference between
         an upload that finishes and one a rider gives up on. */
      quality: 0.6,
      allowsEditing: false,
      /* The bytes, here, rather than a URI the store would have to read back
         through `fetch` and a `FileReader` — two APIs that behave differently
         across Expo Go, a dev build and web. */
      base64: true,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.base64) return null;
    return { uri: asset.uri, base64: asset.base64 };
  };

  const attachPhoto = async (kind: DocumentKind | "profile", side: "front" | "back") => {
    const slot = `${kind}:${side}`;
    setError("");
    const picked = await pickImage();
    if (!picked) return;

    setUploading(slot);
    try {
      const url = await uploadImage(kind, picked.base64);
      if (kind === "profile") {
        setPhotoUrl(url);
        return;
      }
      /* Submitted the moment it uploads, rather than held until the rider
         presses something else. A document sitting in local state is a
         document lost when the app is killed, and the whole point of the
         per-step save is that nothing a rider has done goes missing. */
      const existing = documents.find((doc) => doc.kind === kind);
      await submitDocument({
        kind,
        number: existing?.number || "",
        frontUrl: side === "front" ? url : existing?.frontUrl || "",
        backUrl: side === "back" ? url : existing?.backUrl || "",
      });
    } catch (err) {
      setError(readError(err, "That photo did not upload. Please try again."));
    } finally {
      setUploading("");
    }
  };

  const saveDocumentNumber = async (kind: DocumentKind, value: string) => {
    const existing = documents.find((doc) => doc.kind === kind);
    if (!existing || !existing.frontUrl) return;
    if (value.trim().toUpperCase() === existing.number) return;
    try {
      await submitDocument({ kind, number: value.trim(), frontUrl: existing.frontUrl });
    } catch (err) {
      setError(readError(err, "We could not save that number."));
    }
  };

  /* ── Chrome ──────────────────────────────────────────────────────────────*/

  const verdict = useMemo(() => {
    if (!profile) return null;
    if (profile.status === "rejected" || profile.status === "suspended") {
      return { tone: "danger" as const, text: profile.blockedReason };
    }
    const rejected = documents.filter((doc) => doc.status === "rejected");
    if (rejected.length) {
      return {
        tone: "danger" as const,
        text: `${rejected.map((d) => d.label).join(" and ")} needs a new photo. Tap it below to see why.`,
      };
    }
    return null;
  }, [profile, documents]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {stepIndex >= 0 && screen !== "done" && (
        <>
          <TopBar
            title={`Step ${stepIndex + 1} of ${TOTAL_STEPS}`}
            back={stepIndex > 0 ? "Back" : null}
            onBack={stepIndex > 0 ? () => setScreen(STEPS[stepIndex - 1]) : undefined}
          />
          <View style={styles.progressRail}>
            <StepBars total={TOTAL_STEPS} current={stepIndex} height={4} />
          </View>
        </>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: stepIndex >= 0 && screen !== "done" ? space[5] : insets.top + space[6] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {screen === "welcome" && <Welcome />}

        {screen !== "welcome" && (
          <Text variant="display1">{STEP_TITLE[screen]}</Text>
        )}

        {/* ── 1. Personal ──────────────────────────────────────────────── */}
        {screen === "personal" && (
          <>
            <Text variant="bodyLg" color="secondary" style={styles.blurb}>
              This has to match your government ID exactly, or verification will fail.
            </Text>

            <View style={styles.fields}>
              <Input
                label="Full name"
                value={name}
                onChangeText={setName}
                error={fieldErrors.name}
                placeholder="As printed on your licence"
                autoCapitalize="words"
                maxLength={60}
              />
              <DateField
                label="Date of birth"
                value={dob}
                onChange={setDob}
                error={fieldErrors.dob}
                hint="You must be 18 or over to ride for Lampose."
              />
              <Input
                label="City"
                value={city}
                onChangeText={setCity}
                error={fieldErrors.city}
                placeholder="Rajahmundry"
                autoCapitalize="words"
                maxLength={40}
              />
              {/* Above the address fields rather than beside one of them: it
                  fills several. */}
              <LocateButton busy={locating} onPress={useMyLocation} />

              {/* Read by an approver beside the Aadhaar — a name and address
                  that do not match the ID is a common refusal. Not required by
                  the server's completeness rule, so a rider who skips it is
                  not blocked; it is asked here because this is the one screen
                  where somebody is already typing who they are. */}
              <Input
                label="Where you live"
                value={line1}
                onChangeText={setLine1}
                required={false}
                placeholder="12-3-45, Danavaipeta"
                maxLength={120}
                hint="As it appears on your Aadhaar."
              />
              <Input
                label="Landmark"
                value={landmark}
                onChangeText={setLandmark}
                required={false}
                placeholder="Near the temple"
                maxLength={80}
              />
              <Input
                label="Pincode"
                value={pincode}
                onChangeText={setPincode}
                required={false}
                placeholder="533103"
                keyboardType="number-pad"
                maxLength={6}
                mono
              />
              {/* Collected here rather than only on the profile screen, because
                  it is one of the three fields "Fill with dummy data" refuses
                  to invent — and a field the shortcut demands has to be a field
                  the form actually offers. Optional for a real rider: the
                  server's completeness rule does not ask for it, and a rider
                  with no email address is an ordinary case. */}
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={fieldErrors.email}
                required={false}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={80}
                hint="Where payout statements go."
              />

              <View style={{ gap: space[1] }}>
                <Text variant="eyebrow" color="tertiary">
                  Profile photo
                </Text>
                <View style={{ flexDirection: "row", gap: space[3] }}>
                  <PhotoSlot
                    label="Your photo"
                    uri={photoUrl}
                    busy={uploading === "profile:front"}
                    onPress={() => attachPhoto("profile", "front")}
                  />
                  <View style={{ flex: 1, justifyContent: "center" }}>
                    <Text variant="caption" color="tertiary">
                      A clear photo of your face. Restaurants and customers see this when
                      they hand food over.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── 2. Vehicle ───────────────────────────────────────────────── */}
        {screen === "vehicle" && (
          <>
            <Text variant="bodyLg" color="secondary" style={styles.blurb}>
              You can change this later from your profile.
            </Text>

            <View style={styles.fields}>
              <ChoiceField
                label="What do you ride?"
                options={VEHICLE_TYPES}
                value={vehicleType ?? null}
                onChange={setVehicleType}
                error={fieldErrors.vehicleType}
              />
              <Input
                label="Registration number"
                value={plate}
                onChangeText={setPlate}
                error={fieldErrors.plate}
                required={vehicleType !== "cycle"}
                placeholder="AP05CJ4471"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
                mono
                hint={
                  vehicleType === "cycle"
                    ? "A bicycle does not need one — leave this blank."
                    : "Spaces and dashes are ignored."
                }
              />
              <Input
                label="Make and model"
                value={model}
                onChangeText={setModel}
                required={false}
                placeholder="Honda Activa 6G"
                maxLength={40}
              />
            </View>
          </>
        )}

        {/* ── 3. Documents ─────────────────────────────────────────────── */}
        {screen === "documents" && (
          <>
            <Text variant="bodyLg" color="secondary" style={styles.blurb}>
              Photograph each one in good light, without flash glare. Verification usually
              takes under 24 hours.
            </Text>

            <View style={styles.fields}>
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.kind}
                  doc={doc}
                  uploading={uploading}
                  onAttach={(side) => attachPhoto(doc.kind, side)}
                  onNumber={(value) => saveDocumentNumber(doc.kind, value)}
                />
              ))}
              {documents.length === 0 && (
                <Notice
                  tone="info"
                  title="Loading your checklist…"
                  body="Pull down or tap Continue to try again."
                />
              )}
            </View>
          </>
        )}

        {/* ── 4. Bank ──────────────────────────────────────────────────── */}
        {screen === "bank" && (
          <>
            <Text variant="bodyLg" color="secondary" style={styles.blurb}>
              Earnings are paid every Monday. A bank account or a UPI id — either one is
              enough to get started.
            </Text>

            <View style={styles.fields}>
              <Input
                label="Account holder"
                value={holder}
                onChangeText={setHolder}
                error={fieldErrors.holder}
                required={false}
                placeholder="The name on the account"
                autoCapitalize="words"
                maxLength={60}
              />
              <Input
                label="Account number"
                value={account}
                onChangeText={setAccount}
                error={fieldErrors.account}
                required={false}
                placeholder={
                  profile?.payout?.accountLast4
                    ? `•••• ${profile.payout.accountLast4} — type to replace`
                    : "9 to 18 digits"
                }
                keyboardType="number-pad"
                maxLength={18}
                mono
                /* Not `secureTextEntry`: a rider typing an account number off a
                   passbook has to be able to check it, and a masked field is
                   how a transposed digit reaches a payout run. */
                hint="We only ever show you the last four digits after this."
              />
              <Input
                label="IFSC code"
                value={ifsc}
                onChangeText={setIfsc}
                error={fieldErrors.ifsc}
                required={false}
                placeholder="HDFC0001432"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                mono
              />
              <ChoiceField
                label="Account type"
                options={ACCOUNT_TYPES}
                value={accountType}
                onChange={setAccountType}
              />
              <Input
                label="UPI id"
                value={upi}
                onChangeText={setUpi}
                required={false}
                placeholder="name@bank"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                maxLength={64}
                hint="Where your weekly settlement is sent."
              />
            </View>
          </>
        )}

        {/* ── The verdict ──────────────────────────────────────────────── */}
        {screen === "done" && <Done profile={profile} onRefresh={refreshProfile} />}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <View style={styles.actions}>
          {!!verdict && <Notice tone={verdict.tone} title={verdict.text} glyph="alert" />}
          {!!error && <Notice tone="danger" title={error} glyph="alert" />}

          {screen === "welcome" && (
            <>
              <Btn
                label="Create partner account"
                large
                onPress={() => (token ? setScreen("personal") : router.push("/auth"))}
              />
              <Btn
                label="I already have an account"
                variant="ghost"
                onPress={() => (token ? setScreen("personal") : router.push("/auth"))}
              />
              <Text variant="numMeta" color="tertiary" style={styles.fine}>
                By continuing you agree to the Lampose partner terms.
              </Text>
            </>
          )}

          {screen === "personal" && (
            <>
              <Btn label="Continue" disabled={saving} loading={saving} onPress={continuePersonal} />
              <FillButton
                busy={saving}
                onPress={fillPersonal}
                note="Fills your name, address, city and photo. Your number, email and date of birth stay yours."
              />
            </>
          )}
          {screen === "vehicle" && (
            <>
              <Btn label="Continue" disabled={saving} loading={saving} onPress={continueVehicle} />
              <FillButton busy={saving} onPress={fillVehicle} note="Fills a two-wheeler and its plate." />
            </>
          )}
          {screen === "documents" && (
            <>
              <Btn
                label="Continue"
                disabled={saving || !!uploading}
                loading={saving}
                onPress={continueDocuments}
              />
              <FillButton
                busy={saving || !!uploading}
                onPress={fillDocuments}
                note="Attaches sample scans for the three required documents. PAN and insurance stay empty."
              />
            </>
          )}
          {screen === "bank" && (
            <>
              <Btn label="Save and finish" disabled={saving} loading={saving} onPress={continueBank} />
              <FillButton busy={saving} onPress={fillBank} note="Fills a test bank account and UPI id." />
            </>
          )}
          {screen === "done" && !profile?.hasCompletedOnboarding && (
            <Btn
              label="Submit for review"
              large
              disabled={saving}
              loading={saving}
              onPress={finish}
            />
          )}
          {screen === "done" && profile?.hasCompletedOnboarding && (
            <Btn
              label="Check status"
              variant="ghost"
              glyph="refresh"
              disabled={saving}
              onPress={() => refreshProfile()}
            />
          )}

          {/* Every step but the first is reachable backwards, and the whole
              form is reachable from `done` — a rider who spots a wrong plate
              on the last screen must not have to sign out to fix it. */}
          {screen === "done" && (
            <Btn label="Edit my details" variant="ghost" onPress={() => setScreen("personal")} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/**
 * "Fill with dummy data" — the shortcut past a step, for testing.
 *
 * Renders nothing at all outside a development or explicitly-enabled build, so
 * the call sites do not each have to remember the guard. A real partner who
 * found this would file an application an approver then has to reject.
 *
 * Deliberately the plainest control on the screen: the quiet variant, below
 * the real action, with a line saying what it will and will not touch. It has
 * to be obviously a tool rather than a choice somebody might make by accident,
 * and the note is where the "your date of birth stays yours" promise is
 * actually made to the person reading it.
 */
function FillButton({
  busy,
  onPress,
  note,
}: {
  busy: boolean;
  onPress: () => void;
  note: string;
}) {
  if (!DUMMY_DATA_ENABLED) return null;

  return (
    <View style={{ gap: space[1], marginTop: space[2] }}>
      <Btn label="Fill with dummy data" variant="quiet" glyph="plus" disabled={busy} onPress={onPress} />
      <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
        {note}
      </Text>
    </View>
  );
}

function Welcome() {
  return (
    <View>
      <View style={styles.logoBlock}>
        <View style={styles.logoMark}>
          <Text variant="display1" style={{ color: colors.onBrand }}>
            L
          </Text>
        </View>
        <Text variant="display1" style={{ marginTop: space[4] }}>
          Lampose
        </Text>
        <Text variant="eyebrow" color="brand" style={{ marginTop: space[1] }}>
          Driver partner
        </Text>
        <Rule style={styles.wordmarkRule} />
      </View>
      <Text variant="display1" style={{ textAlign: "center" }}>
        Earn on your own schedule
      </Text>
      <Text variant="bodyLg" color="secondary" style={[styles.blurb, { textAlign: "center" }]}>
        Deliver for Rajahmundry&apos;s best restaurants, and get paid weekly into the
        account you give us.
      </Text>
    </View>
  );
}

/**
 * One document: its verdict, its photographs, and its number.
 *
 * The reason a document was refused sits in its own tinted well rather than as
 * a red line of text — a rider who cannot distinguish red still gets a
 * distinct block, and the sentence is the whole point of the rejection.
 */
function DocumentCard({
  doc,
  uploading,
  onAttach,
  onNumber,
}: {
  doc: DriverDocument;
  uploading: string;
  onAttach: (side: "front" | "back") => void;
  onNumber: (value: string) => void;
}) {
  const [number, setNumber] = useState(doc.number);
  const t = resolveTone(DOC_TONE[doc.status]);
  const failing = doc.status === "rejected";

  useEffect(() => setNumber(doc.number), [doc.number]);

  return (
    <View style={[styles.docCard, failing && { borderColor: t.border, backgroundColor: t.tint }]}>
      <View style={styles.docHead}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="title2" numberOfLines={1}>
            {doc.label}
          </Text>
          <Text variant="caption" color="tertiary">
            {doc.required ? DOC_HINTS[doc.kind] : `Optional. ${DOC_HINTS[doc.kind]}`}
          </Text>
        </View>
        <Chip label={DOC_STATUS_LABEL[doc.status]} tone={DOC_TONE[doc.status]} />
      </View>

      {failing && !!doc.reason && (
        <View style={[styles.reason, { borderColor: t.border }]}>
          <Text variant="caption" style={{ color: t.ink }}>
            {doc.reason}
          </Text>
        </View>
      )}

      <View style={styles.docSlots}>
        <PhotoSlot
          label="Front"
          uri={doc.frontUrl}
          busy={uploading === `${doc.kind}:front`}
          onPress={() => onAttach("front")}
        />
        <PhotoSlot
          label="Back"
          uri={doc.backUrl}
          busy={uploading === `${doc.kind}:back`}
          onPress={() => onAttach("back")}
        />
      </View>

      {/* Saved on blur rather than per keystroke: each save is a request that
          resets the document to `pending`, and doing that fourteen times while
          somebody types a licence number would put the same document in the
          approver's queue fourteen times. */}
      <Input
        label="Number on the document"
        value={number}
        onChangeText={setNumber}
        onBlur={() => onNumber(number)}
        required={false}
        placeholder={doc.frontUrl ? "As printed" : "Add a photo first"}
        editable={!!doc.frontUrl}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={32}
        mono
      />
    </View>
  );
}

/** The last panel: what was submitted, and what the server currently says. */
function Done({
  profile,
  onRefresh,
}: {
  profile: ReturnType<typeof useDriverStore.getState>["profile"];
  onRefresh: () => Promise<boolean>;
}) {
  const [checking, setChecking] = useState(false);
  const submitted = !!profile?.hasCompletedOnboarding;
  const approved = profile?.status === "approved";

  const badge = approved ? "✓" : submitted ? "⌛" : "→";
  const badgeTone = resolveTone(approved ? "success" : submitted ? "warning" : "brand");

  return (
    <View>
      <View style={{ alignItems: "center", marginTop: space[6] }}>
        <View
          style={[
            styles.badge,
            { backgroundColor: badgeTone.tint, borderColor: badgeTone.border },
          ]}
        >
          <Text variant="display1" style={{ color: badgeTone.ink }}>
            {badge}
          </Text>
        </View>
      </View>

      <Text variant="display1" style={{ textAlign: "center", marginTop: space[5] }}>
        {approved
          ? `You are approved${profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}`
          : submitted
            ? "Documents under review"
            : "Ready to submit"}
      </Text>
      <Text variant="bodyLg" color="secondary" style={[styles.blurb, { textAlign: "center" }]}>
        {approved
          ? "Your partner account is live. Go online from the home screen and take your first delivery."
          : submitted
            ? "Our team is checking your licence, RC and ID. You will be notified the moment you are approved — usually within 24 hours."
            : "Everything is filled in. Send it to our team and we will review it within 24 hours."}
      </Text>

      {!!profile?.driverId && (
        <Text variant="numMeta" color="tertiary" style={[styles.fine, { marginTop: space[4] }]}>
          Partner ID {profile.driverId}
        </Text>
      )}

      {submitted && !approved && (
        <Pressable
          accessibilityRole="button"
          disabled={checking}
          onPress={async () => {
            setChecking(true);
            await onRefresh();
            setChecking(false);
          }}
          style={{ marginTop: space[4], alignSelf: "center", flexDirection: "row", gap: space[2] }}
        >
          {checking ? (
            <ActivityIndicator size="small" />
          ) : (
            <Icon name="refresh" size={16} color={colors.brandInk} />
          )}
          <Text variant="bodyStrong" color="brand">
            {checking ? "Checking…" : "Check for an update"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** The server's sentence when there is one, ours only when there is not. */
function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: string; error?: string } | null;
    return payload?.message || payload?.error || err.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: layout.gutter, paddingBottom: space[8] },

  progressRail: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  blurb: { marginTop: space[2] },
  fields: { marginTop: space[5], gap: space[4] },
  actions: { marginTop: space[6], gap: space[2] },
  fine: { textAlign: "center", marginTop: space[2] },

  logoBlock: { alignItems: "center", paddingBottom: space[2] },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkRule: { marginTop: space[6], marginHorizontal: space[8], alignSelf: "stretch" },

  docCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space[4],
    gap: space[3],
  },
  docHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space[3],
  },
  docSlots: { flexDirection: "row", gap: space[3] },
  reason: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    padding: space[3],
  },

  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
