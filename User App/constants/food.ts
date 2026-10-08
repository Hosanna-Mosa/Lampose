/**
 * The Food module's environment gate.
 *
 * The reading moved to `constants/env.ts`, where every environment value in
 * this app now lives — the reason being that "what does this app read from
 * the environment" was previously a grep rather than a file.
 *
 * This stays as the name the Food code imports, because that is what the gate
 * is called at its use sites and renaming it would only make the diff bigger
 * than the change.
 */
export { FOOD_MODE, type FoodMode } from './env';

/**
 * The most an order may come to and still be paid in cash at the door, in
 * rupees. The server enforces it (`COD_LIMIT_RUPEES` in the backend's
 * `foodCustomerOrder.controller.js`); this copy only decides what to offer,
 * so the two must be changed together.
 */
export const COD_LIMIT_RUPEES = 2000;
