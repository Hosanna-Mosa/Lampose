import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send, Store,
} from 'lucide-react';
import {
  Box, Inline, PlainButton, Text,
} from '../../../common/atoms';
import { Note } from '../../molecules/Field/Field';
import { StepBar, StepRail } from '../../molecules/StepNav/StepNav';
import { RestaurantInfoStep } from '../RestaurantInfoStep/RestaurantInfoStep';
import { OperationsStep } from '../OperationsStep/OperationsStep';
import { DocumentsLegalStep } from '../DocumentsLegalStep/DocumentsLegalStep';
import { ContractReviewStep } from '../ContractReviewStep/ContractReviewStep';
import { INITIAL_RESTAURANT_STATE, STEPS } from '../../utils/restaurantOptions';
import { buildApplicationPayload } from '../../utils/buildApplication';
import {
  anchorFor, errorsForStep, firstBadStep, firstErrorKey, stepOfField, validateRestaurant,
} from '../../utils/validateRestaurant';
import { submitRestaurantApplication } from '../../../../services/api';

/*
 * The four-step restaurant application, end to end.
 *
 * ## One state object, one setter
 *
 * The form is thirty-odd fields across four screens, and the steps below are
 * presentational — they receive `form` and `set` and own nothing. That is
 * what lets the review summary on step 4 read live values, and what lets the
 * rules in `validateRestaurant.js` be plain functions of the whole form rather
 * than something assembled from four components' private state at submit
 * time.
 *
 * ## Continue is not greyed out — it ANSWERS
 *
 * It used to be disabled until the step's gate passed, with one sentence
 * underneath naming everything the step wanted. That sentence is the whole
 * problem: step 3 asks for a dozen things, and "the PAN and FSSAI scans, their
 * numbers and matching bank details" does not tell an agent which of those
 * boxes they are looking at is the wrong one. A disabled button cannot be
 * pressed for an answer, so there is nothing to do but re-read the form.
 *
 * So the button stays live, and pressing it either moves on or says exactly
 * what is in the way: the message is printed under the field it belongs to,
 * the field is outlined, and the page scrolls to the first one and focuses
 * it. Nothing is sent — the check is the same `validateRestaurant` the
 * backend's `validateApplication` agrees with, so an application that leaves
 * here is one the server will take.
 *
 * ## When a message appears
 *
 * Not while a box is being typed into. A required field is empty before it is
 * filled in, and an email address is malformed for every character up to the
 * last, so validating as you type would paint the form red for doing it
 * correctly. A field speaks up once it has been LEFT (`touch`), or once
 * Continue has been pressed and refused for that step — after which the whole
 * step is honest about where it stands, including the boxes never visited.
 *
 * ## What submit actually does
 *
 * Uploads the PAN and FSSAI scans to Cloudinary against the AGENT's own staff
 * token, then posts the form. Nothing is written
 * until that last call, so a failure anywhere in the chain is safely
 * retryable — which is what the error panel says, rather than leaving the
 * agent to guess whether pressing the button again will create a second
 * restaurant.
 *
 * The restaurant lands as `verificationStatus: 'pending'` and `isActive:
 * false`. It is invisible to diners and cannot take an order until somebody
 * approves it in the admin console; that is the backend's default and this
 * form deliberately sends nothing that could change it.
 *
 * It may carry a menu and it may not. Step 2 collects dishes OPTIONALLY —
 * whatever the owner has to hand at the counter — and the rest are entered
 * from the Food-Partner app after approval. An application with no products
 * is a valid application; see `MenuSection`.
 */

