/* Ověření: skutečná šablona cenové nabídky × generátor (#146, #147)
 *
 * Proč tahle sada. Jednotkové testy (src/test_docx_obrazek.js) si staví vlastní
 * minidokument, aby šly ověřit i případy, které v šabloně nejsou. To je dobře,
 * ale znamená to, že samotnou šablonu nikdo nehlídá — a přesně tam vzniká
 * nejtišší chyba: kolega otevře .docx ve Wordu, něco přepíše, Word rozseká
 * symbol {{ZPRAC_JMENO}} na tři runy nebo zapomene alternativní text u obrázku,
 * soubor se uloží na Drive a kalkulačka od té chvíle generuje nabídku
 * s prázdnou patičkou. Nic nespadne, nikdo si toho měsíc nevšimne.
 *
 * Tenhle skript proto vezme šablonu tak, jak leží, prožene ji generátorem
 * a podívá se do výsledku: sedí jméno, funkce, telefon a e-mail přihlášeného
 * obchodního technika? Vyměnil se sken podpisu za ten jeho? A když podpis
 * nahraný nemá, zmizel z nabídky celý rámeček, místo aby v ní zůstal cizí?
 *
 * Šablony nejsou v repozitáři (leží na Drive ve složce _CN), takže když se
 * soubor nenajde, sada se přeskočí s vysvětlením místo selhání.
 *
 * Spuštění: node overit_sablona.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { docxVyplnSablonu, zipPrecti, rozmeryObrazku } = require('./src/docxgen.js');

const KDE = [
  '/home/claude/work/sablona/Sablona_NABIDKA_CN_v7.docx',
  '/home/claude/work/deliver/Sablona_NABIDKA_CN_v7.docx',
];
const sablona = KDE.find(p => existsSync(p));
if (!sablona) {
  console.log('PŘESKOČENO – šablona Sablona_NABIDKA_CN_v7.docx nenalezena.');
  console.log('Hledáno v:\n  ' + KDE.join('\n  '));
  process.exit(0);
}
console.log('šablona: ' + sablona + '\n');

let ok = 0, fail = 0;
const test = (n, podm, info) => {
  if (podm) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n, info === undefined ? '' : info); }
};

/* Vymyšlený obchodní technik – skutečná jména kolegů do testů nepatří.
 * Podpis je maličký PNG (6×2 px), na obsahu nezáleží; hlídáme jen to,
 * že se do dokumentu dostaly přesně tyhle bajty a že se podle nich
 * dopočítaly rozměry tvaru. */
const PODPIS_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAIAAAD0PzoJ'
  + 'AAAAEklEQVR4nGP88OEDAypgYsAAAGWyAtTh+N9RAAAAAElFTkSuQmCC';
const JA = {
  ZPRAC_JMENO: 'Ing. Jan Zkušební',
  ZPRAC_FUNKCE: 'Obchodní technik',
  ZPRAC_TEL: '+420 111 222 333',
  ZPRAC_EMAIL: 'jan.zkusebni@priklad.cz',
};

const zdroj = readFileSync(sablona);
const bufer = () => zdroj.buffer.slice(zdroj.byteOffset, zdroj.byteOffset + zdroj.byteLength);

const dekoduj = u8 => new TextDecoder().decode(u8);
async function vygeneruj(placeholders, obrazky) {
  const blob = await docxVyplnSablonu(bufer(), placeholders, [], obrazky);
  const polozky = await zipPrecti(new Uint8Array(await blob.arrayBuffer()));
  const najdi = n => polozky.find(p => p.nazev === n);
  return { polozky, najdi, doc: dekoduj(najdi('word/document.xml').data) };
}

