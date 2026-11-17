/**
 * Platita 2 — ingesta automática (Google Apps Script, runtime V8).
 * Gmail (avisos BCP + Yape) -> parsers -> Supabase RPC ingest_batch. Cero entrada manual.
 * Una sola fuente: este archivo se pega tal cual en script.google.com y también lo carga
 * ingesta/test/run.mjs (los parsers son funciones puras, sin servicios de Google).
 *
 * Funciones que se ejecutan a mano una sola vez: instalar().  El trigger llama a cadaHora().
 */
var PARSER_VERSION = '2026-11-17.1';

var CFG = {
  SUPABASE_URL: '__SUPABASE_URL__',
  SUPABASE_KEY: '__SUPABASE_PUBLISHABLE_KEY__', // llave publicable (no es secreto); el secreto real es INGEST_KEY
  SENDERS: {
    'notificaciones@notificacionesbcp.com.pe': 'bcp',
    'notificaciones@yape.pe': 'yape'
    // Modo EE. UU. (se activa con los primeros correos reales desde el 13 dic 2026):
    // '<remitente real de las alertas de Bank of America, por confirmar con el primer correo>': 'bofa',
    // '<remitente real de Rockland Trust>': 'rockland'
  },
  BACKFILL_DAYS: 90,
  HOURLY_WINDOW_DAYS: 2,
  BATCH: 40,
  TZ_OFFSET: { PE: '-05:00' } // Lima no tiene horario de verano
};

/* ───────────────────────── Parsers (puros) ───────────────────────── */

var MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

function normalizeText(s) {
  return String(s || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\u00a0/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlToText(html) {
  var t = String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&iquest;/gi, '¿').replace(/&iexcl;/gi, '¡').replace(/&ordm;/gi, 'º').replace(/&deg;/gi, '°')
    .replace(/&([aeiouAEIOU])acute;/g, function (_, v) { return 'áéíóúÁÉÍÓÚ'.charAt('aeiouAEIOU'.indexOf(v)); })
    .replace(/&ntilde;/g, 'ñ').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); });
  return normalizeText(t);
}

