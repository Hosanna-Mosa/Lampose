import React from 'react';

/* <ul> and <ol> as one component with an `ordered` flag — "one flag instead
   of two components". The flag is destructured out and never reaches the DOM,
   so the rendered element carries exactly the attributes it was given. */
export const List = React.forwardRef(({ ordered, children, ...rest }, ref) =>
  React.createElement(ordered ? 'ol' : 'ul', { ...rest, ref }, children));
List.displayName = 'List';
