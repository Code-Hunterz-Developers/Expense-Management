import { useState, useCallback } from 'react';
import { api, formatCurrency, formatRevenueWithPkr } from '@/lib/client-api';
import { useCachedQuery, invalidateCache } from '@/lib/useCachedQuery';

const EMPTY = { name: '', email: '', notes: '', status: 'active' };

export default function Accounts() {
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, refresh } = useCachedQuery('accounts:page', useCallback(async () => {
    const [accounts, settings] = await Promise.all([api.getAccounts(), api.getSettings()]);
    return { accounts, exchangeRate: settings.usd_to_pkr };
  }, []));

  const accounts = data?.accounts ?? [];
  const exchangeRate = data?.exchangeRate ?? 267;

  async function refreshAll() {
    invalidateCache('accounts');
    invalidateCache('dashboard');
    invalidateCache('reports');
    await refresh();
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      if (editId) {
        await api.updateAccount(editId, form);
      } else {
        await api.createAccount(form);
      }
      setForm(EMPTY);
      setEditId(null);
      setShowForm(false);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(acc) {
    setForm({ name: acc.name, email: acc.email || '', notes: acc.notes || '', status: acc.status });
    setEditId(acc.id);
    setShowForm(true);
  }

  async function handleDelete(id) {
    if (!confirm('Delete this Upwork ID? Transactions will be unlinked.')) return;
    await api.deleteAccount(id);
    await refreshAll();
  }

  return (
    <>
      <div className="page-header">
        <h2>Upwork IDs</h2>
        <p>Manage your Upwork accounts — investment & profit per ID</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3 className="panel-title">{editId ? 'Edit Account' : 'Add Upwork ID'}</h3>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add ID</button>
          )}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Account Name *</label>
                <input name="name" value={form.name} onChange={handleChange} required placeholder="e.g. Main Upwork Profile" />
              </div>
              <div className="form-group">
                <label>Email / Username</label>
                <input name="email" value={form.email} onChange={handleChange} placeholder="upwork email" />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Any notes about this account..." />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <span className="btn-spinner" aria-hidden="true" />}
                {saving ? (editId ? 'Updating...' : 'Saving...') : (editId ? 'Update' : 'Save')}
              </button>
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="account-grid">
        {accounts.map(acc => (
          <div key={acc.id} className="account-card">
            <div className="account-card-header">
              <div>
                <h3>{acc.name}</h3>
                {acc.email && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{acc.email}</p>}
              </div>
              <span className={`badge ${acc.status === 'active' ? 'badge-revenue' : 'badge-expense'}`}>
                {acc.status}
              </span>
            </div>

            {acc.notes && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{acc.notes}</p>}

            <div className="account-stats">
              <div className="account-stat">
                <label>Total Investment (PKR)</label>
                <span style={{ color: 'var(--info)' }}>{formatCurrency(acc.total_investment, 'PKR')}</span>
              </div>
              <div className="account-stat">
                <label>Total Revenue</label>
                <span style={{ color: 'var(--success)', fontSize: 14 }}>
                  {formatRevenueWithPkr(acc.total_revenue, exchangeRate)}
                </span>
              </div>
              <div className="account-stat">
                <label>Expenses (PKR)</label>
                <span style={{ color: 'var(--danger)' }}>{formatCurrency(acc.total_expense, 'PKR')}</span>
              </div>
              <div className="account-stat">
                <label>Total Costs (PKR)</label>
                <span style={{ color: 'var(--warning)' }}>{formatCurrency(acc.costs_pkr, 'PKR')}</span>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(acc)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(acc.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
