/**
 * The primitive set -- one thin wrapper per React Native primitive used in
 * `app/`, each passing everything through so substituting it cannot change
 * what renders.
 *
 * There is deliberately NO `Text` wrapper here. `components/ui/Text` already
 * wraps it, and every `<Text>` in `app/` is that component rather than React
 * Native's. Adding a second one would put a nesting level between them, and
 * nested `Text` inherits style in React Native in a way plain views do not --
 * lines that truncated at one line begin wrapping to two. That is the one
 * place a wrapper is not automatically safe, so it is the one place this set
 * does not go.
 *
 * There is no `List` / `SectionedList` either: `app/` contains no `FlatList`
 * or `SectionList` at all, and an empty folder is a promise the code has not
 * made.
 */
export { Box } from './Box';
export { Tappable } from './Tappable';
export { Scroller } from './Scroller';
export { Picture } from './Picture';
export { Spinner } from './Spinner';
export { BareInput } from './BareInput';
export { Refresher } from './Refresher';
