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
    res.status(500).json({ error: 'Failed to get questions' });
  }
});

router.post('/categories', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }

    const pool = await getPool();
    let nextSortOrder = sortOrder;
    if (nextSortOrder === undefined) {
      const orderResult = await pool.request().query('SELECT ISNULL(MAX(sortOrder), -1) + 1 as nextSortOrder FROM Categories');
      nextSortOrder = orderResult.recordset[0].nextSortOrder;
    }

    const categoryResult = await pool
      .request()
      .input('name', sql.NVarChar, name.trim())
      .input('sortOrder', sql.Int, nextSortOrder)
      .query('INSERT INTO Categories (name, sortOrder) OUTPUT INSERTED.* VALUES (@name, @sortOrder)');

    await pool
      .request()
      .input('categoryId', sql.Int, categoryResult.recordset[0].id)
      .query('INSERT INTO DefaultCategoryWeights (categoryId, weight) VALUES (@categoryId, 1.0)');

    res.status(201).json(categoryResult.recordset[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const { name, sortOrder } = req.body as { name?: string; sortOrder?: number };

    const pool = await getPool();
    const current = await pool.request().input('id', sql.Int, categoryId).query('SELECT * FROM Categories WHERE id = @id');
    if (current.recordset.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const updated = await pool
      .request()
      .input('id', sql.Int, categoryId)
      .input('name', sql.NVarChar, name?.trim() || current.recordset[0].name)
      .input('sortOrder', sql.Int, sortOrder ?? current.recordset[0].sortOrder)
      .query('UPDATE Categories SET name = @name, sortOrder = @sortOrder OUTPUT INSERTED.* WHERE id = @id');

    res.json(updated.recordset[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const categoryId = parseInt(req.params.id, 10);
    const pool = await getPool();

    await pool.request().input('categoryId', sql.Int, categoryId).query(`
      DELETE cs
      FROM ComparisonScores cs
      JOIN Criteria c ON cs.criteriaId = c.id
      WHERE c.categoryId = @categoryId;

      DELETE ra
      FROM ReferenceAnswers ra
      JOIN Criteria c ON ra.criteriaId = c.id
      WHERE c.categoryId = @categoryId;

      DELETE FROM Criteria WHERE categoryId = @categoryId;
      DELETE FROM CategoryWeights WHERE categoryId = @categoryId;
      DELETE FROM DefaultCategoryWeights WHERE categoryId = @categoryId;
      DELETE FROM Categories WHERE id = @categoryId;
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

router.post('/criteria', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { categoryId, name, definition, sortOrder } = req.body as {
      categoryId?: number;
      name?: string;
      definition?: string;
      sortOrder?: number;
    };

    if (!categoryId || !name?.trim()) {
      res.status(400).json({ error: 'categoryId and name are required' });
      return;
    }

    const pool = await getPool();
    let nextSortOrder = sortOrder;
    if (nextSortOrder === undefined) {
      const orderResult = await pool
        .request()
        .input('categoryId', sql.Int, categoryId)
        .query('SELECT ISNULL(MAX(sortOrder), -1) + 1 as nextSortOrder FROM Criteria WHERE categoryId = @categoryId');
      nextSortOrder = orderResult.recordset[0].nextSortOrder;
    }

    const criterion = await pool
      .request()
      .input('categoryId', sql.Int, categoryId)
      .input('name', sql.NVarChar, name.trim())
      .input('definition', sql.NVarChar, definition?.trim() || null)
      .input('sortOrder', sql.Int, nextSortOrder)
      .query(
        'INSERT INTO Criteria (categoryId, name, definition, sortOrder) OUTPUT INSERTED.* VALUES (@categoryId, @name, @definition, @sortOrder)'
      );

    res.status(201).json(criterion.recordset[0]);
  } catch (error) {
    console.error('Create criterion error:', error);
    res.status(500).json({ error: 'Failed to create criterion' });
  }
});

router.put('/criteria/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const criterionId = parseInt(req.params.id, 10);
    const { categoryId, name, definition, sortOrder } = req.body as {
      categoryId?: number;
      name?: string;
      definition?: string;
      sortOrder?: number;
    };

    const pool = await getPool();
    const current = await pool.request().input('id', sql.Int, criterionId).query('SELECT * FROM Criteria WHERE id = @id');
    if (current.recordset.length === 0) {
      res.status(404).json({ error: 'Criterion not found' });
      return;
    }

    const existing = current.recordset[0];
    const updated = await pool
      .request()
      .input('id', sql.Int, criterionId)
      .input('categoryId', sql.Int, categoryId ?? existing.categoryId)
      .input('name', sql.NVarChar, name?.trim() || existing.name)
      .input('definition', sql.NVarChar, definition === undefined ? existing.definition : definition.trim() || null)
      .input('sortOrder', sql.Int, sortOrder ?? existing.sortOrder)
      .query(`
        UPDATE Criteria
        SET categoryId = @categoryId, name = @name, definition = @definition, sortOrder = @sortOrder
        OUTPUT INSERTED.*
        WHERE id = @id
      `);

    res.json(updated.recordset[0]);
  } catch (error) {
    console.error('Update criterion error:', error);
    res.status(500).json({ error: 'Failed to update criterion' });
  }
});

router.delete('/criteria/:id', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const criterionId = parseInt(req.params.id, 10);
    const pool = await getPool();

    await pool.request().input('criterionId', sql.Int, criterionId).query(`
      DELETE FROM ComparisonScores WHERE criteriaId = @criterionId;
      DELETE FROM ReferenceAnswers WHERE criteriaId = @criterionId;
      DELETE FROM Criteria WHERE id = @criterionId;
    `);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete criterion error:', error);
    res.status(500).json({ error: 'Failed to delete criterion' });
  }
});

export default router;
