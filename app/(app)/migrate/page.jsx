'use client';

import { useState } from 'react';
import initSqlJs from 'sql.js';
import { importFromSqlite } from '@/lib/firestore';

function queryAll(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function parseDbBuffer(buffer) {
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  const db = new SQL.Database(new Uint8Array(buffer));
  const accounts = queryAll(db, 'SELECT * FROM upwork_accounts ORDER BY id');
  const transactions = queryAll(db, 'SELECT * FROM transactions ORDER BY id');
  const settings = queryAll(db, 'SELECT key, value FROM settings');
  db.close();
  return { accounts, transactions, settings };
}

export default function MigratePage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function runMigration(source) {
    setLoading(true);
    setStatus('Reading database...');
    try {
      let buffer;
      if (source === 'bundled') {
        const res = await fetch('/migration/expenses.db');
        if (!res.ok) throw new Error('Backup file not found');
        buffer = await res.arrayBuffer();
      } else {
        buffer = await source.arrayBuffer();
      }

      const data = await parseDbBuffer(buffer);
      setStatus(`Found ${data.accounts.length} accounts, ${data.transactions.length} transactions. Uploading to Firestore...`);

      const result = await importFromSqlite(data);
      setDone(true);
      setStatus(`Done! Migrated ${result.accounts} accounts and ${result.transactions} transactions.`);
    } catch (err) {
      setStatus(`Error: ${err.message || 'Migration failed'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Import Data</h2>
        <p>SQLite backup → Firebase Firestore (one-time)</p>
      </div>

      <div className="panel">
        <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: 14 }}>
          Purana data <code>expenses.db</code> se Firestore mein import hoga. Pehle se Firestore data replace ho jayega.
        </p>

        {status && (
          <div className={done ? 'login-error' : 'revenue-meta'} style={done ? { background: 'var(--success-dim)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.25)', padding: 12, borderRadius: 8, marginBottom: 16 } : { marginBottom: 16 }}>
            {status}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => runMigration('bundled')}
          >
            {loading ? 'Importing...' : 'Import Local Backup'}
          </button>

          <label className="btn btn-secondary" style={{ cursor: loading ? 'not-allowed' : 'pointer' }}>
            Upload .db File
            <input
              type="file"
              accept=".db"
              hidden
              disabled={loading}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) runMigration(file);
              }}
            />
          </label>
        </div>

        {done && (
          <div style={{ marginTop: 20 }}>
            <a href="/dashboard" className="btn btn-primary btn-sm">Go to Dashboard</a>
          </div>
        )}
      </div>
    </>
  );
}