/* ---------- 0) šablona sama ---------- */
console.log('šablona obsahuje symboly zpracovatele');
{
  const polozky = await zipPrecti(new Uint8Array(zdroj));
  const doc = dekoduj(polozky.find(p => p.nazev === 'word/document.xml').data);
  for (const s of ['ZPRAC_JMENO', 'ZPRAC_FUNKCE', 'ZPRAC_TEL', 'ZPRAC_EMAIL'])
    test('symbol {{' + s + '}} je v šabloně právě jednou',
      doc.split('{{' + s + '}}').length === 2, doc.split('{{' + s + '}}').length - 1);
  /* Alternativní text obrázku je jediné, podle čeho aplikace pozná, kterému
   * tvaru má vyměnit obsah. Word ho zahodí, když někdo obrázek smaže a vloží
   * znovu — proto se kontroluje zvlášť. */
  test('tvar podpisu má alternativní text {{ZPRAC_PODPIS}}',
    /o:title="\{\{ZPRAC_PODPIS\}\}"/.test(doc));
  test('blok „Vypracoval:" zůstal', doc.includes('Vypracoval:'));
  test('blok „Kancelář:" zůstal', doc.includes('Kancelář:'));
  /* Šablona koluje mezi lidmi a chodí i na GitHub. Konkrétní jméno, telefon
   * ani e-mail kolegy v ní nemají co dělat — ani v textu, ani v metadatech. */
  const vse = polozky.filter(p => /\.(xml|rels)$/.test(p.nazev)).map(p => dekoduj(p.data)).join('');
  for (const s of ['Lauda', 'lauda.jiri', '590 945'])
    test('v šabloně nezůstalo „' + s + '"', !vse.includes(s));
  /* Platební podmínky (#147) – navázané na kalkulaci ve v6, nesmí se ztratit. */
  for (const s of ['PODM_ZALOHA1_PROC', 'PODM_SPLATNOST_DNI_CISLO', 'PODM_PLATNOST_NABIDKY'])
    test('symbol {{' + s + '}} z platebních podmínek zůstal', doc.includes(s));
  test('překlep „bPoznámky" je opravený', !doc.includes('bPozn'));
}

/* ---------- 1) přihlášený obchodní technik s podpisem ---------- */
console.log('\nnabídka přihlášeného uživatele');
{
  const puvodni = await zipPrecti(new Uint8Array(zdroj));
  const puvodniPodpis = puvodni.find(p => p.nazev === 'word/media/image2.jpeg');
  const { doc, najdi, polozky } = await vygeneruj(JA, { ZPRAC_PODPIS: PODPIS_PNG });

  for (const [k, v] of Object.entries(JA))
    test('v dokumentu je ' + k.replace('ZPRAC_', '').toLowerCase() + ' „' + v + '"', doc.includes(v), k);
  /* Ostatní symboly ({{OBJEDNATEL}}, {{CENA_CELKEM}} …) sem nedosazujeme,
   * hlídáme jen svoje – nesmí v nabídce zůstat ani jeden. */
  test('žádný symbol {{ZPRAC_…}} v dokumentu nezůstal', !/\{\{ZPRAC_[A-Z_]+\}\}/.test(doc),
    (doc.match(/\{\{ZPRAC_[A-Z_]+\}\}/g) || []).join(' '));
  test('tvar podpisu v dokumentu zůstal', doc.includes('r:id="rId8"'));
  /* Alternativní text má po výměně zmizet, jinak by Word „{{ZPRAC_PODPIS}}"
   * předčítal a hlásil ve vlastnostech obrázku. Titulní obrázek (rId7) má
   * o:title="" odjakživa, proto se kontroluje adresně u rId8. */
  test('alternativní text se vyprázdnil', /<v:imagedata r:id="rId8" o:title=""/.test(doc),
    (/<v:imagedata r:id="rId8"[^>]*/.exec(doc) || [''])[0]);

  /* Podpis je PNG, šablona nese JPEG – část se musí přejmenovat, relace
   * i [Content_Types].xml se musí posunout s ní, jinak Word soubor odmítne. */
  const jpeg = najdi('word/media/image2.jpeg');
  const png = najdi('word/media/image2.png');
  test('médium se přejmenovalo na .png', !jpeg && !!png, jpeg ? 'jpeg zůstal' : 'png chybí');
  test('v dokumentu jsou bajty nahraného podpisu',
    png && dekoduj(png.data).length === atobDelka(PODPIS_PNG), png && png.data.length);
  test('původní sken se v archivu nikde nepovaluje',
    !polozky.some(p => p.data.length === puvodniPodpis.data.length && p.nazev.startsWith('word/media/image2')));
  const rels = dekoduj(najdi('word/_rels/document.xml.rels').data);
  test('relace rId8 míří na nové médium', /rId8"[^>]*Target="media\/image2\.png"/.test(rels)
    || /Target="media\/image2\.png"[^>]*Id="rId8"/.test(rels), rels.match(/rId8[^>]*/)[0]);
  test('[Content_Types].xml zná příponu png',
    /Extension="png"/.test(dekoduj(najdi('[Content_Types].xml').data)));

  /* Podpis 6×2 px je široký a nízký. Do rámečku 185,75 × 159,3 bodu se má
   * vejít celý (ne roztažený): omezí ho šířka, výška vyjde 61,92 bodu. */
  /* Dokument má dva plovoucí tvary – na titulní straně obrázek výtahové
   * šachty (rId7) a v patičce podpis (rId8). Nesmíme sáhnout na ten první. */
  const podpisTvar = /<v:shape[^>]*>(?=<v:imagedata r:id="rId8")/.exec(doc);
  test('měnil se tvar podpisu, ne titulní obrázek', !!podpisTvar);
  const titulni = /<v:shape[^>]*style="([^"]*)"[^>]*>(?=<v:imagedata r:id="rId7")/.exec(doc);
  test('titulní obrázek zůstal 261 × 347,3 pt',
    titulni && titulni[1].includes('width:261pt') && titulni[1].includes('height:347.3pt'),
    titulni && titulni[1]);
  const styl = /style="([^"]*)"/.exec(podpisTvar[0])[1];
  const sirka = parseFloat(/width:([\d.]+)pt/.exec(styl)[1]);
  const vyska = parseFloat(/height:([\d.]+)pt/.exec(styl)[1]);
  test('šířka zůstala na okraji rámečku (185,75 pt)', Math.abs(sirka - 185.75) < 0.02, sirka);
  test('výška se dopočítala podle poměru stran', Math.abs(vyska - 185.75 / 3) < 0.05, vyska);
  test('obrázek se do rámečku vešel', vyska <= 159.3 + 0.01 && sirka <= 185.75 + 0.01);
  test('umístění tvaru se nezměnilo', styl.includes('margin-left:238.5pt'), styl);
  test('ořez z původní šablony zůstal', /croptop="-14f"/.test(doc));
}

