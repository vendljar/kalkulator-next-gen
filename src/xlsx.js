/* ============================================================
 * XLSX – čtení a zápis .xlsx v prohlížeči, bez knihoven.
 * Sdílí ZIP vrstvu s docxgen.js (zipZapis / zipPrecti).
 * Zápis: hodnoty jako čísla nebo inline řetězce (t="inlineStr").
 * Čtení: zvládne inline řetězce i sdílené řetězce (sharedStrings) –
 *   tj. i soubor, který uživatel otevřel a uložil v Excelu.
 * ============================================================ */

/* index sloupce (0) → písmeno (A), a zpět */
function xlsxColLetter(idx) {
  let s = '', n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function xlsxColIndex(ref) {
  const m = String(ref).match(/^[A-Z]+/); if (!m) return 0;
  let n = 0; for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function xlsxEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xlsxUnesc(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/* ---------- ZÁPIS ---------- */
function xlsxBunka(ref, val) {
  if (val == null || val === '') return '';
  if (typeof val === 'number' && isFinite(val)) return `<c r="${ref}"><v>${val}</v></c>`;
  if (typeof val === 'boolean') return `<c r="${ref}" t="b"><v>${val ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEsc(val)}</t></is></c>`;
}
function xlsxSheetXml(rows) {
  const body = (rows || []).map((row, ri) => {
    const cells = (row || []).map((val, ci) => xlsxBunka(xlsxColLetter(ci) + (ri + 1), val)).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<sheetData>${body}</sheetData></worksheet>`;
}
/* sheets: [{nazev, rows:[[val,...]]}] → Blob .xlsx */
function xlsxZapis(sheets) {
  const enc = new TextEncoder();
  const list = sheets || [];
  const overrides = list.map((s, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + overrides + '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';
  const wbSheets = list.map((s, i) => `<sheet name="${xlsxEsc(s.nazev || ('List' + (i + 1)))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${wbSheets}</sheets></workbook>`;
  const wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + '</Relationships>';
  const polozky = [
    { nazev: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { nazev: '_rels/.rels', data: enc.encode(rels) },
    { nazev: 'xl/workbook.xml', data: enc.encode(workbook) },
    { nazev: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
  ];
  list.forEach((s, i) => polozky.push({ nazev: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(xlsxSheetXml(s.rows)) }));
  return zipZapis(polozky, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------- ČTENÍ ---------- */
function xlsxSharedStrings(xml) {
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g; let m;
  while ((m = siRe.exec(xml))) {
    const texty = (m[1].match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [])
      .map(t => xlsxUnesc(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, '')));
    out.push(texty.join(''));
  }
  return out;
}
function xlsxParseSheet(xml, shared) {
  const rows = [];
  // pozor: samouzavírací <row .../> a <c .../> (Excel je běžně píše u prázdných
  // buněk) – proto je varianta „/>" v regexu PRVNÍ, jinak by „…>…</…>" pohltila
  // následující buňku/řádek.
  const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g; let rm;
  while ((rm = rowRe.exec(xml))) {
    const rAttrs = rm[1] != null ? rm[1] : (rm[2] || '');
    const obsah = rm[1] != null ? '' : (rm[3] || '');
    const rM = rAttrs.match(/\br="(\d+)"/); if (!rM) continue;
    const ri = +rM[1] - 1, radek = [];
    const cRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g; let cm;
    while ((cm = cRe.exec(obsah))) {
      const attrs = cm[1] != null ? cm[1] : (cm[2] || '');
      const inner = cm[1] != null ? '' : (cm[3] || '');
      const refM = attrs.match(/\br="([A-Z]+\d+)"/);
      const ci = refM ? xlsxColIndex(refM[1]) : radek.length;
      const tM = attrs.match(/\bt="([^"]+)"/);
      const typ = tM ? tM[1] : 'n';
      let val = '';
      if (typ === 'inlineStr') {
        const tm = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        val = tm ? xlsxUnesc(tm[1]) : '';
      } else if (typ === 's') {
        const vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        val = vm ? (shared[+vm[1]] != null ? shared[+vm[1]] : '') : '';
      } else {
        const vm = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (vm) { const raw = xlsxUnesc(vm[1]); val = (typ === 'str' || typ === 'b') ? raw : (raw === '' ? '' : parseFloat(raw)); }
      }
      radek[ci] = val;
    }
    for (let i = 0; i < radek.length; i++) if (radek[i] === undefined) radek[i] = '';
    rows[ri] = radek;
  }
  for (let i = 0; i < rows.length; i++) if (rows[i] === undefined) rows[i] = [];
  return rows;
}
/* u8 (.xlsx) → [{nazev, rows:[[val,...]]}] */
async function xlsxPrecti(u8) {
  const polozky = await zipPrecti(u8);
  const dec = new TextDecoder();
  const najdi = n => { const p = polozky.find(x => x.nazev === n); return p ? dec.decode(p.data) : null; };
  const ssXml = najdi('xl/sharedStrings.xml');
  const shared = ssXml ? xlsxSharedStrings(ssXml) : [];
  // pořadí a názvy listů z workbook.xml + rels
  const wb = najdi('xl/workbook.xml') || '';
  const wbRels = najdi('xl/_rels/workbook.xml.rels') || '';
  const relTarget = {};
  (wbRels.match(/<Relationship\b[^>]*\/>/g) || []).forEach(r => {
    const id = (r.match(/Id="([^"]+)"/) || [])[1];
    const tg = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && tg) relTarget[id] = tg.replace(/^\/?xl\//, '').replace(/^\.\//, '');
  });
  const sheets = [];
  const sheetTags = wb.match(/<sheet\b[^>]*\/>/g) || [];
  if (sheetTags.length) {
    sheetTags.forEach(tag => {
      const nazev = xlsxUnesc((tag.match(/name="([^"]*)"/) || [])[1] || '');
      const rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
      let target = relTarget[rid];
      if (target && target.indexOf('worksheets/') !== 0) target = 'worksheets/' + target.replace(/^worksheets\//, '');
      const xml = najdi('xl/' + target);
      if (xml != null) sheets.push({ nazev, rows: xlsxParseSheet(xml, shared) });
    });
  }
  if (!sheets.length) {   // fallback: seřaď sheetN.xml
    polozky.filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p.nazev))
      .sort((a, b) => a.nazev.localeCompare(b.nazev, undefined, { numeric: true }))
      .forEach((p, i) => sheets.push({ nazev: 'List' + (i + 1), rows: xlsxParseSheet(dec.decode(p.data), shared) }));
  }
  return sheets;
}

if (typeof module !== 'undefined')
  module.exports = { xlsxZapis, xlsxPrecti, xlsxColLetter, xlsxColIndex, xlsxSheetXml, xlsxParseSheet, xlsxSharedStrings };
