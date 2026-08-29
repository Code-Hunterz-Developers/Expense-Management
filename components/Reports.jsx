import { useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api, formatCurrency, currentYear, formatRevenueWithPkr, MARKET_EXCHANGE_RATE_DEFAULT } from '@/lib/client-api';
import { useCachedQuery } from '@/lib/useCachedQuery';

export default function Reports() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');

  const cacheKey = `reports:${year}:${month || 'all'}`;
  const { data, loading } = useCachedQuery(cacheKey, useCallback(async () => {
    const params = { year };
    if (month) params.month = month;
    const [mon, acc, sum, accts] = await Promise.all([
      api.getMonthly(year),
      api.getByAccount(params),
      api.getSummary(params),
      api.getAccounts(),
    ]);
    return {
      monthly: mon,
      byAccount: acc,
      summary: sum,
      accounts: accts,
      exchangeRate: sum.exchange_rate || 267,
      manualPkr: sum.revenue_usd?.is_manual_pkr ? sum.revenue_usd.total_revenue_pkr : null,
    };
  }, [year, month]));

  const monthly = data?.monthly ?? [];
  const byAccount = data?.byAccount ?? [];
  const summary = data?.summary;
  const accounts = data?.accounts ?? [];
  const exchangeRate = data?.exchangeRate ?? MARKET_EXCHANGE_RATE_DEFAULT;
  const effectiveRate = summary?.revenue_withdrawal_rate || 0;
  const calculatedPkr = summary?.revenue_usd?.calculated_pkr ?? 0;
  const manualPkr = data?.manualPkr ?? null;

  const accountMonthlyKey = selectedAccount
    ? `reports:account-monthly:${selectedAccount}:${year}`
    : 'reports:account-monthly:empty';
  const { data: accountMonthlyRaw } = useCachedQuery(accountMonthlyKey, useCallback(async () => {
    if (!selectedAccount) return [];
    return api.getAccountMonthly(selectedAccount, year);
  }, [selectedAccount, year]));
  const accountMonthly = selectedAccount ? (accountMonthlyRaw ?? []) : [];

  const monthRows = monthly.map(m => ({
    ...m,
    total_out: m.investment + m.salary + m.expense,
  }));

  if (loading && !data) {
    return (
      <div className="empty-state">
        <p>Loading reports...</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Reports</h2>
        <p>Month-wise & date-wise detailed breakdown</p>
      </div>

      <div className="filters" style={{ marginBottom: 24 }}>
        <select value={year} onChange={e => setYear(Number(e.target.value))}>
          {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Full Year</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i).toLocaleString('en', { month: 'long' })}
            </option>
          ))}
        </select>
      </div>

      {summary && (
        <>
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15, color: 'var(--success)' }}>Revenue (USD = PKR from withdrawal rates)</h3>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="stat-card revenue">
                <div className="stat-label">Total Revenue</div>
                <div className="stat-value" style={{ fontSize: 22 }}>
                  {formatRevenueWithPkr(summary.revenue_usd?.total_revenue, effectiveRate, manualPkr ?? calculatedPkr)}
                </div>
              </div>
            </div>
          </div>
          <div className="stats-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card investment">
              <div className="stat-label">Investment (PKR)</div>
              <div className="stat-value">{formatCurrency(summary.pkr?.total_investment, 'PKR')}</div>
              <div className="revenue-meta">USD investments @ {exchangeRate} PKR</div>
            </div>
            <div className="stat-card salary">
              <div className="stat-label">Salary (PKR)</div>
              <div className="stat-value">{formatCurrency(summary.pkr?.total_salary, 'PKR')}</div>
            </div>
            <div className="stat-card expense">
              <div className="stat-label">Expenses (PKR)</div>
              <div className="stat-value">{formatCurrency(summary.pkr?.total_expense, 'PKR')}</div>
            </div>
            <div className="stat-card profit">
              <div className="stat-label">Total Outflow (PKR)</div>
              <div className="stat-value">{formatCurrency(summary.pkr?.total_outflow, 'PKR')}</div>
            </div>
          </div>
        </>
      )}

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">Month-wise Report ({year})</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Investment (PKR)</th>
                <th>Revenue (USD = PKR)</th>
                <th>Salary (PKR)</th>
                <th>Expenses (PKR)</th>
                <th>Total Outflow (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">No data</td></tr>
              ) : monthRows.map(row => (
                <tr key={row.month}>
                  <td><strong>{row.month_label}</strong></td>
                  <td style={{ color: 'var(--info)' }}>{formatCurrency(row.investment, 'PKR')}</td>
                  <td style={{ color: 'var(--success)' }}>{formatRevenueWithPkr(row.revenue, null, row.revenue_pkr || null)}</td>
                  <td style={{ color: 'var(--warning)' }}>{formatCurrency(row.salary, 'PKR')}</td>
                  <td style={{ color: 'var(--danger)' }}>{formatCurrency(row.expense, 'PKR')}</td>
                  <td style={{ fontWeight: 700 }}>{formatCurrency(row.total_outflow_pkr, 'PKR')}</td>
                </tr>
              ))}
              {monthRows.length > 0 && (
                <tr style={{ background: 'var(--bg-hover)' }}>
                  <td><strong>TOTAL</strong></td>
                  <td><strong>{formatCurrency(monthRows.reduce((s, r) => s + r.investment, 0), 'PKR')}</strong></td>
                  <td><strong>{formatRevenueWithPkr(monthRows.reduce((s, r) => s + r.revenue, 0), effectiveRate, manualPkr ?? monthRows.reduce((s, r) => s + (r.revenue_pkr || 0), 0))}</strong></td>
                  <td><strong>{formatCurrency(monthRows.reduce((s, r) => s + r.salary, 0), 'PKR')}</strong></td>
                  <td><strong>{formatCurrency(monthRows.reduce((s, r) => s + r.expense, 0), 'PKR')}</strong></td>
                  <td><strong>{formatCurrency(monthRows.reduce((s, r) => s + r.total_outflow_pkr, 0), 'PKR')}</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Per Upwork ID Report</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Upwork ID</th>
                  <th>Investment (PKR)</th>
                  <th>Revenue (USD = PKR)</th>
                  <th>Costs (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {byAccount.map(acc => (
                  <tr key={acc.id}>
                    <td><strong>{acc.name}</strong></td>
                    <td>{formatCurrency(acc.investment, 'PKR')}</td>
                    <td>{formatRevenueWithPkr(acc.revenue, null, acc.revenue_pkr || null)}</td>
                    <td>{formatCurrency(acc.costs_pkr, 'PKR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">Account Monthly Chart</h3>
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)' }}>
              <option value="">Select Upwork ID</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {!selectedAccount ? (
            <div className="empty-state"><p>Select an Upwork ID to view monthly data</p></div>
          ) : accountMonthly.length === 0 ? (
            <div className="empty-state"><p>No data for this account in {year}</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={accountMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3a4f" />
                <XAxis dataKey="month_label" stroke="#8b9cb3" fontSize={11} />
                <YAxis stroke="#8b9cb3" fontSize={11} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: '#1a2332', border: '1px solid #2d3a4f', borderRadius: 8 }}
                  formatter={(v, name, item) => {
                    if (name === 'Revenue (USD)') {
                      const pkr = item?.payload?.revenue_pkr;
                      return pkr ? formatRevenueWithPkr(v, null, pkr) : formatCurrency(v, 'USD');
                    }
                    return formatCurrency(v, 'PKR');
                  }}
                />
                <Legend />
                <Bar dataKey="investment" name="Investment (PKR)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue (USD)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costs_pkr" name="Costs (PKR)" fill="#14b8a6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
