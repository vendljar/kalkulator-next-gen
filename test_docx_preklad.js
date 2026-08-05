/* Test xlsx.js + cenik.js – export/import ceníku, round-trip a diff. */
const eng = require('./engine.js'); const ep = require('./engine_proj.js');
const docx = require('./docxgen.js');
global.zipZapis = docx.zipZapis; global.zipPrecti = docx.zipPrecti;
const xl = require('./xlsx.js');
global.xlsxZapis = xl.xlsxZapis; global.xlsxPrecti = xl.xlsxPrecti;
const cen = require('./cenik.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const C = ZC.zkusebniCenik(), PC = ZC.zkusebniCenikProj();

  // 1) export → xlsx → zpět načtení
  const blob = xl.xlsxZapis(cen.cenikToSheets(C, PC));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  test('xlsx je ZIP (PK)', bytes[0] === 0x50 && bytes[1] === 0x4B);
  const sheets = await xl.xlsxPrecti(bytes);
  test('dva listy', sheets.length === 2, sheets.map(s => s.nazev).join(','));
  test('list OCK má název', /OCK/.test(sheets[0].nazev), sheets[0].nazev);
  test('list PROJ má název', /PROJ/.test(sheets[1].nazev), sheets[1].nazev);

  // 2) round-trip identita: beze změn v Excelu → žádné zmeny
  const d0 = cen.cenikDiffZeSheets(sheets, C, PC);
  test('round-trip bez změn (0 zmen)', d0.zmeny.length === 0, JSON.stringify(d0.zmeny.slice(0, 3)));
  test('round-trip bez chyb', d0.chyby.length === 0, d0.chyby.join(';'));
  test('round-trip bez neznámých', d0.nezname.length === 0, d0.nezname.join(','));

  // 3) najdi řádek profilasKgKc v listu OCK a změň hodnotu → 1 změna
  const ock = sheets[0].rows;
  const findRow = (rows, klic) => rows.find(r => String(r[1]) === klic);
  const rProf = findRow(ock, 'C.profilasKgKc');
  test('nalezena položka profilasKgKc', !!rProf, JSON.stringify(rProf));
  test('hodnota je číslo', typeof rProf[4] === 'number' && rProf[4] === C.profilasKgKc, String(rProf[4]));
  rProf[4] = 99;
  // změň i string typ
  const rSklo = findRow(ock, 'C.skloBokyNazev'); rSklo[4] = 'dvojsklo NOVÉ';
  // změň marži
  const rMarze = findRow(ock, 'C.marze'); rMarze[4] = 0.35;
  // změň lak.rezim (select)
  const rLak = findRow(ock, 'C.lak.rezim'); rLak[4] = 'lakovna';
  // změň PROJ fix
  const rPbr = findRow(sheets[1].rows, 'PC.fixy.pbr'); const staraPbr = rPbr[4]; rPbr[4] = staraPbr + 1234;

  const d1 = cen.cenikDiffZeSheets(sheets, C, PC);
  test('nalezeno 5 změn', d1.zmeny.length === 5, JSON.stringify(d1.zmeny.map(z => z.cesta)));
  const zMap = Object.fromEntries(d1.zmeny.map(z => [z.cesta, z]));
  test('profil: 80→99', zMap['C.profilasKgKc'].stara === C.profilasKgKc && zMap['C.profilasKgKc'].nova === 99);
  test('sklo text', zMap['C.skloBokyNazev'].nova === 'dvojsklo NOVÉ');
  test('marže 0.35', zMap['C.marze'].nova === 0.35);
  test('lak select', zMap['C.lak.rezim'].nova === 'lakovna');
  test('PROJ pbr změna', zMap['PC.fixy.pbr'].nova === staraPbr + 1234);

  // 4) aplikace změn
  cen.cenikAplikuj(d1.zmeny, C, PC);
  test('aplikace profil', C.profilasKgKc === 99);
  test('aplikace sklo', C.skloBokyNazev === 'dvojsklo NOVÉ');
  test('aplikace marže', C.marze === 0.35);
  test('aplikace lak', C.lak.rezim === 'lakovna');
  test('aplikace PROJ pbr', PC.fixy.pbr === staraPbr + 1234);
  // po aplikaci už export/diff nevykazuje změny
  const sheets2 = await xl.xlsxPrecti(new Uint8Array(await xl.xlsxZapis(cen.cenikToSheets(C, PC)).arrayBuffer()));
  test('po aplikaci 0 změn', cen.cenikDiffZeSheets(sheets2, C, PC).zmeny.length === 0);

  // 5) neplatné číslo → chyba
  const sh3 = await xl.xlsxPrecti(new Uint8Array(await xl.xlsxZapis(cen.cenikToSheets(C, PC)).arrayBuffer()));
  findRow(sh3[0].rows, 'C.profilasKgKc')[4] = 'abc';
  const d3 = cen.cenikDiffZeSheets(sh3, C, PC);
  test('neplatné číslo → chyba', d3.chyby.length === 1, d3.chyby.join(';'));

  // 6) desetinná čárka „1 234,5" se přečte jako 1234.5
  const sh4 = await xl.xlsxPrecti(new Uint8Array(await xl.xlsxZapis(cen.cenikToSheets(C, PC)).arrayBuffer()));
  findRow(sh4[0].rows, 'C.montazHodKc')[4] = '1 234,5';
  const d4 = cen.cenikDiffZeSheets(sh4, C, PC);
  const zMont = d4.zmeny.find(z => z.cesta === 'C.montazHodKc');
  test('čárka jako oddělovač', zMont && zMont.nova === 1234.5, zMont && String(zMont.nova));

  // 7) poškozený soubor → xlsxPrecti hodí chybu
  let hodil = false;
  try { await xl.xlsxPrecti(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { hodil = true; }
  test('poškozený soubor hodí chybu', hodil);

  // 8) samouzavírací buňky/řádky (jak je píše Excel) se NEsmí pohltit sousedy
  {
    const sh = '<worksheet><sheetData>'
      + '<row r="1"><c r="A1"/><c r="B1" t="s"><v>1</v></c><c r="C1"><v>42</v></c></row>'
      + '<row r="2"/>'
      + '<row r="3"><c r="A3" t="inlineStr"><is><t>X</t></is></c><c r="B3" s="5"/><c r="C3"><v>7</v></c></row>'
      + '</sheetData></worksheet>';
    const rows = xl.xlsxParseSheet(sh, ['nula', 'Hodnota']);
    test('samouzavírací A1 zůstane prázdné', rows[0][0] === '', JSON.stringify(rows[0]));
    test('B1 sdílený řetězec zachován', rows[0][1] === 'Hodnota', JSON.stringify(rows[0]));
    test('C1 číslo zachováno', rows[0][2] === 42, JSON.stringify(rows[0]));
    test('prázdný samouzavírací řádek nepohltí další', rows[2] && rows[2][2] === 7, JSON.stringify(rows[2]));
    test('C3 za prázdnou samouzavírací buňkou B3 zachováno', rows[2] && rows[2][0] === 'X' && rows[2][2] === 7, JSON.stringify(rows[2]));
  }

  console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY CENÍK XLSX OK');
  process.exit(fail ? 1 : 0);
})();
