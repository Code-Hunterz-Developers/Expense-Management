import { useState, useCallback } from 'react';
import { api, formatCurrency, formatDate, TYPE_LABELS, TYPE_LABELS_SHORT, MONTHS, YEARS, currencyForType, formatRevenueSplit, formatUsdWithPkr, getTxRowDetails, txCurrency, REVENUE_WITHDRAWAL_RATE } from '@/lib/client-api';
import { useCachedQuery, invalidateCache } from '@/lib/useCachedQuery';

function AmountCell({ tx, exchangeRate }) {
  if (tx.type === 'revenue') {
    const { usd, pkr } = formatRevenueSplit(tx.amount, REVENUE_WITHDRAWAL_RATE);
    return (
      <div className="amount-stack">
        <div className="amount-usd">{usd}</div>
        <div className="amount-pkr">{pkr}</div>
      </div>
    );
  }
  if (txCurrency(tx) === 'USD') {
    const { usd, pkr } = formatUsdWithPkr(tx.amount, exchangeRate);
    return (
      <div className="amount-stack">
        <div className="amount-usd">{usd}</div>
        <div className="amount-pkr">{pkr}</div>
      </div>
    );
  }
  return <span className="amount-pkr-only">{formatCurrency(tx.amount, 'PKR')}</span>;
}

function DetailsCell({ tx }) {
  const { primary, secondary } = getTxRowDetails(tx);
  return (
    <div className="tx-details">
      <div className="tx-detail-primary" title={primary}>{primary}</div>
      {secondary ? (
        <div className="tx-detail-secondary" title={secondary}>{secondary}</div>
      ) : null}
    </div>
  );
}

const EMPTY_FORM = {
  type: 'investment',
  account_id: '',
  amount: '',
  currency: 'PKR',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  category: '',
  recipient: '',
  revenue_source: 'upwork',
  client_name: '',
  job_title: '',
};

