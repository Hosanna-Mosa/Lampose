/**
 * Screen chrome: the parts that sit around content rather than inside it.
 *
 * `components/ui` holds the primitives a screen composes; this folder holds
 * the frame those screens live in — navigation, headers, the action bar and
 * the four universal states.
 */

export { TabBar, type TabBarProps, type TabItem } from './TabBar';
export { WaitingPill } from './WaitingPill';

export {
  ExploreHeader,
  StandardHeader,
  PhotoHeader,
  PhotoHero,
  SearchHeader,
  photoHeaderWindows,
  PHOTO_HERO_HEIGHT,
  usePhotoHeroHeight,
  type ExploreHeaderProps,
  type StandardHeaderProps,
  type PhotoHeaderProps,
  type PhotoHeroProps,
  type SearchHeaderProps,
} from './Headers';

export { StickyCtaBar, type StickyCtaBarProps } from './StickyCtaBar';

export {
  StateTemplate,
  SuccessState,
  ListSkeleton,
  DetailSkeleton,
  RefreshLine,
  type StateTemplateProps,
  type SuccessStateProps,
  type ListSkeletonProps,
} from './StateTemplates';
