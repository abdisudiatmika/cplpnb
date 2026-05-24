import express from 'express';
import { DepartmentService } from '../services/department.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const departmentService = new DepartmentService();

// Apply auth to all endpoints
router.use(requireAuth);

// Get all departments
router.get('/', async (req, res) => {
  try {
    const list = await departmentService.getAllDepartments();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get department by ID
router.get('/:id', async (req, res) => {
  try {
    const dept = await departmentService.getDepartmentById(req.params.id);
    if (!dept) {
      return res.status(404).json({ error: 'Jurusan tidak ditemukan.' });
    }
    res.json(dept);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create department (Super Admin only)
router.post('/', requireRole(['super_admin']), async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Nama dan Kode Jurusan wajib diisi.' });
    }
    const dept = await departmentService.createDepartment({ name, code });
    res.status(201).json(dept);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update department (Super Admin only)
router.put('/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const dept = await departmentService.updateDepartment(req.params.id, req.body);
    res.json(dept);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete department (Super Admin only)
router.delete('/:id', requireRole(['super_admin']), async (req, res) => {
  try {
    const dept = await departmentService.deleteDepartment(req.params.id);
    if (!dept) {
      return res.status(404).json({ error: 'Jurusan tidak ditemukan.' });
    }
    res.json({ message: 'Jurusan berhasil dihapus.', dept });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
