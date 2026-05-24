import express from 'express';
import { GradeService } from '../services/grade.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const gradeService = new GradeService();

router.use(requireAuth);
router.use(requireRole(['admin_jurusan']));

// Get all grades for export
router.get('/export/all', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const list = await gradeService.getAllGradesForExport(departmentId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk import grades
router.post('/bulk', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Data harus berupa array items.' });
    }
    const result = await gradeService.bulkSaveGrades(departmentId, items);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all grades for a specific student
router.get('/student/:studentId', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const list = await gradeService.getGradesForStudent(departmentId, req.params.studentId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save (create or update) student grade
router.post('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { studentId, courseId, grade, score, semester, academicYear } = req.body;
    if (!studentId || !courseId || !grade || score === undefined || !semester || !academicYear) {
      return res.status(400).json({ error: 'Mahasiswa, mata kuliah, nilai huruf, skor, semester, dan tahun akademik wajib diisi.' });
    }
    const result = await gradeService.saveGrade(departmentId, {
      studentId,
      courseId,
      grade,
      score: Number(score),
      semester,
      academicYear,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete student grade
router.delete('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const result = await gradeService.deleteGrade(departmentId, req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Data nilai tidak ditemukan.' });
    }
    res.json({ message: 'Data nilai berhasil dihapus.', result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