/** "1,234.50" | "8.9" | "30" -> céntimos enteros. Devuelve null si no es un monto. */
function toCents(str) {
  var c = String(str || '').replace(/,/g, '').replace(/\.$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(c)) return null;
  var p = c.split('.');
  return parseInt(p[0], 10) * 100 + parseInt(((p[1] || '') + '00').slice(0, 2), 10);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

/** Fechas de BCP y Yape -> ISO con el offset fijo del país. Devuelve null si no reconoce el formato. */
function parseDateEs(text, country) {
  var off = CFG.TZ_OFFSET[country || 'PE'];
  var m = /(\d{1,2})\s+(?:de\s+)?([A-Za-zñáéíóú]+)\.?\s+(?:de\s+)?(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*([AaPp])\.?\s*[Mm]\.?/.exec(text);
  if (m) {
    var mon = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (!mon) return null;
    var h = parseInt(m[4], 10) % 12;
    if (/p/i.test(m[6])) h += 12;
    return m[3] + '-' + pad2(mon) + '-' + pad2(parseInt(m[1], 10)) + 'T' + pad2(h) + ':' + m[5] + ':00' + off;
  }
  m = /(\d{2})\/(\d{2})\/(\d{4}) a las (\d{1,2}):(\d{2})/.exec(text);
  if (m) return m[3] + '-' + m[2] + '-' + m[1] + 'T' + pad2(parseInt(m[4], 10)) + ':' + m[5] + ':00' + off;
  return null;
}

/** Nombre de comercio comparable: mayúsculas, sin prefijo de POS (IZI*) ni sufijo de terminal (*001234). */
function normalizeCounterparty(raw) {
  if (!raw) return null;
  var s = String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
  s = s.replace(/^IZI\*/, '').replace(/\*\d{5,}$/, '').trim();
  return s || null;
}

/** Apps Script entrega los valores de BCP en negrita como *valor*: se quita ese envoltorio, no los asteriscos internos (IZI*TAMBO*0012). */
function grab(text, re) {
  var m = re.exec(text);
  if (!m) return null;
  var v = m[1].trim();
  if (v.length > 2 && v.charAt(0) === '*' && v.charAt(v.length - 1) === '*') v = v.slice(1, -1).trim();
  return v || null;
}

function money(text, label) {
  var m = new RegExp(label + '\\s*\\*?\\s*(S\\/|US\\$|\\$)\\s*([\\d.,]+)').exec(text);
  if (!m) return null;
  var cents = toCents(m[2]);
  if (!cents) return null;
  return { cents: cents, currency: m[1] === 'S/' ? 'PEN' : 'USD' };
}

var OP = 'N(?:[úu]mero|[º°o]\\.?) de\\s+operaci[óo]n(?: Yape)?:?\\s+';

/**
 * Tabla de tipos de correo. Cada entrada: a qué correos aplica (when) y cómo se lee (read).
 * read devuelve {kind, direction, amount, date, counterparty?, op?, details?} o null si falta un campo obligatorio.
 */
var EMAIL_TYPES = [
  { id: 'bcp.card_purchase', source: 'bcp', when: /Realizaste un consumo/i, read: function (t) {
      return { kind: 'card_purchase', direction: 'out', amount: money(t, 'Total del consumo'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, new RegExp('Empresa\\s+(.+?)\\s+' + OP)), op: grab(t, new RegExp(OP + '(\\S+)')) };
    } },
  { id: 'bcp.atm_deposit', source: 'bcp', when: /Recibiste un dep[óo]sito/i, read: function (t) {
      return { kind: 'atm_deposit', direction: 'in', amount: money(t, 'Total abonado'), date: parseDateEs(t, 'PE'),
        op: grab(t, new RegExp(OP + '(\\S+)')), details: { atm: grab(t, /C[óo]digo de cajero\s+(\S+)/) } };
    } },
  { id: 'bcp.atm_withdrawal', source: 'bcp', when: /Realizaste un retiro/i, read: function (t) {
      return { kind: 'atm_withdrawal', direction: 'out', amount: money(t, 'Total retirado'), date: parseDateEs(t, 'PE'),
        op: grab(t, new RegExp(OP + '(\\S+)')), details: { atm: grab(t, /C[óo]digo de cajero\s+(\S+)/) } };
    } },
  { id: 'bcp.refund', source: 'bcp', when: /devoluci[óo]n de una operaci[óo]n/i, read: function (t) {
      return { kind: 'refund', direction: 'in', amount: money(t, 'Total devuelto'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, new RegExp('Nombre del Comercio\\s+(.+?)\\s+' + OP)), op: grab(t, new RegExp(OP + '(\\S+)')) };
    } },
  { id: 'bcp.yape_received', source: 'bcp', when: /recepci[óo]n de Yapeo/i, noOp: true, read: function (t) {
      return { kind: 'yape_received', direction: 'in', amount: money(t, 'Monto recibido'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, /Enviado por\s+(.+?)(?=\s+\*?¿No reconoces|\s+\*?¡|$)/) };
    } },
  { id: 'yape.sent', source: 'yape', when: /te notificaremos por cada yapeo/i, read: function (t) {
      return { kind: 'yape_sent', direction: 'out', amount: money(t, 'Monto de yapeo'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, new RegExp('Nombre del Beneficiario\\s+(.+?)\\s+' + OP)), op: grab(t, new RegExp(OP + '(\\S+)')) };
    } },
  { id: 'yape.service', source: 'yape', when: /yapeo de servicio/i, read: function (t) {
      return { kind: 'yape_service', direction: 'out', amount: money(t, 'Monto total'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, /Empresa:\s*(.+?)\s+Servicio:/), op: grab(t, new RegExp(OP + '(\\S+)')),
        details: { service: grab(t, /Servicio:\s*(.+?)\s+C[óo]digo de usuario/) } };
    } },
  { id: 'yape.payment', source: 'yape', when: /^(Pago exitoso|Env[íi]o Autom[áa]tico - Constancia de Transferencia)/i, read: function (t) {
      return { kind: 'yape_payment', direction: 'out', amount: money(t, 'Monto total'), date: parseDateEs(t, 'PE'),
        counterparty: grab(t, /Tu pago en\s+(.+?)\s+fue exitoso/),
        op: grab(t, /ID de operaci[óo]n:\s*(\S+)/) || grab(t, new RegExp(OP + '(\\S+)')) };
    } },
  { id: 'yape.promo_hint', source: 'yape', hint: true, when: /^Tu compra de .+ fue exitosa/i, read: function (t) {
      return { amount: money(t, 'Monto total:'), date: parseDateEs(t, 'PE'), counterparty: grab(t, /Comercio:\s*(.+?)\s+Monto total:/) };
    } },
  { id: 'yape.report', source: 'yape', report: true, when: /^Historial de Movimientos/i },
  { id: 'yape.ignored', source: 'yape', ignore: true, when: /afiliaci[óo]n|desafiliado|biometr[íi]a|elegido para ayudarnos/i }
];

/**
 * email = {id, from, subject, receivedAt (ISO), text, html}
 * -> {status: 'parsed'|'hint'|'ignored'|'unparsed', parser, movement?, hint?}
 * Regla: lo que no se entiende queda 'unparsed' (visible en Supabase), nunca se descarta en silencio.
 */
function parseEmail(email) {
  var from = String(email.from || '').toLowerCase();
  var source = null;
  for (var addr in CFG.SENDERS) if (from.indexOf(addr) !== -1) source = CFG.SENDERS[addr];
  if (!source) return { status: 'ignored', parser: 'unknown_sender' };
  var subject = String(email.subject || '').trim();
  var type = null;
  for (var i = 0; i < EMAIL_TYPES.length; i++) {
    if (EMAIL_TYPES[i].source === source && EMAIL_TYPES[i].when.test(subject)) { type = EMAIL_TYPES[i]; break; }
  }
  if (!type) return { status: 'unparsed', parser: source + '.unknown_subject', source: source };
  if (type.ignore) return { status: 'ignored', parser: type.id, source: source };
  if (type.report) {
    var st = parseYapeReportXml(email.reportXml, email.id);
    return st.length ? { status: 'statement', parser: type.id, source: source, statements: st } : { status: 'unparsed', parser: type.id, source: source };
  }

  var candidates = [normalizeText(email.text), htmlToText(email.html)];
  for (var c = 0; c < candidates.length; c++) {
    var t = source === 'yape' ? candidates[c].replace(/\*/g, '') : candidates[c];
    if (!t) continue;
    var r = type.read(t);
    if (!r || !r.amount || !r.date) continue;
    if (type.hint) {
      if (!r.counterparty) continue;
      return { status: 'hint', parser: type.id, source: source, hint: {
        gmail_message_id: email.id, source: source, amount_cents: r.amount.cents, occurred_at: r.date,
        counterparty: r.counterparty, counterparty_norm: normalizeCounterparty(r.counterparty) } };
    }
    if (!type.noOp && !r.op) continue;
    if (r.kind !== 'atm_deposit' && r.kind !== 'atm_withdrawal' && !r.counterparty) continue;
    var norm = normalizeCounterparty(r.counterparty);
    var day = r.date.slice(0, 10);
    var key = r.op
      ? [source, r.kind, r.op, day].join(':')
      : [source, r.kind, r.date.slice(0, 16), r.amount.cents, (norm || '').replace(/[^A-Z0-9]+/g, '-')].join(':');
    var details = r.details || {};
    details.parser = type.id; details.parser_version = PARSER_VERSION;
    return { status: 'parsed', parser: type.id, source: source, movement: {
      dedupe_key: key, country: 'PE', source: source, kind: r.kind, direction: r.direction,
      amount_cents: r.amount.cents, currency: r.amount.currency, occurred_at: r.date,
      counterparty: r.counterparty || null, counterparty_norm: norm, operation_id: r.op || null,
      gmail_message_id: email.id, details: details } };
  }
  return { status: 'unparsed', parser: type.id, source: source };
}

/** Lista de correos -> payload de ingest_batch. */
function buildPayload(emails, mode) {
  var out = { mode: mode, emails: [], movements: [], hints: [], statements: [] };
  for (var i = 0; i < emails.length; i++) {
    var e = emails[i], r = parseEmail(e);
    if (r.status === 'ignored' && r.parser === 'unknown_sender') continue;
    out.emails.push({ gmail_message_id: e.id, source: r.source, subject: e.subject, received_at: e.receivedAt,
      status: r.status, parser: r.parser, body_text: r.status === 'unparsed' ? (normalizeText(e.text) || htmlToText(e.html)) : null });
    if (r.movement) out.movements.push(r.movement);
    if (r.hint) out.hints.push(r.hint);
    if (r.statements) out.statements = out.statements.concat(r.statements);
  }
  return out;
}

/* ───────────────────────── Gmail + Supabase (solo en Apps Script) ───────────────────────── */

/* ───────── Historial de Movimientos de Yape (adjunto .xlsx que Piero se envía desde la app) ───────── */

function xmlText_(s) {
  return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); }).replace(/&amp;/g, '&');
}

