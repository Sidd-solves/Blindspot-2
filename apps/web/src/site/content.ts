export const CATCHES = [
  { k: 'concentration', t: 'Customers you depend on too much', d: 'When a few buyers carry the business.' },
  { k: 'profitability', t: 'Products that lose money', d: 'Hidden inside categories that look profitable.' },
  { k: 'returns', t: 'Returns and cancellations', d: 'Which products keep coming back, and what it costs.' },
  {
    k: 'retention',
    t: 'Customers who stopped buying',
    d: 'Your best buyers going quiet, and new ones not returning.',
  },
  { k: 'product', t: 'Products that stopped selling', d: 'Sold this time last year, nothing now.' },
  {
    k: 'anomaly',
    t: 'Sales or products falling behind',
    d: 'Your main products and countries compared with the rest, and with last year.',
  },
  { k: 'concentration', t: 'Sales stuck in one market', d: 'When almost every sale comes from one country.' },
  { k: 'outlier', t: 'Relying on a few huge orders', d: 'When a handful of big orders carry the year.' },
  {
    k: 'seasonality',
    t: 'Seasonal sales dips',
    d: "When most of the year's money lands in a few months.",
  },
  { k: 'data-quality', t: 'Messy records', d: 'Duplicates, missing customers, fees mixed into sales.' },
];
export const RULES = [
  {
    t: 'Same period last year',
    d: 'Recent weeks are compared with the same weeks a year earlier, so a holiday rush never looks like growth.',
  },
  {
    t: 'Only real changes count',
    d: 'A drop counts only if it passes a statistical test, adjusted for checking many products at once. Weaker signals are shown as "not confirmed".',
  },
  {
    t: 'Every number is calculated',
    d: 'Totals, percentages and money come from code. AI explains and suggests; the code checks.',
  },
  {
    t: 'Estimates say so',
    d: 'What a fix could be worth is labeled an estimate, with the formula and your numbers shown.',
  },
];
