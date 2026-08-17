/* Ověření: smlouvy o dílo, plná moc a volba jazyka tisku (#143, 15. 8. 2026)
 *
 * Zadání: „V kalkulaci OCK mi chybí varianta tisku nabídek v jazykových
 * mutacích. V kalkulaci OCK i PROJ chybí sekce tisku SoD. V kalkulaci PROJ
 * by měla v rámci tisku SoD přibýt i možnost vytištění plné moci."
 *
 * Jednotkové testy hlídají data (src/test_sod.js) — tenhle skript hlídá to,
 * co z nich vidět není: že tlačítka v aplikaci opravdu jsou, že se do
 * SKUTEČNÝCH šablon smluv dosadí SKUTEČNÁ čísla z kalkulace, že symboly
 * SOD_*, SODP_* a PM_* zůstanou v hotovém dokumentu VIDITELNÉ k ručnímu
 * doplnění a že se výběr jazyka tisku promítne do generování.
 *
 * Šablony nejsou v repozitáři (leží ve /home/claude/work/smlouvy); když se
 * nenajdou, sada se přeskočí s vysvětlením místo selhání.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_sod.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { zipPrecti } = require('/home/claude/work/kng/src/docxgen.js');

const SABLONY_SOUBORY = {
  sod: '/home/claude/work/smlouvy/Sablona_SOD_REALIZACE.docx',
  sodProj: '/home/claude/work/smlouvy/Sablona_SOD_PROJEKCE.docx',
  plnaMoc: '/home/claude/work/smlouvy/Sablona_PLNA_MOC.docx',
};
if (!Object.values(SABLONY_SOUBORY).every(p => existsSync(p))) {
  console.log('PŘESKOČENO – šablony smluv nenalezeny.');
  console.log('Hledáno:\n  ' + Object.values(SABLONY_SOUBORY).join('\n  '));
  process.exit(0);
}

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const test = (n, podm, info) => {
  if (podm) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n, info === undefined ? '' : info); }
};
const konzole = [];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
await p.goto(KDE);
await p.waitForTimeout(700);

/* Sestavení nese prázdný ceník – bez čísel by dokument nevznikl (zábrana
 * ukázkového ceníku) a nebylo by co porovnávat se smlouvou. */
