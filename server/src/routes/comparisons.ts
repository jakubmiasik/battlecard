import { Router, Response } from 'express';
import sql from 'mssql';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';

const router = Router();

type ComparisonPayload = {
  clientName?: string | null;
  comparisonType?: 'client' | 'simple';
  useCaseDescription?: string;
  technologyIds?: number[];
  categoryWeights?: { categoryId: number; weight: number }[];
};

async function touchComparison(pool: sql.ConnectionPool, comparisonId: number) {
  await pool.request().input('comparisonId', sql.Int, comparisonId).query(`
    UPDATE Comparisons
    SET updatedAt = GETUTCDATE()
    WHERE id = @comparisonId
  `);
}

async function seedComparisonScoresFromReferenceAnswers(pool: sql.ConnectionPool, comparisonId: number, technologyId: number) {
  await pool
    .request()
    .input('compId', sql.Int, comparisonId)
    .input('techId', sql.Int, technologyId)
    .query(`
      INSERT INTO ComparisonScores (comparisonId, technologyId, criteriaId, score, justification, updatedBy)
      SELECT @compId, @techId, ra.criteriaId, ra.score, ra.justification, ra.updatedBy
      FROM ReferenceAnswers ra
      WHERE ra.technologyId = @techId
        AND NOT EXISTS (
          SELECT 1
          FROM ComparisonScores cs
          WHERE cs.comparisonId = @compId
            AND cs.technologyId = @techId
            AND cs.criteriaId = ra.criteriaId
        )
    `);
}

async function getCurrentUserId(req: AuthRequest): Promise<number | null> {
  const pool = await getPool();
  const userResult = await pool
    .request()
    .input('oid', req.user!.oid)
    .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');

  return userResult.recordset[0]?.id ?? null;
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const userId = await getCurrentUserId(req);

    const comparisonsResult = await pool.request().input('userId', sql.Int, userId).query(`
      SELECT c.id, c.clientName, c.useCaseDescription, c.comparisonType, c.status, c.createdAt, c.updatedAt,
             STRING_AGG(t.name, ', ') WITHIN GROUP (ORDER BY t.name) as technologyNames,
             creator.displayName as createdByName
      FROM Comparisons c
      LEFT JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
      LEFT JOIN Technologies t ON t.id = ct.technologyId
      LEFT JOIN AppUsers creator ON creator.id = c.createdBy
      WHERE c.createdBy = @userId
      GROUP BY c.id, c.clientName, c.useCaseDescription, c.comparisonType, c.status, c.createdAt, c.updatedAt, creator.displayName
      ORDER BY c.updatedAt DESC
    `);

    const progressResult = await pool.request().input('userId', sql.Int, userId).query(`
      WITH TotalCriteria AS (
        SELECT COUNT(*) as totalCriteria FROM Criteria
      )
      SELECT c.id as comparisonId,
             t.id as technologyId,
             t.name as technologyName,
             COUNT(cs.id) as scoredCount,
             tc.totalCriteria
      FROM Comparisons c
      JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
      JOIN Technologies t ON t.id = ct.technologyId
      CROSS JOIN TotalCriteria tc
      LEFT JOIN ComparisonScores cs ON cs.comparisonId = c.id AND cs.technologyId = t.id
      WHERE c.createdBy = @userId
      GROUP BY c.id, t.id, t.name, tc.totalCriteria
    `);

    const progressByComparison = new Map<number, unknown[]>();
    for (const row of progressResult.recordset) {
      const current = progressByComparison.get(row.comparisonId) ?? [];
      current.push({
        technologyId: row.technologyId,
        technologyName: row.technologyName,
        scoredCount: row.scoredCount,
        totalCriteria: row.totalCriteria,
      });
      progressByComparison.set(row.comparisonId, current);
    }

    // Calculate winner for each comparison
    const winnerResult = await pool.request().input('userId', sql.Int, userId).query(`
      WITH TechWeightedScores AS (
        SELECT c.id as comparisonId,
               t.id as technologyId,
               t.name as technologyName,
               cat.id as categoryId,
               COALESCE(cw.weight, 1) as weight,
               AVG(CAST(cs.score AS FLOAT)) as avgScore
        FROM Comparisons c
        JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
        JOIN Technologies t ON t.id = ct.technologyId
        JOIN ComparisonScores cs ON cs.comparisonId = c.id AND cs.technologyId = t.id
        JOIN Criteria cr ON cr.id = cs.criteriaId
        JOIN Categories cat ON cat.id = cr.categoryId
        LEFT JOIN CategoryWeights cw ON cw.comparisonId = c.id AND cw.categoryId = cat.id
        WHERE c.createdBy = @userId
        GROUP BY c.id, t.id, t.name, cat.id, cw.weight
      ),
      TechFinalScores AS (
        SELECT comparisonId, technologyId, technologyName,
               CASE WHEN SUM(weight) > 0 THEN SUM(avgScore * weight) / SUM(weight) ELSE 0 END as finalScore
        FROM TechWeightedScores
        GROUP BY comparisonId, technologyId, technologyName
      ),
      RankedTechs AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY comparisonId ORDER BY finalScore DESC) as rn
        FROM TechFinalScores
      )
      SELECT comparisonId, technologyName as winnerName, ROUND(finalScore, 2) as winnerScore
      FROM RankedTechs
      WHERE rn = 1
    `);

    const winnerByComparison = new Map<number, { winnerName: string; winnerScore: number }>();
    for (const row of winnerResult.recordset) {
      winnerByComparison.set(row.comparisonId, {
        winnerName: row.winnerName,
        winnerScore: row.winnerScore,
      });
    }

    res.json(
      comparisonsResult.recordset.map((comparison) => ({
        ...comparison,
        technologyProgress: progressByComparison.get(comparison.id) ?? [],
        winner: winnerByComparison.get(comparison.id) ?? null,
      }))
    );
  } catch (error) {
    console.error('List comparisons error:', error);
    res.status(500).json({ error: 'Failed to list comparisons' });
  }
});

