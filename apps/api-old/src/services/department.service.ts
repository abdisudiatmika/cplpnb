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
    const id = globalThis.crypto.randomUUID();
    await db.insert(departments).values({
      id,
      name: data.name,
      code: data.code,
    });
    return await this.getDepartmentById(id);
  }

  async updateDepartment(id: string, data: { name?: string; code?: string }) {
    await db.update(departments)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(departments.id, id));
    return await this.getDepartmentById(id);
  }

  async deleteDepartment(id: string) {
    const dep = await this.getDepartmentById(id);
    if (!dep) return null;
    await db.delete(departments).where(eq(departments.id, id));
    return dep;
  }
}
