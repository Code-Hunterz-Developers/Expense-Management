/**
 * One-time migration: SQLite (data/expenses.db) → Firebase Firestore
 * Run: npm run migrate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'expenses.db');

async function checkpointWal() {
  const sqlite3 = process.env.SQLITE3_PATH || 'sqlite3';
  const { execSync } = await import('child_process');
  try {
    execSync(`"${sqlite3}" "${DB_PATH}" "PRAGMA wal_checkpoint(FULL);"`, { stdio: 'ignore' });
    console.log('WAL checkpoint complete');
  } catch {
    console.warn('WAL checkpoint skipped (sqlite3 not found — use checkpointed .db file)');
  }
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBrmNun6d4icWKLuYOCDhWUle-mpLBVmKc',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'expense-management-7664f.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'expense-management-7664f',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'expense-management-7664f.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '743116569995',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:743116569995:web:c3890ce4057930c35dc38e',
};

const EMAIL = process.env.MIGRATE_EMAIL || 'admin@codehunterz.com';
const PASSWORD = process.env.MIGRATE_PASSWORD || 'Admin@786';

function queryAll(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function readSqlite() {
  const wasmPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'node_modules',
    'sql.js',
    'dist',
    'sql-wasm.wasm'
  );
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);
  const accounts = queryAll(db, 'SELECT * FROM upwork_accounts ORDER BY id');
  const transactions = queryAll(db, 'SELECT * FROM transactions ORDER BY id');
  const settings = queryAll(db, 'SELECT key, value FROM settings');
  db.close();
  return { accounts, transactions, settings };
}

async function clearCollection(db, name) {
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return 0;

  let deleted = 0;
  let batch = writeBatch(db);
  let ops = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    ops++;
    deleted++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return deleted;
}

async function migrate() {
  await checkpointWal();
  console.log('Reading SQLite:', DB_PATH);
  const { accounts, transactions, settings } = await readSqlite();
  console.log(`Found ${accounts.length} accounts, ${transactions.length} transactions, ${settings.length} settings`);

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log('Signing in to Firebase...');
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  console.log('Authenticated as', EMAIL);

  console.log('Clearing existing Firestore data (if any)...');
  const clearedAccounts = await clearCollection(db, 'accounts');
  const clearedTx = await clearCollection(db, 'transactions');
  console.log(`Cleared ${clearedAccounts} accounts, ${clearedTx} transactions`);

  const accountIdMap = {};
  let batch = writeBatch(db);
  let ops = 0;

  for (const acc of accounts) {
    const ref = doc(collection(db, 'accounts'));
    accountIdMap[acc.id] = ref.id;
    batch.set(ref, {
      name: acc.name,
      email: acc.email || '',
      notes: acc.notes || '',
      status: acc.status || 'active',
      created_at: acc.created_at || new Date().toISOString(),
      legacy_id: acc.id,
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
  console.log(`Migrated ${accounts.length} accounts`);

  for (const tx of transactions) {
    const ref = doc(collection(db, 'transactions'));
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
      created_at: tx.created_at || new Date().toISOString(),
      legacy_id: tx.id,
    });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`Migrated ${transactions.length} transactions`);

  const settingsObj = { usd_to_pkr: 267 };
  for (const row of settings) {
    if (row.key === 'usd_to_pkr') settingsObj.usd_to_pkr = parseFloat(row.value) || 267;
    else if (row.key === 'manual_revenue_pkr' && row.value) settingsObj.manual_revenue_pkr = parseFloat(row.value);
    else if (row.key === 'revenue_in_acc_usd' && row.value) settingsObj.revenue_in_acc_usd = parseFloat(row.value);
    else if (row.key === 'revenue_in_acc_pkr' && row.value) settingsObj.revenue_in_acc_pkr = parseFloat(row.value);
  }
  await setDoc(doc(db, 'settings', 'app'), settingsObj, { merge: true });
  console.log('Migrated settings:', settingsObj);

  console.log('\nMigration complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});