export function RestaurantOnboardForm({ onDone }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...INITIAL_RESTAURANT_STATE });

  /* Which fields have been left, and which steps have had Continue pressed and
     refused. Together they decide what the agent is shown; neither of them
     decides what is WRONG, which is `validateRestaurant`'s job alone. */
  const [touched, setTouched] = useState({});
  const [attempted, setAttempted] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  /* The field to scroll to once the step carrying it is on screen. A ref
     rather than state because the step-change effect below reads it during
     the same commit that renders the new step. */
  const pendingFocus = useRef(null);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const touch = (key) => setTouched((current) => (
    current[key] ? current : { ...current, [key]: true }
  ));

  /* Every problem on the whole form, recomputed from the form itself. There is
     no second copy of it in state, so a message can never outlive the value
     that caused it. */
  const errors = useMemo(() => validateRestaurant(form), [form]);

  /* The subset the agent should be seeing right now. */
  const visible = useMemo(() => {
    const shown = {};
    Object.keys(errors).forEach((key) => {
      if (touched[key] || attempted[stepOfField(key)]) shown[key] = errors[key];
    });
    return shown;
  }, [errors, touched, attempted]);

  const stepProblems = errorsForStep(errors, step);
  const stepProblemCount = Object.keys(stepProblems).length;
  const showStepSummary = Boolean(attempted[step]) && stepProblemCount > 0;

  /*
   * Scroll to a field and focus it.
   *
   * The atoms in `common/atoms` are plain pass-through elements with no
   * `forwardRef`, so a ref handed to one would silently do nothing — the DOM
   * id the field already renders with is the handle. The controls that are
   * not inputs (the cuisine chips, the day picker) carry `tabIndex={-1}` on
   * their container so that they can be focused programmatically without
   * joining the tab order.
   */
  const focusField = (key) => {
    const id = anchorFor(key);
    if (!id) return;

    window.requestAnimationFrame(() => {
      const node = document.getElementById(id);
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof node.focus === 'function') node.focus({ preventScroll: true });
    });
  };

  /* Each step starts at its own beginning. Without this, moving from a long
     step to a short one lands the agent halfway down a screen they have not
     read — on a phone, usually past the heading that says which step it is.

     Unless something on the new step is being pointed at: a jump to the top
     followed by a jump to a field is two smooth scrolls racing each other,
     and the one the agent needs is the second. */
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;

    if (target) {
      focusField(target);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  /* The account holder is the owner until somebody says otherwise. Filled
     once, when the name first arrives, so that editing it on step 3 and then
     going back to step 1 does not silently overwrite the correction. */
  useEffect(() => {
    if (form.ownerName && !form.accountHolderName) {
      set({ accountHolderName: form.ownerName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ownerName]);

  const goTo = (next) => {
    setSubmitError(null);
    setStep(next);
  };

  /*
   * Forward is gated; backward never is.
   *
   * The commonest use of Back and of the rail is fixing something spotted on
   * the review screen, and a form that makes you walk forward through three
   * screens to get back to where you were is a form abandoned at the typo. So
   * a step may be left in any state going backwards — the problems are still
   * there, still listed, and still checked before anything is sent.
   */
  const goForward = () => {
    if (stepProblemCount === 0) {
      goTo(step + 1);
      return;
    }

    setAttempted((current) => ({ ...current, [step]: true }));
    focusField(firstErrorKey(stepProblems));
  };

  const submit = async () => {
    /* The whole form, not just step 4. Steps are reopened to fix things, and
       an edit made on the way back can break a step that was clean when it was
       passed — this is the last moment anything can catch that, and the
       alternative is a 400 from `validateApplication` after two uploads. */
    const bad = firstBadStep(errors);
    if (bad !== null) {
      /* Every step, not just the one being looked at: the agent is about to be
         moved to a screen they last saw as complete, and a step that quietly
         holds a second problem would send them round again. */
      setAttempted({ 1: true, 2: true, 3: true, 4: true });

      const target = firstErrorKey(errors);
      if (bad === step) {
        focusField(target);
      } else {
        /* The step has to render before the field in it can be scrolled to. */
        pendingFocus.current = target;
        goTo(bad);
      }
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitStage('Preparing the application...');

    const payload = buildApplicationPayload(form);
    const res = await submitRestaurantApplication(payload, setSubmitStage);

    setSubmitting(false);
    setSubmitStage('');

    if (res?.success) {
      setSubmitted(res.data || {});
      return;
    }

    setSubmitError(res || { error: 'The application could not be submitted.' });
  };

  /* ── Done ─────────────────────────────────────────────────────────────── */

  if (submitted) {
    return (
      <Box className="rst-shell animate-fade-in">
        <Box />
        <Box className="rst-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
          <Box className="rst-empty-icon" style={{ background: 'var(--lampose-green-light)', border: '1px solid var(--lampose-green-border)' }}>
            <CheckCircle2 size={26} color="#45855a" />
          </Box>
          <Text className="rst-step-title" style={{ marginBottom: '8px' }}>
            Application received
          </Text>
          <Text className="rst-step-sub" style={{ marginBottom: '20px' }}>
            Lampose will verify the documents and approve the restaurant. The
            owner then adds their menu from the Food-Partner app.
          </Text>

          {submitted.restaurantId && (
            <Box style={{ marginBottom: '14px' }}>
              <Note tone="ok" icon={<CheckCircle2 size={15} />}>
                Restaurant ID <Inline style={{ fontWeight: 800 }}>{submitted.restaurantId}</Inline>
                {' '}· {submitted.documentCount || 0} document(s) · awaiting approval
              </Note>
            </Box>
          )}

          {/* Anything the backend could not read. An empty list on a normal
              submission — when it is not empty, it is the only place the
              agent will ever be told. */}
          {Array.isArray(submitted.dropped) && submitted.dropped.length > 0 && (
            <Box style={{ marginBottom: '14px', textAlign: 'left' }}>
              <Note tone="warn" icon={<AlertCircle size={15} />}>
                <Inline>
                  Some values were not stored: {submitted.dropped.join(' ')}
                </Inline>
              </Note>
            </Box>
          )}

          <Box style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <PlainButton
              type="button"
              className="rst-btn rst-btn-ghost"
              onClick={() => {
                setSubmitted(null);
                setStep(1);
                setForm({ ...INITIAL_RESTAURANT_STATE });
                /* The next restaurant is a blank form in every sense — a
                   leftover "this was already refused" would paint it red
                   before a word is typed. */
                setTouched({});
                setAttempted({});
              }}
            >
              <Store size={16} />
              Onboard another
            </PlainButton>
            {onDone && (
              <PlainButton type="button" className="rst-btn rst-btn-primary" onClick={onDone}>
                Back to listings
              </PlainButton>
            )}
          </Box>
        </Box>
      </Box>
    );
  }

  /* ── The wizard ───────────────────────────────────────────────────────── */

  const stepProps = { form, set, errors: visible, touch };

  return (
    <Box className="rst-shell animate-fade-in">
      <StepRail step={step} onGo={goTo} />

      <Box>
        <StepBar step={step} />

        {step === 1 && <RestaurantInfoStep {...stepProps} />}
        {step === 2 && <OperationsStep {...stepProps} />}
        {step === 3 && <DocumentsLegalStep {...stepProps} />}
        {step === 4 && <ContractReviewStep {...stepProps} />}

        {/* What is in the way, listed once, with every one of them also
            printed against its own field. Both, because on a long step the
            field that is wrong may be two screens up — and because the count
            is the thing that tells an agent whether they are one fix from
            done or five. */}
        {showStepSummary && (
          <Box style={{ marginBottom: '14px' }}>
            <Note tone="bad" icon={<AlertCircle size={15} />}>
              <Inline>
                {stepProblemCount === 1
                  ? 'One thing still needs fixing on this step:'
                  : `${stepProblemCount} things still need fixing on this step:`}
                <Inline style={{ display: 'block', marginTop: '6px' }}>
                  {Object.keys(stepProblems).map((key) => (
                    <PlainButton
                      key={key}
                      type="button"
                      className="rst-err-jump"
                      onClick={() => focusField(key)}
                    >
                      {stepProblems[key]}
                    </PlainButton>
                  ))}
                </Inline>
              </Inline>
            </Note>
          </Box>
        )}

        {submitError && (
          <Box style={{ marginBottom: '14px' }}>
            <Note tone="bad" icon={<AlertCircle size={15} />}>
              <Inline>
                {submitError.error || submitError.message || 'The application could not be submitted.'}
                {Array.isArray(submitError.problems) && submitError.problems.length > 0 && (
                  <Inline> We still need {submitError.problems.join(', ')}.</Inline>
                )}
                {/* Said explicitly, because the alternative is an agent who
                    does not know whether pressing the button again creates a
                    second restaurant. Nothing is written until the final
                    call, so it does not. */}
                {submitError.reached === false && (
                  <Inline> Nothing was saved — it is safe to try again.</Inline>
                )}
              </Inline>
            </Note>
          </Box>
        )}

        {submitting && submitStage && (
          <Box style={{ marginBottom: '14px' }}>
            <Note tone="info" icon={<Loader2 size={15} />}>{submitStage}</Note>
          </Box>
        )}

        {/* ── The action bar ───────────────────────────────────────────── */}
        <Box className="rst-footer">
          <PlainButton
            type="button"
            className="rst-btn rst-btn-ghost"
            onClick={() => goTo(step - 1)}
            disabled={step === 1 || submitting}
          >
            <ArrowLeft size={16} />
            <Inline>Back</Inline>
          </PlainButton>

          {step < STEPS.length ? (
            <PlainButton
              type="button"
              className="rst-btn rst-btn-primary"
              onClick={goForward}
            >
              <Inline>Continue</Inline>
              <ArrowRight size={16} />
            </PlainButton>
          ) : (
            <PlainButton
              type="button"
              className="rst-btn rst-btn-primary"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? <Loader2 size={16} /> : <Send size={16} />}
              <Inline>{submitting ? 'Submitting...' : 'Submit Application'}</Inline>
            </PlainButton>
          )}
        </Box>

        <Text className="rst-hint" style={{ textAlign: 'center', marginTop: '10px' }}>
          Restaurant Onboarding · Step {step} of {STEPS.length}
        </Text>
      </Box>
    </Box>
  );
}
