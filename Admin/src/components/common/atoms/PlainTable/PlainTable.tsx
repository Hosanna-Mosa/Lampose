import React from 'react';

export const PlainTable: React.FC<React.TableHTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }> = (props) => (
  <table {...props} />
);

export const TableHead: React.FC<React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }> = (props) => (
  <thead {...props} />
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }> = (props) => (
  <tbody {...props} />
);

export const PlainTr: React.FC<React.HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }> = (props) => (
  <tr {...props} />
);

export const PlainTh: React.FC<React.ThHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }> = (props) => (
  <th {...props} />
);

export const PlainTd: React.FC<React.TdHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }> = (props) => (
  <td {...props} />
);

export const Caption: React.FC<React.HTMLAttributes<HTMLTableCaptionElement> & { ref?: React.Ref<HTMLTableCaptionElement> }> = (props) => (
  <caption {...props} />
);
