import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasm = path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const dbPath = path.join(root, 'data', 'expenses.db');

const SQL = await initSqlJs({ locateFile: () => wasm });
console.log('file size:', fs.statSync(dbPath).size);
const db = new SQL.Database(fs.readFileSync(dbPath));
const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
console.log('tables:', tables[0]?.values?.map(v => v[0]) || []);

for (const name of tables[0]?.values?.map(v => v[0]) || []) {
  const count = db.exec(`SELECT COUNT(*) FROM ${name}`);
  console.log(name, 'rows:', count[0]?.values[0][0]);
}
