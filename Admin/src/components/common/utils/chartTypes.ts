export interface Datum {
  label: string;
  value: number;
  /** Optional CSS colour var override, e.g. `var(--chart-critical)`. */
  color?: string;
  /** Extra line shown in the tooltip. */
  meta?: string;
}
