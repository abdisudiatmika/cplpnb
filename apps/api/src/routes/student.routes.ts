import express from 'express';
import { StudentService } from '../services/student.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const studentService = new StudentService();

// Apply auth to all student routes
router.use(requireAuth);
router.use(requireRole(['admin_jurusan']));

// Get stats
router.get('/stats', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const stats = await studentService.getStudentStats(departmentId);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get all students
router.get('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const search = req.query.search as string;
    const angkatan = req.query.angkatan as string;
    const kelas = req.query.kelas as string;

    const list = await studentService.getAllStudents(departmentId, { search, angkatan, kelas });
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get average IPK
router.get('/ipk-average', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const angkatan = req.query.angkatan as string | undefined;
    const kelas = req.query.kelas as string | undefined;

    const averageIpk = await studentService.getAverageIpk(departmentId, { angkatan, kelas });
    res.json({ averageIpk });
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
    const student = await studentService.getStudentById(departmentId, req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Mahasiswa tidak ditemukan' });
    }
    res.json(student);
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
    const { nim, name, angkatan, kelas, status } = req.body;
    if (!nim || !name || !angkatan || !kelas) {
      return res.status(400).json({ error: 'NIM, nama, angkatan, dan kelas wajib diisi' });
    }
    const student = await studentService.createStudent(departmentId, { nim, name, angkatan, kelas, status });
    res.status(201).json(student);
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
      if (!item.nim || !item.name || !item.angkatan || !item.kelas) {
        return res.status(400).json({ error: 'Setiap baris mahasiswa wajib memiliki NIM, Nama, Angkatan, dan Kelas.' });
      }
    }

    const result = await studentService.bulkCreateStudent(departmentId, items.map(item => ({
      nim: String(item.nim),
      name: item.name,
      angkatan: String(item.angkatan),
      kelas: item.kelas,
      status: item.status || 'Aktif',
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
    const student = await studentService.updateStudent(departmentId, req.params.id, req.body);
    res.json(student);
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
    const student = await studentService.deleteStudent(departmentId, req.params.id);
    if (!student) {
      return res.status(404).json({ error: 'Mahasiswa tidak ditemukan' });
    }
    res.json({ message: 'Mahasiswa berhasil dihapus', student });
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
    const deleted = await studentService.bulkDeleteStudents(departmentId, ids);
    res.json({ message: 'Mahasiswa berhasil dihapus secara massal', count: deleted.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
