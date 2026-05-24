import { db } from '../db/index.js';
import { users, departments } from '../db/schema.js';
import { auth } from '../auth/better-auth.js';
import { eq } from 'drizzle-orm';

export class UserAdminService {
  async getAllDepartmentAdmins() {
    const list = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      departmentId: users.departmentId,
      departmentName: departments.name,
      departmentCode: departments.code,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(departments, eq(users.departmentId, departments.id))
    .where(eq(users.role, 'admin_jurusan'))
    .orderBy(users.name);
    return list;
  }

  async createDepartmentAdmin(data: { name: string; email: string; password: string; departmentId: string }) {
    // 1. Create the user using Better Auth Admin API
    const result = await auth.api.createUser({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: 'user',
      },
    });

    if (!result || !result.user) {
      throw new Error('Gagal membuat akun admin.');
    }

    // 2. Set the departmentId and role using Drizzle
    const updated = await db.update(users)
      .set({
        departmentId: data.departmentId,
        role: 'admin_jurusan',
      })
      .where(eq(users.id, result.user.id))
      .returning();

    return updated[0];
  }

  async updateDepartmentAdmin(id: string, data: { name?: string; email?: string; password?: string; departmentId?: string }) {
    // 1. Update basic fields using Better Auth
    await auth.api.adminUpdateUser({
      body: {
        userId: id,
        data: {
          name: data.name,
          email: data.email,
          password: data.password,
        },
      },
    });

    // 2. Update departmentId if provided
    const updateData: any = {};
    if (data.departmentId !== undefined) {
      updateData.departmentId = data.departmentId;
    }
    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.email !== undefined) {
      updateData.email = data.email;
    }

    const updated = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    return updated[0];
  }

  async deleteDepartmentAdmin(id: string) {
    // Get user details first
    const userResult = await db.select().from(users).where(eq(users.id, id));
    const user = userResult[0];
    if (!user) return null;

    // Delete using Better Auth Admin API
    await auth.api.removeUser({
      body: {
        userId: id,
      },
    });

    return user;
  }
}
