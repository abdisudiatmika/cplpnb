import { db } from '../db/index.js';
import { courses, courseCplMappings, cpls, studentGrades } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

export class CourseService {
  async getAllCourses(departmentId: string) {
    return await db.select().from(courses).where(eq(courses.departmentId, departmentId)).orderBy(courses.code);
  }

  async getCourseById(departmentId: string, id: string) {
    const result = await db.select().from(courses).where(
      and(
        eq(courses.id, id),
        eq(courses.departmentId, departmentId)
      )
    );
    return result[0] || null;
  }

  async createCourse(departmentId: string, data: { code: string; name: string; sks: number }) {
    const result = await db.insert(courses).values({
      code: data.code,
      name: data.name,
      sks: data.sks,
      departmentId: departmentId,
    }).returning();
    return result[0];
  }

  async bulkCreateCourse(departmentId: string, items: { code: string; name: string; sks: number }[]) {
    if (items.length === 0) return [];
    const values = items.map(item => ({
      code: item.code,
      name: item.name,
      sks: item.sks,
      departmentId: departmentId,
    }));
    return await db.insert(courses).values(values).returning();
  }

  async updateCourse(departmentId: string, id: string, data: { code?: string; name?: string; sks?: number }) {
    const result = await db.update(courses)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(courses.id, id),
          eq(courses.departmentId, departmentId)
        )
      )
      .returning();
    return result[0];
  }

  async deleteCourse(departmentId: string, id: string) {
    const result = await db.delete(courses)
      .where(
        and(
          eq(courses.id, id),
          eq(courses.departmentId, departmentId)
        )
      )
      .returning();
    return result[0] || null;
  }

  async bulkDeleteCourses(departmentId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return await db.delete(courses)
      .where(
        and(
          inArray(courses.id, ids),
          eq(courses.departmentId, departmentId)
        )
      )
      .returning();
  }

  async getCourseMappingForCpl(departmentId: string, cplCode: string, studentId?: string) {
    // Find the CPL for this department
    const cplResult = await db.select().from(cpls).where(
      and(
        eq(cpls.code, cplCode),
        eq(cpls.departmentId, departmentId)
      )
    );
    const cpl = cplResult[0];
    if (!cpl) return [];

    if (studentId) {
      const results = await db.select({
        code: courses.code,
        name: courses.name,
        sks: courses.sks,
        grade: studentGrades.grade,
        score: studentGrades.score,
      })
      .from(courseCplMappings)
      .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
      .leftJoin(studentGrades, and(
        eq(studentGrades.courseId, courses.id),
        eq(studentGrades.studentId, studentId)
      ))
      .where(
        and(
          eq(courseCplMappings.cplId, cpl.id),
          eq(courses.departmentId, departmentId)
        )
      );

      return results.map(r => ({
        code: r.code,
        name: r.name,
        sks: r.sks,
        grade: r.grade || 'Belum Diambil',
        score: r.score !== null ? r.score : 0,
      }));
    } else {
      return await db.select({
        code: courses.code,
        name: courses.name,
        sks: courses.sks,
      })
      .from(courseCplMappings)
      .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
      .where(
        and(
          eq(courseCplMappings.cplId, cpl.id),
          eq(courses.departmentId, departmentId)
        )
      );
    }
  }
}
