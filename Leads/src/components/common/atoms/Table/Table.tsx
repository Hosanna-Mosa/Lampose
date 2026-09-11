import React from 'react';

/* The table elements are only ever meaningful together, so they share one
   file — "closely coupled parts share a file". Each is a bare passthrough:
   same tag, same attributes, no classes of its own. */

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ children, ...rest }) => (
  <table {...rest}>{children}</table>
);

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...rest }) => (
  <thead {...rest}>{children}</thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...rest }) => (
  <tbody {...rest}>{children}</tbody>
);

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({ children, ...rest }) => (
  <tr {...rest}>{children}</tr>
);

export const TableHeaderCell: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ children, ...rest }) => (
  <th {...rest}>{children}</th>
);

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ children, ...rest }) => (
  <td {...rest}>{children}</td>
);