/**
 * XML de xl/worksheets/sheet1.xml (celdas inlineStr) -> filas de estado de cuenta.
 * Columnas: Tipo de Transacción | Origen | Destino | Monto | Mensaje | Fecha de operación (dd/mm/aaaa hh:mm:ss, hora de Lima).
 * Devuelve [] si no encuentra la cabecera: nunca adivina columnas.
 */
function parseYapeReportXml(xml, gmailId) {
  var rows = [], out = [], seen = {}, rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, m;
  while ((m = rowRe.exec(String(xml || '')))) {
    var cells = {}, cellRe = /<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g, c;
    while ((c = cellRe.exec(m[1]))) {
      var parts = [], tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g, t;
      while ((t = tRe.exec(c[2]))) parts.push(xmlText_(t[1]));
      cells[c[1]] = parts.join('').replace(/\s+/g, ' ').trim();
    }
    rows.push(cells);
  }
  var head = -1;
  for (var i = 0; i < rows.length; i++) {
    if (/^Tipo de Transacci/i.test(rows[i].A || '') && /^Monto/i.test(rows[i].D || '') && /^Fecha/i.test(rows[i].F || '')) { head = i; break; }
  }
  if (head < 0) return out;
  for (var j = head + 1; j < rows.length; j++) {
    var r = rows[j], tipo = (r.A || '').toUpperCase();
    var dir = tipo === 'PAGASTE' ? 'out' : (/^TE PAG/.test(tipo) ? 'in' : null);
    var cents = toCents(r.D), d = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(r.F || '');
    if (!dir || !cents || !d) continue;
    var cp = dir === 'out' ? r.C : r.B;
    if (!cp) continue;
    var person = /\*$/.test(cp) || /^[A-Z]{2,6} - /.test(cp);
    var norm = normalizeCounterparty(cp.replace(/^([A-Z]{2,6}) - /, '$1-'));
    var when = d[3] + '-' + d[2] + '-' + d[1] + 'T' + d[4] + ':' + d[5] + ':' + d[6];
    var key = ['yape_report', dir, when, cents, norm.replace(/[^A-Z0-9]+/g, '-')].join(':');
    if (seen[key]) key += ':' + (seen[key] + 1);
    seen[key.replace(/:\d+$/, '')] = (seen[key.replace(/:\d+$/, '')] || 0) + 1;
    out.push({ dedupe_key: key, country: 'PE', source: 'yape_report', direction: dir, amount_cents: cents, currency: 'PEN',
      occurred_at: when + CFG.TZ_OFFSET.PE, counterparty: cp, counterparty_norm: norm, is_person: person,
      kind: dir === 'in' ? 'yape_received' : (person ? 'yape_sent' : 'yape_payment'),
      message: r.E || null, gmail_message_id: gmailId });
  }
  return out;
}

