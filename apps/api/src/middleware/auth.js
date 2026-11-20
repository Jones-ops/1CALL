import { verifyAccessToken } from '../services/tokens.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return next(unauthorized());
  const payload = verifyAccessToken(h.slice(7));
  req.user = { id: payload.sub, orgId: payload.org, role: payload.role };
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export const requireAdmin = requireRole('admin');
