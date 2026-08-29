'use client';

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import {
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  listTransactions,
  createTransaction,
  getTransaction,
  updateTransaction,
  deleteTransaction,
  getRecentTransactions,
  getMonthlyReport,
  getByAccountReport,
  getAccountMonthlyReport,
} from '@/lib/firestore';
import {
  getSettingsPayload,
  updateSettings,
  getDashboardSummary,
  formatMonth,
  currencyForType,
  REVENUE_WITHDRAWAL_RATE,
  txCurrency,
} from '@/lib/settings';

export const api = {
  login: async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return {
      user: {
        id: cred.user.uid,
        email: cred.user.email,
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Admin',
        role: 'admin',
      },
    };
  },

  logout: () => signOut(auth),

  getAccounts: () => listAccounts(),
  createAccount: (data) => createAccount(data),
  updateAccount: (id, data) => updateAccount(id, data),
  deleteAccount: (id) => deleteAccount(id),

  getTransactions: (params = {}) => listTransactions(params),
  createTransaction: (data) => createTransaction({
    ...data,
    currency: resolveTransactionCurrency(data),
  }),
  updateTransaction: async (id, data) => {
    const existing = await getTransaction(id);
    if (!existing) throw new Error('Transaction not found');
    const merged = { ...existing, ...data };
    return updateTransaction(id, { ...data, currency: resolveTransactionCurrency(merged) }, existing);
  },
  deleteTransaction: (id) => deleteTransaction(id),

  getSummary: (params = {}) => getDashboardSummary(params),
  getMonthly: async (year) => {
    const rows = await getMonthlyReport(year);
    return rows.map(r => ({
      ...r,
      total_outflow_pkr: r.investment + r.salary + r.expense,
      month_label: formatMonth(r.month),
    }));
  },
  getByAccount: (params = {}) => getByAccountReport(params),
  getAccountMonthly: async (accountId, year) => {
    const rows = await getAccountMonthlyReport(accountId, year);
    return rows.map(r => ({
      ...r,
      costs_pkr: r.investment + r.expense,
      month_label: formatMonth(r.month),
    }));
  },
  getRecent: (limit = 10) => getRecentTransactions(limit),
  getSettings: () => getSettingsPayload(),
  updateSettings: (data) => updateSettings(data),
};

export { currencyForType, REVENUE_WITHDRAWAL_RATE, MARKET_EXCHANGE_RATE_DEFAULT, txCurrency, revenuePkrForTx, revenueRateForTx } from '@/lib/settings';

function resolveTransactionCurrency(data) {
  if (data.type === 'investment' || data.type === 'expense') {
    return data.currency === 'USD' ? 'USD' : 'PKR';
  }
  return currencyForType(data.type);
}

export const CURRENCIES = {
  USD: 'USD',
  PKR: 'PKR',
};

export function formatCurrency(amount, currency = 'USD') {
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${code} ${Number(amount || 0).toLocaleString()}`;
  }
}

export function formatRevenueWithPkr(usdAmount, rate = REVENUE_WITHDRAWAL_RATE, pkrOverride = null) {
  const usd = Number(usdAmount) || 0;
  const pkr = pkrOverride !== null && pkrOverride !== undefined
    ? Number(pkrOverride)
    : usd * rate;
  return `${formatCurrency(usd, 'USD')} = ${formatCurrency(pkr, 'PKR')}`;
}

export function formatRevenueSplit(usdAmount, rate = REVENUE_WITHDRAWAL_RATE, pkrOverride = null) {
  const usd = Number(usdAmount) || 0;
  const pkr = pkrOverride !== null && pkrOverride !== undefined
    ? Number(pkrOverride)
    : usd * rate;
  return {
    usd: formatCurrency(usd, 'USD'),
    pkr: formatCurrency(pkr, 'PKR'),
    isManual: pkrOverride !== null && pkrOverride !== undefined,
  };
}

export function formatUsdWithPkr(usdAmount, rate) {
  const usd = Number(usdAmount) || 0;
  const pkr = usd * rate;
  return {
    usd: formatCurrency(usd, 'USD'),
    pkr: formatCurrency(pkr, 'PKR'),
    combined: `${formatCurrency(usd, 'USD')} = ${formatCurrency(pkr, 'PKR')}`,
  };
}

export function usdToPkr(usdAmount, rate = REVENUE_WITHDRAWAL_RATE) {
  return (Number(usdAmount) || 0) * rate;
}

export function getTxRowDetails(tx) {
  if (tx.type === 'revenue' && (tx.revenue_source === 'upwork' || tx.client_name)) {
    return {
      primary: tx.client_name || '-',
      secondary: tx.job_title || '',
    };
  }
  if (tx.type === 'salary') {
    return {
      primary: tx.recipient || 'Salary',
      secondary: tx.description || tx.category || '',
    };
  }
  if (tx.type === 'expense' || (tx.type === 'revenue' && tx.revenue_source === 'other')) {
    return {
      primary: tx.description || tx.item_name || '-',
      secondary: tx.category || '',
    };
  }
  const primary = tx.category || tx.description || tx.item_name || '-';
  const secondary = tx.description && tx.description !== primary ? tx.description : '';
  return { primary, secondary };
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const TYPE_LABELS = {
  investment: 'Investment',
  revenue: 'Revenue / Profit',
  salary: 'Salary',
  expense: 'Expense',
};

export const TYPE_LABELS_SHORT = {
  investment: 'Investment',
  revenue: 'Revenue',
  salary: 'Salary',
  expense: 'Expense',
};

export const PURCHASE_SUGGESTIONS = [
  'Claude', 'Cursor', 'ChatGPT', 'GitHub Copilot', 'Upwork Connects',
  'Profile Boost', 'Figma', 'Canva', 'Hosting', 'Domain', 'Other',
];

export function getTxDetail(tx) {
  if (tx.type === 'revenue') {
    if (tx.revenue_source === 'upwork' || (!tx.revenue_source && (tx.client_name || tx.job_title))) {
      const parts = [tx.client_name, tx.job_title].filter(Boolean);
      if (parts.length) return parts.join(' — ');
    }
    if (tx.description || tx.item_name) return tx.description || tx.item_name;
  }
  if (tx.type === 'expense') {
    if (tx.description || tx.item_name) return tx.description || tx.item_name;
  }
  if (tx.recipient) return tx.recipient;
  return tx.description || '-';
}

export const MONTHS = [
  { value: '', label: 'All Months' },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
  })),
];

export const currentYear = new Date().getFullYear();
export const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);
