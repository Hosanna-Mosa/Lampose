import React from 'react';

/* <div> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Box = ({ children, ...rest }) => <div {...rest}>{children}</div>;
