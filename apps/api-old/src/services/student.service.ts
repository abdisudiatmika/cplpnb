import { db } from '../db/index.js';
import { students } from '../db/schema.js';
import { eq, like, and, sql, inArray } from 'drizzle-orm';

export class StudentService {
  async getAllStudents(departmentId: string, filter: { search?: string; angkatan?: string; kelas?: string }) {
    let conditions = [eq(students.departmentId, departmentId)];

    if (filter.search) {
      conditions.push(
        like(students.name, `%${filter.search}%`) || 
        like(students.nim, `%${filter.search}%`)
      );
    }
    if (filter.angkatan) {
      conditions.push(eq(students.angkatan, filter.angkatan));
    }
    if (filter.kelas) {
      conditions.push(eq(students.kelas, filter.kelas));
    }

    const whereClause = and(...conditions);
    return await db.select().from(students).where(whereClause).orderBy(students.nim);
  }

  async getStudentById(departmentId: string, id: string) {
    const result = await db.select().from(students).where(
      and(
        eq(students.id, id),
        eq(students.departmentId, departmentId)
      )
    );
    return result[0] || null;
  }

  async createStudent(departmentId: string, data: { nim: string; name: string; angkatan: string; kelas: string; status?: 'Aktif' | 'Lulus' | 'Cuti' }) {
    const id = globalThis.crypto.randomUUID();
    await db.insert(students).values({
      id,
      nim: data.nim,
      name: data.name,
      angkatan: data.angkatan,
      kelas: data.kelas,
      status: data.status || 'Aktif',
      departmentId: departmentId,
    });
    return await this.getStudentById(departmentId, id);
  }

  async bulkCreateStudent(departmentId: string, items: { nim: string; name: string; angkatan: string; kelas: string; status?: 'Aktif' | 'Lulus' | 'Cuti' }[]) {
    if (items.length === 0) return [];
    const values = items.map(item => ({
      id: globalThis.crypto.randomUUID(),
      nim: item.nim,
      name: item.name,
      angkatan: item.angkatan,
      kelas: item.kelas,
      status: item.status || 'Aktif',
      departmentId: departmentId,
    }));
    await db.insert(students).values(values);
    const ids = values.map(v => v.id);
    return await db.select().from(students).where(inArray(students.id, ids));
  }

  async updateStudent(departmentId: string, id: string, data: { nim?: string; name?: string; angkatan?: string; kelas?: string; status?: 'Aktif' | 'Lulus' | 'Cuti' }) {
    await db.update(students)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(students.id, id),
          eq(students.departmentId, departmentId)
        )
      );
    return await this.getStudentById(departmentId, id);
  }

  async deleteStudent(departmentId: string, id: string) {
    const student = await this.getStudentById(departmentId, id);
    if (!student) return null;
    await db.delete(students)
      .where(
        and(
          eq(students.id, id),
          eq(students.departmentId, departmentId)
        )
      );
    return student;
  }

  async bulkDeleteStudents(departmentId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const studentsToDelete = await db.select().from(students).where(
      and(
        inArray(students.id, ids),
        eq(students.departmentId, departmentId)
      )
    );
    await db.delete(students)
      .where(
        and(
          inArray(students.id, ids),
          eq(students.departmentId, departmentId)
        )
      );
    return studentsToDelete;
  }

  async getStudentStats(departmentId: string) {
    const stats = await db.select({
      status: students.status,
      count: sql<number>`count(${students.id})`,
    })
    .from(students)
    .where(eq(students.departmentId, departmentId))
    .groupBy(students.status);

    const totalCountResult = await db.select({
      count: sql<number>`count(${students.id})`
    })
    .from(students)
    .where(eq(students.departmentId, departmentId));

    const statsMap = stats.reduce((acc, curr) => {
      acc[curr.status] = Number(curr.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      total: Number(totalCountResult[0]?.count) || 0,
      active: statsMap['Aktif'] || 0,
      cuti: statsMap['Cuti'] || 0,
      lulus: statsMap['Lulus'] || 0,
    };
  }

  async getAverageIpk(departmentId: string, filter: { angkatan?: string; kelas?: string }) {
    let studentQuery: any = eq(students.departmentId, departmentId);

    if (filter.angkatan) {
      studentQuery = and(studentQuery, eq(students.angkatan, filter.angkatan));
    }
    if (filter.kelas) {
      studentQuery = and(studentQuery, eq(students.kelas, filter.kelas));
    }

    const { studentGrades, courses } = await import('../db/schema.js');

    const allGrades = await db.select({
      studentId: studentGrades.studentId,
      grade: studentGrades.grade,
      sks: courses.sks,
    }).from(studentGrades)
      .innerJoin(students, eq(students.id, studentGrades.studentId))
      .innerJoin(courses, eq(courses.id, studentGrades.courseId))
      .where(studentQuery);

    const studentStats = new Map<string, { score: number, sks: number }>();
    for (const g of allGrades) {
      if (g.grade === 'Belum Diambil') continue;
      
      let gradePoint = 0;
      switch (g.grade) {
        case 'A': gradePoint = 4.0; break;
        case 'A-': gradePoint = 3.7; break;
        case 'B+': gradePoint = 3.3; break;
        case 'B': gradePoint = 3.0; break;
        case 'B-': gradePoint = 2.7; break;
        case 'C+': gradePoint = 2.3; break;
        case 'C': gradePoint = 2.0; break;
        case 'D': gradePoint = 1.0; break;
        default: gradePoint = 0.0;
      }
      
      const current = studentStats.get(g.studentId) || { score: 0, sks: 0 };
      current.score += gradePoint * g.sks;
      current.sks += g.sks;
      studentStats.set(g.studentId, current);
    }

    let sumIpk = 0;
    let studentsWithIpk = 0;

    for (const stats of studentStats.values()) {
      if (stats.sks > 0) {
        sumIpk += stats.score / stats.sks;
        studentsWithIpk++;
      }
    }

    if (studentsWithIpk === 0) return 0;
    return Number((sumIpk / studentsWithIpk).toFixed(2));
  }
}
