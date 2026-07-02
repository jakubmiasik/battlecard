import { Request, Response, NextFunction } from 'express';
import { getPool } from '../db/connection.js';
import { AuthRequest } from './auth.js';

export function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('oid', req.user.oid)
      .query('SELECT role, status FROM AppUsers WHERE entraObjectId = @oid');

    if (result.recordset.length === 0) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (result.recordset[0].status === 'blocked') {
      res.status(403).json({ error: 'Account is blocked' });
      return;
    }

    if (!roles.includes(result.recordset[0].role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
