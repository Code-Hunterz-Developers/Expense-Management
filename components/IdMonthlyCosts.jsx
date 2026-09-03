import { useState, useCallback } from 'react';
import {
  api,
  formatCurrency,
  formatDate,
  currentYear,
  MONTHS,
  TYPE_LABELS,
  PAID_FROM_LABELS,
  formatUsdWithPkr,
  MARKET_EXCHANGE_RATE_DEFAULT,
  currentMonth,
} from '@/lib/client-api';
import { useCachedQuery } from '@/lib/useCachedQuery';

function AmountDisplay({ item, exchangeRate }) {
  if (item.currency === 'USD') {
    const { usd, pkr } = formatUsdWithPkr(item.amount, exchangeRate);
    return (
      <div className="amount-stack">
        <div className="amount-usd">{usd}</div>
        <div className="amount-pkr">{pkr}</div>
      </div>
    );
  }
  return <span className="amount-pkr-only">{formatCurrency(item.amount_pkr, 'PKR')}</span>;
}

function PaidFromBadge({ paidFrom }) {
  const isOwn = paidFrom === 'own_balance';
  return (
    <span className={`paid-from-badge ${isOwn ? 'paid-from-own' : 'paid-from-company'}`}>
      {PAID_FROM_LABELS[paidFrom] || PAID_FROM_LABELS.company}
    </span>
  );
}

function MonthBlock({ month, exchangeRate }) {
  return (
    <div className="id-cost-month">
      <div className="id-cost-month-header">
        <h4>{month.month_label}</h4>
        <div className="id-cost-month-totals">
          <span className="id-cost-total">{formatCurrency(month.total_pkr, 'PKR')}</span>
          <span className="paid-from-badge paid-from-company">
            Company: {formatCurrency(month.company_pkr, 'PKR')}
          </span>
          <span className="paid-from-badge paid-from-own">
            ID Balance: {formatCurrency(month.own_balance_pkr, 'PKR')}
          </span>
        </div>
      </div>

      {month.items.length === 0 ? (
        <p className="id-cost-empty-month">No costs recorded for this month</p>
      ) : (
        <div className="table-wrap">
          <table className="responsive-table id-cost-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Item</th>
                <th>Paid From</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {month.items.map(item => (
                <tr key={item.id}>
                  <td data-label="Date">{formatDate(item.date)}</td>
                  <td data-label="Type">
                    <span className={`badge badge-${item.type}`}>{TYPE_LABELS[item.type]}</span>
                  </td>
                  <td data-label="Item">
                    <div className="tx-details">
                      <div className="tx-detail-primary">{item.label}</div>
                      {item.description && item.description !== item.label ? (
                        <div className="tx-detail-secondary">{item.description}</div>
                      ) : null}
                    </div>
                  </td>
                  <td data-label="Paid From">
                    <PaidFromBadge paidFrom={item.paid_from} />
                  </td>
                  <td data-label="Amount">
                    <AmountDisplay item={item} exchangeRate={exchangeRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccountSection({ account, exchangeRate }) {
  return (
    <div className="panel id-cost-account">
      <div className="id-cost-account-header">
        <div>
          <h3>{account.name}</h3>
          {account.email ? <p className="id-cost-account-email">{account.email}</p> : null}
        </div>
        <div className="id-cost-year-totals">
          <div className="id-cost-year-total-main">
            <label>Period Total</label>
            <span>{formatCurrency(account.year_total.total_pkr, 'PKR')}</span>
          </div>
          <div className="id-cost-year-split">
            <span className="paid-from-badge paid-from-company">
              Company: {formatCurrency(account.year_total.company_pkr, 'PKR')}
            </span>
            <span className="paid-from-badge paid-from-own">
              ID Balance: {formatCurrency(account.year_total.own_balance_pkr, 'PKR')}
            </span>
          </div>
        </div>
      </div>

      {account.months.length === 0 ? (
        <p className="empty-state">No connects, subscriptions, or other costs recorded for this ID in the selected period</p>
      ) : (
        account.months.map(month => (
          <MonthBlock key={month.month} month={month} exchangeRate={exchangeRate} />
        ))
      )}
    </div>
  );
}

export default function IdMonthlyCosts() {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const cacheKey = `id-costs:${year}:${month || 'all'}`;
  const { data, loading } = useCachedQuery(cacheKey, useCallback(async () => {
    const params = { year: String(year) };
    if (month) params.month = month;
    return api.getIdMonthlyCosts(params);
  }, [year, month]));

  const accounts = data?.accounts ?? [];
  const exchangeRate = data?.exchange_rate ?? MARKET_EXCHANGE_RATE_DEFAULT;

  if (loading && !data) {
    return (
      <div className="empty-state">
        <p>Loading ID costs...</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>ID Monthly Costs</h2>
        <p>Monthly connects, subscriptions, and expenses per Upwork ID — funded by company account or ID balance</p>
      </div>

      <div className="filters id-cost-filters">
        <select value={year} onChange={e => setYear(Number(e.target.value))}>
          {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Full year (by month)</option>
          {MONTHS.filter(m => m.value).map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="id-cost-legend panel">
        <p>
          <strong>Company Account</strong> — Paid by the company (connects, tools, subscriptions, etc.).
        </p>
        <p>
          <strong>ID Balance</strong> — Deducted from this Upwork ID&apos;s earnings that were not added to revenue or withdrawn.
        </p>
        <p className="id-cost-rate-note">
          USD amounts converted to PKR at market rate: 1 USD = {exchangeRate} PKR
        </p>
      </div>

      <div className="id-cost-grid">
        {accounts.map(account => (
          <AccountSection key={account.id} account={account} exchangeRate={exchangeRate} />
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="empty-state panel">
          <p>No Upwork IDs found. Add accounts from the Upwork IDs page first.</p>
        </div>
      )}
    </>
  );
}
