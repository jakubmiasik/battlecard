import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

// List all users (admin only)
router.get('/', requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM AppUsers ORDER BY displayName');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Update user role (admin only)
router.put('/:id/role', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (!['admin', 'explorer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be admin or explorer.' });
      return;
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', parseInt(req.params.id))
      .input('role', role)
      .query('UPDATE AppUsers SET role = @role, updatedAt = GETUTCDATE() OUTPUT INSERTED.* WHERE id = @id');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', parseInt(req.params.id))
      .query('DELETE FROM AppUsers WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