// Get comparisons shared with the current user — must be before /:id
router.get('/shared/with-me', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const userId = await getCurrentUserId(req);

    const comparisonsResult = await pool.request().input('userId', sql.Int, userId).query(`
      SELECT c.id, c.clientName, c.useCaseDescription, c.comparisonType, c.status, c.createdAt, c.updatedAt,
             STRING_AGG(t.name, ', ') WITHIN GROUP (ORDER BY t.name) as technologyNames,
             creator.displayName as createdByName,
             sharer.displayName as sharedByName,
             cs.sharedAt
      FROM ComparisonShares cs
      JOIN Comparisons c ON c.id = cs.comparisonId
      LEFT JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
      LEFT JOIN Technologies t ON t.id = ct.technologyId
      LEFT JOIN AppUsers creator ON creator.id = c.createdBy
      LEFT JOIN AppUsers sharer ON sharer.id = cs.sharedByUserId
      WHERE cs.sharedWithUserId = @userId
      GROUP BY c.id, c.clientName, c.useCaseDescription, c.comparisonType, c.status, c.createdAt, c.updatedAt,
               creator.displayName, sharer.displayName, cs.sharedAt
      ORDER BY cs.sharedAt DESC
    `);

    const compIds = comparisonsResult.recordset.map((r) => r.id);
    const progressByComparison = new Map<number, unknown[]>();

    if (compIds.length > 0) {
      const idList = compIds.join(',');
      const progressResult = await pool.request().query(`
        WITH TotalCriteria AS (SELECT COUNT(*) as totalCriteria FROM Criteria)
        SELECT c.id as comparisonId, t.id as technologyId, t.name as technologyName,
               COUNT(csc.id) as scoredCount, tc.totalCriteria
        FROM Comparisons c
        JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
        JOIN Technologies t ON t.id = ct.technologyId
        CROSS JOIN TotalCriteria tc
        LEFT JOIN ComparisonScores csc ON csc.comparisonId = c.id AND csc.technologyId = t.id
        WHERE c.id IN (${idList})
        GROUP BY c.id, t.id, t.name, tc.totalCriteria
      `);
      for (const row of progressResult.recordset) {
        const current = progressByComparison.get(row.comparisonId) ?? [];
        current.push({ technologyId: row.technologyId, technologyName: row.technologyName, scoredCount: row.scoredCount, totalCriteria: row.totalCriteria });
        progressByComparison.set(row.comparisonId, current);
      }
    }

    const winnerByComparison = new Map<number, { winnerName: string; winnerScore: number }>();
    if (compIds.length > 0) {
      const idList = compIds.join(',');
      const winnerResult = await pool.request().query(`
        WITH TechWeightedScores AS (
          SELECT c.id as comparisonId, t.id as technologyId, t.name as technologyName,
                 cat.id as categoryId, COALESCE(cw.weight, 1) as weight,
                 AVG(CAST(csc.score AS FLOAT)) as avgScore
          FROM Comparisons c
          JOIN ComparisonTechnologies ct ON ct.comparisonId = c.id
          JOIN Technologies t ON t.id = ct.technologyId
          JOIN ComparisonScores csc ON csc.comparisonId = c.id AND csc.technologyId = t.id
          JOIN Criteria cr ON cr.id = csc.criteriaId
          JOIN Categories cat ON cat.id = cr.categoryId
          LEFT JOIN CategoryWeights cw ON cw.comparisonId = c.id AND cw.categoryId = cat.id
          WHERE c.id IN (${idList})
          GROUP BY c.id, t.id, t.name, cat.id, cw.weight
        ),
        TechFinalScores AS (
          SELECT comparisonId, technologyId, technologyName,
                 CASE WHEN SUM(weight) > 0 THEN SUM(avgScore * weight) / SUM(weight) ELSE 0 END as finalScore
          FROM TechWeightedScores GROUP BY comparisonId, technologyId, technologyName
        ),
        RankedTechs AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY comparisonId ORDER BY finalScore DESC) as rn
          FROM TechFinalScores
        )
        SELECT comparisonId, technologyName as winnerName, ROUND(finalScore, 2) as winnerScore
        FROM RankedTechs WHERE rn = 1
      `);
      for (const row of winnerResult.recordset) {
        winnerByComparison.set(row.comparisonId, { winnerName: row.winnerName, winnerScore: row.winnerScore });
      }
    }

    res.json(
      comparisonsResult.recordset.map((comparison) => ({
        ...comparison,
        technologyProgress: progressByComparison.get(comparison.id) ?? [],
        winner: winnerByComparison.get(comparison.id) ?? null,
      }))
    );
  } catch (error) {
    console.error('Get shared comparisons error:', error);
    res.status(500).json({ error: 'Failed to get shared comparisons' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const compId = parseInt(req.params.id, 10);

    const comparison = await pool.request().input('id', sql.Int, compId).query('SELECT * FROM Comparisons WHERE id = @id');

    if (comparison.recordset.length === 0) {
      res.status(404).json({ error: 'Comparison not found' });
      return;
    }

    const technologies = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT t.*
      FROM ComparisonTechnologies ct
      JOIN Technologies t ON ct.technologyId = t.id
      WHERE ct.comparisonId = @compId
      ORDER BY t.name
    `);

    const weights = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT cw.id, cw.comparisonId, cw.categoryId, CAST(cw.weight AS FLOAT) as weight, cat.name as categoryName
      FROM CategoryWeights cw
      JOIN Categories cat ON cw.categoryId = cat.id
      WHERE cw.comparisonId = @compId
      ORDER BY cat.sortOrder, cat.id
    `);

    const scores = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT cs.*, c.name as criteriaName, c.definition, cat.name as categoryName, cat.id as categoryId
      FROM ComparisonScores cs
      JOIN Criteria c ON cs.criteriaId = c.id
      JOIN Categories cat ON c.categoryId = cat.id
      WHERE cs.comparisonId = @compId
      ORDER BY cat.sortOrder, c.sortOrder, c.id
    `);

    res.json({
      ...comparison.recordset[0],
      technologies: technologies.recordset,
      categoryWeights: weights.recordset,
      scores: scores.recordset,
    });
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({ error: 'Failed to get comparison' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientName, comparisonType, useCaseDescription, technologyIds, categoryWeights } = req.body as ComparisonPayload;
    const resolvedType = comparisonType === 'simple' ? 'simple' : 'client';
    const trimmedClientName = clientName?.trim() || null;

    if (resolvedType === 'client' && !trimmedClientName) {
      res.status(400).json({ error: 'Client name is required for client comparisons' });
      return;
    }

    if (!technologyIds || !Array.isArray(technologyIds) || technologyIds.length < 2) {
      res.status(400).json({ error: 'At least two technologies are required' });
      return;
    }

    const pool = await getPool();
    const userId = await getCurrentUserId(req);

    const compResult = await pool
      .request()
      .input('clientName', sql.NVarChar, resolvedType === 'simple' ? null : trimmedClientName)
      .input('comparisonType', sql.NVarChar, resolvedType)
      .input('useCaseDescription', sql.NVarChar, useCaseDescription?.trim() || null)
      .input('createdBy', sql.Int, userId)
      .query(`
        INSERT INTO Comparisons (clientName, comparisonType, useCaseDescription, createdBy)
        OUTPUT INSERTED.*
        VALUES (@clientName, @comparisonType, @useCaseDescription, @createdBy)
      `);

    const compId = compResult.recordset[0].id;

    for (const techId of technologyIds) {
      await pool
        .request()
        .input('compId', sql.Int, compId)
        .input('techId', sql.Int, techId)
        .query('INSERT INTO ComparisonTechnologies (comparisonId, technologyId) VALUES (@compId, @techId)');
    }

    if (Array.isArray(categoryWeights) && categoryWeights.length > 0) {
      for (const item of categoryWeights) {
        await pool
          .request()
          .input('compId', sql.Int, compId)
          .input('categoryId', sql.Int, item.categoryId)
          .input('weight', sql.Decimal(5, 2), item.weight)
          .query('INSERT INTO CategoryWeights (comparisonId, categoryId, weight) VALUES (@compId, @categoryId, @weight)');
      }
    }

    await pool.request().input('compId', sql.Int, compId).query(`
      INSERT INTO CategoryWeights (comparisonId, categoryId, weight)
      SELECT @compId, c.id, COALESCE(dcw.weight, 1.0)
      FROM Categories c
      LEFT JOIN DefaultCategoryWeights dcw ON dcw.categoryId = c.id
      WHERE NOT EXISTS (
        SELECT 1 FROM CategoryWeights cw WHERE cw.comparisonId = @compId AND cw.categoryId = c.id
      );
    `);

    for (const techId of technologyIds) {
      await seedComparisonScoresFromReferenceAnswers(pool, compId, techId);
    }

    res.status(201).json(compResult.recordset[0]);
  } catch (error) {
    console.error('Create comparison error:', error);
    res.status(500).json({ error: 'Failed to create comparison' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const comparisonId = parseInt(req.params.id, 10);
    const { clientName, comparisonType, useCaseDescription, status } = req.body as ComparisonPayload & { status?: string };
    const pool = await getPool();

    const current = await pool.request().input('id', sql.Int, comparisonId).query('SELECT * FROM Comparisons WHERE id = @id');
    if (current.recordset.length === 0) {
      res.status(404).json({ error: 'Comparison not found' });
      return;
    }

    const existing = current.recordset[0];
    const resolvedType = comparisonType ?? existing.comparisonType ?? 'client';
    const nextClientName = clientName === undefined ? existing.clientName : clientName?.trim() || null;

    if (resolvedType === 'client' && !nextClientName) {
      res.status(400).json({ error: 'Client name is required for client comparisons' });
      return;
    }

    const result = await pool
      .request()
      .input('id', sql.Int, comparisonId)
      .input('clientName', sql.NVarChar, nextClientName)
      .input('comparisonType', sql.NVarChar, resolvedType)
      .input('useCaseDescription', sql.NVarChar, useCaseDescription === undefined ? existing.useCaseDescription : useCaseDescription.trim() || null)
      .input('status', sql.NVarChar, status || existing.status || 'draft')
      .query(`
        UPDATE Comparisons
        SET clientName = @clientName,
            comparisonType = @comparisonType,
            useCaseDescription = @useCaseDescription,
            status = @status,
            updatedAt = GETUTCDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Update comparison error:', error);
    res.status(500).json({ error: 'Failed to update comparison' });
  }
});

