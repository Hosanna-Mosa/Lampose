import React from 'react';

/* <p> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Text = ({ children, ...rest }) => <p {...rest}>{children}</p>;
