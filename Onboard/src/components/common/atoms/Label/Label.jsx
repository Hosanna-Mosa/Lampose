import React from 'react';

/* <label> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Label = ({ children, ...rest }) => <label {...rest}>{children}</label>;
