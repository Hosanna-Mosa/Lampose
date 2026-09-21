/* ══════════════════════════════════════════════════════════════════════════
   The food surface's formatters and rules - and NOTHING ELSE.

   This file used to be a 606-line hand-written fixture: seventeen invented
   kitchens, their dishes, three coupons, three addresses, a payment list, a
   diner's order history and a monthly spend figure, all typed by hand. Its
   own header said "Nothing here is fetched", and that was true - so a visitor
   opening the Order Food page was shown kitchens that do not exist, an order
   "on the way" that nobody placed, and a rider named Rahul.

   Every one of those arrays is gone. The catalogue now comes from the server:

     kitchens, menus, cuisines, the area      food/FoodCatalogue.jsx
     addresses, orders, coupons, payments,
     usuals, spend                            api/foodApi.js -> /api/v2/food-web

   What is left is what a server has nothing to say about: how to write
   "Rs 1,247", how to turn a minute count into "1:28 pm", what the three diet
   labels are called, and one predicate. They are formatters and a rule, not
   data, and every component that formats money still imports them from here.

   Money is whole rupees everywhere - no paise, no floats to round.
   ══════════════════════════════════════════════════════════════════════════ */

export const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/* "1:28 pm" from minutes past midnight — the one clock formatter for food. */
export const clockLabel = minute => {
  const wrapped = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

/* Ready-by, from the clock in the visitor's own browser plus the kitchen's
   prep time. Recomputed on render rather than baked in, so a fixture opened
   at midnight does not promise lunch. */
export const readyLabel = prepMinutes => {
  const now = new Date();
  return clockLabel(now.getHours() * 60 + now.getMinutes() + prepMinutes);
};

export const DIET_LABEL = { veg: 'Veg', egg: 'Contains egg', nonveg: 'Non-veg' };

/* Veg-only hides DISHES. Pure-veg mode additionally hides kitchens that cook
   anything else — two different questions, which is why the feed keeps them
   as two states of one control rather than one checkbox. */
export const dietAllowed = (diet, mode) => {
  if (mode === 'off') return true;
  return diet === 'veg';
};

/* A kitchen is pure veg when it says so, and the feed trusts that flag rather
   than scanning the menu: a kitchen with no dishes loaded yet is not
   accidentally "pure veg". */
export const isPureVeg = kitchen => Boolean(kitchen?.pureVeg);
