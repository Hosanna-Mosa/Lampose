import React from 'react';

/* <main> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Main = ({ children, ...rest }) => <main {...rest}>{children}</main>;