/** Solo Apps Script: saca el XML de la hoja del adjunto .xlsx (un .xlsx es un zip). null si no hay adjunto legible. */
function readXlsxSheet_(message) {
  var atts = message.getAttachments();
  for (var i = 0; i < atts.length; i++) {
    if (!/\.xlsx$/i.test(atts[i].getName())) continue;
    var files = Utilities.unzip(Utilities.newBlob(atts[i].getBytes(), 'application/zip', 'r.zip'));
    for (var j = 0; j < files.length; j++) {
      if (/^xl\/worksheets\/sheet1\.xml$/.test(files[j].getName())) return files[j].getDataAsString('UTF-8');
    }
  }
  return null;
}

function gmailQuery_(days) {
  return 'from:(' + Object.keys(CFG.SENDERS).join(' OR ') + ') newer_than:' + days + 'd';
}

function fetchEmails_(days) {
  var since = Date.now() - days * 86400000, out = [], seen = {}, start = 0, threads;
  do {
    threads = GmailApp.search(gmailQuery_(days), start, 100);
    for (var i = 0; i < threads.length; i++) {
      var msgs = threads[i].getMessages();
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j], id = m.getId();
        if (seen[id] || m.getDate().getTime() < since) continue;
        seen[id] = true;
        out.push({ id: id, from: m.getFrom(), subject: m.getSubject(), receivedAt: m.getDate().toISOString(),
          text: m.getPlainBody(), html: m.getBody(),
          reportXml: /^Historial de Movimientos/i.test(m.getSubject()) ? readXlsxSheet_(m) : null });
      }
    }
    start += 100;
  } while (threads.length === 100);
  return out;
}

