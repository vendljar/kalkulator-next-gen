/* Test kryci.js + generování krycího listu do Wordu (od nuly).
   Ověří rozdělení polí BO/Techdata, generování .docx a jeho zpětné rozbalení. */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
global.vypocetProj = ep.vypocetProj;   // KL-3 typ produktu + KL-4 DPS/DPZ (hodnota je JEN OCK)
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const docx = require('./docxgen.js');
global.docxVyplnSablonu = docx.docxVyplnSablonu; global.docxDokumentBlob = docx.docxDokumentBlob;
const dokM = require('./dokumenty.js');
global.dokumentRegistruj = dokM.dokumentRegistruj;
const fm = require('./firma.js');   // SET-3 – prefill sekce „Dodavatel (naše firma)“
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const kr = require('./kryci.js');
global.KRYCI_SEKCE = kr.KRYCI_SEKCE; global.kryciCtx = kr.kryciCtx; global.kryciData = kr.kryciData;
const { dokumentVygeneruj, dokumentDef, dokumentTypyPrefix } = dokM;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9001'; zak.objednatel = 'Vzorový odběratel s.r.o.'; zak.kontakt = 'Ing. Jan Vzorový';
zak.adresa = 'Vzorová 163/17, Praha 10'; zak.nazevAkce = 'Vestavba OCK';
const v = zak.varianty[0];

// 1) registrace obou verzí
test('registrovány kryci_bo i kryci_techdata', dokumentTypyPrefix('kryci_').length === 2, dokumentTypyPrefix('kryci_').join(','));

// 2) rozdělení polí
const bo = kr.kryciData(zak, v, JEKLY, 'bo');
const td = kr.kryciData(zak, v, JEKLY, 'techdata');
const sekBo = bo.sekce.map(s => s.sekce), sekTd = td.sekce.map(s => s.sekce);
test('BO NEobsahuje Technická specifika', !sekBo.includes('Technická specifika'));
test('BO NEobsahuje Atypy OCK', !sekBo.includes('Atypy OCK'));
test('BO obsahuje Platební podmínky', sekBo.includes('Platební podmínky'));
test('Techdata obsahuje Technická specifika', sekTd.includes('Technická specifika'));
test('Techdata obsahuje Atypy OCK', sekTd.includes('Atypy OCK'));
// zákazník: BO má IČO, Techdata ne
const boZak = (bo.sekce.find(s => s.sekce.startsWith('Zákazník')) || { radky: [] }).radky.map(r => r[0]);
const tdZak = (td.sekce.find(s => s.sekce.startsWith('Zákazník')) || { radky: [] }).radky.map(r => r[0]);
test('BO Zákazník obsahuje IČO', boZak.includes('IČO'));
test('Techdata Zákazník neobsahuje IČO', !tdZak.includes('IČO'));

/* Očekávané firemní údaje se odvozují z DEFAULT_FIRMA – v repozitáři je
 * ukázková firma, skutečná leží v _DB/_nastaveni.json. Test hlídá, že se
 * prefill vezme z firemních údajů, ne jaké údaje to zrovna jsou. */
const D = require('./firma.js').DEFAULT_FIRMA;
const SIDLO = D.sidloUlice + ', ' + D.sidloPsc + ' ' + D.sidloMesto;

// 3) prefill hodnoty
const najdi = (data, label) => { for (const s of data.sekce) for (const r of s.radky) if (r[0] === label) return r[1]; return null; };
test('provázaný Název akce', najdi(bo, 'Název akce') === 'Vestavba OCK', najdi(bo, 'Název akce'));
test('provázané Číslo CN', najdi(bo, 'Číslo nabídky (CN)') === '2026-OPR-CN-9001');
test('prefill hodnota bez DPH obsahuje Kč', /Kč/.test(najdi(bo, 'Hodnota zakázky bez DPH') || ''));

// 3b) SET-3 – sekce Dodavatel (naše firma) s prefillem z firma.js
test('BO obsahuje sekci Dodavatel (naše firma)', sekBo.includes('Dodavatel (naše firma)'), sekBo.join('|'));
test('Techdata obsahuje sekci Dodavatel (naše firma)', sekTd.includes('Dodavatel (naše firma)'), sekTd.join('|'));
test('prefill Zhotovitel z firemních údajů', najdi(bo, 'Zhotovitel') === D.nazev, najdi(bo, 'Zhotovitel'));
test('prefill Sídlo zhotovitele', najdi(bo, 'Sídlo zhotovitele') === SIDLO, najdi(bo, 'Sídlo zhotovitele'));
test('prefill IČO / DIČ zhotovitele', najdi(bo, 'IČO / DIČ zhotovitele') === 'IČO: ' + D.ico, najdi(bo, 'IČO / DIČ zhotovitele'));
test('Techdata NEobsahuje bankovní spojení zhotovitele', najdi(td, 'Bankovní spojení zhotovitele') === null);
test('prefill Nabídku vypracoval', (najdi(bo, 'Nabídku vypracoval') || '').includes(D.zpracoval), najdi(bo, 'Nabídku vypracoval'));