router.put('/:id/technologies', async (req: AuthRequest, res: Response) => {
  try {
    const comparisonId = parseInt(req.params.id, 10);
    const { technologyIds } = req.body as ComparisonPayload;

    if (!Array.isArray(technologyIds)) {
      res.status(400).json({ error: 'technologyIds array is required' });
      return;
    }

    const nextTechnologyIds = [...new Set(technologyIds.map((value) => parseInt(String(value), 10)).filter((value) => Number.isInteger(value)))];
    if (nextTechnologyIds.length < 2) {
      res.status(400).json({ error: 'At least two technologies are required' });
      return;
    }

    const pool = await getPool();
    const currentComparison = await pool.request().input('id', sql.Int, comparisonId).query('SELECT id FROM Comparisons WHERE id = @id');
    if (currentComparison.recordset.length === 0) {
      res.status(404).json({ error: 'Comparison not found' });
      return;
    }

    const currentTechnologies = await pool.request().input('comparisonId', sql.Int, comparisonId).query(`
      SELECT technologyId
      FROM ComparisonTechnologies
      WHERE comparisonId = @comparisonId
    `);

    const currentTechnologyIds = currentTechnologies.recordset.map((row) => row.technologyId as number);
    const technologyIdsToRemove = currentTechnologyIds.filter((technologyId) => !nextTechnologyIds.includes(technologyId));
    const technologyIdsToAdd = nextTechnologyIds.filter((technologyId) => !currentTechnologyIds.includes(technologyId));

    for (const technologyId of technologyIdsToRemove) {
      await pool
        .request()
        .input('comparisonId', sql.Int, comparisonId)
        .input('technologyId', sql.Int, technologyId)
        .query(`
          DELETE FROM ComparisonScores
          WHERE comparisonId = @comparisonId AND technologyId = @technologyId
        `);

      await pool
        .request()
        .input('comparisonId', sql.Int, comparisonId)
        .input('technologyId', sql.Int, technologyId)
        .query(`
          DELETE FROM ComparisonTechnologies
          WHERE comparisonId = @comparisonId AND technologyId = @technologyId
        `);
    }

    for (const technologyId of technologyIdsToAdd) {
      await pool
        .request()
        .input('comparisonId', sql.Int, comparisonId)
        .input('technologyId', sql.Int, technologyId)
        .query(`
          INSERT INTO ComparisonTechnologies (comparisonId, technologyId)
          VALUES (@comparisonId, @technologyId)
        `);

      await seedComparisonScoresFromReferenceAnswers(pool, comparisonId, technologyId);
    }

    await touchComparison(pool, comparisonId);

    const technologies = await pool.request().input('comparisonId', sql.Int, comparisonId).query(`
      SELECT t.*
      FROM ComparisonTechnologies ct
      JOIN Technologies t ON ct.technologyId = t.id
      WHERE ct.comparisonId = @comparisonId
      ORDER BY t.name
    `);

    res.json(technologies.recordset);
  } catch (error) {
    console.error('Update comparison technologies error:', error);
    res.status(500).json({ error: 'Failed to update comparison technologies' });
  }
});

