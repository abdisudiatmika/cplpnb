import { pgTable, text, integer, doublePrecision, timestamp, uuid, pgEnum, boolean } from 'drizzle-orm/pg-core';

// Enums
export const statusEnum = pgEnum('student_status', ['Aktif', 'Lulus', 'Cuti']);
export const categoryEnum = pgEnum('cpl_category', ['Sikap', 'Pengetahuan', 'Keterampilan Umum', 'Keterampilan Khusus']);
export const roleEnum = pgEnum('user_role', ['super_admin', 'admin_jurusan', 'user']);

// Departments (Jurusan) Table
export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(), // e.g. "MI", "AK", "AN", "EL"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Better Auth - Users table
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  role: roleEnum('role').default('admin_jurusan').notNull(),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  banned: boolean('banned'),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// Better Auth - Sessions table
export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
});

// Better Auth - Accounts table
export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});

// Students (Mahasiswa) Table
export const students = pgTable('students', {
  id: uuid('id').defaultRandom().primaryKey(),
  nim: text('nim').notNull().unique(),
  name: text('name').notNull(),
  angkatan: text('angkatan').notNull(), // e.g. "2022"
  kelas: text('kelas').notNull(),       // e.g. "4A"
  status: statusEnum('status').default('Aktif').notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Courses (Mata Kuliah) Table
export const courses = pgTable('courses', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull(), // e.g. "MPK101" (Not globally unique anymore)
  name: text('name').notNull(),
  sks: integer('sks').notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CPL Table
export const cpls = pgTable('cpls', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull(), // e.g. "CPL-01" (Not globally unique anymore)
  description: text('description').notNull(),
  category: categoryEnum('category').notNull(),
  targetValue: integer('target_value').default(75).notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Course-CPL Mapping Table
export const courseCplMappings = pgTable('course_cpl_mappings', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  cplId: uuid('cpl_id').notNull().references(() => cpls.id, { onDelete: 'cascade' }),
  weight: doublePrecision('weight').default(1.0).notNull(), // Contribution weight
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Student Grades Table
export const studentGrades = pgTable('student_grades', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  grade: text('grade').notNull(), // e.g., 'A', 'B+', 'C', etc.
  score: doublePrecision('score').notNull(), // Numeric equivalent (e.g. 4.0, 3.5, 2.0)
  semester: text('semester').notNull(), // e.g. "IV"
  academicYear: text('academic_year').notNull(), // e.g. "2024/2025"
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
