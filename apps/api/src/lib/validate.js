import { HttpError } from './errors.js';

/**
 * zod validation middleware. Parsed data lands on req.valid[where]
 * (Express 5 makes req.query read-only, so we never overwrite it).
 */
export const validate =
  (schema, where = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[where] ?? {});
    if (!result.success) {
      return next(new HttpError(400, 'Validation failed', 'VALIDATION', result.error.flatten()));
    }
    req.valid = { ...(req.valid || {}), [where]: result.data };
    next();
  };
