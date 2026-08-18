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
