/** Default shown in revenue form until user sets withdrawal rate */
export const REVENUE_WITHDRAWAL_RATE = 267;

/** Default market rate for investment/expense USD → PKR (editable in settings) */
export const MARKET_EXCHANGE_RATE_DEFAULT = 280;

export function currencyForType(type) {
  return type === 'revenue' ? 'USD' : 'PKR';
}

export function txCurrency(tx) {
  if (tx?.currency) return tx.currency;
  return currencyForType(tx?.type);
}

/** PKR for a revenue tx — uses withdrawal_pkr or amount × withdrawal_rate */
export function revenuePkrForTx(tx) {
  if (tx?.withdrawal_pkr != null && tx.withdrawal_pkr !== '') {
    return Number(tx.withdrawal_pkr) || 0;
  }
  const rate = Number(tx?.withdrawal_rate);
  if (rate > 0) {
    return (Number(tx?.amount) || 0) * rate;
  }
  return 0;
}

/** Effective withdrawal rate for a revenue tx */
export function revenueRateForTx(tx) {
  const usd = Number(tx?.amount) || 0;
  const pkr = revenuePkrForTx(tx);
  if (usd > 0 && pkr > 0) return pkr / usd;
  const rate = Number(tx?.withdrawal_rate);
  return rate > 0 ? rate : null;
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

export const PAID_FROM = {
  company: 'company',
  own_balance: 'own_balance',
};

export const PAID_FROM_LABELS = {
  company: 'Company Account',
  own_balance: 'ID Balance (not withdrawn)',
};

export function normalizePaidFrom(value) {
  return value === PAID_FROM.own_balance ? PAID_FROM.own_balance : PAID_FROM.company;
}

/** Investment/expense USD → PKR — never use legacy revenue withdrawal rate (267) */
export function resolveInvestmentExchangeRate(settings = {}) {
  const dedicated = parseFloat(settings.investment_usd_to_pkr);
  if (Number.isFinite(dedicated) && dedicated > 0) return dedicated;

  const legacy = parseFloat(settings.usd_to_pkr);
  if (Number.isFinite(legacy) && legacy > 0 && legacy !== REVENUE_WITHDRAWAL_RATE) {
    return legacy;
  }

  return MARKET_EXCHANGE_RATE_DEFAULT;
}