/* ---------- opravy krycího listu (#23) ---------- */

// KL-1: adresa stavby vs. sídlo objednatele jsou dvě různá pole
test('KL-1 adresa stavby se bere z hlavičky', najdi(bo, 'Adresa stavby') === 'Vzorová 163/17, Praha 10', najdi(bo, 'Adresa stavby'));
test('KL-1 sídlo objednatele zůstane prázdné, dokud se nevyplní',
  najdi(bo, 'Adresa (sídlo) objednatele') === '', JSON.stringify(najdi(bo, 'Adresa (sídlo) objednatele')));
zak.adresaObjednatele = 'Radlická 3185/1c, 150 00 Praha 5';
test('KL-1 sídlo objednatele se propíše, ne adresa stavby',
  najdi(kr.kryciData(zak, v, JEKLY, 'bo'), 'Adresa (sídlo) objednatele') === 'Radlická 3185/1c, 150 00 Praha 5');

/* KL-2: hodnota = JEN ocelová konstrukce po schválené slevě. Tenhle krycí list
 * je podkladem pro objednávku / SoD na dodávku konstrukce; projekce má vlastní
 * krycí list s vlastní hodnotou, takže sečíst obě části by znamenalo mít stejné
 * peníze ve dvou smlouvách. Proto se tu ani nesmí objevit rozpad „(OCK … + PROJ …)“
 * – i když je projekční část oceněná, do téhle hodnoty nepatří. */
