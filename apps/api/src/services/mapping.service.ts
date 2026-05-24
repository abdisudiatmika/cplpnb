import { db } from '../db/index.js';
import { courseCplMappings, courses, cpls } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class MappingService {
  async getAllMappings(departmentId: string, courseId?: string) {
    const conditions = [
      eq(courses.departmentId, departmentId),
      eq(cpls.departmentId, departmentId),
    ];
    if (courseId) {
      conditions.push(eq(courseCplMappings.courseId, courseId));
    }
    return await db.select({
      id: courseCplMappings.id,
      courseId: courseCplMappings.courseId,
      courseCode: courses.code,
      courseName: courses.name,
      cplId: courseCplMappings.cplId,
      cplCode: cpls.code,
      cplDescription: cpls.description,
      cplCategory: cpls.category,
      weight: courseCplMappings.weight,
    })
    .from(courseCplMappings)
    .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
    .innerJoin(cpls, eq(courseCplMappings.cplId, cpls.id))
    .where(and(...conditions))
    .orderBy(cpls.code, courses.code);
  }

  async createMapping(departmentId: string, data: { courseId: string; cplId: string; weight: number }) {
    // Verify course belongs to department
    const courseResult = await db.select().from(courses).where(
      and(
        eq(courses.id, data.courseId),
        eq(courses.departmentId, departmentId)
      )
    );
    if (courseResult.length === 0) {
      throw new Error('Mata kuliah tidak ditemukan di jurusan Anda.');
    }

    // Verify CPL belongs to department
    const cplResult = await db.select().from(cpls).where(
      and(
        eq(cpls.id, data.cplId),
        eq(cpls.departmentId, departmentId)
      )
    );
    if (cplResult.length === 0) {
      throw new Error('CPL tidak ditemukan di jurusan Anda.');
    }

    // Check if mapping already exists
    const existing = await db.select().from(courseCplMappings).where(
      and(
        eq(courseCplMappings.courseId, data.courseId),
        eq(courseCplMappings.cplId, data.cplId)
      )
    );
    if (existing.length > 0) {
      // Update weight instead of duplicating
      const updatedResult = await db.update(courseCplMappings)
        .set({ weight: data.weight })
        .where(eq(courseCplMappings.id, existing[0].id))
        .returning();
      return updatedResult[0];
    }

    const result = await db.insert(courseCplMappings).values({
      courseId: data.courseId,
      cplId: data.cplId,
      weight: data.weight,
    }).returning();

    return result[0];
  }

  async deleteMapping(departmentId: string, id: string) {
    // Verify mapping belongs to department
    const mappingCheck = await db.select({
      id: courseCplMappings.id,
    })
    .from(courseCplMappings)
    .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
    .where(
      and(
        eq(courseCplMappings.id, id),
        eq(courses.departmentId, departmentId)
      )
    );

    if (mappingCheck.length === 0) {
      throw new Error('Pemetaan tidak ditemukan di jurusan Anda.');
    }

    const result = await db.delete(courseCplMappings).where(eq(courseCplMappings.id, id)).returning();
    return result[0];
  }

  async bulkCreateMappings(departmentId: string, items: { courseId: string; cplId: string; weight: number }[]) {
    if (items.length === 0) return [];
    const results = [];
    for (const item of items) {
      const result = await this.createMapping(departmentId, item);
      results.push(result);
    }
    return results;
  }
}
