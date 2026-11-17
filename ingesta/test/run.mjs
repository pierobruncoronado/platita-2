// Pruebas de los parsers sin dependencias:  node ingesta/test/run.mjs
// Carga Code.js igual que Apps Script (ámbito global, sin módulos) y lo corre contra correos reales saneados.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../apps-script/Code.js'), 'utf8');
const api = new Function(src + '\nreturn { parseEmail, buildPayload, toCents, parseDateEs, normalizeCounterparty, parseYapeReportXml };')();
const { cases } = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

let pass = 0;
const fail = [];
const check = (name, fn) => { try { fn(); pass++; } catch (e) { fail.push(`${name}\n    ${e.message.split('\n')[0]}`); } };

for (const c of cases) {
  check(c.name, () => {
    const r = api.parseEmail(c.email);
    const x = c.expect;
    assert.equal(r.status, x.status, 'status');
    for (const k of Object.keys(x)) {
      if (k === 'status') continue;
      if (k.startsWith('hint_')) assert.deepEqual(r.hint[k.slice(5)], x[k], k);
      else assert.deepEqual(r.movement[k], x[k], k);
    }
    if (r.movement) {
      assert.equal(r.movement.gmail_message_id, c.email.id);
      assert.ok(Number.isInteger(r.movement.amount_cents) && r.movement.amount_cents > 0, 'céntimos enteros');
      assert.ok(r.movement.dedupe_key.length > 10, 'dedupe_key');
    }
  });
}

check('toCents: formatos reales y basura', () => {
  assert.equal(api.toCents('6.39'), 639);
  assert.equal(api.toCents('8.9'), 890);
  assert.equal(api.toCents('30'), 3000);
  assert.equal(api.toCents('1,234.50'), 123450);
  assert.equal(api.toCents('GRATIS'), null);
  assert.equal(api.toCents('1.234'), null);
});
check('parseDateEs: medianoche y mediodía', () => {
  assert.equal(api.parseDateEs('01 de enero de 2027 - 12:05 AM', 'PE'), '2027-01-01T00:05:00-05:00');
  assert.equal(api.parseDateEs('01 de enero de 2027 - 12:05 PM', 'PE'), '2027-01-01T12:05:00-05:00');
  assert.equal(api.parseDateEs('sin fecha', 'PE'), null);
});
check('normalizeCounterparty: POS Izipay y terminal', () => {
  assert.equal(api.normalizeCounterparty('IZI*TAMBO ANGAM*001039243'), 'TAMBO ANGAM');
  assert.equal(api.normalizeCounterparty('DLC*RAPPI PERU'), 'DLC*RAPPI PERU');
  assert.equal(api.normalizeCounterparty(null), null);
});
check('dedupe: el mismo correo reenviado con otro id de Gmail produce la misma llave', () => {
  const e = cases[0].email;
  assert.equal(api.parseEmail(e).movement.dedupe_key, api.parseEmail({ ...e, id: 'otro-id' }).movement.dedupe_key);
});
check('dedupe: mismo n.º de operación corto en otro día NO colisiona', () => {
  const e = cases.find((c) => c.email.id === 'fx-bcp-deposito').email;
  const otro = { ...e, text: e.text.replace('30 de octubre', '31 de octubre') };
  assert.notEqual(api.parseEmail(e).movement.dedupe_key, api.parseEmail(otro).movement.dedupe_key);
});
check('buildPayload: 1 movimiento por correo parseado, pista aparte, ajenos fuera, unparsed con texto', () => {
  const p = api.buildPayload(cases.map((c) => c.email), 'backfill');
  const n = (s) => cases.filter((c) => c.expect.status === s).length;
  assert.equal(p.movements.length, n('parsed'));
  assert.equal(p.hints.length, n('hint'));
  assert.equal(p.emails.length, cases.length - 1);
  assert.equal(new Set(p.movements.map((m) => m.dedupe_key)).size, p.movements.length);
  assert.ok(p.emails.filter((e) => e.status === 'unparsed').every((e) => e.body_text));
  assert.ok(p.emails.filter((e) => e.status !== 'unparsed').every((e) => e.body_text === null));
});

const report = JSON.parse(readFileSync(join(here, 'yape-report.fixture.json'), 'utf8'));
check('historial Yape: 7 filas válidas; cabecera, tipos desconocidos y montos rotos se omiten', () => {
  const st = api.parseYapeReportXml(report.xml, 'g1');
  assert.equal(st.length, 7);
  assert.deepEqual([st[0].direction, st[0].amount_cents, st[0].occurred_at, st[0].kind, st[0].is_person, st[0].counterparty],
    ['out', 1300, '2026-11-16T18:21:18-05:00', 'yape_sent', true, 'Persona Uno*']);
  assert.deepEqual([st[1].kind, st[1].is_person, st[1].counterparty_norm], ['yape_payment', false, 'TIENDAS TAMBO S.A.C.']);
  assert.deepEqual([st[2].direction, st[2].kind, st[2].counterparty], ['in', 'yape_received', 'Persona Dos*']);
  assert.deepEqual([st[3].is_person, st[3].counterparty_norm, st[3].message], [true, 'PLIN-PERSONA TRES EJEMPLO', 'Recibiste un PLIN']);
});
check('historial Yape (juicio): un comercio con asterisco interno (IZI*...) no es persona', () => {
  const st = api.parseYapeReportXml(report.xml, 'g1');
  assert.deepEqual([st[4].is_person, st[4].kind, st[4].counterparty_norm], [false, 'yape_payment', 'MARKET LAS SHILIQUITA']);
});
check('historial Yape: dos yapeos idénticos en el mismo segundo no se pisan; el mensaje se desescapa', () => {
  const st = api.parseYapeReportXml(report.xml, 'g1');
  assert.notEqual(st[5].dedupe_key, st[6].dedupe_key);
  assert.equal(st[5].message, 'caf&é');
  assert.equal(new Set(st.map((x) => x.dedupe_key)).size, st.length);
  assert.deepEqual(api.parseYapeReportXml(report.xml, 'g1').map((x) => x.dedupe_key), st.map((x) => x.dedupe_key));
});
check('historial Yape: sin cabecera reconocible devuelve [] y el correo queda unparsed', () => {
  assert.deepEqual(api.parseYapeReportXml('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>PAGASTE</t></is></c></row></sheetData></worksheet>', 'g'), []);
  const e = { id: 'r1', from: 'notificaciones@yape.pe', subject: 'Historial de Movimientos', receivedAt: 'x', text: '', reportXml: null };
  assert.equal(api.parseEmail(e).status, 'unparsed');
  const ok = api.parseEmail({ ...e, reportXml: report.xml });
  assert.deepEqual([ok.status, ok.statements.length], ['statement', 7]);
  assert.equal(api.buildPayload([{ ...e, reportXml: report.xml }], 'hourly').statements.length, 7);
});

console.log(`${pass} passed, ${fail.length} failed`);
if (fail.length) { console.log(fail.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
