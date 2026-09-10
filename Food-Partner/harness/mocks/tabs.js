/* app/(dash)/_layout.tsx is 93 lines of custom tab bar handed to <Tabs> as a
   `tabBar` prop. Mock Tabs to () => null and that entire file snapshots as
   nothing — it would pass every comparison while verifying zero of it.
   So this shim actually CALLS props.tabBar with a fabricated navigation state,
   shaped to exactly what TabBar reads: state.index, state.routes[i].{key,name},
   navigation.emit/navigate. */
const React = require('react');

const NAMES = ['index', 'menu', 'orders', 'profile'];
const ROUTES = NAMES.map((name, i) => ({ key: `${name}-${i}`, name }));

/* Which tab renders focused. The capture script flips this to cover the
   focused-pill branch as a second case. */
let focusedIndex = 0;
const setFocusedIndex = (i) => { focusedIndex = i; };

const Tabs = ({ tabBar, children, ...props }) =>
  React.createElement('Tabs', props, [
    tabBar
      ? React.createElement(
          React.Fragment,
          { key: 'tabbar' },
          tabBar({
            state: { index: focusedIndex, routes: ROUTES, routeNames: NAMES },
            navigation: {
              emit: () => ({ defaultPrevented: false }),
              navigate: jest.fn(),
            },
            descriptors: {},
            insets: { top: 47, right: 0, bottom: 34, left: 0 },
          }),
        )
      : null,
    React.createElement(React.Fragment, { key: 'children' }, children),
  ]);

Tabs.Screen = ({ children, ...props }) => React.createElement('Tabs.Screen', props, children);

module.exports = { Tabs, setFocusedIndex, TAB_ROUTES: ROUTES };
