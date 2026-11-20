import { api, resetDb, prisma } from './helpers.js';

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

const reg = {
  orgName: 'St. Mark Parish',
  name: 'Jane Mwangi',
  email: 'Jane@Example.com',
  phone: '0712 345 678',
  password: 'S3cure-pass',
};

describe('auth', () => {
  let verifyToken;
  let refreshToken;

  test('register creates org + owner with Argon2id hash and sends verification', async () => {
    const res = await api().post('/api/v1/auth/register').send(reg).expect(201);
    expect(res.body.devVerifyToken).toBeTruthy(); // mock mode exposes the link
    verifyToken = res.body.devVerifyToken;
    const user = await prisma.user.findUnique({
      where: { email: 'jane@example.com' },
      include: { org: true },
    });
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.phone).toBe('+254712345678');
    expect(user.role).toBe('owner');
    expect(user.org.name).toBe('St. Mark Parish');
  });

  test('duplicate email rejected; invalid input rejected', async () => {
    await api().post('/api/v1/auth/register').send(reg).expect(409);
    await api()
      .post('/api/v1/auth/register')
      .send({ ...reg, email: 'x@y.z', password: 'short' })
      .expect(400);
  });

  test('login blocked until email verified', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: reg.password })
      .expect(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('verify email then login', async () => {
    await api().post('/api/v1/auth/verify-email').send({ token: verifyToken }).expect(200);
    await api().post('/api/v1/auth/verify-email').send({ token: verifyToken }).expect(400); // single use
    await api()
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: 'wrong-pass' })
      .expect(401);
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: reg.password })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    refreshToken = res.body.refreshToken;
    const me = await api()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body.user.email).toBe('jane@example.com');
    expect(me.body.balance.available).toBe(0);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'auth.login' } });
    expect(audit).toBeTruthy();
  });

  test('refresh rotates; reusing an old refresh token revokes the family', async () => {
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(refreshToken);
    // Reuse of the rotated token = theft
    await api().post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    // The newer token is now revoked too
    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: r1.body.refreshToken })
      .expect(401);
  });

  test('forgot + reset password', async () => {
    const f = await api()
      .post('/api/v1/auth/forgot-password')
      .send({ email: reg.email })
      .expect(200);
    await api()
      .post('/api/v1/auth/reset-password')
      .send({ token: f.body.devResetToken, password: 'New-password-1' })
      .expect(200);
    await api()
      .post('/api/v1/auth/login')
      .send({ email: reg.email, password: 'New-password-1' })
      .expect(200);
    // Unknown email still returns 200 (no account enumeration)
    await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@x.com' }).expect(200);
  });

  test('protected routes require a token', async () => {
    await api().get('/api/v1/me').expect(401);
    await api().get('/api/v1/me').set('Authorization', 'Bearer garbage').expect(401);
  });

  test('config endpoint reports mock mode', async () => {
    const res = await api().get('/api/v1/config').expect(200);
    expect(res.body.mockMode).toBe(true);
    expect(res.body.bannerText).toMatch(/MOCK MODE/);
  });
});
