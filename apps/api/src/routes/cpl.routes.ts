import express from 'express';
import { CplService } from '../services/cpl.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const cplService = new CplService();

router.use(requireAuth);
router.use(requireRole(['admin_jurusan']));

// Get all CPLs for department
router.get('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const list = await cplService.getAllCpls(departmentId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get student CPL achievements
router.get('/achievements/:studentId', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const achievements = await cplService.getStudentCplAchievements(departmentId, req.params.studentId);
    res.json(achievements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get department CPL averages
router.get('/averages', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const angkatan = req.query.angkatan as string | undefined;
    const kelas = req.query.kelas as string | undefined;
    const averages = await cplService.getDepartmentCplAverages(departmentId, angkatan, kelas);
    res.json(averages);
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
    const cpl = await cplService.getCplById(departmentId, req.params.id);
    if (!cpl) {
      return res.status(404).json({ error: 'CPL tidak ditemukan.' });
    }
    res.json(cpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create CPL
router.post('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { code, description, category, targetValue } = req.body;
    if (!code || !description || !category || targetValue === undefined) {
      return res.status(400).json({ error: 'Kode, deskripsi, kategori, dan nilai target wajib diisi.' });
    }
    const cpl = await cplService.createCpl(departmentId, { code, description, category, targetValue: Number(targetValue) });
    res.status(201).json(cpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk create CPL
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
      if (!item.code || !item.description || !item.category) {
        return res.status(400).json({ error: 'Setiap baris wajib memiliki kode, deskripsi, dan kategori.' });
      }
      if (!['Sikap', 'Pengetahuan', 'Keterampilan Umum', 'Keterampilan Khusus'].includes(item.category)) {
        return res.status(400).json({ error: `Kategori "${item.category}" tidak valid. Harus salah satu dari: Sikap, Pengetahuan, Keterampilan Umum, Keterampilan Khusus.` });
      }
    }
    const result = await cplService.bulkCreateCpl(departmentId, items.map(item => ({
      code: item.code,
      description: item.description,
      category: item.category as any,
      targetValue: Number(item.targetValue) || 75
    })));
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update CPL
router.put('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const cpl = await cplService.updateCpl(departmentId, req.params.id, req.body);
    res.json(cpl);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete CPL
router.delete('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const cpl = await cplService.deleteCpl(departmentId, req.params.id);
    if (!cpl) {
      return res.status(404).json({ error: 'CPL tidak ditemukan.' });
    }
    res.json({ message: 'CPL berhasil dihapus.', cpl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
