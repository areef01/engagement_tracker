/**
 * Majlis Tunang checklist  <->  this Google Sheet
 *
 * The checklist website reads and saves its data here, and only with the passcode. Tabs (created automatically the first time):
 *   Kategori : one row per category
 *   Items    : one row per item (Jumlah is a formula, Done is a checkbox)
 *   Settings : bajet, nama pasangan, tarikh majlis, tema (kept here so they're not in the public repo)
 * You can also edit the Sheet directly; the website shows it on the next refresh.
 *
 * Setup: see GOOGLE_SHEET_SETUP.md in the repo.
 *   1. Project Settings > Script Properties > add PASSCODE (only people who know it can save from the website).
 *      The passcode lives there, not in this file, because this file is also in the public GitHub repo.
 *   2. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 *   3. Put the Web app URL in data/tunang.js (sheetUrl).
 * After changing this code: Deploy > Manage deployments > Edit > Version: New version.
 */
function passcode() { return PropertiesService.getScriptProperties().getProperty('PASSCODE') || ''; }

const ITEM_HEAD = ['ID', 'Kategori ID', 'Kategori', 'Item', 'Jenis', 'Harga (RM)', 'Pax', 'RM / pax',
  'Jumlah (RM)', 'Depo (RM)', 'Tarikh depo', 'Full payment by', 'Done', 'Nota', 'Thread ref'];
const CAT_HEAD = ['ID', 'Emoji', 'Kategori', 'Tip'];
const SET_HEAD = ['Setting', 'Value'];
const KIND_LABEL = { biasa: 'Biasa', pax: 'Makanan', task: 'Task' };

// ---------- web app ----------

// Opening the link directly shows nothing: the data only goes out to a request carrying the passcode.
function doGet() {
  return json({ ok: false, error: 'Private. Buka checklist dan masukkan passcode.' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'Bad request' }); }
  if (!passcode()) return json({ ok: false, error: 'PASSCODE belum diset dalam Script Properties' });
  if (String(body.pass || '') !== passcode()) return json({ ok: false, error: 'Passcode salah' });
  if (body.action === 'check') return json({ ok: true });
  if (body.action === 'load') return json({ ok: true, data: readAll() });
  if (body.action === 'save') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { writeAll(body.data); } finally { lock.releaseLock(); }
    return json({ ok: true, savedAt: new Date().toISOString() });
  }
  return json({ ok: false, error: 'Unknown action' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- sheet helpers ----------

function tab(name, head) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#fce6ec');
    sh.setFrozenRows(1);
  }
  return sh;
}

function body(sh, width) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];
}

function tz() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }

// Sheet cell -> 'yyyy-mm-dd' (accepts real dates, ISO text and d/m/yyyy text)
function toIso(v) {
  if (v === '' || v === null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz(), 'yyyy-MM-dd');
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  return '';
}
function pad(x) { return ('0' + x).slice(-2); }
function numOrBlank(v) { return v === '' || v === null || isNaN(Number(v)) ? '' : Number(v); }
function newId(prefix) { return prefix + Utilities.getUuid().slice(0, 8); }

// ---------- read: Sheet -> website ----------

