export const CATCHES = [
  { k: 'concentration', t: 'Customers you depend on too much', d: 'When a few buyers carry the business.' },
  { k: 'profitability', t: 'Products that lose money', d: 'Hidden inside categories that look profitable.' },
  { k: 'returns', t: 'Returns and cancellations', d: 'Which products keep coming back, and what it costs.' },
  { k: 'retention', t: 'Customers who stopped buying', d: 'Your best buyers going quiet, and new ones not returning.' },
  { k: 'product', t: 'Products that stopped selling', d: 'Sold this time last year, nothing now.' },
  { k: 'anomaly', t: 'Anything falling behind', d: 'Your main products, customers and countries compared with the rest.' },
  { k: 'trend', t: 'Shrinking sales or basket size', d: 'Compared with the same period last year.' },
  { k: 'seasonality', t: 'Seasonal cash crunches', d: 'When most of the year\'s money lands in a few months.' },
  { k: 'data-quality', t: 'Messy records', d: 'Duplicates, missing customers, fees mixed into sales.' },
];
export const RULES = [
  { t: 'Same period last year', d: 'Recent weeks are compared with the same weeks a year earlier, so a holiday rush never looks like growth.' },
  { t: 'Only real changes count', d: 'A drop is reported only if it passes a statistical test (Welch t of −2 or stronger), not random noise.' },
  { t: 'Every number is calculated', d: 'Totals, percentages and money come from code. AI explains and suggests; the code checks.' },
  { t: 'Estimates say so', d: 'What a fix could be worth is labeled an estimate, with the formula and your numbers shown.' },
];
