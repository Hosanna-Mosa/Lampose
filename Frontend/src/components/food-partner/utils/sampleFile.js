export const sampleFileFor = (label, accept) => {
  const csv = accept.includes('.csv');
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_sample.${csv ? 'csv' : 'png'}`;
  const body = csv
    ? 'category,itemName,price,description,type,isBestseller\n'
      + 'Starters,Paneer Tikka,220,Char-grilled cottage cheese,Veg,yes\n'
      + 'Main Course,Chicken Biryani,320,Dum-cooked with long grain rice,Non-Veg,yes\n'
    : 'sample document';

  return new File([body], name, { type: csv ? 'text/csv' : 'image/png' });
};
