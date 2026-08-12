/* Ověření: tisk cenové nabídky PROJ do Wordu (12. 8. 2026, #180)
 *
 * Proč tahle sada existuje. Nabídka PROJ se do 12. 8. 2026 dala vytisknout jen
 * na obrazovce; Word uměla pouze nabídka OCK. Zadání znělo „ať tato sekce
 * funguje stejně jako v kalkulaci OCK" — a „stejně" tady znamená celou cestu:
 * tlačítko → šablona .docx → dosazení symbolů {{…}} → stažený soubor → zámek
 * varianty. Jednotkové testy hlídají data (src/test_nabidka_proj.js), tenhle
 * skript hlídá to, co z nich vidět není: že tlačítko v aplikaci opravdu je,
 * že se do SKUTEČNÉ šablony dosadí SKUTEČNÁ čísla z kalkulace a že v hotovém
 * dokumentu nezůstane viset žádný symbol.
 *
 * Kontroluje se i to, co si uživatel výslovně přál:
 *   – v nabídce NENÍ řádek obchodního zaokrouhlení (zaokrouhlují se položky),
 *   – úvodní fotka projekční nabídky je VLASTNÍ, ne převzatá z nabídky OCK.
 *
 * Generuje se uvnitř prohlížeče, přes tutéž funkci, kterou volá tlačítko —
 * kdyby se cesta v aplikaci rozešla s tou testovanou, sada by to neodhalila.
 *
 * Šablona není v repozitáři (leží u ostatních v _CN / sablona_proj), takže
 * když se nenajde, sada se přeskočí s vysvětlením místo selhání.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_nabidka_proj_word.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { zipPrecti } = require('/home/claude/work/kng/src/docxgen.js');

const KDE_SABLONA = [
  '/home/claude/work/sablona_proj/Sablona_NABIDKA_PROJ.docx',
  '/home/claude/work/deliver/Sablona_NABIDKA_PROJ.docx',
];
const sablona = KDE_SABLONA.find(p => existsSync(p));
if (!sablona) {
  console.log('PŘESKOČENO – šablona Sablona_NABIDKA_PROJ.docx nenalezena.');
  console.log('Hledáno v:\n  ' + KDE_SABLONA.join('\n  '));
  process.exit(0);
}

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const test = (n, podm, info) => {
  if (podm) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n, info === undefined ? '' : info); }
};
const konzole = [];

/* Fotka projekční nabídky — 6×2 px PNG. Na obsahu nezáleží, hlídá se jen to,
 * že se do dokumentu dostaly PŘESNĚ tyhle bajty (a ne fotka nabídky OCK). */
const FOTO_PROJ = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAYAAAACCAIAAAD0PzoJ'
  + 'AAAAEklEQVR4nGP88OEDAypgYsAAAGWyAtTh+N9RAAAAAElFTkSuQmCC';
/* Fotka nabídky OCK je jiná (4×1 px) – právě proto, aby šlo poznat, kdyby se
 * do projekční nabídky vloudila. */
const FOTO_OCK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAIAAACQd1Pe'
  + 'AAAADUlEQVR4nGNgYGBgAAAABQABXvMqOgAAAABJRU5ErkJggg==';

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
await p.goto(KDE);
await p.waitForTimeout(700);

/* Sestavení nese prázdný ceník (samé nuly) – bez čísel by dokument stejně
 * nevznikl (zábrana ukázkového ceníku) a nebylo by co porovnávat. */
const ZC = require('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp, fotoProj, fotoOck]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta();
  ZAK.projHlavicka.cislo = '2026 OVP CN 0199';
  ZAK.projHlavicka.objednatel = 'SVJ Zkušební 7';
  ZAK.projHlavicka.kontakt = 'Ing. Zkoušková / předsedkyně';
  ZAK.projHlavicka.adresa = 'Zkušební 7, 100 00 Praha';
  ZAK.projHlavicka.nazevAkce = 'Přístavba výtahu – projekční práce';
  ZAK.uvodniFotoProj = fotoProj;
  ZAK.uvodniFotoProjPopis = 'Bytový dům, pohled z ulice';
  ZAK.uvodniFoto = fotoOck;          // nabídka OCK má svou, jinou
  render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj(), FOTO_PROJ, FOTO_OCK]);
await p.waitForTimeout(300);

