import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { api, formatCurrency, formatDate, TYPE_LABELS, currentYear, getTxDetail, formatRevenueWithPkr, REVENUE_WITHDRAWAL_RATE, txCurrency, formatUsdWithPkr, MARKET_EXCHANGE_RATE_DEFAULT } from '@/lib/client-api';
import { useRouter } from 'next/navigation';
import { useCachedQuery, invalidateCache } from '@/lib/useCachedQuery';

export default function Dashboard() {
  const router = useRouter();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState('');
  const [showRevenueEdit, setShowRevenueEdit] = useState(false);
  const [showRateEdit, setShowRateEdit] = useState(false);
  const [rateInput, setRateInput] = useState('280');
  const [pkrInput, setPkrInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingRate, setSavingRate] = useState(false);

  const cacheKey = `dashboard:${year}:${month || 'all'}`;
  const { data, loading, refresh } = useCachedQuery(cacheKey, useCallback(async () => {
    const params = { year };
    if (month) params.month = month;
    const [sum, mon, acc, rec] = await Promise.all([
      api.getSummary(params),
      api.getMonthly(year),
      api.getByAccount(params),
      api.getRecent(8),
    ]);
    return {
      summary: sum,
      monthly: mon,
      byAccount: acc,
      recent: rec,
      exchangeRate: sum.exchange_rate || 267,
      manualPkr: sum.revenue_usd?.is_manual_pkr ? sum.revenue_usd.total_revenue_pkr : null,
    };
  }, [year, month]));

  const summary = data?.summary;
  const monthly = data?.monthly ?? [];
  const byAccount = data?.byAccount ?? [];
  const recent = data?.recent ?? [];
  const exchangeRate = data?.exchangeRate ?? MARKET_EXCHANGE_RATE_DEFAULT;
  const revenueRate = REVENUE_WITHDRAWAL_RATE;
  const manualPkr = data?.manualPkr ?? null;

  useEffect(() => {
    if (data) {
      setRateInput(String(data.exchangeRate));
      setPkrInput(data.manualPkr !== null ? String(Math.round(data.manualPkr)) : '');
    }
  }, [data]);

  async function saveRevenuePkr(useAuto = false) {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      const payload = {
        manual_revenue_pkr: useAuto
          ? ''
          : pkrInput.trim()
            ? parseFloat(pkrInput)
            : '',
      };
      await api.updateSettings(payload);
      setShowRevenueEdit(false);
      invalidateCache('dashboard');
      invalidateCache('reports');
      await refresh();
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveInvestmentRate() {
    const rate = parseFloat(rateInput);
    if (!rate || rate <= 0 || savingRate) return;
    setSavingRate(true);
    try {
      await api.updateSettings({ usd_to_pkr: rate });
      setShowRateEdit(false);
      invalidateCache('dashboard');
      invalidateCache('reports');
      invalidateCache('accounts');
      invalidateCache('transactions');
      await refresh();
    } finally {
      setSavingRate(false);
    }
  }

  const totalUsd = summary?.revenue_usd?.total_revenue || 0;
  const calculatedPkr = totalUsd * revenueRate;
  const revenueInAccPkr = summary?.revenue_in_acc?.pkr ?? (calculatedPkr - (summary?.pkr?.total_salary || 0) - (summary?.pkr?.total_expense || 0));
  const revenueInAccUsd = summary?.revenue_in_acc?.usd ?? (revenueRate > 0 ? revenueInAccPkr / revenueRate : 0);
  const deductionsPkr = summary?.revenue_in_acc?.deductions_pkr ?? ((summary?.pkr?.total_salary || 0) + (summary?.pkr?.total_expense || 0));

  const filterLabel = month
    ? `${new Date(2000, parseInt(month) - 1).toLocaleString('en', { month: 'long' })} ${year}`
    : `Year ${year}`;

  if (loading && !data) {
    return <div className="empty-state"><p>Loading dashboard...</p></div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Upwork sales, investment, profit & salary overview</p>
      </div>

      <div className="filters" style={{ marginBottom: 24 }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))}>
          {[currentYear, currentYear - 1, currentYear - 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">All Months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i).toLocaleString('en', { month: 'long' })}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Showing: {filterLabel}</span>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: 'var(--success)' }}>Revenue (USD = PKR)</h3>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="stat-card revenue revenue-card">
            <div className="stat-card-head">
              <div className="stat-label">Total Revenue</div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setShowRevenueEdit(v => {
                    const next = !v;
                    if (next) {
                      setPkrInput(
                        manualPkr !== null
                          ? String(Math.round(manualPkr))
                          : String(Math.round(calculatedPkr))
                      );
                    }
                    return next;
                  });
                }}
              >
                {showRevenueEdit ? 'Close' : 'Edit Amount'}
              </button>
            </div>

            {!showRevenueEdit ? (
              <>
                <div className="stat-value revenue-display">
                  {formatRevenueWithPkr(totalUsd, revenueRate, manualPkr)}
                </div>
                <div className="revenue-meta">
                  Withdrawal rate: 1 USD = {revenueRate} PKR (fixed)
                  {manualPkr !== null && <span className="manual-tag"> · Manual PKR</span>}
                </div>

                <div className="revenue-in-acc">
                  <div className="stat-label">Total Revenue in Acc</div>
                  <div className="stat-value revenue-display revenue-in-acc-value">
                    {formatRevenueWithPkr(revenueInAccUsd, revenueRate, revenueInAccPkr)}
                  </div>
                  <div className="revenue-meta">
                    Revenue − salary & expense
                    {deductionsPkr > 0 && ` · −${formatCurrency(deductionsPkr, 'PKR')}`}
                  </div>
                </div>
              </>
            ) : (
              <div className="revenue-edit-form">
                <div className="form-group">
                  <label>USD Total (auto)</label>
                  <input value={formatCurrency(totalUsd, 'USD')} disabled />
                </div>
                <div className="form-group">
                  <label>Withdrawal Rate (fixed)</label>
                  <input value={`1 USD = ${revenueRate} PKR`} disabled />
                </div>
                <div className="form-group">
                  <label>PKR Amount (manual override)</label>
                  <input
                    type="number"
                    value={pkrInput}
                    onChange={e => setPkrInput(e.target.value)}
                    placeholder={`Auto: ${formatCurrency(calculatedPkr, 'PKR')}`}
                  />
                </div>

                <div className="revenue-edit-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={savingSettings} onClick={() => saveRevenuePkr(false)}>
                    {savingSettings && <span className="btn-spinner" aria-hidden="true" />}
                    {savingSettings ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={savingSettings} onClick={() => saveRevenuePkr(true)}>
                    {savingSettings && <span className="btn-spinner" aria-hidden="true" />}
                    {savingSettings ? 'Saving...' : 'Use Auto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--primary)' }}>Costs & Expenses (PKR)</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRateEdit(v => !v)}>
            {showRateEdit ? 'Close Rate' : 'Edit USD Rate'}
          </button>
        </div>
        {showRateEdit && (
          <div className="panel" style={{ marginBottom: 16, padding: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Investment USD amounts convert at this actual market rate.
            </p>
            <div className="form-grid" style={{ gridTemplateColumns: 'minmax(200px, 280px) auto', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>1 USD = PKR (investment)</label>
                <input type="number" value={rateInput} onChange={e => setRateInput(e.target.value)} />
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={savingRate} onClick={saveInvestmentRate}>
                {savingRate && <span className="btn-spinner" aria-hidden="true" />}
                {savingRate ? 'Saving...' : 'Save Rate'}
              </button>
            </div>
          </div>
        )}
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Investment USD rate: 1 USD = {exchangeRate} PKR
        </p>
        <div className="stats-grid">
          <div className="stat-card investment">
            <div className="stat-label">Total Investment</div>
            <div className="stat-value">{formatCurrency(summary?.pkr?.total_investment, 'PKR')}</div>
          </div>
          <div className="stat-card salary">
            <div className="stat-label">Total Salary Paid</div>
            <div className="stat-value">{formatCurrency(summary?.pkr?.total_salary, 'PKR')}</div>
          </div>
          <div className="stat-card expense">
            <div className="stat-label">Other Expenses</div>
            <div className="stat-value">{formatCurrency(summary?.pkr?.total_expense, 'PKR')}</div>
          </div>
          <div className="stat-card profit">
            <div className="stat-label">Total Outflow (PKR)</div>
            <div className="stat-value">{formatCurrency(summary?.pkr?.total_outflow, 'PKR')}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Monthly Breakdown ({year})</h3>
          </div>
          {monthly.length === 0 ? (
            <div className="empty-state"><p>No data for this year</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
                <XAxis dataKey="month_label" stroke="#8b9cb3" fontSize={12} />
                <YAxis stroke="#8b9cb3" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1a2332', border: '1px solid #2d3a4f', borderRadius: 8 }}
                  formatter={(v, name) => {
                    if (name === 'Revenue (USD)') return formatRevenueWithPkr(v, revenueRate, null);
                    return formatCurrency(v, 'PKR');
                  }}
                />
                <Legend />
                <Bar dataKey="investment" name="Investment (PKR)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue (USD)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="salary" name="Salary (PKR)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Monthly Trends ({year})</h3>
          </div>
          {monthly.length === 0 ? (
            <div className="empty-state"><p>No data for this year</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
                <XAxis dataKey="month_label" stroke="#8b9cb3" fontSize={12} />
                <YAxis stroke="#8b9cb3" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: '#1a2332', border: '1px solid #2d3a4f', borderRadius: 8 }}
                  formatter={(v, name) => {
                    if (name === 'Revenue (USD)') return formatRevenueWithPkr(v, revenueRate, null);
                    return formatCurrency(v, 'PKR');
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Revenue (USD)" stroke="#22c55e" strokeWidth={3} dot={{ fill: '#22c55e' }} />
                <Line type="monotone" dataKey="total_outflow_pkr" name="Total Outflow (PKR)" stroke="#14b8a6" strokeWidth={3} dot={{ fill: '#14b8a6' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Per Upwork ID Summary</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push('/accounts')}>
            Manage IDs
          </button>
        </div>
        <div className="account-grid">
          {byAccount.map(acc => (
            <div key={acc.id} className="account-card">
              <div className="account-card-header">
                <h3>{acc.name}</h3>
              </div>
              <div className="account-stats">
                <div className="account-stat">
                  <label>Investment (PKR)</label>
                  <span style={{ color: 'var(--info)' }}>{formatCurrency(acc.investment, 'PKR')}</span>
                </div>
                <div className="account-stat">
                  <label>Revenue (USD → PKR)</label>
                  <span style={{ color: 'var(--success)', fontSize: 14 }}>
                    {formatRevenueWithPkr(acc.revenue, revenueRate, null)}
                  </span>
                </div>
                <div className="account-stat">
                  <label>Expenses (PKR)</label>
                  <span style={{ color: 'var(--danger)' }}>{formatCurrency(acc.expense, 'PKR')}</span>
                </div>
                <div className="account-stat">
                  <label>Total Costs (PKR)</label>
                  <span style={{ color: 'var(--warning)' }}>{formatCurrency(acc.costs_pkr, 'PKR')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Recent Transactions</h3>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/transactions')}>
            + Add Entry
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Account</th>
                <th>Client / Item</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No transactions yet</td></tr>
              ) : recent.map(tx => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td><span className={`badge badge-${tx.type}`}>{TYPE_LABELS[tx.type]}</span></td>
                  <td>{tx.account_name || '-'}</td>
                  <td>{getTxDetail(tx)}</td>
                  <td><strong>{
                    tx.type === 'revenue'
                      ? formatRevenueWithPkr(tx.amount, revenueRate, null)
                      : txCurrency(tx) === 'USD'
                        ? formatUsdWithPkr(tx.amount, exchangeRate).combined
                        : formatCurrency(tx.amount, 'PKR')
                  }</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
