/** Fixed Upwork withdrawal rate for revenue USD → PKR */
export const REVENUE_WITHDRAWAL_RATE = 267;

export function currencyForType(type) {
  return type === 'revenue' ? 'USD' : 'PKR';
}

export function txCurrency(tx) {
  if (tx?.currency) return tx.currency;
  return currencyForType(tx?.type);
}

export function amountToPkr(amount, currency, exchangeRate) {
  const value = Number(amount) || 0;
  if (currency === 'USD') return value * exchangeRate;
  return value;
}

export function txAmountPkr(tx, exchangeRate) {
  return amountToPkr(tx.amount, txCurrency(tx), exchangeRate);
}

export function sumTypePkr(transactions, type, exchangeRate) {
  return transactions
    .filter(t => t.type === type)
    .reduce((sum, t) => sum + txAmountPkr(t, exchangeRate), 0);
}

export function sumTypeAmount(transactions, type) {
  return transactions
    .filter(t => t.type === type)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}