function readAll() {
  const cs = tab('Kategori', CAT_HEAD), is = tab('Items', ITEM_HEAD), st = tab('Settings', SET_HEAD);

  // categories (rows typed straight into the Sheet get an ID written back)
  const catRows = body(cs, CAT_HEAD.length);
  let fixed = false;
  const cats = [];
  catRows.forEach(function (r, k) {
    if (String(r[2]).trim() === '') return;
    if (!r[0]) { r[0] = newId('k'); cs.getRange(k + 2, 1).setValue(r[0]); fixed = true; }
    cats.push({ id: String(r[0]), emoji: String(r[1] || '✨'), name: String(r[2]).trim(), tip: String(r[3] || '') });
  });

  const items = [];
  body(is, ITEM_HEAD.length).forEach(function (r, k) {
    const name = String(r[3]).trim();
    if (!name) return;
    let cat = String(r[1] || '');
    if (!cats.some(function (c) { return c.id === cat; })) {     // match by category name if the ID is missing
      const byName = cats.filter(function (c) { return c.name.toLowerCase() === String(r[2]).trim().toLowerCase(); })[0];
      if (!byName) return;
      cat = byName.id;
      is.getRange(k + 2, 2).setValue(cat);
    }
    if (!r[0]) { r[0] = newId('s'); is.getRange(k + 2, 1).setValue(r[0]); }
    const jenis = String(r[4]).toLowerCase();
    const kind = /makan|pax|food/.test(jenis) ? 'pax' : /task/.test(jenis) ? 'task' : 'biasa';
    items.push({
      id: String(r[0]), cat: cat, name: name, kind: kind,
      harga: kind === 'biasa' ? numOrBlank(r[5]) : '',
      pax: kind === 'pax' ? numOrBlank(r[6]) : '', perHead: kind === 'pax' ? numOrBlank(r[7]) : '',
      depo: numOrBlank(r[9]), depoDate: toIso(r[10]), dueDate: toIso(r[11]),
      done: r[12] === true || /^(true|y|ya|yes|1|✓)$/i.test(String(r[12]).trim()),
      note: String(r[13] || ''), ref: String(r[14] || '')
    });
  });

  let budget = '', couple = '', date = '', theme = '';
  body(st, 2).forEach(function (r) {
    const key = String(r[0]);
    if (/bajet|budget/i.test(key)) budget = numOrBlank(r[1]);
    else if (/nama|couple|name/i.test(key)) couple = String(r[1] || '').trim();
    else if (/tarikh|date/i.test(key)) date = toIso(r[1]);
    else if (/tema|theme/i.test(key)) theme = String(r[1] || '').trim();
  });

  if (fixed) SpreadsheetApp.flush();
  return { budget: budget, couple: couple, date: date, theme: theme, cats: cats, items: items };
}

// ---------- write: website -> Sheet ----------

function writeAll(data) {
  if (!data || !data.cats || !data.items) throw new Error('No data');
  const cs = tab('Kategori', CAT_HEAD), is = tab('Items', ITEM_HEAD), st = tab('Settings', SET_HEAD);

  replaceBody(cs, CAT_HEAD.length, data.cats.map(function (c) { return [c.id, c.emoji, c.name, c.tip || '']; }));

  const catName = {};
  data.cats.forEach(function (c) { catName[c.id] = c.name; });
  const rows = data.items.map(function (i, k) {
    const r = k + 2;
    return [
      i.id, i.cat, catName[i.cat] || '', i.name, KIND_LABEL[i.kind] || 'Biasa',
      i.kind === 'biasa' ? numOrBlank(i.harga) : '',
      i.kind === 'pax' ? numOrBlank(i.pax) : '', i.kind === 'pax' ? numOrBlank(i.perHead) : '',
      '=IF(E' + r + '="Makanan",N(G' + r + ')*N(H' + r + '),IF(E' + r + '="Task","",N(F' + r + ')))',
      // dates go in as yyyy-mm-dd text so the Sheet reads them in its own time zone, like typed dates
      numOrBlank(i.depo), toIso(i.depoDate), toIso(i.dueDate), !!i.done, i.note || '', i.ref || ''
    ];
  });
  replaceBody(is, ITEM_HEAD.length, rows);

  const n = rows.length;
  if (n) {
    is.getRange(2, 5, n, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Biasa', 'Makanan', 'Task'], true).build());
    is.getRange(2, 13, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    is.getRange(2, 6, n, 1).setNumberFormat('#,##0.00');
    is.getRange(2, 8, n, 3).setNumberFormat('#,##0.00');
    is.getRange(2, 11, n, 2).setNumberFormat('d mmm yyyy');
  }

  replaceBody(st, 2, [['Bajet (RM)', numOrBlank(data.budget)], ['Nama pasangan', data.couple || ''],
    ['Tarikh majlis', toIso(data.date)], ['Tema', data.theme || ''], ['Last saved', new Date()]]);
  st.getRange(4, 2).setNumberFormat('d mmm yyyy');
  st.getRange(6, 2).setNumberFormat('d mmm yyyy, h:mm am/pm');
}

function replaceBody(sh, width, rows) {
  const old = sh.getLastRow() - 1;
  if (old > 0) {
    const r = sh.getRange(2, 1, old, width);
    r.clearContent();
    r.clearDataValidations();
  }
  if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
}
