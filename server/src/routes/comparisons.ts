import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

// List comparisons for current user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const userResult = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');
    const userId = userResult.recordset[0]?.id;

    const result = await pool
      .request()
      .input('userId', userId)
      .query(
        `SELECT c.*, 
          (SELECT STRING_AGG(t.name, ', ') FROM ComparisonTechnologies ct 
           JOIN Technologies t ON ct.technologyId = t.id WHERE ct.comparisonId = c.id) as technologyNames
         FROM Comparisons c WHERE c.createdBy = @userId ORDER BY c.updatedAt DESC`
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list comparisons' });
  }
});

// Get single comparison with all details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const compId = parseInt(req.params.id);

    const comparison = await pool
      .request()
      .input('id', compId)
      .query('SELECT * FROM Comparisons WHERE id = @id');

    if (comparison.recordset.length === 0) {
      res.status(404).json({ error: 'Comparison not found' });
      return;
    }

    const technologies = await pool
      .request()
      .input('compId', compId)
      .query(
        `SELECT t.* FROM ComparisonTechnologies ct 
         JOIN Technologies t ON ct.technologyId = t.id 
         WHERE ct.comparisonId = @compId`
      );

    const weights = await pool
      .request()
      .input('compId', compId)
      .query(
        `SELECT cw.*, cat.name as categoryName 
         FROM CategoryWeights cw 
         JOIN Categories cat ON cw.categoryId = cat.id 
         WHERE cw.comparisonId = @compId`
      );

    const scores = await pool
      .request()
      .input('compId', compId)
      .query(
        `SELECT cs.*, c.name as criteriaName, c.definition, cat.name as categoryName, cat.id as categoryId
         FROM ComparisonScores cs
         JOIN Criteria c ON cs.criteriaId = c.id
         JOIN Categories cat ON c.categoryId = cat.id
         WHERE cs.comparisonId = @compId
         ORDER BY cat.sortOrder, c.sortOrder`
      );

    res.json({
      ...comparison.recordset[0],
      technologies: technologies.recordset,
      categoryWeights: weights.recordset,
      scores: scores.recordset,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get comparison' });
  }
});

// Create comparison
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientName, useCaseDescription, technologyIds, categoryWeights } = req.body;

    if (!clientName) {
      res.status(400).json({ error: 'Client name is required' });
      return;
    }

    const pool = await getPool();

    const userResult = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');
    const userId = userResult.recordset[0]?.id;

    // Create comparison
    const compResult = await pool
      .request()
      .input('clientName', clientName)
      .input('useCaseDescription', useCaseDescription || null)
      .input('createdBy', userId)
      .query(
        'INSERT INTO Comparisons (clientName, useCaseDescription, createdBy) OUTPUT INSERTED.* VALUES (@clientName, @useCaseDescription, @createdBy)'
      );
    const compId = compResult.recordset[0].id;

    // Add technologies
    if (technologyIds && Array.isArray(technologyIds)) {
      for (const techId of technologyIds) {
        await pool
          .request()
          .input('compId', compId)
          .input('techId', techId)
          .query('INSERT INTO ComparisonTechnologies (comparisonId, technologyId) VALUES (@compId, @techId)');
      }
    }

    // Add category weights
    if (categoryWeights && Array.isArray(categoryWeights)) {
      for (const cw of categoryWeights) {
        await pool
          .request()
          .input('compId', compId)
          .input('categoryId', cw.categoryId)
          .input('weight', cw.weight)
          .query('INSERT INTO CategoryWeights (comparisonId, categoryId, weight) VALUES (@compId, @categoryId, @weight)');
      }
    }

    // Pre-populate scores from reference answers
    if (technologyIds && Array.isArray(technologyIds)) {
      for (const techId of technologyIds) {
        await pool
          .request()
          .input('compId', compId)
          .input('techId', techId)
          .query(
            `INSERT INTO ComparisonScores (comparisonId, technologyId, criteriaId, score, justification, updatedBy)
             SELECT @compId, @techId, ra.criteriaId, ra.score, ra.justification, ra.updatedBy
             FROM ReferenceAnswers ra WHERE ra.technologyId = @techId`
          );
      }
    }

    res.status(201).json(compResult.recordset[0]);
  } catch (err) {
    console.error('Create comparison error:', err);
    res.status(500).json({ error: 'Failed to create comparison' });
  }
});

// Update comparison metadata
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { clientName, useCaseDescription, status } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', parseInt(req.params.id))
      .input('clientName', clientName)
      .input('useCaseDescription', useCaseDescription || null)
      .input('status', status || 'draft')
      .query(
        `UPDATE Comparisons SET clientName = @clientName, useCaseDescription = @useCaseDescription, 
         status = @status, updatedAt = GETUTCDATE() OUTPUT INSERTED.* WHERE id = @id`
      );

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'Comparison not found' });
      return;
    }
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update comparison' });
  }
});

