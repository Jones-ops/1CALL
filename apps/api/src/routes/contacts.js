import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { classifyRows, CONSENT_SOURCES, DEFAULT_GROUP_NAME } from '@1call/shared';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../lib/validate.js';
import { audit, ctx } from '../lib/audit.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseImportFile, parseText, MAX_IMPORT_ROWS } from '../services/importParser.js';
import { suppressedSet } from '../engine/suppression.js';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const groupName = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((v) => v || DEFAULT_GROUP_NAME);

async function existingNumbers(orgId, name) {
  const group = await prisma.contactGroup.findUnique({ where: { orgId_name: { orgId, name } } });
  if (!group) return { group: null, set: new Set() };
  const rows = await prisma.contact.findMany({
    where: { orgId, groupId: group.id },
    select: { phoneE164: true },
  });
  return { group, set: new Set(rows.map((r) => r.phoneE164)) };
}

router.post('/import/preview', upload.single('file'), async (req, res) => {
  const body = z
    .object({ text: z.string().max(5_000_000).optional(), groupName })
    .parse(req.body ?? {});
  let rows;
  if (req.file) rows = await parseImportFile(req.file.buffer, req.file.originalname);
  else if (body.text) rows = parseText(body.text);
  else throw badRequest('Paste some numbers or choose a file.', 'IMPORT_EMPTY');

  const { set } = await existingNumbers(req.user.orgId, body.groupName);
  const { rows: classified, counts } = classifyRows(rows, set);
  res.json({ groupName: body.groupName, counts, rows: classified });
});

router.post(
  '/import/commit',
  validate(
    z.object({
      groupName,
      consentSource: z.enum(CONSENT_SOURCES),
      declarationAccepted: z.literal(true, {
        errorMap: () => ({ message: 'You must confirm these people agreed to receive calls.' }),
      }),
      source: z.enum(['paste', 'file', 'phone_contacts']).default('paste'),
      rows: z
        .array(
          z.object({ name: z.string().max(120).optional().default(''), phone: z.string().max(40) }),
        )
        .min(1)
        .max(MAX_IMPORT_ROWS),
    }),
  ),
  async (req, res) => {
    const b = req.valid.body;
    const orgId = req.user.orgId;
    const now = new Date();

    const group = await prisma.contactGroup.upsert({
      where: { orgId_name: { orgId, name: b.groupName } },
      update: {},
      create: { orgId, name: b.groupName },
    });
    const { set } = await existingNumbers(orgId, b.groupName);
    // The server re-normalises and re-checks everything (source of truth).
    const { rows, counts } = classifyRows(
      b.rows.map((r) => ({ name: r.name, input: r.phone })),
      set,
    );
    const valid = rows.filter((r) => r.status === 'valid');
    if (!valid.length)
      throw badRequest('There are no valid new numbers to add.', 'IMPORT_NOTHING_VALID');

    const result = await prisma.$transaction(
      async (tx) => {
        const imp = await tx.contactImport.create({
          data: {
            orgId,
            userId: req.user.id,
            groupId: group.id,
            source: b.source,
            consentSource: b.consentSource,
            declarationAccepted: true,
            totalRows: counts.total,
            validCount: counts.valid,
            duplicateCount: counts.duplicate,
            invalidCount: counts.invalid,
            importedCount: 0,
            ip: req.ip,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
          },
        });
        let imported = 0;
        for (let i = 0; i < valid.length; i += 1000) {
          const r = await tx.contact.createMany({
            data: valid.slice(i, i + 1000).map((v) => ({
              orgId,
              groupId: group.id,
              name: v.name,
              phoneE164: v.phone,
              consentSource: b.consentSource,
              consentAt: now,
              importId: imp.id,
            })),
            skipDuplicates: true,
          });
          imported += r.count;
        }
        return tx.contactImport.update({
          where: { id: imp.id },
          data: { importedCount: imported },
        });
      },
      { timeout: 120_000 },
    );

    await audit(ctx(req), 'contacts.import', {
      targetType: 'contact_import',
      targetId: result.id,
      details: {
        group: group.name,
        ...counts,
        imported: result.importedCount,
        consentSource: b.consentSource,
      },
    });
    res
      .status(201)
      .json({ importId: result.id, groupId: group.id, imported: result.importedCount, counts });
  },
);

router.get(
  '/',
  validate(
    z.object({
      q: z.string().trim().max(100).optional(),
      group: z.string().max(40).optional(),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }),
    'query',
  ),
  async (req, res) => {
    const { q, group, page, pageSize } = req.valid.query;
    const where = { orgId: req.user.orgId };
    if (group) where.groupId = group;
    if (q) {
      const digits = q.replace(/[^\d+]/g, '');
      where.OR = [{ name: { contains: q, mode: 'insensitive' } }];
      if (digits.length >= 3) where.OR.push({ phoneE164: { contains: digits.replace(/^0/, '') } });
    }
    const [total, items] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { group: { select: { id: true, name: true } } },
      }),
    ]);
    const blocked = await suppressedSet(
      req.user.orgId,
      items.map((c) => c.phoneE164),
    );
    res.json({
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phoneE164,
        groupId: c.groupId,
        groupName: c.group.name,
        consentSource: c.consentSource,
        consentAt: c.consentAt,
        optedOut: blocked.has(c.phoneE164),
      })),
    });
  },
);

router.delete('/:id', async (req, res) => {
  const c = await prisma.contact.findFirst({ where: { id: req.params.id, orgId: req.user.orgId } });
  if (!c) throw notFound('Contact not found');
  await prisma.contact.delete({ where: { id: c.id } });
  await audit(ctx(req), 'contact.delete', {
    targetType: 'contact',
    targetId: c.id,
    details: { phone: c.phoneE164 },
  });
  res.json({ ok: true });
});

export const groupsRouter = Router();
groupsRouter.use(requireAuth);
groupsRouter.get('/', async (req, res) => {
  const groups = await prisma.contactGroup.findMany({
    where: { orgId: req.user.orgId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { contacts: true } } },
  });
  res.json({ items: groups.map((g) => ({ id: g.id, name: g.name, count: g._count.contacts })) });
});

export default router;
