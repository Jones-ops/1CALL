import ExcelJS from 'exceljs';
import { api, resetDb, makeCustomer, prisma } from './helpers.js';

beforeAll(resetDb);
afterAll(() => prisma.$disconnect());

describe('contacts import', () => {
  let c;
  beforeAll(async () => {
    c = await makeCustomer();
  });

  test('preview classifies valid / duplicate / invalid', async () => {
    const res = await api()
      .post('/api/v1/contacts/import/preview')
      .set(c.auth)
      .send({
        text: 'Jane,0712345678\n+254712345678\n0722 000 111\nnot-a-number\n+447911123456',
        groupName: 'Parents',
      })
      .expect(200);
    expect(res.body.counts).toEqual({ total: 5, valid: 3, duplicate: 1, invalid: 1 });
    expect(res.body.rows[0]).toMatchObject({
      name: 'Jane',
      phone: '+254712345678',
      status: 'valid',
    });
  });

  test('commit requires the consent declaration', async () => {
    await api()
      .post('/api/v1/contacts/import/commit')
      .set(c.auth)
      .send({
        groupName: 'Parents',
        consentSource: 'paper_form',
        declarationAccepted: false,
        rows: [{ phone: '0712345678' }],
      })
      .expect(400);
  });

  test('commit stores consent source, time, user and IP; re-import detects duplicates', async () => {
    const res = await api()
      .post('/api/v1/contacts/import/commit')
      .set(c.auth)
      .send({
        groupName: 'Parents',
        consentSource: 'paper_form',
        declarationAccepted: true,
        rows: [
          { name: 'Jane', phone: '0712345678' },
          { phone: '254722000111' },
          { phone: 'junk' },
          { phone: '+254712345678' },
        ],
      })
      .expect(201);
    expect(res.body.imported).toBe(2);
    const imp = await prisma.contactImport.findUnique({ where: { id: res.body.importId } });
    expect(imp).toMatchObject({
      userId: c.user.id,
      consentSource: 'paper_form',
      declarationAccepted: true,
      validCount: 2,
      duplicateCount: 1,
      invalidCount: 1,
    });
    expect(imp.ip).toBeTruthy();
    const contact = await prisma.contact.findFirst({
      where: { orgId: c.org.id, phoneE164: '+254712345678' },
    });
    expect(contact.consentSource).toBe('paper_form');

    const again = await api()
      .post('/api/v1/contacts/import/preview')
      .set(c.auth)
      .send({ text: '0712345678\n0733111222', groupName: 'Parents' })
      .expect(200);
    expect(again.body.counts).toMatchObject({ valid: 1, duplicate: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'contacts.import' } })).toBe(1);
  });

  test('CSV and Excel files are parsed on the server', async () => {
    await api()
      .post('/api/v1/contacts/import/preview')
      .set(c.auth)
      .field('groupName', 'Files')
      .attach(
        'file',
        Buffer.from('Name,Phone Number\nAmos,0700111222\nBea,0700111333\n,bad\n'),
        'list.csv',
      )
      .expect(200)
      .then((r) => expect(r.body.counts).toEqual({ total: 3, valid: 2, duplicate: 0, invalid: 1 }));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['name', 'mobile']);
    ws.addRow(['Carol', 712000999]); // Excel drops the leading 0
    ws.addRow(['Dan', '+254 733 444 555']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await api()
      .post('/api/v1/contacts/import/preview')
      .set(c.auth)
      .attach('file', buf, 'list.xlsx')
      .expect(200);
    expect(r.body.counts.valid).toBe(2);
    expect(r.body.rows.map((x) => x.phone)).toEqual(['+254712000999', '+254733444555']);
  });

  test('list, search, filter, opted-out badge, delete; scoped by org', async () => {
    await prisma.suppression.create({
      data: { orgId: c.org.id, phoneE164: '+254722000111', source: 'manual' },
    });
    const list = await api().get('/api/v1/contacts').set(c.auth).expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items.find((x) => x.phone === '+254722000111').optedOut).toBe(true);
    const search = await api().get('/api/v1/contacts?q=jane').set(c.auth).expect(200);
    expect(search.body.items).toHaveLength(1);
    const byNum = await api().get('/api/v1/contacts?q=0712').set(c.auth).expect(200);
    expect(byNum.body.items).toHaveLength(1);

    const other = await makeCustomer();
    const id = list.body.items[0].id;
    await api().delete(`/api/v1/contacts/${id}`).set(other.auth).expect(404);
    expect((await api().get('/api/v1/contacts').set(other.auth)).body.total).toBe(0);
    await api().delete(`/api/v1/contacts/${id}`).set(c.auth).expect(200);

    const groups = await api().get('/api/v1/groups').set(c.auth).expect(200);
    expect(groups.body.items.find((g) => g.name === 'Parents').count).toBe(1);
  });
});
