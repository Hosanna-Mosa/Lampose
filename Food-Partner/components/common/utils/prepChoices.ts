/* The prep-time choices a kitchen may pick from: the standard list, plus this
   restaurant's own standing time if it has one, de-duplicated and sorted.

   Both this and PREP_MINUTES were written out verbatim in the order queue and in
   the new-order sheet. Implementations were compared, not names, before merging. */

export const PREP_MINUTES = [15, 20, 30, 45];

export const prepChoices = (standing: number | null) => {
  const all = standing && standing > 0 ? [...PREP_MINUTES, Math.round(standing)] : PREP_MINUTES;
  return Array.from(new Set(all)).sort((a, b) => a - b);
};
