/* Testy jazykových mutací dokumentů (N1, 2. část):
   – docxPrelozSablonu / docxPrelozXml: překlad pevného textu .docx šablony,
   – nabidkaData(…, lang): překlad HODNOT dosazovaných do {{…}}.
   Spuštění: cd src && node test_docx_preklad.js */
const P = require('./preklad.js');
global.tr = P.tr; global.trStav = P.trStav;                 // v prohlížeči jsou to globály z preklad.js
const dg = require('./docxgen.js');
const { docxPrelozXml, docxPrelozSablonu, odstavcoveSpany, odstavecText, zipPrecti } = dg;

const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const { nabidkaData } = require('./nabidka.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const par = (...runy) => '<w:p>' + runy.map(t => `<w:r><w:t>${t}</w:t></w:r>`).join('') + '</w:p>';
const texty = xml => (xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [])
  .map(t => t.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, ''));

// ---- 1. hledání odstavců ---------------------------------------------------
const x1 = par('A') + '<w:p/>' + par('B') + '<w:p w:rsidR="00"/>' + par('C');
test('najde 3 odstavce, prázdné <w:p/> ignoruje', odstavcoveSpany(x1).length === 3,
  odstavcoveSpany(x1).length);
test('text odstavce spojí runy', odstavecText(par('UMÍSTĚNÍ ', 'ŠACHTY')) === 'UMÍSTĚNÍ ŠACHTY');
test('text odstavce rozkóduje entity', odstavecText(par('A &amp; B')) === 'A & B');

// ---- 2. překlad textu rozděleného do více runů -----------------------------
let stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
let out = docxPrelozXml(par('UMÍSTĚNÍ ', 'ŠACHTY'), 'en', stat);
test('rozdělený text se přeloží jako celek', texty(out)[0] === 'SHAFT LOCATION', texty(out));
test('ostatní runy se vyprázdní', texty(out)[1] === '', JSON.stringify(texty(out)));
test('statistika započítala překlad', stat.prelozeno === 1 && stat.celkem === 1, JSON.stringify(stat));

stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
out = docxPrelozXml(par('ZÁKLADNÍ PARAMETRY ŠACHTY'), 'de', stat);
test('DE překlad sekce', texty(out)[0] === 'PARAMETER DES SCHACHTGERÜSTS', texty(out));

// ---- 3. zástupné symboly {{…}} zůstávají netknuté --------------------------
stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
const xPh = par('{{TS_UMISTENI}}');
test('odstavec se symbolem se nemění', docxPrelozXml(xPh, 'en', stat) === xPh);
const xPhSplit = par('{{', 'TS_UMISTENI', '}}');
test('symbol rozdělený do runů se nemění', docxPrelozXml(xPhSplit, 'en', stat) === xPhSplit);
test('symboly se nepočítají do statistiky', stat.celkem === 0, JSON.stringify(stat));

// ---- 4. nepřeložené fráze zůstávají česky a jsou v seznamu -----------------
stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
const xNez = par('naprosto neznámá věta v šabloně');
out = docxPrelozXml(xNez, 'en', stat);
test('neznámá věta zůstane česky', out === xNez);
test('neznámá věta je v seznamu chybějících', stat.chybi[0] === 'naprosto neznámá věta v šabloně',
  JSON.stringify(stat.chybi));

// ---- 5. neutrální obsah (čísla, pomlčky) se nepočítá jako chybějící --------
stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
docxPrelozXml(par('1 600') + par(' - '), 'fr', stat);
test('neutrální odstavce se nehlásí jako chybějící', stat.chybi.length === 0 && stat.neutralni === 2,
  JSON.stringify(stat));

// ---- 6. escapování a bezpečnost XML ---------------------------------------
stat = { celkem: 0, prelozeno: 0, neutralni: 0, chybi: [] };
P.prekladNastav('test & pokus', 'en', 'test & attempt <ok>');
out = docxPrelozXml(par('test &amp; pokus'), 'en', stat);
test('výstup je XML-escapovaný', texty(out)[0] === 'test &amp; attempt &lt;ok&gt;', texty(out));
P.prekladSmaz('test & pokus');

