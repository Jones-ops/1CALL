// Object storage. S3-compatible (AWS S3, MinIO, R2…) when S3_BUCKET is set;
// otherwise files go to a local folder and are served through /media with an
// HMAC-signed, expiring URL. Either way callers only ever get short-lived URLs.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const cfg = config.storage;
let s3 = null;
let s3Public = null;
let s3mod = null;

async function clients() {
  if (s3) return { s3, s3Public };
  s3mod = await import('@aws-sdk/client-s3');
  const base = {
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: cfg.accessKeyId
      ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
      : undefined,
  };
  s3 = new s3mod.S3Client({ ...base, endpoint: cfg.endpoint });
  // URLs handed to phones / the voice provider must use a publicly reachable host.
  s3Public = new s3mod.S3Client({ ...base, endpoint: cfg.publicEndpoint });
  return { s3, s3Public };
}

const localPath = (key) => {
  const p = path.resolve(cfg.localDir, key);
  if (!p.startsWith(path.resolve(cfg.localDir))) throw new Error('Invalid storage key');
  return p;
};

export async function putObject(key, body, contentType) {
  if (cfg.driver === 's3') {
    const { s3 } = await clients();
    await s3.send(
      new s3mod.PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function deleteObject(key) {
  if (cfg.driver === 's3') {
    const { s3 } = await clients();
    await s3.send(new s3mod.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

const sign = (key, exp) =>
  crypto.createHmac('sha256', cfg.signingSecret).update(`${key}:${exp}`).digest('base64url');

/** A signed URL valid for `ttlSec` seconds. */
export async function signedUrl(key, ttlSec = cfg.urlTtlSec) {
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  if (cfg.driver === 's3') {
    const { s3Public } = await clients();
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const url = await getSignedUrl(
      s3Public,
      new s3mod.GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
      { expiresIn: ttlSec },
    );
    return { url, expiresAt };
  }
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const url = `${config.publicUrl}/media/${encodeURIComponent(key)}?exp=${exp}&sig=${sign(key, exp)}`;
  return { url, expiresAt };
}

/** Verify a local signed URL; returns the absolute file path or null. */
export function verifyLocalSignature(key, exp, sig) {
  if (cfg.driver !== 'local') return null;
  const e = Number(exp);
  if (!e || e * 1000 < Date.now()) return null;
  const expected = Buffer.from(sign(key, e));
  const given = Buffer.from(String(sig || ''));
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return localPath(key);
}
