import { auth } from './better-auth.js';
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  session?: any;
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as any),
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized: Session not found or expired.' });
    }

    req.session = session;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const requireRole = (roles: ('super_admin' | 'admin_jurusan')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Unauthorized: Session not found.' });
    }

    const userRole = req.session.user.role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
    }

    next();
  };
};
