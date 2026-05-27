import express from 'express';
import { CourseService } from '../services/course.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const courseService = new CourseService();

router.use(requireAuth);
router.use(requireRole(['admin_jurusan']));

// Get all courses
router.get('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const list = await courseService.getAllCourses(departmentId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get mapping for CPL
router.get('/mapping/:cplCode', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const studentId = req.query.studentId as string;
    const mappings = await courseService.getCourseMappingForCpl(departmentId, req.params.cplCode, studentId);
    res.json(mappings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get by ID
router.get('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const course = await courseService.getCourseById(departmentId, req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Mata kuliah tidak ditemukan.' });
    }
    res.json(course);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create
router.post('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { code, name, sks } = req.body;
    if (!code || !name || sks === undefined) {
      return res.status(400).json({ error: 'Kode, nama, dan SKS mata kuliah wajib diisi.' });
    }
    const course = await courseService.createCourse(departmentId, { code, name, sks: Number(sks) });
    res.status(201).json(course);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk create
router.post('/bulk', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Payload harus berupa array dalam field "items".' });
    }

    // Validation
    for (const item of items) {
      if (!item.code || !item.name || item.sks === undefined) {
        return res.status(400).json({ error: 'Setiap baris wajib memiliki kode, nama, dan SKS.' });
      }
      if (isNaN(Number(item.sks))) {
        return res.status(400).json({ error: `SKS untuk mata kuliah "${item.name}" harus berupa angka.` });
      }
    }

    const result = await courseService.bulkCreateCourse(departmentId, items.map(item => ({
      code: item.code,
      name: item.name,
      sks: Number(item.sks),
    })));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update
router.put('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const course = await courseService.updateCourse(departmentId, req.params.id, req.body);
    res.json(course);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete
router.delete('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const course = await courseService.deleteCourse(departmentId, req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Mata kuliah tidak ditemukan.' });
    }
    res.json({ message: 'Mata kuliah berhasil dihapus.', course });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk delete
router.post('/bulk-delete', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ error: 'Payload harus berupa array dalam field "ids".' });
    }
    const deleted = await courseService.bulkDeleteCourses(departmentId, ids);
    res.json({ message: 'Mata kuliah berhasil dihapus secara massal', count: deleted.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
