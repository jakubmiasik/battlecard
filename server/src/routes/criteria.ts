import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get all categories with criteria
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const categories = await pool.request().query('SELECT * FROM Categories ORDER BY sortOrder');
    const criteria = await pool.request().query('SELECT * FROM Criteria ORDER BY sortOrder');

    const result = categories.recordset.map((cat) => ({
      ...cat,
      criteria: criteria.recordset.filter((c) => c.categoryId === cat.id),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get criteria' });
  }
});

export default router;
