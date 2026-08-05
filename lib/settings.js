'use client';

import {
  getSettingsDoc,
  updateSettingsDoc,
  getFilteredTransactions,
} from '@/lib/firestore';
import {
  REVENUE_WITHDRAWAL_RATE,
  MARKET_EXCHANGE_RATE_DEFAULT,
  currencyForType,
  sumTypePkr,
  sumTypeAmount,
} from '@/lib/currency';

export {
  REVENUE_WITHDRAWAL_RATE,
  MARKET_EXCHANGE_RATE_DEFAULT,
  currencyForType,
  txCurrency,
  amountToPkr,
  txAmountPkr,
  sumTypePkr,
} from '@/lib/currency';

export async function getExchangeRate() {
  const settings = await getSettingsDoc();
  const rate = parseFloat(settings.usd_to_pkr);
  return rate > 0 ? rate : MARKET_EXCHANGE_RATE_DEFAULT;
}

export async function getManualRevenuePkr() {
  const settings = await getSettingsDoc();
  if (settings.manual_revenue_pkr === undefined || settings.manual_revenue_pkr === null || settings.manual_revenue_pkr === '') {
    return null;
  }
  const val = parseFloat(settings.manual_revenue_pkr);
  return Number.isFinite(val) ? val : null;
}

function getSettingNumber(settings, key) {
  if (settings[key] === undefined || settings[key] === null || settings[key] === '') return null;
  const val = parseFloat(settings[key]);
  return Number.isFinite(val) ? val : null;
}

export async function getSettingsPayload() {
  const settings = await getSettingsDoc();
  return {
    usd_to_pkr: await getExchangeRate(),
    manual_revenue_pkr: await getManualRevenuePkr(),
    revenue_in_acc: {
      usd: getSettingNumber(settings, 'revenue_in_acc_usd'),
      pkr: getSettingNumber(settings, 'revenue_in_acc_pkr'),
    },
  };
}

export async function updateSettings(body) {
  const { usd_to_pkr, manual_revenue_pkr, revenue_in_acc_usd, revenue_in_acc_pkr } = body;
  const updates = {};

  if (usd_to_pkr !== undefined) {
    const rate = parseFloat(usd_to_pkr);
    if (!rate || rate <= 0) throw new Error('Valid exchange rate required');
    updates.usd_to_pkr = rate;
  }

  if (manual_revenue_pkr !== undefined) {
    if (manual_revenue_pkr === '' || manual_revenue_pkr === null) {
      updates.manual_revenue_pkr = null;
    } else {
      const pkr = parseFloat(manual_revenue_pkr);
      if (!Number.isFinite(pkr) || pkr < 0) throw new Error('Valid PKR amount required');
      updates.manual_revenue_pkr = pkr;
    }
  }

  if (revenue_in_acc_usd !== undefined) {
    updates.revenue_in_acc_usd = revenue_in_acc_usd === '' || revenue_in_acc_usd === null ? null : parseFloat(revenue_in_acc_usd);
  }

  if (revenue_in_acc_pkr !== undefined) {
    updates.revenue_in_acc_pkr = revenue_in_acc_pkr === '' || revenue_in_acc_pkr === null ? null : parseFloat(revenue_in_acc_pkr);
  }

  await updateSettingsDoc(updates);
  return getSettingsPayload();
}

export function formatMonth(ym) {
  const [, m] = ym.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m, 10) - 1]} ${ym.split('-')[0]}`;
}

export async function getDashboardSummary({ year, month }) {
  const transactions = await getFilteredTransactions({ year, month });
  const exchangeRate = await getExchangeRate();
  const manualPkr = await getManualRevenuePkr();
  const revenueRate = REVENUE_WITHDRAWAL_RATE;

  const totalRevenueUsd = sumTypeAmount(transactions, 'revenue');
  const total_investment = sumTypePkr(transactions, 'investment', exchangeRate);
  const total_salary = sumTypePkr(transactions, 'salary', exchangeRate);
  const total_expense = sumTypePkr(transactions, 'expense', exchangeRate);
  const totalOutflowPkr = total_investment + total_salary + total_expense;

  const calculatedPkr = totalRevenueUsd * revenueRate;
  const displayPkr = manualPkr !== null ? manualPkr : calculatedPkr;
  const deductionsPkr = total_salary + total_expense;
  const revenueInAccPkr = displayPkr - deductionsPkr;
  const revenueInAccUsd = revenueRate > 0 ? revenueInAccPkr / revenueRate : 0;

  return {
    exchange_rate: exchangeRate,
    revenue_withdrawal_rate: revenueRate,
    revenue_usd: {
      total_revenue: totalRevenueUsd,
      calculated_pkr: calculatedPkr,
      total_revenue_pkr: displayPkr,
      is_manual_pkr: manualPkr !== null,
    },
    revenue_in_acc: {
      usd: revenueInAccUsd,
      pkr: revenueInAccPkr,
      deductions_pkr: deductionsPkr,
    },
    pkr: {
      total_investment,
      total_salary,
      total_expense,
      total_outflow: totalOutflowPkr,
    },
  };
}
