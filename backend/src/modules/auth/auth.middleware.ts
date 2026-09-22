import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { JwtPayload } from './auth.service';
import { db } from '../../db';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload & { originalUserId?: string; teamRole?: string };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // Resolve team membership: team members see their owner's workspace
    const { rows } = await db.query(
      `SELECT owner_id, role FROM team_members WHERE member_user_id = $1 LIMIT 1`,
      [payload.userId],
    );

    if (rows.length) {
      req.user = {
        ...payload,
        userId: rows[0].owner_id,       // act as owner for all data queries
        originalUserId: payload.userId, // keep original for audit
        teamRole: rows[0].role,
      };
    } else {
      req.user = payload;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
