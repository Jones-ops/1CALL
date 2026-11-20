import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { api, resetDb, makeCustomer, prisma } from './helpers.js';
import { config } from '../src/config.js';
import { convertToTelephonyWav, makeToneWav } from '../src/services/audio.js';

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('auth hardening', () => {
  test('reset / verification tokens are never returned when exposeDevTokens is off (production)', async () => {
    const c = await makeCustomer();
    const saved = config.exposeDevTokens;
    config.exposeDevTokens = false;
    try {
      const r = await api()
        .post('/api/v1/auth/forgot-password')
        .send({ email: c.user.email })
        .expect(200);
      expect(r.body.devResetToken).toBeUndefined();
      const reg = await api()
        .post('/api/v1/auth/register')
        .send({
          orgName: 'Org X',
          name: 'Xavier',
          email: 'x@sec.example',
          phone: '0712345678',
          password: 'Password-1',
        })
        .expect(201);
      expect(reg.body.devVerifyToken).toBeUndefined();
      expect(reg.body.devVerifyUrl).toBeUndefined();
    } finally {
      config.exposeDevTokens = saved;
    }
  });

  test('an account is locked after 10 failed sign-ins, even with the right password', async () => {
    const c = await makeCustomer();
    for (let i = 0; i < 10; i++) {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: c.user.email, password: 'wrong-password' })
        .expect(401);
    }
    const r = await api()
      .post('/api/v1/auth/login')
      .send({ email: c.user.email, password: 'Password123!' })
      .expect(429);
    expect(r.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('invalid call-status filter is a 400, not a server error', async () => {
    const c = await makeCustomer();
    await api().get('/api/v1/campaigns/nope/calls?status=bogus').set(c.auth).expect(400);
  });
});

describe('audio upload hardening', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '1call-sec-'));

  test('a playlist disguised as an MP3 cannot make ffmpeg read other files', async () => {
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'SECRET');
    const playlist = `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.0,\n${path.join(dir, 'secret.txt')}\n#EXT-X-ENDLIST\n`;
    await expect(convertToTelephonyWav(Buffer.from(playlist), 'evil.mp3')).rejects.toMatchObject({
      status: 400,
    });
    await expect(convertToTelephonyWav(Buffer.from(playlist), 'evil.m3u8')).rejects.toMatchObject({
      status: 400,
    });
  });

  test('real WAV and M4A recordings still convert to 8 kHz mono', async () => {
    const wav = await convertToTelephonyWav(makeToneWav(5, 440, 44100), 'tone.wav');
    expect(wav.durationSec).toBeCloseTo(5, 0);

    // Phones record M4A (AAC): make one with ffmpeg and convert it.
    const src = path.join(dir, 'tone.wav');
    const m4a = path.join(dir, 'tone.m4a');
    fs.writeFileSync(src, makeToneWav(4, 440, 44100));
    const r = spawnSync(ffmpegStatic, ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'aac', m4a]);
    expect(r.status).toBe(0);
    const out = await convertToTelephonyWav(fs.readFileSync(m4a), 'voice.m4a');
    expect(out.durationSec).toBeGreaterThan(3.5);
    expect(out.buffer.readUInt32LE(24)).toBe(8000); // sample rate
    expect(out.buffer.readUInt16LE(22)).toBe(1); // mono
  });
});