function rpc_(fn, body) {
  var res = UrlFetchApp.fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: CFG.SUPABASE_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_KEY },
    payload: JSON.stringify(body)
  });
  if (res.getResponseCode() >= 300) throw new Error('Supabase ' + fn + ' -> ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

/** El secreto de ingesta lo genera el propio script y solo guarda su hash la base: nadie lo copia ni lo pega. */
function ingestKey_() {
  var props = PropertiesService.getScriptProperties(), key = props.getProperty('INGEST_KEY');
  if (!key) {
    key = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('INGEST_KEY', key);
  }
  if (rpc_('ingest_claim', { p_key: key }) !== true) {
    throw new Error('La base ya tiene otra llave de ingesta registrada. Pide a Claude: delete from private.ingest_keys; y vuelve a ejecutar instalar().');
  }
  return key;
}

function ingest_(days, mode) {
  var key = ingestKey_(), emails = fetchEmails_(days), total = { emails: 0, movements: 0, new: 0, unparsed: 0, hints_applied: 0, statements: 0, promoted: 0, linked: 0 };
  var payload = buildPayload(emails, mode), n = Math.max(payload.emails.length, 1);
  for (var i = 0; i < n; i += CFG.BATCH) {
    var ids = {}, slice = payload.emails.slice(i, i + CFG.BATCH);
    slice.forEach(function (e) { ids[e.gmail_message_id] = true; });
    var r = rpc_('ingest_batch', { p_key: key, p_payload: { mode: mode, emails: slice,
      movements: payload.movements.filter(function (m) { return ids[m.gmail_message_id]; }),
      hints: payload.hints.filter(function (h) { return ids[h.gmail_message_id]; }),
      statements: payload.statements.filter(function (x) { return ids[x.gmail_message_id]; }) } });
    for (var k in total) total[k] += r[k] || 0;
  }
  console.log(mode + ': ' + JSON.stringify(total));
  return total;
}

/** Trigger horario. Sin correos nuevos igual escribe una fila en ingest_runs: ese es el latido que evita la pausa de Supabase. */
function cadaHora() { return ingest_(CFG.HOURLY_WINDOW_DAYS, 'hourly'); }

/** Una sola vez: registra la llave, carga 90 días y deja el trigger horario. Volver a ejecutarla es seguro (idempotente). */
function instalar() {
  var r = ingest_(CFG.BACKFILL_DAYS, 'backfill');
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cadaHora') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cadaHora').timeBased().everyHours(1).create();
  console.log('Instalado. Carga inicial: ' + JSON.stringify(r));
  return r;
}

/** Solo dispara la pantalla de permisos de Google; no lee ni escribe nada. */
function autorizar() { console.log('Permisos concedidos. Siguiente paso: instalar().'); }

if (typeof module !== 'undefined') {
  module.exports = { CFG: CFG, parseEmail: parseEmail, buildPayload: buildPayload, toCents: toCents, parseDateEs: parseDateEs,
    normalizeCounterparty: normalizeCounterparty, htmlToText: htmlToText, normalizeText: normalizeText, parseYapeReportXml: parseYapeReportXml };
}
