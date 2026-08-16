/**
 * The booking request — the emotional centre of the product.
 *
 * Written for two readers at once: a nervous eighteen-year-old and the parent
 * looking over their shoulder. Nothing in here says "sorry", and none of the
 * three outcomes is red — nothing has been charged at any point, and red would
 * say otherwise.
 */

export { QuoteCard, type QuoteCardProps } from './QuoteCard';
export { WaitingRing, type WaitingRingProps } from './WaitingRing';
export {
  WaitLoader,
  OwnerStatusTrail,
  type WaitLoaderProps,
  type TrailStep,
  type TrailStepState,
} from './OwnerWait';
