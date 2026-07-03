import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// List all technologies
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT t.*, u.displayName as createdByName FROM Technologies t LEFT JOIN AppUsers u ON t.createdBy = u.id ORDER BY t.name'
    );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list technologies' });
  }
});

// Create technology
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const pool = await getPool();

    // Get user id
    const userResult = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');
    const userId = userResult.recordset[0]?.id;

    // Check if already exists
    const existing = await pool
      .request()
      .input('name', name)
      .query('SELECT id FROM Technologies WHERE name = @name');

    if (existing.recordset.length > 0) {
      res.json({ ...existing.recordset[0], alreadyExists: true });
      return;
    }

    const result = await pool
      .request()
      .input('name', name)
      .input('description', description || null)
      .input('createdBy', userId || null)
      .input('isGlobal', 1)
      .query(
        'INSERT INTO Technologies (name, description, createdBy, isGlobal) OUTPUT INSERTED.* VALUES (@name, @description, @createdBy, @isGlobal)'
      );

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create technology' });
  }
});

// Update technology
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', parseInt(req.params.id))
      .input('name', name)
      .input('description', description || null)
      .query(
        'UPDATE Technologies SET name = @name, description = @description OUTPUT INSERTED.* WHERE id = @id'
      );

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Technology not found' });
      return;
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update technology' });
  }
});

// Delete technology
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', parseInt(req.params.id))
      .query('DELETE FROM Technologies WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete technology' });
  }
});

export default router;
