import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'mysql',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://sia.pnb.ac.id',
    'http://sia.pnb.ac.id',
    process.env.BETTER_AUTH_URL || 'http://localhost:4000',
  ],
  user: {
    additionalFields: {
      departmentId: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin(),
  ],
});
