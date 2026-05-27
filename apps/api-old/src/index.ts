import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// @ts-ignore
const apiDir = typeof __dirname !== 'undefined' 
  ? __dirname 
  : path.dirname(fileURLToPath((0, eval)('import.meta.url')));

dotenv.config({ path: path.resolve(apiDir, '.env') });

// Setup robust crash logging helper
export const logErrorToFile = (errorType: string, err: any) => {
  try {
    const logPath = path.resolve(apiDir, 'crash.log');
    const timestamp = new Date().toISOString();
    const errorMessage = err instanceof Error ? err.stack || err.message : String(err);
    const logContent = `[${timestamp}] [${errorType}] ${errorMessage}\n\n`;
    fs.appendFileSync(logPath, logContent, 'utf8');
  } catch (logErr) {
    console.error('Failed to write to crash.log:', logErr);
  }
};

// Listen to uncaught exceptions & rejections immediately
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logErrorToFile('UncaughtException', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logErrorToFile('UnhandledRejection', reason);
});

// Polyfill globalThis.crypto for better-auth
import cryptoModule from 'crypto';
if (!globalThis.crypto) {
  if (cryptoModule.webcrypto) {
    // @ts-ignore
    globalThis.crypto = cryptoModule.webcrypto;
  } else {
    // @ts-ignore
    globalThis.crypto = {
      getRandomValues: (arr: any) => cryptoModule.randomFillSync(arr),
    };
  }
}

import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import courseRoutes from './routes/course.routes.js';
import cplRoutes from './routes/cpl.routes.js';
import departmentRoutes from './routes/department.routes.js';
import userAdminRoutes from './routes/user-admin.routes.js';
import mappingRoutes from './routes/mapping.routes.js';
import gradeRoutes from './routes/grade.routes.js';

import { auth } from './auth/better-auth.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { eq } from 'drizzle-orm';

const app = express();


// Sanitize headers to remove HTTP/2 pseudo-headers (e.g. :authority, :path) that crash Node.js native Request/Headers
app.use((req, res, next) => {
  for (const key in req.headers) {
    if (key.startsWith(':')) {
      delete req.headers[key];
    }
  }
  next();
});
const PORT = process.env.PORT || 4000;

// Enable CORS
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://sia.pnb.ac.id',
    'http://sia.pnb.ac.id',
  ],
  credentials: true,
}));

// Body parser
app.use(express.json());

// Expose API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/cpl', cplRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/user-admins', userAdminRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/grades', gradeRoutes);

// Health Check endpoint (works both with and without /api prefix)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Seed Super Admin on startup
const seedSuperAdmin = async () => {
  try {
    const superAdminEmail = 'superadmin@cpl-pnb.ac.id';
    const existing = await db.select().from(users).where(eq(users.email, superAdminEmail));
    
    if (existing.length === 0) {
      const password = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';
      if (process.env.NODE_ENV === 'production' && password === 'superadmin123') {
        console.warn('[Seed] WARNING: Skip seeding super admin in production because SUPER_ADMIN_PASSWORD is set to default or empty.');
        return;
      }
      console.log(`[Seed] Super Admin not found. Seeding ${superAdminEmail}...`);
      const result = await auth.api.signUpEmail({
        body: {
          email: superAdminEmail,
          password: password,
          name: 'Super Admin PNB',
        },
      });

      if (result && result.user) {
        await db.update(users)
          .set({ role: 'super_admin' })
          .where(eq(users.id, result.user.id));
        console.log('[Seed] Super Admin account created successfully.');
      }
    } else {
      console.log('[Seed] Super Admin account already exists.');
    }
  } catch (err) {
    console.error('[Seed] Error seeding Super Admin:', err);
  }
};

// Express Error Handling Middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[Express Error]', err);
  logErrorToFile('ExpressError', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
  });
});

app.listen(PORT, async () => {
  console.log(`[Server] Express CPL PNB API listening on port ${PORT}`);
  await seedSuperAdmin();
});

export default app;
