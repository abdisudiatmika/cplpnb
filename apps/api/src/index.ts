import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS
app.use(cors({
  origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://localhost:5174'],
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

// Health Check endpoint
app.get('/health', (req, res) => {
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

app.listen(PORT, async () => {
  console.log(`[Server] Express CPL PNB API listening on port ${PORT}`);
  await seedSuperAdmin();
});

export default app;
