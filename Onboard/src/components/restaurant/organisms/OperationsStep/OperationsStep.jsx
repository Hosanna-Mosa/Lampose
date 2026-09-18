import React from 'react';
import {
  Clock, Info, Plus, Trash2,
} from 'lucide-react';
import {
  Box, Inline, Input, PlainButton, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { COPY, DAYS } from '../../utils/restaurantOptions';
import { hoursKey } from '../../utils/validateRestaurant';

/*
 * Step 2 — when the kitchen is open. That is all.
 *
 * ## There is no menu builder here, and that is the design
 *
 * This step used to carry one: categories, dishes, prices, a photograph each,
 * and a spreadsheet importer for the places that already had their menu typed
 * somewhere. All of it is gone, because none of it fits who fills this form
 * in. A Lampose employee stands at a counter with the owner for twenty
 * minutes; sixty dishes with a photograph each is not twenty minutes' work,
 * and a form that asks for it is a form abandoned halfway with the licences
 * already photographed.
 *
 * So the menu belongs to the RESTAURANT, entered from the Food-Partner app
 * once an admin approves the account. The backend's matching half is the rule
 * that used to demand at least one item, removed in `foodPartner.util.js`
 * with the reasoning beside it — without that, an application carrying no
 * products would be refused at submit.
 *
 * The note at the bottom of this step says so out loud, because an agent who
 * expects to enter a menu and never meets one will otherwise assume the form
 * lost it.
 *
 * ## The timings editor edits ONE day at a time
 *
 * Seven days each with several slots is a wall of time inputs on a phone. So
 * the days are ticked first, then one of them is selected and its slots are
 * edited below — which is also how a restaurant actually differs: the same
 * hours all week, and something else on Sunday.
 *
 * ## Which is why a problem with a day is printed with the DAY in it
 *
 * Only one day's slots are on screen, so "opening and closing are the same"
 * under the editor would be read as being about the day being edited. Every
 * hours message names its own day, and each day holding one is listed
 * together below the editor rather than only when that day is selected —
 * otherwise the agent has to tap through seven chips to find the one Continue
 * is refusing to move past.
 *
 * Every edit here marks its day as spoken for, so a slot broken by an edit is
 * reported as it is broken. There is no "left the field" moment to wait for:
 * a time picker and a tick box are done the instant they are touched, and the
 * hours all start out valid, so anything wrong with them was just typed.
 */

export function OperationsStep({ form, set, errors = {}, touch = () => {} }) {
  const copy = COPY;

  /* Every day still holding a problem, in week order rather than the order
     they were ticked. */
  const hourProblems = DAYS
    .filter((day) => errors[hoursKey(day)])
    .map((day) => ({ day, message: errors[hoursKey(day)] }));

  const toggleDay = (day) => {
    const next = form.selectedDays.includes(day)
      ? form.selectedDays.filter((entry) => entry !== day)
      : [...form.selectedDays, day];

    touch('selectedDays');
    touch(hoursKey(day));

    set({
      selectedDays: next,
      /* The editor below always points at a day that is actually open. */
      activeTimingDay: next.includes(form.activeTimingDay)
        ? form.activeTimingDay
        : (next[0] || 'Monday'),
    });
  };

  const setSlots = (day, slots) => {
    touch(hoursKey(day));
    set({ dayTimeSlots: { ...form.dayTimeSlots, [day]: slots } });
  };

  const addSlot = (day) => {
    setSlots(day, [...(form.dayTimeSlots[day] || []), { open: '09:00', close: '22:00' }]);
  };

  const updateSlot = (day, index, key, value) => {
    const slots = (form.dayTimeSlots[day] || []).map((slot, i) => (
      i === index ? { ...slot, [key]: value } : slot
    ));
    setSlots(day, slots);
  };

  const removeSlot = (day, index) => {
    setSlots(day, (form.dayTimeSlots[day] || []).filter((_, i) => i !== index));
  };

  const slots = form.dayTimeSlots[form.activeTimingDay] || [];

  return (
    <Box className="animate-fade-in">
      <Box className="rst-step-head">
        <Text className="rst-step-title">Operational Details</Text>
        <Text className="rst-step-sub">
          Set the days and hours this kitchen takes orders.
        </Text>
      </Box>

      <Box className="rst-section">
        <SectionHead icon={<Clock size={16} color="#45855a" />} title="Operational Timings" />

        <Box className="rst-card">
          <Field label="Days of Operation" required error={errors.selectedDays}>
            <Box style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <PlainButton
                type="button"
                className="rst-btn-link"
                onClick={() => {
                  const next = form.selectedDays.length === 7 ? [] : [...DAYS];
                  set({ selectedDays: next, activeTimingDay: next[0] || 'Monday' });
                }}
              >
                {form.selectedDays.length === 7 ? 'Deselect All' : 'Select All'}
              </PlainButton>
            </Box>
            <Box className="rst-days" id="rst-days" tabIndex={-1}>
              {DAYS.map((day) => (
                <PlainButton
                  key={day}
                  type="button"
                  onClick={() => { toggleDay(day); set({ activeTimingDay: day }); }}
                  className={`rst-day${form.selectedDays.includes(day) ? ' is-on' : ''}`}
                  aria-pressed={form.selectedDays.includes(day)}
                >
                  {day.slice(0, 3)}
                </PlainButton>
              ))}
            </Box>
          </Field>

          {form.selectedDays.length > 0 && (
            <Box className="rst-divide" id="rst-hours" tabIndex={-1}>
              <Field label="Opening & Closing Hours" hint={copy.operatingHelp}>
                <Box className="rst-chips" style={{ marginBottom: '12px' }}>
                  {form.selectedDays.map((day) => (
                    <PlainButton
                      key={day}
                      type="button"
                      onClick={() => set({ activeTimingDay: day })}
                      className={`rst-chip${form.activeTimingDay === day ? ' is-on' : ''}${errors[hoursKey(day)] ? ' is-bad' : ''}`}
                    >
                      {day}
                    </PlainButton>
                  ))}
                </Box>

                {slots.map((slot, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <Box key={index} className="rst-slot">
                    <Box>
                      <Text className="rst-hint" style={{ marginBottom: '4px' }}>Opening</Text>
                      <Input
                        className="rst-input"
                        type="time"
                        value={slot.open}
                        onChange={(event) => updateSlot(form.activeTimingDay, index, 'open', event.target.value)}
                        aria-label={`${form.activeTimingDay} slot ${index + 1} opening time`}
                      />
                    </Box>
                    <Inline className="rst-slot-dash">—</Inline>
                    <Box>
                      <Text className="rst-hint" style={{ marginBottom: '4px' }}>Closing</Text>
                      <Input
                        className="rst-input"
                        type="time"
                        value={slot.close}
                        onChange={(event) => updateSlot(form.activeTimingDay, index, 'close', event.target.value)}
                        aria-label={`${form.activeTimingDay} slot ${index + 1} closing time`}
                      />
                    </Box>
                    {slots.length > 1 && (
                      <PlainButton
                        type="button"
                        className="rst-slot-kill"
                        onClick={() => removeSlot(form.activeTimingDay, index)}
                        aria-label={`Remove slot ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </PlainButton>
                    )}
                  </Box>
                ))}

                <PlainButton
                  type="button"
                  className="rst-btn-link"
                  onClick={() => addSlot(form.activeTimingDay)}
                  style={{ marginTop: '10px' }}
                >
                  <Plus size={15} />
                  Add another slot for {form.activeTimingDay}
                </PlainButton>

                {hourProblems.map((problem) => (
                  <FieldError key={problem.day} message={problem.message} />
                ))}
              </Field>
            </Box>
          )}
        </Box>
      </Box>

      {/* Said out loud, because its absence is the surprising part. An agent
          who came expecting to type a menu and never met one would reasonably
          assume the form had lost it. */}
      <Box className="rst-section">
        <Note tone="info" icon={<Info size={15} />}>
          No menu is entered here. Once Lampose approves this restaurant, the
          owner adds their own dishes and prices from the Food-Partner app.
        </Note>
      </Box>
    </Box>
  );
}
