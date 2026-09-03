'use client';

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  sumTypePkr,
  sumTypeAmount,
  txAmountPkr,
  revenuePkrForTx,
  MARKET_EXCHANGE_RATE_DEFAULT,
  REVENUE_WITHDRAWAL_RATE,
  normalizePaidFrom,
  resolveInvestmentExchangeRate,
} from '@/lib/currency';

const ACCOUNTS = 'accounts';
const TRANSACTIONS = 'transactions';
const SETTINGS_DOC = 'settings/app';

function nowIso() {
  return new Date().toISOString();
}

function docData(snap) {
  return { id: snap.id, ...snap.data() };
}

function filterByDate(items, { year, month, from, to } = {}) {
  return items.filter(item => {
    const date = item.date || '';
    if (year && month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      if (!date.startsWith(prefix)) return false;
    } else if (year) {
      if (!date.startsWith(String(year))) return false;
    }
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

function sumByType(transactions, type) {
  return sumTypeAmount(transactions, type);
}

async function getMarketRate() {
  const settings = await getSettingsDoc();
  return resolveInvestmentExchangeRate(settings);
}

async function getAllAccountsRaw() {
  const snap = await getDocs(collection(db, ACCOUNTS));
  return snap.docs.map(docData).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

async function getAllTransactionsRaw() {
  const snap = await getDocs(collection(db, TRANSACTIONS));
  return snap.docs.map(docData);
}

function withAccountNames(transactions, accounts) {
  const map = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  return transactions.map(t => ({
    ...t,
    account_name: t.account_id ? map[t.account_id] || null : null,
  }));
}

export async function ensureSeedData() {
  const accountsSnap = await getDocs(collection(db, ACCOUNTS));

  if (accountsSnap.empty) {
    const batch = writeBatch(db);
    const seeds = [
      ['Upwork Account 1', 'Primary account'],
      ['Upwork Account 2', 'Secondary account'],
      ['Upwork Account 3', 'Third account'],
    ];
    for (const [name, notes] of seeds) {
      const ref = doc(collection(db, ACCOUNTS));
      batch.set(ref, {
        name,
        email: '',
        notes,
        status: 'active',
        created_at: nowIso(),
      });
    }
    await batch.commit();
  }

  const settingsRef = doc(db, 'settings', 'app');
  const settingsSnap = await getDoc(settingsRef);
  if (!settingsSnap.exists()) {
    await setDoc(settingsRef, {
      usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
      investment_usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
    });
  }
}

async function migrateInvestmentRateSettings(settingsRef, data = {}) {
  const dedicated = parseFloat(data.investment_usd_to_pkr);
  if (Number.isFinite(dedicated) && dedicated > 0 && dedicated !== REVENUE_WITHDRAWAL_RATE) {
    return data;
  }

  const legacy = parseFloat(data.usd_to_pkr);
  let rate = MARKET_EXCHANGE_RATE_DEFAULT;
  if (Number.isFinite(legacy) && legacy > 0 && legacy !== REVENUE_WITHDRAWAL_RATE) {
    rate = legacy;
  }

  const updates = {
    investment_usd_to_pkr: rate,
    usd_to_pkr: rate,
  };
  await setDoc(settingsRef, updates, { merge: true });
  return { ...data, ...updates };
}

export async function getSettingsDoc() {
  await ensureSeedData();
  const ref = doc(db, 'settings', 'app');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return {
      usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
      investment_usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
    };
  }
  return migrateInvestmentRateSettings(ref, snap.data());
}

export async function updateSettingsDoc(updates) {
  await ensureSeedData();
  const ref = doc(db, 'settings', 'app');
  const current = (await getDoc(ref)).data() || {};
  await setDoc(ref, { ...current, ...updates }, { merge: true });
  return getSettingsDoc();
}

export async function listAccounts() {
  await ensureSeedData();
  const [accounts, transactions, exchangeRate] = await Promise.all([
    getAllAccountsRaw(),
    getAllTransactionsRaw(),
    getMarketRate(),
  ]);

  return accounts.map(account => {
    const related = transactions.filter(t => t.account_id === account.id);
    const total_investment = sumTypePkr(related, 'investment', exchangeRate);
    const total_revenue = sumByType(related, 'revenue');
    const total_revenue_pkr = related
      .filter(t => t.type === 'revenue')
      .reduce((sum, t) => sum + revenuePkrForTx(t), 0);
    const total_expense = sumTypePkr(related, 'expense', exchangeRate);
    return {
      ...account,
      total_investment,
      total_revenue,
      total_revenue_pkr,
      total_expense,
      costs_pkr: total_investment + total_expense,
    };
  });
}

export async function createAccount(data) {
  await ensureSeedData();
  const ref = doc(collection(db, ACCOUNTS));
  const payload = {
    name: data.name.trim(),
    email: data.email || '',
    notes: data.notes || '',
    status: data.status || 'active',
    created_at: nowIso(),
  };
  await setDoc(ref, payload);
  return { id: ref.id, ...payload };
}

export async function updateAccount(id, data) {
  const ref = doc(db, ACCOUNTS, String(id));
  const existing = await getDoc(ref);
  if (!existing.exists()) return null;

  const payload = {
    name: data.name ?? existing.data().name,
    email: data.email ?? existing.data().email,
    notes: data.notes ?? existing.data().notes,
    status: data.status ?? existing.data().status,
  };
  await updateDoc(ref, payload);
  return { id: ref.id, ...existing.data(), ...payload };
}

export async function deleteAccount(id) {
  const ref = doc(db, ACCOUNTS, String(id));
  const existing = await getDoc(ref);
  if (!existing.exists()) return false;
  await deleteDoc(ref);
  return true;
}

export async function listTransactions(filters = {}) {
  await ensureSeedData();
  const [accounts, transactions] = await Promise.all([
    getAllAccountsRaw(),
    getAllTransactionsRaw(),
  ]);

  let rows = transactions;
  if (filters.type) rows = rows.filter(t => t.type === filters.type);
  if (filters.account_id) rows = rows.filter(t => String(t.account_id) === String(filters.account_id));
  rows = filterByDate(rows, filters);

  rows.sort((a, b) => {
    const dateCmp = (b.date || '').localeCompare(a.date || '');
    if (dateCmp !== 0) return dateCmp;
    return String(b.id).localeCompare(String(a.id));
  });

  return withAccountNames(rows, accounts);
}

export async function createTransaction(data) {
  await ensureSeedData();
  const ref = doc(collection(db, TRANSACTIONS));
  const payload = {
    account_id: data.account_id || null,
    type: data.type,
    amount: parseFloat(data.amount),
    date: data.date,
    description: data.description || '',
    category: data.category || '',
    recipient: data.recipient || '',
    client_name: data.client_name || '',
    job_title: data.job_title || '',
    revenue_source: data.revenue_source || '',
    item_name: data.item_name || '',
    currency: data.currency,
    withdrawal_pkr: data.withdrawal_pkr ?? null,
    withdrawal_rate: data.withdrawal_rate ?? null,
    paid_from: ['investment', 'expense'].includes(data.type)
      ? normalizePaidFrom(data.paid_from)
      : null,
    created_at: nowIso(),
  };
  await setDoc(ref, payload);

  const accounts = await getAllAccountsRaw();
  return withAccountNames([{ id: ref.id, ...payload }], accounts)[0];
}

export async function updateTransaction(id, data, existing) {
  const ref = doc(db, TRANSACTIONS, String(id));
  const txType = data.type ?? existing.type;
  const payload = {
    account_id: data.account_id ?? existing.account_id ?? null,
    type: txType,
    amount: data.amount !== undefined ? parseFloat(data.amount) : existing.amount,
    date: data.date || existing.date,
    description: data.description ?? existing.description,
    category: data.category ?? existing.category,
    recipient: data.recipient ?? existing.recipient,
    client_name: data.client_name ?? existing.client_name,
    job_title: data.job_title ?? existing.job_title,
    revenue_source: data.revenue_source ?? existing.revenue_source,
    item_name: data.item_name ?? existing.item_name,
    currency: data.currency ?? existing.currency,
    withdrawal_pkr: data.withdrawal_pkr !== undefined ? data.withdrawal_pkr : (existing.withdrawal_pkr ?? null),
    withdrawal_rate: data.withdrawal_rate !== undefined ? data.withdrawal_rate : (existing.withdrawal_rate ?? null),
    paid_from: ['investment', 'expense'].includes(txType)
      ? normalizePaidFrom(data.paid_from ?? existing.paid_from)
      : null,
  };
  await updateDoc(ref, payload);

  const accounts = await getAllAccountsRaw();
  return withAccountNames([{ id: ref.id, ...existing, ...payload }], accounts)[0];
}

export async function getTransaction(id) {
  const ref = doc(db, TRANSACTIONS, String(id));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function deleteTransaction(id) {
  const ref = doc(db, TRANSACTIONS, String(id));
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  await deleteDoc(ref);
  return true;
}

export async function getRecentTransactions(limit = 10) {
  const rows = await listTransactions({});
  return rows.slice(0, limit);
}

export async function getMonthlyReport(year) {
  const [transactions, exchangeRate] = await Promise.all([
    filterByDate(await getAllTransactionsRaw(), { year: String(year) }),
    getMarketRate(),
  ]);
  const byMonth = {};

  for (const tx of transactions) {
    const month = (tx.date || '').slice(0, 7);
    if (!month) continue;
    if (!byMonth[month]) {
      byMonth[month] = { month, investment: 0, revenue: 0, revenue_pkr: 0, salary: 0, expense: 0 };
    }
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'revenue') {
      byMonth[month].revenue += amount;
      byMonth[month].revenue_pkr = (byMonth[month].revenue_pkr || 0) + revenuePkrForTx(tx);
    } else if (tx.type === 'investment') {
      byMonth[month].investment += txAmountPkr(tx, exchangeRate);
    } else if (tx.type === 'salary') {
      byMonth[month].salary += txAmountPkr(tx, exchangeRate);
    } else if (tx.type === 'expense') {
      byMonth[month].expense += txAmountPkr(tx, exchangeRate);
    }
  }

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getByAccountReport({ year, month }) {
  const [accounts, transactions, exchangeRate] = await Promise.all([
    getAllAccountsRaw(),
    filterByDate(await getAllTransactionsRaw(), { year, month }),
    getMarketRate(),
  ]);

  return accounts.map(account => {
    const related = transactions.filter(t => t.account_id === account.id);
    const investment = sumTypePkr(related, 'investment', exchangeRate);
    const revenue = sumByType(related, 'revenue');
    const revenue_pkr = related
      .filter(t => t.type === 'revenue')
      .reduce((sum, t) => sum + revenuePkrForTx(t), 0);
    const expense = sumTypePkr(related, 'expense', exchangeRate);
    return {
      id: account.id,
      name: account.name,
      investment,
      revenue,
      revenue_pkr,
      expense,
      costs_pkr: investment + expense,
    };
  });
}

export async function getAccountMonthlyReport(accountId, year) {
  const [transactions, exchangeRate] = await Promise.all([
    filterByDate(await getAllTransactionsRaw(), { year: String(year) })
      .then(rows => rows.filter(t => String(t.account_id) === String(accountId))),
    getMarketRate(),
  ]);

  const byMonth = {};
  for (const tx of transactions) {
    const month = (tx.date || '').slice(0, 7);
    if (!month) continue;
    if (!byMonth[month]) {
      byMonth[month] = { month, investment: 0, revenue: 0, expense: 0 };
    }
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'investment') byMonth[month].investment += txAmountPkr(tx, exchangeRate);
    if (tx.type === 'revenue') byMonth[month].revenue += amount;
    if (tx.type === 'expense') byMonth[month].expense += txAmountPkr(tx, exchangeRate);
  }

  return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
}

export async function getIdMonthlyCostsReport({ year, month }) {
  const [accounts, transactions, exchangeRate] = await Promise.all([
    getAllAccountsRaw(),
    filterByDate(await getAllTransactionsRaw(), { year, month }),
    getMarketRate(),
  ]);

  const costTypes = new Set(['investment', 'expense']);

  return {
    exchange_rate: exchangeRate,
    accounts: accounts.map(account => {
      const related = transactions.filter(
        t => t.account_id === account.id && costTypes.has(t.type),
      );

      const byMonth = {};
      for (const tx of related) {
        const monthKey = (tx.date || '').slice(0, 7);
        if (!monthKey) continue;

        if (!byMonth[monthKey]) {
          byMonth[monthKey] = {
            month: monthKey,
            items: [],
            total_pkr: 0,
            company_pkr: 0,
            own_balance_pkr: 0,
          };
        }

        const pkr = txAmountPkr(tx, exchangeRate);
        const paidFrom = normalizePaidFrom(tx.paid_from);
        const label = tx.category || tx.description || tx.item_name || TYPE_COST_LABEL[tx.type] || tx.type;

        byMonth[monthKey].items.push({
          id: tx.id,
          date: tx.date,
          type: tx.type,
          category: tx.category || '',
          description: tx.description || tx.item_name || '',
          label,
          amount: Number(tx.amount) || 0,
          currency: tx.currency || 'PKR',
          amount_pkr: pkr,
          paid_from: paidFrom,
        });
        byMonth[monthKey].total_pkr += pkr;
        if (paidFrom === 'own_balance') byMonth[monthKey].own_balance_pkr += pkr;
        else byMonth[monthKey].company_pkr += pkr;
      }

      for (const m of Object.values(byMonth)) {
        m.items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }

      const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
      const year_total = months.reduce(
        (acc, m) => ({
          total_pkr: acc.total_pkr + m.total_pkr,
          company_pkr: acc.company_pkr + m.company_pkr,
          own_balance_pkr: acc.own_balance_pkr + m.own_balance_pkr,
        }),
        { total_pkr: 0, company_pkr: 0, own_balance_pkr: 0 },
      );

      return {
        id: account.id,
        name: account.name,
        email: account.email || '',
        status: account.status || 'active',
        months,
        year_total,
      };
    }),
  };
}

const TYPE_COST_LABEL = {
  investment: 'Investment',
  expense: 'Expense',
};

export async function getFilteredTransactions({ year, month }) {
  return filterByDate(await getAllTransactionsRaw(), { year, month });
}

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return;

  let batch = writeBatch(db);
  let ops = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

export async function clearAllData() {
  await clearCollection(TRANSACTIONS);
  await clearCollection(ACCOUNTS);
}

export async function importFromSqlite({ accounts, transactions, settings }) {
  await clearAllData();

  const accountIdMap = {};
  let batch = writeBatch(db);
  let ops = 0;

  for (const acc of accounts) {
    const ref = doc(collection(db, ACCOUNTS));
    accountIdMap[acc.id] = ref.id;
    batch.set(ref, {
      name: acc.name,
      email: acc.email || '',
      notes: acc.notes || '',
      status: acc.status || 'active',
      created_at: acc.created_at || nowIso(),
    });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  }

  for (const tx of transactions) {
    const ref = doc(collection(db, TRANSACTIONS));
    batch.set(ref, {
      account_id: tx.account_id ? accountIdMap[tx.account_id] || null : null,
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      description: tx.description || '',
      category: tx.category || '',
      recipient: tx.recipient || '',
      client_name: tx.client_name || '',
      job_title: tx.job_title || '',
      revenue_source: tx.revenue_source || '',
      item_name: tx.item_name || '',
      currency: tx.currency || (tx.type === 'revenue' ? 'USD' : 'PKR'),
      withdrawal_pkr: tx.withdrawal_pkr ?? null,
      withdrawal_rate: tx.withdrawal_rate ?? null,
      paid_from: ['investment', 'expense'].includes(tx.type)
        ? normalizePaidFrom(tx.paid_from)
        : null,
      created_at: tx.created_at || nowIso(),
    });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  const settingsObj = {
    usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
    investment_usd_to_pkr: MARKET_EXCHANGE_RATE_DEFAULT,
  };
  for (const row of settings) {
    if (row.key === 'usd_to_pkr') {
      const imported = parseFloat(row.value);
      if (Number.isFinite(imported) && imported > 0 && imported !== REVENUE_WITHDRAWAL_RATE) {
        settingsObj.usd_to_pkr = imported;
        settingsObj.investment_usd_to_pkr = imported;
      }
    } else if (row.key === 'manual_revenue_pkr' && row.value) settingsObj.manual_revenue_pkr = parseFloat(row.value);
    else if (row.key === 'revenue_in_acc_usd' && row.value) settingsObj.revenue_in_acc_usd = parseFloat(row.value);
    else if (row.key === 'revenue_in_acc_pkr' && row.value) settingsObj.revenue_in_acc_pkr = parseFloat(row.value);
  }
  await setDoc(doc(db, 'settings', 'app'), settingsObj, { merge: true });

  return {
    accounts: accounts.length,
    transactions: transactions.length,
  };
}