// Save scores for a comparison
router.put('/:id/scores', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id);
    const { scores } = req.body as {
      scores: { technologyId: number; criteriaId: number; score: number; justification?: string }[];
    };

    const pool = await getPool();

    const userResult = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');
    const userId = userResult.recordset[0]?.id;

    for (const s of scores) {
      await pool
        .request()
        .input('compId', compId)
        .input('techId', s.technologyId)
        .input('criteriaId', s.criteriaId)
        .input('score', s.score)
        .input('justification', s.justification || null)
        .input('updatedBy', userId)
        .query(
          `MERGE ComparisonScores AS target
           USING (VALUES (@compId, @techId, @criteriaId)) AS source (comparisonId, technologyId, criteriaId)
           ON target.comparisonId = source.comparisonId 
              AND target.technologyId = source.technologyId 
              AND target.criteriaId = source.criteriaId
           WHEN MATCHED THEN
             UPDATE SET score = @score, justification = @justification, updatedBy = @updatedBy, updatedAt = GETUTCDATE()
           WHEN NOT MATCHED THEN
             INSERT (comparisonId, technologyId, criteriaId, score, justification, updatedBy)
             VALUES (@compId, @techId, @criteriaId, @score, @justification, @updatedBy);`
        );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save scores error:', err);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

// Save category weights for a comparison
router.put('/:id/weights', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id);
    const { weights } = req.body as {
      weights: { categoryId: number; weight: number }[];
    };

    const pool = await getPool();

    for (const w of weights) {
      await pool
        .request()
        .input('compId', compId)
        .input('categoryId', w.categoryId)
        .input('weight', w.weight)
        .query(
          `MERGE CategoryWeights AS target
           USING (VALUES (@compId, @categoryId)) AS source (comparisonId, categoryId)
           ON target.comparisonId = source.comparisonId AND target.categoryId = source.categoryId
           WHEN MATCHED THEN
             UPDATE SET weight = @weight
           WHEN NOT MATCHED THEN
             INSERT (comparisonId, categoryId, weight) VALUES (@compId, @categoryId, @weight);`
        );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save weights' });
  }
});

// Get calculated results for a comparison
router.get('/:id/results', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id);
    const pool = await getPool();

    // Get all categories
    const categories = await pool.request().query('SELECT * FROM Categories ORDER BY sortOrder');

    // Get weights
    const weights = await pool
      .request()
      .input('compId', compId)
      .query('SELECT * FROM CategoryWeights WHERE comparisonId = @compId');

    // Get technologies
    const technologies = await pool
      .request()
      .input('compId', compId)
      .query(
        `SELECT t.* FROM ComparisonTechnologies ct 
         JOIN Technologies t ON ct.technologyId = t.id 
         WHERE ct.comparisonId = @compId`
      );

    // Get scores with criteria and category info
    const scores = await pool
      .request()
      .input('compId', compId)
      .query(
        `SELECT cs.technologyId, cs.criteriaId, cs.score, cs.justification,
                c.name as criteriaName, c.categoryId, cat.name as categoryName
         FROM ComparisonScores cs
         JOIN Criteria c ON cs.criteriaId = c.id
         JOIN Categories cat ON c.categoryId = cat.id
         WHERE cs.comparisonId = @compId`
      );

    // Get criteria counts per category
    const criteriaCounts = await pool.request().query(
      'SELECT categoryId, COUNT(*) as cnt FROM Criteria GROUP BY categoryId'
    );

    // Calculate weighted scores per technology
    const results = technologies.recordset.map((tech) => {
      const techScores = scores.recordset.filter((s) => s.technologyId === tech.id);

      let totalWeightedScore = 0;
      let totalWeight = 0;

      const categoryResults = categories.recordset.map((cat) => {
        const catScores = techScores.filter((s) => s.categoryId === cat.id);
        const weight = weights.recordset.find((w) => w.categoryId === cat.id)?.weight || 1.0;
        const criteriaCount = criteriaCounts.recordset.find((cc) => cc.categoryId === cat.id)?.cnt || 1;

        const avgScore = catScores.length > 0
          ? catScores.reduce((sum, s) => sum + s.score, 0) / catScores.length
          : 0;

        const weightedScore = avgScore * weight;
        totalWeightedScore += weightedScore;
        totalWeight += weight;

        return {
          categoryId: cat.id,
          categoryName: cat.name,
          weight,
          avgScore: Math.round(avgScore * 100) / 100,
          weightedScore: Math.round(weightedScore * 100) / 100,
          scoredCriteria: catScores.length,
          totalCriteria: criteriaCount,
        };
      });

      const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

      return {
        technologyId: tech.id,
        technologyName: tech.name,
        finalScore: Math.round(finalScore * 100) / 100,
        categoryResults,
        scores: techScores,
      };
    });

    // Sort by final score descending
    results.sort((a, b) => b.finalScore - a.finalScore);

    // Add recommendation
    const recommendation = results.length > 0 ? results[0].technologyName : 'No technologies scored';

    res.json({
      recommendation,
      results,
    });
  } catch (err) {
    console.error('Results error:', err);
    res.status(500).json({ error: 'Failed to calculate results' });
  }
});

// Delete comparison
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('id', parseInt(req.params.id))
      .query('DELETE FROM Comparisons WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comparison' });
  }
});

export default router;
