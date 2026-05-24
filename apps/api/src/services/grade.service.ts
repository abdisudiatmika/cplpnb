import { db } from '../db/index.js';
import { studentGrades, students, courses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class GradeService {
  async getGradesForStudent(departmentId: string, studentId: string) {
    // Verify student belongs to department
    const student = await db.select().from(students).where(
      and(
        eq(students.id, studentId),
        eq(students.departmentId, departmentId)
      )
    );
    if (student.length === 0) {
      throw new Error('Mahasiswa tidak ditemukan di jurusan Anda.');
    }

    return await db.select({
      id: studentGrades.id,
      studentId: studentGrades.studentId,
      courseId: studentGrades.courseId,
      courseCode: courses.code,
      courseName: courses.name,
      sks: courses.sks,
      grade: studentGrades.grade,
      score: studentGrades.score,
      semester: studentGrades.semester,
      academicYear: studentGrades.academicYear,
    })
    .from(studentGrades)
    .innerJoin(courses, eq(studentGrades.courseId, courses.id))
    .where(eq(studentGrades.studentId, studentId))
    .orderBy(courses.code);
  }

  async saveGrade(departmentId: string, data: { studentId: string; courseId: string; grade: string; score: number; semester: string; academicYear: string }) {
    // Verify student belongs to department
    const student = await db.select().from(students).where(
      and(
        eq(students.id, data.studentId),
        eq(students.departmentId, departmentId)
      )
    );
    if (student.length === 0) {
      throw new Error('Mahasiswa tidak ditemukan di jurusan Anda.');
    }

    // Verify course belongs to department
    const course = await db.select().from(courses).where(
      and(
        eq(courses.id, data.courseId),
        eq(courses.departmentId, departmentId)
      )
    );
    if (course.length === 0) {
      throw new Error('Mata kuliah tidak ditemukan di jurusan Anda.');
    }

    // Check if grade already exists
    const existing = await db.select().from(studentGrades).where(
      and(
        eq(studentGrades.studentId, data.studentId),
        eq(studentGrades.courseId, data.courseId)
      )
    );

    if (existing.length > 0) {
      const updated = await db.update(studentGrades)
        .set({
          grade: data.grade,
          score: data.score,
          semester: data.semester,
          academicYear: data.academicYear,
          updatedAt: new Date(),
        })
        .where(eq(studentGrades.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await db.insert(studentGrades).values({
      studentId: data.studentId,
      courseId: data.courseId,
      grade: data.grade,
      score: data.score,
      semester: data.semester,
      academicYear: data.academicYear,
    }).returning();

    return inserted[0];
  }

  async deleteGrade(departmentId: string, id: string) {
    // Verify grade belongs to department (via student)
    const grade = await db.select({
      id: studentGrades.id,
    })
    .from(studentGrades)
    .innerJoin(students, eq(studentGrades.studentId, students.id))
    .where(
      and(
        eq(studentGrades.id, id),
        eq(students.departmentId, departmentId)
      )
    );

    if (grade.length === 0) {
      throw new Error('Data nilai tidak ditemukan di jurusan Anda.');
    }

    const deleted = await db.delete(studentGrades).where(eq(studentGrades.id, id)).returning();
    return deleted[0];
  }

  async getAllGradesForExport(departmentId: string) {
    return await db.select({
      id: studentGrades.id,
      studentId: studentGrades.studentId,
      studentNim: students.nim,
      studentName: students.name,
      studentClass: students.kelas,
      studentAngkatan: students.angkatan,
      courseId: studentGrades.courseId,
      courseCode: courses.code,
      courseName: courses.name,
      sks: courses.sks,
      grade: studentGrades.grade,
      score: studentGrades.score,
    })
    .from(studentGrades)
    .innerJoin(students, eq(studentGrades.studentId, students.id))
    .innerJoin(courses, eq(studentGrades.courseId, courses.id))
    .where(eq(students.departmentId, departmentId))
    .orderBy(students.nim, courses.code);
  }

  async bulkSaveGrades(departmentId: string, items: { studentId: string; courseId: string; grade: string; score: number; semester?: string; academicYear?: string }[]) {
    if (items.length === 0) return [];
    
    const results = [];
    
    const allExisting = await db.select({
      id: studentGrades.id,
      studentId: studentGrades.studentId,
      courseId: studentGrades.courseId
    })
    .from(studentGrades)
    .innerJoin(students, eq(studentGrades.studentId, students.id))
    .where(eq(students.departmentId, departmentId));

    for (const item of items) {
      const existing = allExisting.find(e => e.studentId === item.studentId && e.courseId === item.courseId);
      if (existing) {
        await db.update(studentGrades).set({
          grade: item.grade,
          score: item.score,
          updatedAt: new Date()
        }).where(eq(studentGrades.id, existing.id));
        results.push({ id: existing.id });
      } else {
        const inserted = await db.insert(studentGrades).values({
          studentId: item.studentId,
          courseId: item.courseId,
          grade: item.grade,
          score: item.score,
          semester: item.semester || '1',
          academicYear: item.academicYear || '2024/2025'
        }).returning({ id: studentGrades.id });
        results.push({ id: inserted[0].id });
      }
    }
    return results;
  }
}

