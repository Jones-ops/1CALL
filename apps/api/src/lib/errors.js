import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, code = 'BAD_REQUEST', details) =>
  new HttpError(400, msg, code, details);
export const unauthorized = (msg = 'Please sign in', code = 'UNAUTHORIZED') =>
  new HttpError(401, msg, code);
export const forbidden = (msg = 'You do not have access to this', code = 'FORBIDDEN') =>
  new HttpError(403, msg, code);
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg, code = 'CONFLICT') => new HttpError(409, msg, code);

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Route not found', code: 'NOT_FOUND' } });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res
      .status(400)
      .json({
        error: { message: 'Validation failed', code: 'VALIDATION', details: err.flatten() },
      });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { message: err.message, code: 'UPLOAD' } });
  }
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ error: { message: err.message, code: err.code, details: err.details } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'Request too large', code: 'TOO_LARGE' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Invalid JSON', code: 'BAD_JSON' } });
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: { message: 'Something went wrong', code: 'INTERNAL' } });
}