// ---- 7. celý .docx roundtrip ----------------------------------------------
(async () => {
  const telo = par('ZÁKLADNÍ PARAMETRY ŠACHTY') + par('UMÍSTĚNÍ ŠACHTY') + par('{{TS_UMISTENI}}');
  const zdroj = await dg.docxSestavBlob(telo).arrayBuffer();
  const st = {};
  const blob = await docxPrelozSablonu(zdroj, 'en', st);
  const polozky = await zipPrecti(new Uint8Array(await blob.arrayBuffer()));
  const doc = new TextDecoder().decode(polozky.find(p => p.nazev === 'word/document.xml').data);
  test('roundtrip: sekce přeložena', doc.includes('SHAFT CORE PARAMETERS'), doc.slice(0, 200));
  test('roundtrip: popisek přeložen', doc.includes('SHAFT LOCATION'));
  test('roundtrip: symbol zachován', doc.includes('{{TS_UMISTENI}}'));
  test('roundtrip: statistika', st.prelozeno === 2 && st.celkem === 2, JSON.stringify(st));

  let chyba = '';
  try { await docxPrelozSablonu(zdroj, 'cz', {}); } catch (e) { chyba = e.message; }
  test('bez cílového jazyka to skončí chybou', /jazyk/i.test(chyba), chyba);

  // ---- 8. nabidkaData s jazykem -------------------------------------------
  const zak = zk.novaZakazka();
  zak.cislo = '2026-OPR-CN-9001'; zak.objednatel = 'Vzorový odběratel s.r.o.';
  const v = zak.varianty[0];
  const cz = nabidkaData(zak, v, JEKLY);
  const czExpl = nabidkaData(zak, v, JEKLY, 'cz');
  const en = nabidkaData(zak, v, JEKLY, 'en');
  const de = nabidkaData(zak, v, JEKLY, 'de');

  test('bez jazyka = beze změny (zpětná kompatibilita)',
    JSON.stringify(cz.placeholders) === JSON.stringify(czExpl.placeholders));
  // hodnoty ze slovníku se přeloží; co ve slovníku není, zůstává česky (a je vidět v pokrytí)
  const tsKlice = Object.keys(cz.placeholders).filter(k => k.startsWith('TS_'));
  const zmeneno = tsKlice.filter(k => en.placeholders[k] !== cz.placeholders[k]);
  test('EN: přeložena je aspoň třetina hodnot TS_*', zmeneno.length >= tsKlice.length / 3,
    zmeneno.length + '/' + tsKlice.length);
  test('EN: konkrétní hodnota přeložena (slovník/vzor)',
    en.placeholders.TS_HAKY === P.tr(cz.placeholders.TS_HAKY, 'en')
    && ['slovník', 'vzor'].includes(P.trStav(cz.placeholders.TS_HAKY, 'en').zdroj),
    cz.placeholders.TS_HAKY + ' → ' + en.placeholders.TS_HAKY);
  test('EN: sazba DPH slovem přeložena', en.placeholders.DPH_NAZEV === P.tr(cz.placeholders.DPH_NAZEV, 'en'),
    cz.placeholders.DPH_NAZEV + ' → ' + en.placeholders.DPH_NAZEV);
  test('DE: sazba DPH slovem přeložena', de.placeholders.DPH_NAZEV === P.tr(cz.placeholders.DPH_NAZEV, 'de'),
    cz.placeholders.DPH_NAZEV + ' → ' + de.placeholders.DPH_NAZEV);
  test('EN: sokl přeložen', /included|not included/.test(en.placeholders.TS_NENI_SOKL), en.placeholders.TS_NENI_SOKL);
  test('ceny zůstávají shodné bez ohledu na jazyk',
    en.placeholders.CENA_BEZ_DPH === cz.placeholders.CENA_BEZ_DPH);
  test('EN: příplatky mají anglické „quantity"',
    !en.priplatky.length || en.priplatky[0].popis.startsWith('quantity: '),
    (en.priplatky[0] || {}).popis);
  test('název souboru nese jazyk', en.nazevSouboru.endsWith('_EN') && !cz.nazevSouboru.endsWith('_EN'),
    en.nazevSouboru);
  test('data nesou informaci o jazyku', en.jazyk === 'en' && cz.jazyk === 'cz');
  /* Hlídá se ZTRÁTA, ne prázdnota: některé placeholdery jsou prázdné záměrně
   * (ZAOKROUHLENI_KC je prázdné, když se nezaokrouhluje – dokument tím schová
   * celý řádek). Chyba by byla, kdyby česky vyplněná hodnota po překladu zmizela. */
  const ztracene = Object.keys(cz.placeholders)
    .filter(k => cz.placeholders[k] !== '' && cz.placeholders[k] != null)
    .filter(k => en.placeholders[k] == null || en.placeholders[k] === '');
  test('překlad neztratil žádný vyplněný placeholder', ztracene.length === 0, ztracene.join(','));

  console.log(fail ? `\n${fail} CHYB (${ok} OK)` : `\nVŠECHNY TESTY DOCX-PŘEKLAD OK (${ok})`);
  process.exit(fail ? 1 : 0);
})();
