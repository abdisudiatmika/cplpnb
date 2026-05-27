import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// @ts-ignore
const apiDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(fileURLToPath((0, eval)('import.meta.url')));

dotenv.config({ path: path.resolve(apiDir, '.env') });

let pool: mysql.Pool;

if (process.env.DB_HOST || process.env.DB_USER || process.env.DB_PASSWORD || process.env.DB_NAME) {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cpl_pnb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
} else {
  const connectionString = process.env.DATABASE_URL || 'mysql://root:password@127.0.0.1:3306/cpl_pnb';
  pool = mysql.createPool(connectionString);
}

export { pool };
export const db = drizzle(pool, { schema, mode: 'default' });
export type Database = typeof db;