const ZC = require('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta();
  ZAK.cislo = '2026 - OPR - CN - 0177';
  ZAK.objednatel = 'SVJ Zkušební 11'; ZAK.kontakt = 'Ing. Zkoušková';
  ZAK.adresa = 'Zkušební 11, 100 00 Praha';
  ZAK.nazevAkce = 'Přístavba výtahu – zkouška SoD';
  Object.assign(ZAK.projHlavicka, { objednatel: 'SVJ Zkušební 11',
    adresa: 'Zkušební 11, 100 00 Praha', nazevAkce: 'Projekce – zkouška SoD' });
  render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(300);

/* ---------- 1) ovládání v aplikaci ---------- */
console.log('\ntlačítka a karty v aplikaci');
await p.click('#tab-kalk');
await p.waitForTimeout(300);
{
  const tlacitka = await p.evaluate(() =>
    [...document.querySelectorAll('button')].map(x => x.textContent.trim()));
  test('v Kalkulaci OCK je tlačítko „Vytvořit smlouvu o dílo (Word)"',
    tlacitka.some(t => t.indexOf('Vytvořit smlouvu o dílo (Word)') === 0));
  test('v Kalkulaci OCK je výběr jazyka tisku',
    await p.evaluate(() => /Jazyk tisku/.test(document.body.innerHTML)
      && [...document.querySelectorAll('select')].some(s =>
        [...s.options].some(o => o.value === 'de'))));
}
await p.click('#tab-proj');
await p.waitForTimeout(300);
{
  const tlacitka = await p.evaluate(() =>
    [...document.querySelectorAll('button')].map(x => x.textContent.trim()));
  test('v Kalkulaci PROJ je tlačítko „Vytvořit smlouvu o dílo PROJ (Word)"',
    tlacitka.some(t => t.indexOf('Vytvořit smlouvu o dílo PROJ (Word)') === 0));
  test('v Kalkulaci PROJ je tlačítko „Vytvořit plnou moc (Word)"',
    tlacitka.some(t => t.indexOf('Vytvořit plnou moc (Word)') === 0));
  test('v Kalkulaci PROJ je výběr jazyka tisku',
    await p.evaluate(() => [...document.querySelectorAll('select')].some(s =>
      [...s.options].some(o => o.textContent.indexOf('dle Nastavení') === 0))));
}
test('stavové řádky smluv jsou na třídách (karta OCK je v aplikaci dvakrát)',
  await p.evaluate(() => {
    sodStavText('sod', 'zkouška stavu');
    const vsechny = [...document.querySelectorAll('.sodStav_sod')];
    return vsechny.length >= 1 && vsechny.every(e => e.textContent === 'zkouška stavu');
  }));
test('Nastavení → Šablony zná řádky smluv i plné moci',
  await p.evaluate(() => /smlouvy o dílo/i.test(nastSablony()) && /pln[áé] moci?/i.test(nastSablony())));
test('typy smluv jedou přes centrální šablony (#139)',
  await p.evaluate(() => ['sod', 'sodProj', 'plnaMoc'].every(t => SABLONY_ONLINE_TYPY.includes(t))));

/* ---------- 2) hotové dokumenty ---------- */
console.log('\nvygenerované smlouvy a plná moc');
const b64 = {};
for (const [typ, cesta] of Object.entries(SABLONY_SOUBORY))
  b64[typ] = readFileSync(cesta).toString('base64');

const vysledek = await p.evaluate(async (sablonyB64) => {
  const buf = s => {
    const bin = atob(s); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  };
  const varianta = aktivniVarianta(ZAK);
  const out = {};
  for (const typ of ['sod', 'sodProj', 'plnaMoc']) {
    const res = await dokumentVygeneruj(typ, buf(sablonyB64[typ]), ZAK, varianta, JEKLY, 'cz');
    const bajty = new Uint8Array(await res.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < bajty.length; i++) s += String.fromCharCode(bajty[i]);
    out[typ] = { docx: btoa(s), nazevSouboru: res.nazevSouboru };
  }
  const nab = nabidkaData(ZAK, varianta, JEKLY, 'cz');
  const nabP = nabidkaProjData(ZAK, varianta, 'cz');
  return Object.assign(out, { cenaOck: nab.placeholders.CENA_BEZ_DPH,
    cenaProj: nabP.placeholders.PROJ_CELKEM_BEZ_DPH });
}, b64);

const dekoduj = u8 => new TextDecoder().decode(u8);
const docText = async typ => {
  const casti = await zipPrecti(new Uint8Array(Buffer.from(vysledek[typ].docx, 'base64')));
  return dekoduj(casti.find(x => x.nazev === 'word/document.xml').data);
};

{
  const doc = await docText('sod');
  const holy = doc.replace(/<[^>]+>/g, '');
  test('SoD realizace: název souboru začíná SOD_',
    vysledek.sod.nazevSouboru.indexOf('SOD_') === 0, vysledek.sod.nazevSouboru);
  test('SoD realizace nese cenu z nabídky OCK', holy.includes(vysledek.cenaOck), vysledek.cenaOck);
  test('SoD realizace nese objednatele', holy.includes('SVJ Zkušební 11'));
  test('známé symboly jsou vyplněné (OBJEDNATEL, CENA_BEZ_DPH, FIRMA_*)',
    !/\{\{(OBJEDNATEL|CENA_BEZ_DPH|FIRMA_NAZEV|FIRMA_ICO)\}\}/.test(holy));
  test('symboly SOD_* zůstaly VIDITELNÉ k ručnímu doplnění',
    /\{\{SOD_[A-Z0-9_]+\}\}/.test(holy), (holy.match(/\{\{SOD_[A-Z0-9_]+\}\}/g) || []).length);
}
{
  const doc = await docText('sodProj');
  const holy = doc.replace(/<[^>]+>/g, '');
  test('SoD projekce: název souboru začíná SOD_PROJ_',
    vysledek.sodProj.nazevSouboru.indexOf('SOD_PROJ_') === 0, vysledek.sodProj.nazevSouboru);
  test('SoD projekce nese cenu z nabídky PROJ', holy.includes(vysledek.cenaProj), vysledek.cenaProj);
  test('symboly SODP_* (platby po fázích) zůstaly viditelné',
    /\{\{SODP_[A-Z0-9_]+\}\}/.test(holy));
}
{
  const doc = await docText('plnaMoc');
  const holy = doc.replace(/<[^>]+>/g, '');
  test('plná moc: název souboru začíná PLNA_MOC',
    vysledek.plnaMoc.nazevSouboru.indexOf('PLNA_MOC') === 0, vysledek.plnaMoc.nazevSouboru);
  test('plná moc nese adresu stavby', holy.includes('Zkušební 11, 100 00 Praha'));
  test('symboly PM_* (zmocnitel) zůstaly viditelné', /\{\{PM_[A-Z0-9_]+\}\}/.test(holy));
  test('firemní údaje zmocněnce jsou vyplněné', !/\{\{FIRMA_[A-Z0-9_]+\}\}/.test(holy));
}

/* ---------- 3) zámek a jazyk tisku ---------- */
console.log('\nzámek a jazyk tisku');
test('SoD realizace i projekce variantu zamykají, plná moc ne',
  await p.evaluate(() => dokumentZamyka('sod') && dokumentZamyka('sodProj')
    && !dokumentZamyka('plnaMoc')));
test('výběr jazyka tisku se promítá do tiskJazyk()',
  await p.evaluate(() => {
    tiskJazykNastav('de');
    const de = tiskJazyk() === 'de';
    tiskJazykNastav('');                    // zpět na „dle Nastavení"
    return de && tiskJazyk() === jazyk();
  }));
test('plná moc se tiskne vždy česky (úřední dokument), i při cizím jazyku tisku',
  await p.evaluate(() => {
    tiskJazykNastav('en');
    const cz = sodJazyk('plnaMoc') === 'cz' && sodJazyk('sod') === 'en';
    tiskJazykNastav('');
    return cz;
  }));
test('neplatná hodnota jazyka tisku spadne na „dle Nastavení"',
  await p.evaluate(() => { tiskJazykNastav('xx'); const v = tiskJazyk() === jazyk();
    tiskJazykNastav(''); return v; }));

test('aplikace při generování nehlásila chybu do konzole', konzole.length === 0,
  konzole.slice(0, 3).join(' | '));

await b.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
