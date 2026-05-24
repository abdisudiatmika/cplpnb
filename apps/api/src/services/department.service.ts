import { db } from '../db/index.js';
import { departments } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export class DepartmentService {
  async getAllDepartments() {
    return await db.select().from(departments).orderBy(departments.code);
  }

  async getDepartmentById(id: string) {
    const result = await db.select().from(departments).where(eq(departments.id, id));
    return result[0] || null;
  }

  async createDepartment(data: { name: string; code: string }) {
    const result = await db.insert(departments).values({
      name: data.name,
      code: data.code,
    }).returning();
    return result[0];
  }

  async updateDepartment(id: string, data: { name?: string; code?: string }) {
    const result = await db.update(departments)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(departments.id, id))
      .returning();
    return result[0];
  }

  async deleteDepartment(id: string) {
    const result = await db.delete(departments).where(eq(departments.id, id)).returning();
    return result[0] || null;
  }
}
