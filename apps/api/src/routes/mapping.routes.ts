import express from 'express';
import { MappingService } from '../services/mapping.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const mappingService = new MappingService();

router.use(requireAuth);
router.use(requireRole(['admin_jurusan']));

// Get all mappings for department
router.get('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const list = await mappingService.getAllMappings(departmentId, req.query.courseId as string | undefined);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create/Update mapping
router.post('/', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const { courseId, cplId, weight } = req.body;
    if (!courseId || !cplId || weight === undefined) {
      return res.status(400).json({ error: 'Mata kuliah, CPL, dan bobot wajib diisi.' });
    }
    const mapping = await mappingService.createMapping(departmentId, { courseId, cplId, weight: Number(weight) });
    res.status(201).json(mapping);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete mapping
router.delete('/:id', async (req: any, res) => {
  try {
    const departmentId = req.session.user.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'User does not belong to a department.' });
    }
    const mapping = await mappingService.deleteMapping(departmentId, req.params.id);
    if (!mapping) {
      return res.status(404).json({ error: 'Pemetaan tidak ditemukan.' });
    }
    res.json({ message: 'Pemetaan berhasil dihapus.', mapping });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk create mappings
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
    const results = await mappingService.bulkCreateMappings(departmentId, items);
    res.status(201).json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