router.put('/:id/scores', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);
    const { scores } = req.body as {
      scores: { technologyId: number; criteriaId: number; score: number; justification?: string }[];
    };

    const pool = await getPool();
    const userId = await getCurrentUserId(req);

    for (const item of scores) {
      await pool
        .request()
        .input('compId', sql.Int, compId)
        .input('techId', sql.Int, item.technologyId)
        .input('criteriaId', sql.Int, item.criteriaId)
        .input('score', sql.Int, item.score)
        .input('justification', sql.NVarChar, item.justification?.trim() || null)
        .input('updatedBy', sql.Int, userId)
        .query(`
          MERGE ComparisonScores AS target
          USING (VALUES (@compId, @techId, @criteriaId)) AS source (comparisonId, technologyId, criteriaId)
          ON target.comparisonId = source.comparisonId
             AND target.technologyId = source.technologyId
             AND target.criteriaId = source.criteriaId
          WHEN MATCHED THEN
            UPDATE SET score = @score, justification = @justification, updatedBy = @updatedBy, updatedAt = GETUTCDATE()
          WHEN NOT MATCHED THEN
            INSERT (comparisonId, technologyId, criteriaId, score, justification, updatedBy)
            VALUES (@compId, @techId, @criteriaId, @score, @justification, @updatedBy);
        `);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save scores error:', error);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

router.put('/:id/weights', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);
    const { weights } = req.body as { weights: { categoryId: number; weight: number }[] };
    const pool = await getPool();

    for (const item of weights) {
      await pool
        .request()
        .input('compId', sql.Int, compId)
        .input('categoryId', sql.Int, item.categoryId)
        .input('weight', sql.Decimal(5, 2), item.weight)
        .query(`
          MERGE CategoryWeights AS target
          USING (VALUES (@compId, @categoryId)) AS source (comparisonId, categoryId)
          ON target.comparisonId = source.comparisonId AND target.categoryId = source.categoryId
          WHEN MATCHED THEN UPDATE SET weight = @weight
          WHEN NOT MATCHED THEN INSERT (comparisonId, categoryId, weight) VALUES (@compId, @categoryId, @weight);
        `);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Save weights error:', error);
    res.status(500).json({ error: 'Failed to save weights' });
  }
});

