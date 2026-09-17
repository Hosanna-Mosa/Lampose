import React from 'react';

/* <option> — passes every attribute straight through and adds nothing of its
   own, so the rendered markup is identical to the hand-written element. */
export const Option = ({ children, ...rest }) => <option {...rest}>{children}</option>;
