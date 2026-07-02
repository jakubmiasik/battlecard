import { Router, Response } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = Router();

// Get reference answers for a technology
router.get('/:technologyId', async (req: AuthRequest, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('technologyId', parseInt(req.params.technologyId))
      .query(
        `SELECT ra.*, c.name as criteriaName, c.definition, cat.name as categoryName, cat.id as categoryId
         FROM ReferenceAnswers ra
         JOIN Criteria c ON ra.criteriaId = c.id
         JOIN Categories cat ON c.categoryId = cat.id
         WHERE ra.technologyId = @technologyId
         ORDER BY cat.sortOrder, c.sortOrder`
      );
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get reference answers' });
  }
});

// Save/update reference answers (admin only) - batch upsert
router.post('/:technologyId', requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const technologyId = parseInt(req.params.technologyId);
    const { answers } = req.body as { answers: { criteriaId: number; score: number; justification: string }[] };

    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ error: 'answers array required' });
      return;
    }

    const pool = await getPool();

    // Get user id
    const userResult = await pool
      .request()
      .input('oid', req.user!.oid)
      .query('SELECT id FROM AppUsers WHERE entraObjectId = @oid');
    const userId = userResult.recordset[0]?.id;

    for (const answer of answers) {
      await pool
        .request()
        .input('technologyId', technologyId)
        .input('criteriaId', answer.criteriaId)
        .input('score', answer.score)
        .input('justification', answer.justification || null)
        .input('updatedBy', userId)
        .query(
          `MERGE ReferenceAnswers AS target
           USING (VALUES (@technologyId, @criteriaId)) AS source (technologyId, criteriaId)
           ON target.technologyId = source.technologyId AND target.criteriaId = source.criteriaId
           WHEN MATCHED THEN
             UPDATE SET score = @score, justification = @justification, updatedBy = @updatedBy, updatedAt = GETUTCDATE()
           WHEN NOT MATCHED THEN
             INSERT (technologyId, criteriaId, score, justification, updatedBy)
             VALUES (@technologyId, @criteriaId, @score, @justification, @updatedBy);`
        );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save reference answers error:', err);
    res.status(500).json({ error: 'Failed to save reference answers' });
  }
});

export default router;