router.get('/:id/results', async (req: AuthRequest, res: Response) => {
  try {
    const compId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const categories = await pool.request().query('SELECT * FROM Categories ORDER BY sortOrder, id');

    const weights = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT categoryId, CAST(weight AS FLOAT) as weight
      FROM CategoryWeights
      WHERE comparisonId = @compId
    `);

    const technologies = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT t.*
      FROM ComparisonTechnologies ct
      JOIN Technologies t ON ct.technologyId = t.id
      WHERE ct.comparisonId = @compId
      ORDER BY t.name
    `);

    const scores = await pool.request().input('compId', sql.Int, compId).query(`
      SELECT cs.technologyId, cs.criteriaId, cs.score, cs.justification,
             c.name as criteriaName, c.categoryId, cat.name as categoryName
      FROM ComparisonScores cs
      JOIN Criteria c ON cs.criteriaId = c.id
      JOIN Categories cat ON c.categoryId = cat.id
      WHERE cs.comparisonId = @compId
    `);

    const criteriaCounts = await pool.request().query(
      'SELECT categoryId, COUNT(*) as cnt FROM Criteria GROUP BY categoryId'
    );

    const results = technologies.recordset.map((tech) => {
      const techScores = scores.recordset.filter((score) => score.technologyId === tech.id);
      let totalWeightedScore = 0;
      let totalWeight = 0;

      const categoryResults = categories.recordset.map((category) => {
        const categoryScores = techScores.filter((score) => score.categoryId === category.id);
        const weight = weights.recordset.find((item) => item.categoryId === category.id)?.weight ?? 1;
        const criteriaCount = criteriaCounts.recordset.find((item) => item.categoryId === category.id)?.cnt ?? 0;
        const avgScore = categoryScores.length > 0
          ? categoryScores.reduce((sum, score) => sum + score.score, 0) / categoryScores.length
          : 0;

        totalWeightedScore += avgScore * weight;
        totalWeight += weight;

        return {
          categoryId: category.id,
          categoryName: category.name,
          weight,
          avgScore: Math.round(avgScore * 100) / 100,
          weightedScore: Math.round(avgScore * weight * 100) / 100,
          scoredCriteria: categoryScores.length,
          totalCriteria: criteriaCount,
        };
      });

      const finalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

      return {
        technologyId: tech.id,
        technologyName: tech.name,
        finalScore: Math.round(finalScore * 100) / 100,
        categoryResults,
      };
    });

    results.sort((a, b) => b.finalScore - a.finalScore);

    res.json({
      recommendation: results.length > 0 ? results[0].technologyName : 'No technologies scored',
      results,
    });
  } catch (error) {
    console.error('Results error:', error);
    res.status(500).json({ error: 'Failed to calculate results' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.Int, parseInt(req.params.id, 10)).query('DELETE FROM Comparisons WHERE id = @id');
    res.json({ success: true });
  } catch (error) {
    console.error('Delete comparison error:', error);
    res.status(500).json({ error: 'Failed to delete comparison' });
  }
});

