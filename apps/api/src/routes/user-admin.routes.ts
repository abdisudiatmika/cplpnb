import express from 'express';
import { UserAdminService } from '../services/user-admin.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

const router = express.Router();
const userAdminService = new UserAdminService();

// Apply auth and super_admin restriction to all admin management endpoints
router.use(requireAuth);
router.use(requireRole(['super_admin']));

// Get all department admins
router.get('/', async (req, res) => {
  try {
    const list = await userAdminService.getAllDepartmentAdmins();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a department admin
router.post('/', async (req, res) => {
  try {
    const { name, email, password, departmentId } = req.body;
    if (!name || !email || !password || !departmentId) {
      return res.status(400).json({ error: 'Nama, email, password, dan jurusan wajib diisi.' });
    }
    const adminUser = await userAdminService.createDepartmentAdmin({ name, email, password, departmentId });
    res.status(201).json(adminUser);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update a department admin
router.put('/:id', async (req, res) => {
  try {
    const adminUser = await userAdminService.updateDepartmentAdmin(req.params.id, req.body);
    res.json(adminUser);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a department admin
router.delete('/:id', async (req, res) => {
  try {
    const adminUser = await userAdminService.deleteDepartmentAdmin(req.params.id);
    if (!adminUser) {
      return res.status(404).json({ error: 'Admin tidak ditemukan.' });
    }
    res.json({ message: 'Admin berhasil dihapus.', adminUser });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
