import React, { useEffect, useState } from 'react';
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
import { buildApplicationPayload, canProceed } from '../../utils/buildApplication';
import { submitRestaurantApplication } from '../../../../services/api';

/*
 * The four-step restaurant application, end to end.
 *
 * ## One state object, one setter
 *
 * The form is thirty-odd fields across four screens, and the steps below are
 * presentational — they receive `form` and `set` and own nothing. That is
 * what lets the review summary on step 4 read live values, and what lets the
 * gates in `buildApplication.js` be plain functions of the whole form rather
 * than something assembled from four components' private state at submit
 * time.
 *
 * ## The gates are advisory on the way FORWARD and absent on the way BACK
 *
 * Continue is disabled until the current step's gate passes. The rail lets a
 * completed step be reopened freely, because the commonest use of it is
 * fixing a typo spotted on the review screen, and a form that makes you walk
 * forward through three screens to get back to where you were is a form that
 * gets abandoned at the typo.
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
 * false`, WITH NO MENU. It is invisible to diners and cannot take an order
 * until somebody approves it in the admin console; that is the backend's
 * default and this form deliberately sends nothing that could change it.
 * The menu is entered by the restaurant from the Food-Partner app after
 * approval, which is why none is collected here.
 */

export function RestaurantOnboardForm({ onDone }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ ...INITIAL_RESTAURANT_STATE });

  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));

  const ready = canProceed(form, step);

  /* Each step starts at its own beginning. Without this, moving from a long
     step to a short one lands the agent halfway down a screen they have not
     read — on a phone, usually past the heading that says which step it is.
     The window is scrolled rather than an element, because the atoms in
     `common/atoms` are plain pass-through elements with no `forwardRef` and
     a ref handed to one would silently do nothing. */
  useEffect(() => {
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

  const submit = async () => {
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

  return (
    <Box className="rst-shell animate-fade-in">
      <StepRail step={step} onGo={goTo} />

      <Box>
        <StepBar step={step} />

        {step === 1 && <RestaurantInfoStep form={form} set={set} />}
        {step === 2 && <OperationsStep form={form} set={set} />}
        {step === 3 && <DocumentsLegalStep form={form} set={set} />}
        {step === 4 && <ContractReviewStep form={form} set={set} />}

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
              onClick={() => goTo(step + 1)}
              disabled={!ready}
            >
              <Inline>Continue</Inline>
              <ArrowRight size={16} />
            </PlainButton>
          ) : (
            <PlainButton
              type="button"
              className="rst-btn rst-btn-primary"
              onClick={submit}
              disabled={!ready || submitting}
            >
              {submitting ? <Loader2 size={16} /> : <Send size={16} />}
              <Inline>{submitting ? 'Submitting...' : 'Submit Application'}</Inline>
            </PlainButton>
          )}
        </Box>

        {/* Why Continue is grey. A disabled button with no explanation is the
            single commonest way a long form loses somebody. */}
        {!ready && !submitting && (
          <Text className="rst-hint" style={{ textAlign: 'center', marginTop: '10px' }}>
            {step === 1 && 'Fill in the name, a category, the owner details, a ten-digit mobile number and the address to continue.'}
            {step === 2 && 'Pick the days this kitchen is open and set the hours to continue.'}
            {step === 3 && 'The PAN and FSSAI scans, their numbers, a GSTIN (or the exempt box), and matching bank details with a confirmed IFSC are needed to continue.'}
            {step === 4 && 'Accept the terms and type the signature to submit.'}
          </Text>
        )}

        <Text className="rst-hint" style={{ textAlign: 'center', marginTop: '6px' }}>
          Restaurant Onboarding · Step {step} of {STEPS.length}
        </Text>
      </Box>
    </Box>
  );
}
