import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Login / register: upsert user on first login
router.post('/login', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { oid, email, name } = req.user!;
    const pool = await getPool();

    // Check if user exists
    const existing = await pool
      .request()
      .input('oid', oid)
      .query('SELECT * FROM AppUsers WHERE entraObjectId = @oid');

    if (existing.recordset.length > 0) {
      res.json(existing.recordset[0]);
      return;
    }

    // Check if first user → make admin
    const userCount = await pool.request().query('SELECT COUNT(*) as cnt FROM AppUsers');
    const role = userCount.recordset[0].cnt === 0 ? 'admin' : 'explorer';

    const result = await pool
      .request()
      .input('oid', oid)
      .input('email', email)
      .input('name', name)
      .input('role', role)
      .query(
        'INSERT INTO AppUsers (entraObjectId, email, displayName, role) OUTPUT INSERTED.* VALUES (@oid, @email, @name, @role)'
      );

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT * FROM AppUsers WHERE entraObjectId = @oid');

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