/* ---------- 2) uživatel bez nahraného podpisu ---------- */
console.log('\nnabídka uživatele, který podpis nenahrál');
{
  const { doc, najdi } = await vygeneruj(JA, {});
  test('texty se doplnily i bez obrázku', doc.includes(JA.ZPRAC_JMENO) && doc.includes(JA.ZPRAC_EMAIL));
  /* Prázdný rámeček by v nabídce vypadal jako chyba tisku a cizí podpis
   * by byl horší než žádný — celý tvar proto musí zmizet. */
  test('tvar s podpisem z dokumentu zmizel', !doc.includes('{{ZPRAC_PODPIS}}') && !doc.includes('rId8'));
  test('titulní obrázek (rId7) se odstraněním nedotkl',
    doc.includes('r:id="rId7"') && (doc.match(/<v:shape\b/g) || []).length === 1,
    (doc.match(/<v:shape\b/g) || []).length + '× v:shape');
  test('blok „Vypracoval:" i tak zůstal', doc.includes('Vypracoval:'));
  test('párové značky sedí', doc.split('<w:r>').length + doc.split('<w:r ').length - 2
    === doc.split('</w:r>').length - 1,
    doc.split('<w:r>').length + doc.split('<w:r ').length - 2 + ' × ' + (doc.split('</w:r>').length - 1));
  test('médium v archivu zůstalo netknuté', !!najdi('word/media/image2.jpeg'));
}

/* ---------- 3) nabídka vygenerovaná bez přihlášení ---------- */
console.log('\nnabídka vygenerovaná offline (firemní údaje)');
{
  /* Kalkulačka běží i jako jednosouborové HTML na ploše, kdy o uživateli neví.
   * Symboly pak plní zpracovatel.js firemními údaji — šablona to musí unést. */
  const firma = { ZPRAC_JMENO: 'ENGINEERS CZ s.r.o.', ZPRAC_FUNKCE: '',
                  ZPRAC_TEL: '+420 252 546 463', ZPRAC_EMAIL: 'info@engineers-cz.cz' };
  const { doc } = await vygeneruj(firma, {});
  test('firemní jméno se doplnilo', doc.includes('ENGINEERS CZ s.r.o.'));
  test('prázdná funkce nenechá v dokumentu symbol', !doc.includes('ZPRAC_FUNKCE'));
  test('žádný symbol {{ZPRAC_…}} nezůstal', !/\{\{ZPRAC_[A-Z_]+\}\}/.test(doc),
    (doc.match(/\{\{ZPRAC_[A-Z_]+\}\}/g) || []).join(' '));
}

function atobDelka(dataUrl) {
  return Buffer.from(String(dataUrl).split(',')[1], 'base64').length;
}

console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
