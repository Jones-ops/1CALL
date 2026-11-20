// Serves locally-stored audio through HMAC-signed, expiring URLs
// (only used when S3 is not configured).
import { Router } from 'express';
import fs from 'node:fs';
import { verifyLocalSignature } from '../services/storage.js';

const router = Router();

router.get('/:key', (req, res) => {
  const file = verifyLocalSignature(req.params.key, req.query.exp, req.query.sig);
  if (!file || !fs.existsSync(file)) return res.status(403).send('Link expired');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.type('audio/wav');
  fs.createReadStream(file).pipe(res);
});

export default router;
