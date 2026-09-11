import React from 'react';

/* <a> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Link = ({ children, ...rest }) => <a {...rest}>{children}</a>;