export default function Transactions() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ type: '', account_id: '', year: '', month: '' });

  const { data: accountsData } = useCachedQuery('accounts:list', () => api.getAccounts());
  const accounts = accountsData ?? [];

  const { data: settingsData } = useCachedQuery('settings', () => api.getSettings());
  const exchangeRate = settingsData?.usd_to_pkr ?? 267;

  const txKey = `transactions:${filters.type}:${filters.account_id}:${filters.year}:${filters.month}`;
  const { data: txData, loading, refresh: refreshTx } = useCachedQuery(txKey, useCallback(async () => {
    const params = {};
    if (filters.type) params.type = filters.type;
    if (filters.account_id) params.account_id = filters.account_id;
    if (filters.year) params.year = filters.year;
    if (filters.month) params.month = filters.month;
    return api.getTransactions(params);
  }, [filters.type, filters.account_id, filters.year, filters.month]));
  const transactions = txData ?? [];

  async function refreshAll() {
    invalidateCache('transactions');
    invalidateCache('dashboard');
    invalidateCache('reports');
    invalidateCache('accounts');
    await refreshTx();
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'type') {
        next.revenue_source = value === 'revenue' ? 'upwork' : '';
        next.client_name = '';
        next.job_title = '';
        next.description = '';
        next.recipient = '';
        next.currency = value === 'investment' ? (prev.currency === 'USD' ? 'USD' : 'PKR') : currencyForType(value);
      }
      if (name === 'revenue_source') {
        next.client_name = '';
        next.job_title = '';
        next.description = '';
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const payload = {
        ...form,
        account_id: form.account_id || null,
        amount: parseFloat(form.amount),
        currency: form.type === 'investment' ? form.currency : currencyForType(form.type),
        revenue_source: form.type === 'revenue' ? form.revenue_source : '',
        item_name: '',
      };

      if (editId) {
        await api.updateTransaction(editId, payload);
      } else {
        await api.createTransaction(payload);
      }

      setForm(EMPTY_FORM);
      setEditId(null);
      setShowForm(false);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(tx) {
    setForm({
      type: tx.type,
      account_id: tx.account_id || '',
      amount: String(tx.amount),
      currency: tx.currency || currencyForType(tx.type),
      date: tx.date,
      description: tx.description || tx.item_name || '',
      category: tx.category || '',
      recipient: tx.recipient || '',
      revenue_source: tx.revenue_source || (tx.type === 'revenue' ? 'upwork' : ''),
      client_name: tx.client_name || '',
      job_title: tx.job_title || '',
    });
    setEditId(tx.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return;
    await api.deleteTransaction(id);
    await refreshAll();
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
  }

  const needsAccount = ['investment', 'revenue', 'expense'].includes(form.type);
  const isSalary = form.type === 'salary';
  const isRevenue = form.type === 'revenue';
  const isUpworkRevenue = isRevenue && form.revenue_source === 'upwork';
  const isOtherRevenue = isRevenue && form.revenue_source === 'other';
  const showOtherDescription = isOtherRevenue || form.type === 'expense';

  return (
    <>
      <div className="page-header">
        <h2>Transactions</h2>
        <p>Add & manage investment, revenue, salary & expenses</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">{editId ? 'Edit Entry' : 'Add New Entry'}</h3>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Add Transaction
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Type *</label>
                <select name="type" value={form.type} onChange={handleChange} required>
                  <option value="investment">Investment (Upwork connects, ads, etc.)</option>
                  <option value="revenue">Revenue / Profit (Upwork earnings)</option>
                  <option value="salary">Salary Paid</option>
                  <option value="expense">Other Expense</option>
                </select>
              </div>

              {isRevenue && (
                <div className="form-group">
                  <label>Revenue Source *</label>
                  <select name="revenue_source" value={form.revenue_source} onChange={handleChange} required>
                    <option value="upwork">Upwork Client Payment</option>
                    <option value="other">Other Source</option>
                  </select>
                </div>
              )}

              {needsAccount && (
                <div className="form-group">
                  <label>Upwork ID {isUpworkRevenue ? '*' : ''}</label>
                  <select
                    name="account_id"
                    value={form.account_id}
                    onChange={handleChange}
                    required={isUpworkRevenue}
                  >
                    <option value="">Select account</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {isUpworkRevenue && (
                <>
                  <div className="form-group">
                    <label>Client Name *</label>
                    <input
                      name="client_name"
                      value={form.client_name}
                      onChange={handleChange}
                      required
                      placeholder="e.g. John Smith"
                    />
                  </div>
                  <div className="form-group">
                    <label>Job Title *</label>
                    <input
                      name="job_title"
                      value={form.job_title}
                      onChange={handleChange}
                      required
                      placeholder="e.g. React Developer — E-commerce App"
                    />
                  </div>
                </>
              )}

              {showOtherDescription && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Description *</label>
                  <input
                    name="description"
                    type="text"
                    value={form.description}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Claude, Cursor, Upwork Connects..."
                  />
                </div>
              )}

              <div className="form-group">
                <label>Amount ({form.type === 'investment' ? form.currency : currencyForType(form.type)}) *</label>
                <input name="amount" type="number" step="0.01" min="0" value={form.amount} onChange={handleChange} required />
              </div>

              {form.type === 'investment' && (
                <div className="form-group">
                  <label>Currency *</label>
                  <select name="currency" value={form.currency} onChange={handleChange} required>
                    <option value="PKR">PKR (Rs)</option>
                    <option value="USD">USD ($) — actual rate se convert</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Date *</label>
                <input name="date" type="date" value={form.date} onChange={handleChange} required />
              </div>

              {isSalary && (
                <div className="form-group">
                  <label>Recipient Name</label>
                  <input name="recipient" value={form.recipient} onChange={handleChange} placeholder="Employee name" />
                </div>
              )}

              {!showOtherDescription && !isUpworkRevenue && (
                <div className="form-group">
                  <label>Category</label>
                  <input name="category" value={form.category} onChange={handleChange} placeholder="e.g. Connects, Bonus, Tools" />
                </div>
              )}

              {!showOtherDescription && form.type !== 'salary' && (
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes</label>
                  <textarea name="description" value={form.description} onChange={handleChange} placeholder="Extra notes..." />
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <span className="btn-spinner" aria-hidden="true" />}
                {saving ? (editId ? 'Updating...' : 'Saving...') : `${editId ? 'Update' : 'Save'} Entry`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelForm} disabled={saving}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">All Transactions</h3>
          <div className="filters">
            <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
              <option value="">All Types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select value={filters.account_id} onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">All Accounts</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}>
              <option value="">All Years</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="table-wrap transactions-table-wrap">
          <table className="responsive-table transactions-table">
            <thead>
              <tr>
                <th className="col-date">Date</th>
                <th className="col-type">Type</th>
                <th className="col-account">Upwork ID</th>
                <th className="col-details">Details</th>
                <th className="col-amount">Amount</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && txData == null ? (
                <tr><td colSpan={6} className="empty-state">Loading...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="empty-state">No transactions found</td></tr>
              ) : transactions.map(tx => (
                <tr key={tx.id}>
                  <td data-label="Date" className="col-date">{formatDate(tx.date)}</td>
                  <td data-label="Type" className="col-type">
                    <span className={`badge badge-${tx.type} badge-type`} title={TYPE_LABELS[tx.type]}>
                      {TYPE_LABELS_SHORT[tx.type]}
                    </span>
                  </td>
                  <td data-label="Upwork ID" className="col-account">
                    <span className="cell-ellipsis" title={tx.account_name || '-'}>{tx.account_name || '-'}</span>
                  </td>
                  <td data-label="Details" className="col-details">
                    <DetailsCell tx={tx} />
                  </td>
                  <td data-label="Amount" className="col-amount">
                    <AmountCell tx={tx} exchangeRate={exchangeRate} />
                  </td>
                  <td data-label="Actions" className="col-actions">
                    <div className="actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(tx)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tx.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
