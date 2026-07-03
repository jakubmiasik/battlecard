import { Router, Response } from 'express';
import sql from 'mssql';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

async function getQuestionsTree() {
  const pool = await getPool();
  const categories = await pool.request().query('SELECT * FROM Categories ORDER BY sortOrder, id');
  const criteria = await pool.request().query('SELECT * FROM Criteria ORDER BY categoryId, sortOrder, id');

  return categories.recordset.map((category) => ({
    ...category,
    criteria: criteria.recordset.filter((criterion) => criterion.categoryId === category.id),
  }));
}

router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    res.json(await getQuestionsTree());
  } catch {
    res.status(500).json({ error: 'Failed to get criteria' });
  }
});

router.get('/default-weights', async (_req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT c.id as categoryId, c.name as categoryName, CAST(COALESCE(dcw.weight, 1.0) AS FLOAT) as weight
      FROM Categories c
      LEFT JOIN DefaultCategoryWeights dcw ON dcw.categoryId = c.id
      ORDER BY c.sortOrder, c.id
    `);
    res.json(result.recordset);
  } catch {
    res.status(500).json({ error: 'Failed to get default weights' });
  }
});

router.put('/default-weights', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { weights } = req.body as { weights?: { categoryId: number; weight: number }[] };

    if (!Array.isArray(weights)) {
      res.status(400).json({ error: 'weights array is required' });
      return;
    }

    const pool = await getPool();

    for (const item of weights) {
      await pool
        .request()
        .input('categoryId', sql.Int, item.categoryId)
        .input('weight', sql.Decimal(5, 2), item.weight)
        .query(`
          MERGE DefaultCategoryWeights AS target
          USING (VALUES (@categoryId, @weight)) AS source (categoryId, weight)
          ON target.categoryId = source.categoryId
          WHEN MATCHED THEN UPDATE SET weight = source.weight
          WHEN NOT MATCHED THEN INSERT (categoryId, weight) VALUES (source.categoryId, source.weight);
        `);
    }

    const result = await pool.request().query(`
      SELECT c.id as categoryId, c.name as categoryName, CAST(COALESCE(dcw.weight, 1.0) AS FLOAT) as weight
      FROM Categories c
      LEFT JOIN DefaultCategoryWeights dcw ON dcw.categoryId = c.id
      ORDER BY c.sortOrder, c.id
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Save default weights error:', error);
    res.status(500).json({ error: 'Failed to save default weights' });
  }
});

export default router;