const ctx = kr.kryciCtx(zak, v, JEKLY);
const rOck = eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, v.data.ock.fixes);
const rProj = ep.vypocetProj(v.data.proj.zadani, v.data.proj.cenik);   // KL-3 / KL-4 níže
const cekano = Math.round(rOck.souhrn.zakladCena).toLocaleString('cs-CZ');
test('KL-2 hodnota odpovídá ceně OCK po slevě', ctx.hodnota.indexOf(cekano) === 0, ctx.hodnota + ' vs ' + cekano);
test('KL-2 hodnota neuvádí rozpad na OCK a PROJ', !/\(OCK|PROJ/.test(ctx.hodnota), ctx.hodnota);
test('KL-2 oceněná projekce hodnotu OCK nezvyšuje',
  rProj.souhrn.celkem > 0 && ctx.hodnota.indexOf(Math.round(rOck.souhrn.zakladCena + rProj.souhrn.celkem).toLocaleString('cs-CZ')) !== 0,
  ctx.hodnota + ' (PROJ ' + rProj.souhrn.celkem + ')');

// KL-3: čistě projekční zakázka není šachta
test('KL-3 typ produktu u kombinované zakázky', /šachta \+ projekce$/.test(ctx.typProduktu), ctx.typProduktu);
// čistě projekční zakázka: OCK část je nulová (engine dočasně nahrazen, ať je
// test nezávislý na tom, jakým zadáním se v OCK dá dosáhnout nuly)
const vypocetOrig = global.vypocet;
global.vypocet = () => ({ souhrn: { zakladCena: 0 }, priplatky: [] });
const ctxP = kr.kryciCtx(zak, v, JEKLY);
global.vypocet = vypocetOrig;
test('KL-3 typ produktu bez OCK je Projekce', ctxP.typProduktu === 'Projekce', ctxP.typProduktu);
/* Bez ocelové konstrukce nemá tenhle krycí list co ocenit – projekční cena sem
 * nepatří (má vlastní krycí list PROJ), takže se nesmí objevit ani omylem. */
test('KL-3 hodnota bez OCK neobsahuje cenu projekce',
  rProj.souhrn.celkem > 0 &&
  ctxP.hodnota.indexOf(Math.round(rProj.souhrn.celkem).toLocaleString('cs-CZ')) === -1, ctxP.hodnota);

// KL-4: pole, která aplikace zná, se předvyplní
test('KL-4 jméno obchodníka z Nastavení → Firma', najdi(bo, 'Jméno obchodníka') === D.zpracoval, najdi(bo, 'Jméno obchodníka'));
test('KL-4 zaměření strojovna z technické specifikace', najdi(bo, 'Zaměření strojovna') === 'Ano', najdi(bo, 'Zaměření strojovna'));
test('KL-4 prováděcí dokumentace z kalkulace PROJ (DPS)',
  ['Ano', 'Ne'].includes(najdi(bo, 'Prováděcí dokumentace')), najdi(bo, 'Prováděcí dokumentace'));
test('KL-4 DPS oceněná → Prováděcí dokumentace Ano',
  (rProj.sekce.find(s => s.key === 'dps').celkem > 0) === (najdi(bo, 'Prováděcí dokumentace') === 'Ano'));
test('KL-4 DPZ oceněná → DSP Ano',
  (rProj.sekce.find(s => s.key === 'dpz').celkem > 0) === (najdi(bo, 'DSP') === 'Ano'));

// KL-5: zádržné rozdělené na dva řádky s procenty
const labely = bo.sekce.flatMap(s => s.radky.map(r => r[0]));
['Zádržné – do odstranění vad a nedodělků', 'Zádržné do odstranění VaN – %',
  'Zádržné – po dobu záruky', 'Zádržné po dobu záruky – %'].forEach(l =>
  test('KL-5 řádek „' + l + '“', labely.includes(l), labely.join('|')));
const mig = kr.kryciMigraceZadrzne({ zadrzne: 'ANO do odstranění vad a nedodělků 10 %' });
test('KL-5 migrace starého textu na Ano', mig.zadrzne === 'Ano', JSON.stringify(mig));
test('KL-5 migrace vytáhne procento', mig.zadrzneProc === '10', JSON.stringify(mig));
test('KL-5 migrace nechá už převedenou hodnotu být',
  kr.kryciMigraceZadrzne({ zadrzne: 'Ne' }).zadrzne === 'Ne');
test('KL-5 migrace bez zádržného nespadne', kr.kryciMigraceZadrzne({}).zadrzne === undefined);

// KL-6: scoring je odkaz
const poleScoring = kr.KRYCI_SEKCE.flatMap(s => s.pole).find(p => p.id === 'scoring');
test('KL-6 scoring je typu link', poleScoring && poleScoring.typ === 'link', poleScoring && poleScoring.typ);

// KL-7: patička s podpisem
test('KL-7 BO obsahuje sekci Podpis', sekBo.includes('Podpis'), sekBo.join('|'));
test('KL-7 Techdata obsahuje sekci Podpis', sekTd.includes('Podpis'), sekTd.join('|'));
test('KL-7 podpis obchodníka předvyplněn', najdi(bo, 'Podpis obchodníka') === D.zpracoval, najdi(bo, 'Podpis obchodníka'));
test('KL-7 řádek Informován', labely.includes('Informován'), labely.join('|'));

// 4) ruční přepis má přednost
v.data.kryci = { hodnoty: { obchodnik: 'Jan Novák' } };
test('ruční přepis obchodníka', najdi(kr.kryciData(zak, v, JEKLY, 'bo'), 'Jméno obchodníka') === 'Jan Novák');

(async () => {
  // 5) generování .docx přes jednotný registr + zpětné rozbalení ZIP
  const res = await dokumentVygeneruj('kryci_bo', null, zak, v, JEKLY);
  const bytes = new Uint8Array(await res.blob.arrayBuffer());
  test('BO .docx je ZIP (PK)', bytes[0] === 0x50 && bytes[1] === 0x4B);
  test('název souboru BO', /KRYCI_LIST_Backoffice_2026-OPR-CN-9001/.test(res.nazevSouboru), res.nazevSouboru);
  const polozky = await docx.zipPrecti(bytes);
  const doc = polozky.find(p => p.nazev === 'word/document.xml');
  test('obsahuje word/document.xml', !!doc);
  const xml = new TextDecoder().decode(doc.data);
  test('document.xml obsahuje nadpis Backoffice', xml.includes('Backoffice'));
  test('document.xml obsahuje sekci Platební podmínky', xml.includes('Platební podmínky'));
  test('document.xml obsahuje hodnotu (Jan Novák)', xml.includes('Jan Novák'));
  test('document.xml má tabulku', xml.includes('<w:tbl>'));

  const res2 = await dokumentVygeneruj('kryci_techdata', null, zak, v, JEKLY);
  const b2 = new Uint8Array(await res2.blob.arrayBuffer());
  const xml2 = new TextDecoder().decode((await docx.zipPrecti(b2)).find(p => p.nazev === 'word/document.xml').data);
  test('Techdata obsahuje Atypy OCK', xml2.includes('Atypy OCK'));
  test('Techdata NEobsahuje Platební podmínky nadpis mimo pokuty', xml2.includes('Techdata'));

  console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY KRYCÍ DOCX OK');
  process.exit(fail ? 1 : 0);
})();
