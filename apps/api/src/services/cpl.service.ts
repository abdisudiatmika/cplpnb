import { db } from '../db/index.js';
import { cpls, courseCplMappings, studentGrades, courses, students } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export class CplService {
  async getAllCpls(departmentId: string) {
    return await db.select().from(cpls).where(eq(cpls.departmentId, departmentId)).orderBy(cpls.code);
  }

  async getCplById(departmentId: string, id: string) {
    const result = await db.select().from(cpls).where(
      and(
        eq(cpls.id, id),
        eq(cpls.departmentId, departmentId)
      )
    );
    return result[0] || null;
  }

  async createCpl(departmentId: string, data: { code: string; description: string; category: 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus'; targetValue: number }) {
    const result = await db.insert(cpls).values({
      code: data.code,
      description: data.description,
      category: data.category,
      targetValue: data.targetValue,
      departmentId: departmentId,
    }).returning();
    return result[0];
  }

  async bulkCreateCpl(departmentId: string, items: { code: string; description: string; category: 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus'; targetValue: number }[]) {
    if (items.length === 0) return [];
    const values = items.map(item => ({
      code: item.code,
      description: item.description,
      category: item.category,
      targetValue: item.targetValue,
      departmentId: departmentId,
    }));
    return await db.insert(cpls).values(values).returning();
  }

  async updateCpl(departmentId: string, id: string, data: { code?: string; description?: string; category?: 'Sikap' | 'Pengetahuan' | 'Keterampilan Umum' | 'Keterampilan Khusus'; targetValue?: number }) {
    const result = await db.update(cpls)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cpls.id, id),
          eq(cpls.departmentId, departmentId)
        )
      )
      .returning();
    return result[0];
  }

  async deleteCpl(departmentId: string, id: string) {
    const result = await db.delete(cpls)
      .where(
        and(
          eq(cpls.id, id),
          eq(cpls.departmentId, departmentId)
        )
      )
      .returning();
    return result[0] || null;
  }

  async getStudentCplAchievements(departmentId: string, studentId: string) {
    const allCpls = await db.select().from(cpls).where(eq(cpls.departmentId, departmentId)).orderBy(cpls.code);
    const achievements = [];

    const allMappings = await db.select({
      cplId: courseCplMappings.cplId,
      courseId: courseCplMappings.courseId,
      weight: courseCplMappings.weight,
      sks: courses.sks,
    })
    .from(courseCplMappings)
    .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
    .where(eq(courses.departmentId, departmentId));

    const allGrades = await db.select()
      .from(studentGrades)
      .where(eq(studentGrades.studentId, studentId));
    
    const gradesMap = new Map<string, string>();
    for (const g of allGrades) {
      gradesMap.set(g.courseId, g.grade);
    }

    for (const cpl of allCpls) {
      const mappings = allMappings.filter(m => m.cplId === cpl.id);

      if (mappings.length === 0) {
        achievements.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value: 0,
          status: 'Belum Diukur' as const,
        });
        continue;
      }

      let totalScoreWeight = 0;
      let totalWeight = 0;
      let takenCoursesCount = 0;

      for (const map of mappings) {
        const grade = gradesMap.get(map.courseId);
        const multiplier = map.weight * map.sks;

        if (grade && grade !== 'Belum Diambil') {
          let pctValue = 0;
          switch (grade) {
            case 'A': pctValue = 95; break;
            case 'A-': pctValue = 90; break;
            case 'B+': pctValue = 85; break;
            case 'B': pctValue = 80; break;
            case 'B-': pctValue = 75; break;
            case 'C+': pctValue = 70; break;
            case 'C': pctValue = 65; break;
            case 'D': pctValue = 50; break;
            default: pctValue = 0;
          }
          totalScoreWeight += pctValue * multiplier;
          totalWeight += multiplier;
          takenCoursesCount++;
        }
      }

      if (takenCoursesCount === 0) {
        achievements.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value: 0,
          status: 'Belum Diukur' as const,
        });
      } else {
        const value = Math.round(totalScoreWeight / totalWeight);
        const status = value >= cpl.targetValue ? ('Tercapai' as const) : ('Tidak Tercapai' as const);
        achievements.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value,
          status,
        });
      }
    }

    return achievements;
  }

  async getDepartmentCplAverages(departmentId: string, angkatan?: string, kelas?: string) {
    const allCpls = await db.select().from(cpls).where(eq(cpls.departmentId, departmentId)).orderBy(cpls.code);
    
    let studentQuery: any = eq(students.departmentId, departmentId);
    if (angkatan) {
      studentQuery = and(studentQuery, eq(students.angkatan, angkatan));
    }
    if (kelas) {
      studentQuery = and(studentQuery, eq(students.kelas, kelas));
    }
    
    const studentsList = await db.select().from(students).where(studentQuery);
    
    if (studentsList.length === 0 || allCpls.length === 0) {
      return allCpls.map(cpl => ({
        id: cpl.id,
        code: cpl.code,
        description: cpl.description,
        category: cpl.category,
        value: 0,
        status: 'Belum Diukur' as const,
      }));
    }

    const allMappings = await db.select({
      cplId: courseCplMappings.cplId,
      courseId: courseCplMappings.courseId,
      weight: courseCplMappings.weight,
      sks: courses.sks,
    })
    .from(courseCplMappings)
    .innerJoin(courses, eq(courseCplMappings.courseId, courses.id))
    .where(eq(courses.departmentId, departmentId));

    const allGrades = await db.select({
      studentId: studentGrades.studentId,
      courseId: studentGrades.courseId,
      grade: studentGrades.grade,
    }).from(studentGrades)
      .innerJoin(students, eq(students.id, studentGrades.studentId))
      .where(studentQuery);

    const gradesMap = new Map<string, string>();
    for (const g of allGrades) {
      gradesMap.set(`${g.studentId}_${g.courseId}`, g.grade);
    }

    const averages = [];

    for (const cpl of allCpls) {
      const mappings = allMappings.filter(m => m.cplId === cpl.id);

      if (mappings.length === 0) {
        averages.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value: 0,
          status: 'Belum Diukur' as const,
        });
        continue;
      }

      let totalCplSum = 0;
      let studentsMeasured = 0;

      for (const student of studentsList) {
        let totalScoreWeight = 0;
        let totalWeight = 0;
        let takenCoursesCount = 0;

        for (const map of mappings) {
          const grade = gradesMap.get(`${student.id}_${map.courseId}`);

          const multiplier = map.weight * map.sks;

          if (grade && grade !== 'Belum Diambil') {
            let pctValue = 0;
            switch (grade) {
              case 'A': pctValue = 95; break;
              case 'A-': pctValue = 90; break;
              case 'B+': pctValue = 85; break;
              case 'B': pctValue = 80; break;
              case 'B-': pctValue = 75; break;
              case 'C+': pctValue = 70; break;
              case 'C': pctValue = 65; break;
              case 'D': pctValue = 50; break;
              default: pctValue = 0;
            }
            totalScoreWeight += pctValue * multiplier;
            totalWeight += multiplier;
            takenCoursesCount++;
          }
        }

        if (takenCoursesCount > 0 && totalWeight > 0) {
          totalCplSum += Math.round(totalScoreWeight / totalWeight);
          studentsMeasured++;
        }
      }

      if (studentsMeasured === 0) {
        averages.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value: 0,
          status: 'Belum Diukur' as const,
        });
      } else {
        const value = Math.round(totalCplSum / studentsMeasured);
        const status = value >= cpl.targetValue ? ('Tercapai' as const) : ('Tidak Tercapai' as const);
        averages.push({
          id: cpl.id,
          code: cpl.code,
          description: cpl.description,
          category: cpl.category,
          value,
          status,
        });
      }
    }

    return averages;
  }
}