/* ---------- 0) šablona sama ---------- */
console.log('\nšablona Sablona_NABIDKA_PROJ.docx');
{
  const dek = u8 => new TextDecoder().decode(u8);
  const casti = await zipPrecti(new Uint8Array(readFileSync(sablona)));
  const docS = dek(casti.find(x => x.nazev === 'word/document.xml').data);
  for (const s of ['OBJEDNATEL', 'ADRESA', 'DATUM', 'CISLO_NABIDKY', 'POPIS_ZAMERU',
                   'PROJ_CENA_ZAMERENI', 'PROJ_CENA_DPZ', 'PROJ_CENA_KOLAUDACE',
                   'PODM_PLATNOST_NABIDKY', 'ZPRAC_JMENO'])
    test('symbol {{' + s + '}} je v šabloně právě jednou',
      docS.split('{{' + s + '}}').length === 2, docS.split('{{' + s + '}}').length - 1);
  /* Alternativní text je jediné, podle čeho aplikace pozná, kterému obrázku
   * má vyměnit obsah. Word ho zahodí, když někdo obrázek smaže a vloží znovu. */
  test('místo pro úvodní fotku je označené', /descr="\{\{UVODNI_FOTO\}\}"/.test(docS));
  test('místo pro podpis zpracovatele je označené', /descr="\{\{ZPRAC_PODPIS\}\}"/.test(docS));
  /* Šablona koluje mezi lidmi. Jméno, telefon, e-mail ani sken podpisu kolegy,
   * ze jehož nabídky vzor vznikl, v ní nemají co dělat. */
  const vse = casti.filter(x => /\.(xml|rels)$/.test(x.nazev)).map(x => dek(x.data)).join('');
  /* Telefon se hledá i s pevnou mezerou (Word je tak píše). Samotné „724"
   * by chytalo i vnitřní značky Wordu (w:rsid), takže se hledá celé číslo. */
  const telefon = vse.replace(/ /g, ' ');
  for (const s of ['Sikora', 'sikora.daniel'])
    test('v šabloně nezůstalo „' + s + '"', !vse.includes(s));
  test('v šabloně nezůstal telefon kolegy', !telefon.includes('724 323 407'));
  const podpis = casti.find(x => x.nazev === 'word/media/image2.png');
  test('sken podpisu ze vzoru je ze šablony vyprázdněný',
    podpis && podpis.data.length < 200, podpis && podpis.data.length);
  test('zástupný obrázek úvodní fotky je v šabloně',
    casti.some(x => x.nazev === 'word/media/uvodni_foto.png'));
  /* Vzorové hodnoty by v nabídce vypadaly jako skutečné údaje zákazníka. */
  for (const s of ['Xx xxx Kč', 'xx.xx.2026', 'OVP-CN-00xx', 'Zákazník ….'])
    test('vzorová hodnota „' + s + '" je nahrazená', !docS.includes(s));
}

/* ---------- 1) ovládání v aplikaci ---------- */
console.log('\ntlačítko a karta v aplikaci');
await p.click('#tab-proj');
await p.waitForTimeout(300);

const tlacitka = await p.evaluate(() =>
  [...document.querySelectorAll('button')].map(x => x.textContent.trim()));
test('v Kalkulaci PROJ je tlačítko „Vytvořit nabídku PROJ (Word)"',
  tlacitka.some(t => t.indexOf('Vytvořit nabídku PROJ (Word)') === 0), tlacitka.slice(-8).join(' | '));
test('náhled a tisk nabídky zůstal vedle něj',
  tlacitka.some(t => t.indexOf('Kompletní náhled a tisk nabídky') === 0));
test('karta nabídky PROJ nabízí nahrání vlastní fotky',
  await p.evaluate(() => /Úvodní fotka nabídky PROJ/.test(document.body.innerHTML)));
test('stavový řádek je na třídě, ne na id (karta se vykresluje dvakrát)',
  await p.evaluate(() => document.querySelectorAll('.nabidkaProjStav').length >= 1));

/* Karta stojí i v Přehledu cenových nabídek – tam se nabídky tisknou nejčastěji. */
await p.click('#tab-zakazka');
await p.waitForTimeout(300);
test('tlačítko je i v Přehledu cenových nabídek',
  await p.evaluate(() => [...document.querySelectorAll('button')]
    .some(x => x.textContent.indexOf('Vytvořit nabídku PROJ (Word)') === 0)));
test('obě kopie karty se hlásí do téhož stavového řádku',
  await p.evaluate(() => {
    nabidkaProjStavText('zkouška stavu');
    return [...document.querySelectorAll('.nabidkaProjStav')]
      .every(e => e.textContent === 'zkouška stavu');
  }));

/* Nastavení → Šablony musí umět šablonu PROJ přijmout, jinak by se vybírala
 * při každém generování znovu. */
test('Nastavení → Šablony zná řádek šablony PROJ',
  await p.evaluate(() => /Šablona cenové nabídky PROJ/.test(nastSablony())));
test('a pořád zná i šablonu OCK',
  await p.evaluate(() => /Šablona cenové nabídky OCK/.test(nastSablony())));

/* ---------- 2) hotový dokument ---------- */
console.log('\nvygenerovaný .docx');
const zdroj = readFileSync(sablona);
const b64 = zdroj.toString('base64');

