// Converts uploaded audio to telephony format (8 kHz, mono, 16-bit PCM WAV)
// with ffmpeg and reports the exact duration.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { badRequest } from '../lib/errors.js';

const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

// Extension -> the only ffmpeg demuxer allowed to read it.
const DEMUXER = {
  mp3: 'mp3',
  wav: 'wav',
  m4a: 'mov',
  mp4: 'mov',
  '3gp': 'mov',
  aac: 'aac',
  caf: 'caf',
  webm: 'matroska',
  ogg: 'ogg',
};
export const ALLOWED_AUDIO_EXT = Object.keys(DEMUXER);
export const MAX_DURATION_SEC = 300;

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`)),
    );
  });
}

/** Duration of a PCM WAV buffer, read from its fmt/data chunks. */
export function wavDurationSec(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') {
      const dataSize = Math.min(size, buf.length - off - 8);
      return byteRate ? dataSize / byteRate : 0;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export async function convertToTelephonyWav(input, originalName = 'audio') {
  const ext = path.extname(originalName).slice(1).toLowerCase();
  if (!DEMUXER[ext]) throw badRequest('Use an MP3, WAV or M4A file.', 'AUDIO_INVALID');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '1call-'));
  const inFile = path.join(dir, `in-${crypto.randomUUID()}.${ext}`);
  const outFile = path.join(dir, 'out.wav');
  try {
    await fs.writeFile(inFile, input);
    await run([
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-protocol_whitelist',
      'file',
      '-f',
      DEMUXER[ext],
      '-i',
      inFile,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '8000',
      '-c:a',
      'pcm_s16le',
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-t',
      String(MAX_DURATION_SEC + 1),
      outFile,
    ]);
    const buffer = await fs.readFile(outFile);
    const durationSec = Math.round(wavDurationSec(buffer) * 100) / 100;
    if (durationSec < 0.5) throw badRequest('The recording is empty or too short.', 'AUDIO_EMPTY');
    if (durationSec > MAX_DURATION_SEC) {
      throw badRequest(
        `Recordings must be under ${MAX_DURATION_SEC / 60} minutes.`,
        'AUDIO_TOO_LONG',
      );
    }
    return { buffer, durationSec, contentType: 'audio/wav' };
  } catch (err) {
    if (err.status) throw err;
    console.error('[audio] conversion failed', err.message);
    throw badRequest('Could not read this audio file. Use MP3, WAV or M4A.', 'AUDIO_INVALID');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Generates a simple tone WAV (used by the seed script for the demo recording). */
export function makeToneWav(seconds = 12, freq = 440, rate = 8000) {
  const samples = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const beep = Math.floor(i / (rate * 0.5)) % 2 === 0; // half-second beeps
    const v = beep ? Math.sin((2 * Math.PI * freq * i) / rate) * 0.3 : 0;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}
