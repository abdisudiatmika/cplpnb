import { mysqlTable, varchar, text, int, double, timestamp, mysqlEnum, boolean } from 'drizzle-orm/mysql-core';

// Departments (Jurusan) Table
export const departments = mysqlTable('departments', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  name: text('name').notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(), // e.g. "MI", "AK", "AN", "EL"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Better Auth - Users table
export const users = mysqlTable('user', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  role: mysqlEnum('role', ['super_admin', 'admin_jurusan', 'user']).default('admin_jurusan').notNull(),
  departmentId: varchar('department_id', { length: 36 }).references(() => departments.id, { onDelete: 'set null' }),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// Better Auth - Sessions table
export const sessions = mysqlTable('session', {
  id: varchar('id', { length: 255 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// Better Auth - Accounts table
export const accounts = mysqlTable('account', {
  id: varchar('id', { length: 255 }).primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// Better Auth - Verifications table
export const verifications = mysqlTable('verification', {
  id: varchar('id', { length: 255 }).primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// Students (Mahasiswa) Table
export const students = mysqlTable('students', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  nim: varchar('nim', { length: 50 }).notNull().unique(),
  name: text('name').notNull(),
  angkatan: varchar('angkatan', { length: 50 }).notNull(), // e.g. "2022"
  kelas: varchar('kelas', { length: 50 }).notNull(),       // e.g. "4A"
  status: mysqlEnum('status', ['Aktif', 'Lulus', 'Cuti']).default('Aktif').notNull(),
  departmentId: varchar('department_id', { length: 36 }).notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Courses (Mata Kuliah) Table
export const courses = mysqlTable('courses', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  code: varchar('code', { length: 50 }).notNull(), // e.g. "MPK101"
  name: text('name').notNull(),
  sks: int('sks').notNull(),
  departmentId: varchar('department_id', { length: 36 }).notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CPL Table
export const cpls = mysqlTable('cpls', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  code: varchar('code', { length: 50 }).notNull(), // e.g. "CPL-01"
  description: text('description').notNull(),
  category: mysqlEnum('category', ['Sikap', 'Pengetahuan', 'Keterampilan Umum', 'Keterampilan Khusus']).notNull(),
  targetValue: int('target_value').default(75).notNull(),
  departmentId: varchar('department_id', { length: 36 }).notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course-CPL Mapping Table
export const courseCplMappings = mysqlTable('course_cpl_mappings', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  courseId: varchar('course_id', { length: 36 }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
  cplId: varchar('cpl_id', { length: 36 }).notNull().references(() => cpls.id, { onDelete: 'cascade' }),
  weight: double('weight').default(1.0).notNull(), // Contribution weight
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Student Grades Table
export const studentGrades = mysqlTable('student_grades', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => globalThis.crypto.randomUUID()),
  studentId: varchar('student_id', { length: 36 }).notNull().references(() => students.id, { onDelete: 'cascade' }),
  courseId: varchar('course_id', { length: 36 }).notNull().references(() => courses.id, { onDelete: 'cascade' }),
  grade: varchar('grade', { length: 10 }).notNull(), // e.g., 'A', 'B+', 'C', etc.
  score: double('score').notNull(), // Numeric equivalent
  semester: varchar('semester', { length: 50 }).notNull(), // e.g. "IV"
  academicYear: varchar('academic_year', { length: 50 }).notNull(), // e.g. "2024/2025"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
