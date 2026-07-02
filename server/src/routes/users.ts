import { Router, Response } from 'express';
import sql from 'mssql';
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

router.post('/', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, displayName, role } = req.body as {
      email?: string;
      displayName?: string;
      role?: string;
    };

    const normalizedEmail = email?.trim().toLowerCase();
    const trimmedDisplayName = displayName?.trim();

    if (!normalizedEmail || !trimmedDisplayName || !['admin', 'explorer'].includes(role || '')) {
      res.status(400).json({ error: 'email, displayName, and a valid role are required.' });
      return;
    }

    const pool = await getPool();
    const existing = await pool
      .request()
      .input('email', sql.NVarChar, normalizedEmail)
      .query('SELECT * FROM AppUsers WHERE email = @email');

    if (existing.recordset.length > 0) {
      const user = existing.recordset[0];

      if (!user.entraObjectId) {
        const updated = await pool
          .request()
          .input('id', sql.Int, user.id)
          .input('email', sql.NVarChar, normalizedEmail)
          .input('displayName', sql.NVarChar, trimmedDisplayName)
          .input('role', sql.NVarChar, role)
          .query(`
            UPDATE AppUsers
            SET email = @email, displayName = @displayName, role = @role, updatedAt = GETUTCDATE()
            OUTPUT INSERTED.*
            WHERE id = @id
          `);

        res.json(updated.recordset[0]);
        return;
      }

      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const created = await pool
      .request()
      .input('email', sql.NVarChar, normalizedEmail)
      .input('displayName', sql.NVarChar, trimmedDisplayName)
      .input('role', sql.NVarChar, role)
      .query(`
        INSERT INTO AppUsers (entraObjectId, email, displayName, role)
        OUTPUT INSERTED.*
        VALUES (NULL, @email, @displayName, @role)
      `);

    res.status(201).json(created.recordset[0]);
  } catch (err) {
    console.error('Invite user error:', err);
    res.status(500).json({ error: 'Failed to invite user' });
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

router.put('/:id/status', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['active', 'blocked'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be active or blocked.' });
      return;
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, parseInt(req.params.id, 10))
      .input('status', sql.NVarChar, status)
      .query('UPDATE AppUsers SET status = @status, updatedAt = GETUTCDATE() OUTPUT INSERTED.* WHERE id = @id');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
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