// Share a comparison with users
router.post('/:id/share', async (req: AuthRequest, res: Response) => {
  try {
    const comparisonId = parseInt(req.params.id, 10);
    const { userIds } = req.body as { userIds: number[] };
    const pool = await getPool();
    const sharedByUserId = await getCurrentUserId(req);

    for (const userId of userIds) {
      await pool
        .request()
        .input('comparisonId', sql.Int, comparisonId)
        .input('sharedWithUserId', sql.Int, userId)
        .input('sharedByUserId', sql.Int, sharedByUserId)
        .query(`
          IF NOT EXISTS (
            SELECT 1 FROM ComparisonShares
            WHERE comparisonId = @comparisonId AND sharedWithUserId = @sharedWithUserId
          )
          INSERT INTO ComparisonShares (comparisonId, sharedWithUserId, sharedByUserId)
          VALUES (@comparisonId, @sharedWithUserId, @sharedByUserId)
        `);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Share comparison error:', error);
    res.status(500).json({ error: 'Failed to share comparison' });
  }
});

// Get users a comparison is shared with
router.get('/:id/shares', async (req: AuthRequest, res: Response) => {
  try {
    const comparisonId = parseInt(req.params.id, 10);
    const pool = await getPool();

    const result = await pool.request().input('comparisonId', sql.Int, comparisonId).query(`
      SELECT cs.id, cs.sharedWithUserId, u.displayName, u.email, cs.sharedAt
      FROM ComparisonShares cs
      JOIN AppUsers u ON u.id = cs.sharedWithUserId
      WHERE cs.comparisonId = @comparisonId
      ORDER BY cs.sharedAt DESC
    `);

    res.json(result.recordset);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get shares' });
  }
});

// Unshare a comparison from a user
router.delete('/:id/share/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const comparisonId = parseInt(req.params.id, 10);
    const userId = parseInt(req.params.userId, 10);
    const pool = await getPool();

    await pool
      .request()
      .input('comparisonId', sql.Int, comparisonId)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM ComparisonShares WHERE comparisonId = @comparisonId AND sharedWithUserId = @userId');

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unshare comparison' });
  }
});

export default router;