const vysledek = await p.evaluate(async (sablonaB64) => {
  const bin = atob(sablonaB64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const varianta = aktivniVarianta(ZAK);
  const res = await dokumentVygeneruj('nabidkaProj', u8.buffer, ZAK, varianta, JEKLY, 'cz');
  const bajty = new Uint8Array(await res.blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bajty.length; i++) s += String.fromCharCode(bajty[i]);
  const d = nabidkaProjData(ZAK, varianta);
  return { docx: btoa(s), nazevSouboru: res.nazevSouboru,
           cislo: d.placeholders.CISLO_NABIDKY,
           celkem: d.placeholders.PROJ_CELKEM_BEZ_DPH,
           sDph: d.placeholders.PROJ_CELKEM_S_DPH,
           zamereni: d.placeholders.PROJ_CENA_ZAMERENI,
           zaokr: d.placeholders.PROJ_ZAOKROUHLENI_KC };
}, b64);

const polozky = await zipPrecti(new Uint8Array(Buffer.from(vysledek.docx, 'base64')));
const dekoduj = u8 => new TextDecoder().decode(u8);
const doc = dekoduj(polozky.find(x => x.nazev === 'word/document.xml').data);

test('název souboru začíná NABÍDKA_PROJ_',
  vysledek.nazevSouboru.indexOf('NABÍDKA_PROJ_') === 0, vysledek.nazevSouboru);
test('v dokumentu nezůstal žádný symbol {{…}}',
  !/\{\{[A-Z0-9_]+\}\}/.test(doc), (doc.match(/\{\{[A-Z0-9_]+\}\}/g) || []).slice(0, 6).join(' '));
test('hlavička nese objednatele z hlavičky PROJ', doc.includes('SVJ Zkušební 7'));
/* Číslo nabídky se do dokumentu píše ve tvaru bez mezer (2026OVPCN0199) –
 * tak, jak ho složí projCisloNabidky. Porovnává se proto s hodnotou, kterou
 * aplikace skutečně dosazuje, ne s tím, co se napsalo do hlavičky. */
test('hlavička nese číslo nabídky PROJ', doc.includes(vysledek.cislo), vysledek.cislo);
test('cena za zaměření se dosadila z kalkulace',
  doc.includes(vysledek.zamereni), vysledek.zamereni);

/* Zadání z 12. 8. 2026: řádek obchodního zaokrouhlení se v nabídce neuvádí,
 * zaokrouhlují se rovnou jednotlivé položky. Symbol v šabloně zůstat smí
 * (starší šablony ho mají), ale musí se vyplnit prázdnem. */
test('symbol obchodního zaokrouhlení je prázdný', vysledek.zaokr === '', vysledek.zaokr);
test('v dokumentu není řádek „obchodní zaokrouhlení"',
  !/[Oo]bchodní\s*zaokrouhlení/.test(doc.replace(/<[^>]+>/g, '')));
/* Ceny musí vycházet na celé koruny – zaokrouhlení se přesunulo do položek,
 * takže nenulové haléře by znamenaly, že se přesun někde nepovedl. Formát
 * částky („21 600,00 Kč") zůstává beze změny, mění se jen to, co v něm může
 * po desetinné čárce stát. */
const celeKoruny = s => /,00\s/.test(s) || !/,/.test(s);
test('cena za zaměření vychází na celé koruny', celeKoruny(vysledek.zamereni), vysledek.zamereni);
test('celková cena bez DPH vychází na celé koruny', celeKoruny(vysledek.celkem), vysledek.celkem);

/* Fotka. Vzor PROJ má obrázky vložené novějším způsobem (DrawingML), proto
 * se hlídá i to, že se alternativní text po výměně vyprázdnil — jinak by ho
 * Word ukazoval ve vlastnostech obrázku jako „{{UVODNI_FOTO}}". */
const bajtyFoto = Buffer.from(FOTO_PROJ.split(',')[1], 'base64');
const bajtyFotoOck = Buffer.from(FOTO_OCK.split(',')[1], 'base64');
const media = polozky.filter(x => x.nazev.startsWith('word/media/'));
const sedi = u8 => Buffer.from(u8).equals(bajtyFoto);
test('úvodní fotka PROJ je v archivu dokumentu',
  media.some(m => sedi(m.data)), media.map(m => m.nazev + ':' + m.data.length).join(' '));
test('fotka z nabídky OCK se do projekční nabídky nedostala',
  !media.some(m => Buffer.from(m.data).equals(bajtyFotoOck)));
test('alternativní text obrázku se po výměně vyprázdnil',
  !/descr="\{\{UVODNI_FOTO\}\}"/.test(doc));
test('popisek fotky se dosadil jako text', doc.includes('Bytový dům, pohled z ulice')
  || !doc.includes('UVODNI_FOTO_POPIS'));

/* ---------- 3) zámek varianty ---------- */
console.log('\nzámek po vytištění');
test('typ dokumentu „nabidkaProj" je v rejstříku zámků',
  await p.evaluate(() => typeof ZAMEK_TYPY === 'undefined'
    || !!(ZAMEK_TYPY.nabidkaProj && ZAMEK_TYPY.nabidkaProj.zamyka)));

test('aplikace při generování nehlásila chybu do konzole', konzole.length === 0,
  konzole.slice(0, 3).join(' | '));

await b.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
