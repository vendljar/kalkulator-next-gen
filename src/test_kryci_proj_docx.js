/* Test kryci_proj.js + generování krycího listu zakázky PROJ do Wordu.
   Ověří napojení na Kalkulaci PROJ (vypocetProj), rozdělení polí BO/Techdata,
   generování .docx a jeho zpětné rozbalení. */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { global[k] = ep[k]; });   // vypocetProj + DEFAULT_*_PROJ
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();  // ceník v sestavení je prázdný, testy potřebují čísla
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
/* V prohlížeči jsou všechny moduly v jednom scope, v Node se načítají zvlášť.
 * Hlavičkové funkce proto musíme doplnit do globálu – jinak kryciProjCtx tiše
 * spadne do nouzové větve (čte přímo zakázku) a testy by ověřovaly jiný kód,
 * než jaký poběží v aplikaci. */
global.projHlavicka = zk.projHlavicka;
global.projHlavickaEfektivni = zk.projHlavickaEfektivni;
global.projHlavickaZOck = zk.projHlavickaZOck;
global.projCisloNabidky = zk.projCisloNabidky;
const docx = require('./docxgen.js');
global.docxVyplnSablonu = docx.docxVyplnSablonu; global.docxDokumentBlob = docx.docxDokumentBlob;
const dokM = require('./dokumenty.js');
global.dokumentRegistruj = dokM.dokumentRegistruj;
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const np = require('./nabidka_proj.js');   // NABIDKA_PROJ_SAZBY – paušály a splatnost
Object.keys(np).forEach(k => { global[k] = np[k]; });
const kr = require('./kryci.js');          // krycí list OCK – kvůli kontrole, že se prefixy nemíchají
global.KRYCI_SEKCE = kr.KRYCI_SEKCE; global.kryciCtx = kr.kryciCtx; global.kryciData = kr.kryciData;
const kp = require('./kryci_proj.js');
Object.keys(kp).forEach(k => { global[k] = kp[k]; });
const { dokumentVygeneruj, dokumentTypyPrefix } = dokM;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const zak = zk.novaZakazka();
zak.cislo = '2026-OVP-CN-9002'; zak.objednatel = 'SVJ Vzorová 163'; zak.kontakt = 'Ing. Jan Vzorový';
zak.adresa = 'Vzorová 163/17, Praha 10'; zak.nazevAkce = 'Výtah do zrcadla schodiště';
zak.popisZameru = 'Vestavba osobního výtahu do zrcadla stávajícího schodiště.';
const v = zak.varianty[0];

// 1) registrace obou verzí pod vlastním prefixem (nemíchá se s krycím listem OCK)
test('registrovány kryciproj_bo i kryciproj_techdata',
  dokumentTypyPrefix('kryciproj_').length === 2, dokumentTypyPrefix('kryciproj_').join(','));
test('prefix kryci_ zůstal na dvou typech OCK',
  dokumentTypyPrefix('kryci_').length === 2, dokumentTypyPrefix('kryci_').join(','));

// 2) nová varianta má úložiště ručních hodnot
test('novaVariantaData obsahuje kryciProj.hodnoty',
  !!(v.data.kryciProj && v.data.kryciProj.hodnoty), JSON.stringify(Object.keys(v.data)));

// 3) migrace importem (starší zakázka bez kryciProj)
const stary = JSON.parse(JSON.stringify(zak));
delete stary.varianty[0].data.kryciProj;
const migr = zk.importZakazka(stary);
test('import doplní kryciProj.hodnoty',
  !!(migr.varianty[0].data.kryciProj && migr.varianty[0].data.kryciProj.hodnoty));

// 4) rozdělení polí BO / Techdata
const bo = kp.kryciProjData(zak, v, JEKLY, 'bo');
const td = kp.kryciProjData(zak, v, JEKLY, 'techdata');
const sekBo = bo.sekce.map(s => s.sekce), sekTd = td.sekce.map(s => s.sekce);
test('BO obsahuje Platební podmínky', sekBo.includes('Platební podmínky'), sekBo.join('|'));
test('BO obsahuje Rozsah projekčních prací',
  sekBo.some(s => s.startsWith('Rozsah projekčních prací')), sekBo.join('|'));
test('BO NEobsahuje Projekční specifika', !sekBo.includes('Projekční specifika'));
test('BO NEobsahuje Atypy a rizika PROJ', !sekBo.includes('Atypy a rizika PROJ'));
test('Techdata obsahuje Projekční specifika', sekTd.includes('Projekční specifika'), sekTd.join('|'));
test('Techdata obsahuje Atypy a rizika PROJ', sekTd.includes('Atypy a rizika PROJ'));
test('Techdata obsahuje Stupně dokumentace', sekTd.some(s => s.startsWith('Stupně dokumentace')));
test('BO NEobsahuje Stupně dokumentace', !sekBo.some(s => s.startsWith('Stupně dokumentace')));
const boZak = (bo.sekce.find(s => s.sekce.startsWith('Zákazník')) || { radky: [] }).radky.map(r => r[0]);
const tdZak = (td.sekce.find(s => s.sekce.startsWith('Zákazník')) || { radky: [] }).radky.map(r => r[0]);
test('BO Zákazník obsahuje IČO', boZak.includes('IČO'));
test('Techdata Zákazník neobsahuje IČO', !tdZak.includes('IČO'));

// 5) prefill z hlavičky zakázky a z firemních údajů
const najdi = (data, label) => { for (const s of data.sekce) for (const r of s.radky) if (r[0] === label) return r[1]; return null; };
/* Firemní údaje se odvozují z DEFAULT_FIRMA – viz poznámka v test_kryci_docx.js. */
const D = require('./firma.js').DEFAULT_FIRMA;
test('provázaný Název akce', najdi(bo, 'Název akce') === 'Výtah do zrcadla schodiště', najdi(bo, 'Název akce'));
test('provázané Číslo CN', najdi(bo, 'Číslo nabídky (CN)') === '2026-OVP-CN-9002');
/* Popis záměru se z krycího listu PROJ odebral (v OCK verzi obdobu nemá a oba
 * listy se čtou vedle sebe). V datech zakázky ale zůstává – používá ho nabídka. */
test('Popis záměru už v krycím listu PROJ není', najdi(bo, 'Popis záměru') === null, najdi(bo, 'Popis záměru'));
test('Popis záměru zůstal v datech zakázky', /zrcadla/.test(zak.popisZameru || ''), zak.popisZameru);
test('prefill Zhotovitel z firemních údajů',
  najdi(bo, 'Zhotovitel') === D.nazev, najdi(bo, 'Zhotovitel'));
test('předmět zakázky je PROJ', /PROJ/.test(najdi(bo, 'Předmět zakázky') || ''), najdi(bo, 'Předmět zakázky'));

// 6) NAPOJENÍ NA KALKULACI PROJ – hodnota i rozsah odpovídají vypocetProj
const r = ep.vypocetProj(v.data.proj.zadani, v.data.proj.cenik);
const ocekKc = Math.round(r.souhrn.celkem).toLocaleString('cs-CZ') + ' Kč';
test('Hodnota zakázky bez DPH = souhrn z vypocetProj',
  najdi(bo, 'Hodnota zakázky bez DPH') === ocekKc, najdi(bo, 'Hodnota zakázky bez DPH') + ' vs ' + ocekKc);
test('Oceněných činností odpovídá počtu sekcí',
  najdi(bo, 'Oceněných činností') === r.sekce.filter(s => s.celkem > 0).length + ' z ' + r.sekce.length + ' činností',
  najdi(bo, 'Oceněných činností'));
// každá činnost: buď „ANO – <cena>“, nebo „není součástí nabídky“ – nikdy nula
const cinRadky = (bo.sekce.find(s => s.sekce.startsWith('Rozsah projekčních prací')) || { radky: [] }).radky;
test('rozsah má řádek pro každou činnost z Kalkulace PROJ',
  kp.KRYCI_PROJ_CINNOSTI.every(([, label]) => cinRadky.some(x => x[0] === label)),
  cinRadky.map(x => x[0]).join('|'));
const cinHodnoty = cinRadky.filter(x => kp.KRYCI_PROJ_CINNOSTI.some(([, l]) => l === x[0])).map(x => x[1]);
test('žádná činnost není vyčíslena nulou',
  cinHodnoty.every(h => /^ANO – /.test(h) || h === 'není součástí nabídky'), cinHodnoty.join('|'));
test('alespoň jedna činnost je oceněná', cinHodnoty.some(h => /^ANO – /.test(h)), cinHodnoty.join('|'));
// technická verze nikde neuvádí cenu činnosti
const stRadky = (td.sekce.find(s => s.sekce.startsWith('Stupně dokumentace')) || { radky: [] }).radky;
test('technická verze uvádí jen ANO/NE bez cen',
  stRadky.length > 0 && stRadky.every(x => x[1] === 'ANO' || x[1] === 'NE'), JSON.stringify(stRadky));

// 6b) živé napojení: změna hodin v Kalkulaci PROJ MUSÍ změnit hodnotu v krycím listu,
//     a dosud neoceněná činnost se musí přepnout z „není součástí nabídky“ na „ANO – …“
const puvodni = najdi(bo, 'Hodnota zakázky bez DPH');
const sekZam = v.data.proj.zadani.sekce.find(s => s.key === 'zamereni');
sekZam.polozky[0].hodiny = sekZam.polozky[0].hodiny + 8;
const bo2 = kp.kryciProjData(zak, v, JEKLY, 'bo');
test('změna hodin v Kalkulaci PROJ mění hodnotu v krycím listu',
  najdi(bo2, 'Hodnota zakázky bez DPH') !== puvodni,
  puvodni + ' -> ' + najdi(bo2, 'Hodnota zakázky bez DPH'));
test('hodnota zůstává formátovaná v Kč', /Kč$/.test(najdi(bo2, 'Hodnota zakázky bez DPH') || ''));

const labelStudie = kp.KRYCI_PROJ_CINNOSTI.find(([k]) => k === 'studie')[1];
test('neoceněná studie je „není součástí nabídky“',
  najdi(bo2, labelStudie) === 'není součástí nabídky', najdi(bo2, labelStudie));
const sekSt = v.data.proj.zadani.sekce.find(s => s.key === 'studie');
sekSt.polozky[0].hodiny = 12;
const bo3 = kp.kryciProjData(zak, v, JEKLY, 'bo');
test('po ocenění se studie přepne na ANO s cenou',
  /^ANO – .*Kč$/.test(najdi(bo3, labelStudie) || ''), najdi(bo3, labelStudie));
const td3 = kp.kryciProjData(zak, v, JEKLY, 'techdata');
test('technická verze studie přepnuta na ANO bez ceny',
  najdi(td3, labelStudie) === 'ANO', najdi(td3, labelStudie));
// vrátit zpět, ať navazující testy pracují s výchozí kalkulací
sekSt.polozky[0].hodiny = 0; sekZam.polozky[0].hodiny = sekZam.polozky[0].hodiny - 8;

/* ---------- opravy krycího listu (#23), společné s verzí OCK ---------- */

// KL-1: sídlo objednatele ≠ adresa stavby
test('KL-1 sídlo objednatele zůstane prázdné, dokud se nevyplní',
  najdi(bo, 'Adresa (sídlo) objednatele') === '', JSON.stringify(najdi(bo, 'Adresa (sídlo) objednatele')));
// hlavička PROJ je samostatný objekt (globály jsou doplněné nahoře)
zk.zakazkaKopirujHlavicku(zak, 'doProj');
zak.projHlavicka.adresaObjednatele = 'Radlická 3185/1c, 150 00 Praha 5';
test('KL-1 sídlo objednatele se propíše z hlavičky PROJ',
  najdi(kp.kryciProjData(zak, v, JEKLY, 'bo'), 'Adresa (sídlo) objednatele') === 'Radlická 3185/1c, 150 00 Praha 5',
  najdi(kp.kryciProjData(zak, v, JEKLY, 'bo'), 'Adresa (sídlo) objednatele'));
test('KL-1 hlavička PROJ nese i adresu stavby',
  najdi(kp.kryciProjData(zak, v, JEKLY, 'bo'), 'Adresa stavby') === 'Vzorová 163/17, Praha 10');
test('KL-1 adresa stavby zůstává adresou stavby',
  najdi(bo, 'Adresa stavby') === 'Vzorová 163/17, Praha 10', najdi(bo, 'Adresa stavby'));

/* Prázdná hlavička PROJ se čte z hlavičky OCK. Bez toho chyběl v krycím listu
 * název akce a adresa stavby jen proto, že se hlavička ručně nepřevzala –
 * a obchodník to na hotovém dokumentu pozná pozdě. Vlastní hodnota v hlavičce
 * PROJ má vždycky přednost a smazáním se zase vrátí hodnota z OCK. */
const zak2 = zk.novaZakazka();
zak2.cislo = '2026-OVP-CN-0301'; zak2.nazevAkce = 'Testovací 123'; zak2.adresa = 'V háji 15';
const v2 = zak2.varianty[0];
const boFb = kp.kryciProjData(zak2, v2, JEKLY, 'bo');
test('nepřevzatá hlavička PROJ: Název akce se doplní z hlavičky OCK',
  najdi(boFb, 'Název akce') === 'Testovací 123', najdi(boFb, 'Název akce'));
test('nepřevzatá hlavička PROJ: Adresa stavby se doplní z hlavičky OCK',
  najdi(boFb, 'Adresa stavby') === 'V háji 15', najdi(boFb, 'Adresa stavby'));
/* Číslo nabídky je v nové zakázce předvyplněné předlohou „2026 - OPR - CN - “,
 * kterou obchodník dopisuje. Nedopsaná předloha se za vyplněné číslo nepovažuje,
 * jinak by v dokumentu skončil holý útržek místo čísla z hlavičky OCK. */
test('nepřevzatá hlavička PROJ: Číslo CN se doplní z hlavičky OCK',
  najdi(boFb, 'Číslo nabídky (CN)') === '2026-OVP-CN-0301', najdi(boFb, 'Číslo nabídky (CN)'));
test('nedopsaná předloha čísla se do krycího listu nedostane',
  najdi(boFb, 'Číslo nabídky (CN)') !== zk.ZAK_CISLO_PREDLOHA, najdi(boFb, 'Číslo nabídky (CN)'));
test('doplnění z OCK nezapisuje do hlavičky PROJ',
  !zak2.projHlavicka.nazevAkce && !zak2.projHlavicka.adresa,
  JSON.stringify(zak2.projHlavicka));
zak2.projHlavicka.nazevAkce = 'Jiný název pro projekci';
test('vlastní hodnota v hlavičce PROJ má přednost',
  najdi(kp.kryciProjData(zak2, v2, JEKLY, 'bo'), 'Název akce') === 'Jiný název pro projekci',
  najdi(kp.kryciProjData(zak2, v2, JEKLY, 'bo'), 'Název akce'));
zak2.projHlavicka.nazevAkce = '';
test('smazáním se vrátí hodnota z hlavičky OCK',
  najdi(kp.kryciProjData(zak2, v2, JEKLY, 'bo'), 'Název akce') === 'Testovací 123');
/* popisek zdroje má říct, odkud hodnota přišla – jinak není poznat, že se
 * v krycím listu čte cizí hlavička */
const ctxFb = kp.kryciProjCtx(zak2, v2);
test('popisek zdroje hlásí převzetí z hlavičky OCK', /OCK/.test(ctxFb.hlSrc('nazevAkce')), ctxFb.hlSrc('nazevAkce'));
zak2.projHlavicka.nazevAkce = 'Vlastní';
const ctxFb2 = kp.kryciProjCtx(zak2, v2);
test('popisek zdroje u vlastní hodnoty neuvádí OCK', !/OCK/.test(ctxFb2.hlSrc('nazevAkce')), ctxFb2.hlSrc('nazevAkce'));

/* ČÍSLO NABÍDKY PROJ = ČÍSLO NABÍDKY OCK (zadání 29. 7. 2026).
 * Na rozdíl od ostatních polí hlavičky tady vlastní hodnota v hlavičce PROJ
 * NEMÁ přednost – jedna zakázka nese jedno číslo, dokud se řada PROJ
 * neosamostatní. Kontroluje se krycí list i nabídka, protože dva dokumenty
 * s různým číslem jsou horší než jedno špatné číslo. */
const zakC = zk.novaZakazka();
zakC.cislo = '2026-OVP-CN-0500';
zakC.projHlavicka.cislo = '2026-PROJ-CN-9999';
const vC = zakC.varianty[0];
test('krycí list PROJ bere číslo nabídky z hlavičky OCK',
  najdi(kp.kryciProjData(zakC, vC, JEKLY, 'bo'), 'Číslo nabídky (CN)') === '2026-OVP-CN-0500',
  najdi(kp.kryciProjData(zakC, vC, JEKLY, 'bo'), 'Číslo nabídky (CN)'));
test('název souboru krycího listu PROJ nese číslo z OCK',
  /2026-OVP-CN-0500/.test(kp.kryciProjData(zakC, vC, JEKLY, 'bo').nazevSouboru),
  kp.kryciProjData(zakC, vC, JEKLY, 'bo').nazevSouboru);
test('vlastní číslo v hlavičce PROJ zůstalo v datech nedotčené',
  zakC.projHlavicka.cislo === '2026-PROJ-CN-9999', zakC.projHlavicka.cislo);
/* pole je navázané na ZAK.cislo – přepsáním se mění číslo celé zakázky */
const poleCislo = zakl2 => (zakl2.find(s => s.sekce === 'Základní údaje') || { pole: [] })
  .pole.find(p => p.id === 'cisloCN');
test('pole Číslo CN v PROJ je navázané na hlavičku OCK (ZAK.cislo)',
  poleCislo(kp.KRYCI_PROJ_SEKCE).bind === 'ZAK.cislo', poleCislo(kp.KRYCI_PROJ_SEKCE).bind);
/* kdyby OCK číslo nemělo, dokument nesmí zůstat bez čísla */
const zakD = zk.novaZakazka();
zakD.cislo = ''; zakD.projHlavicka.cislo = '2026-PROJ-CN-7777';
test('bez čísla v OCK se použije vlastní číslo PROJ',
  najdi(kp.kryciProjData(zakD, zakD.varianty[0], JEKLY, 'bo'), 'Číslo nabídky (CN)') === '2026-PROJ-CN-7777',
  najdi(kp.kryciProjData(zakD, zakD.varianty[0], JEKLY, 'bo'), 'Číslo nabídky (CN)'));

/* Základní údaje obou krycích listů se čtou vedle sebe, takže společná pole
 * musí mít stejné pořadí i stejné názvy. Bez téhle kontroly se listy zase
 * tiše rozejdou při první úpravě jednoho z nich. */
const zakl = def => (def.find(s => s.sekce === 'Základní údaje') || { pole: [] }).pole;
const zaklOck = zakl(kr.KRYCI_SEKCE), zaklProj = zakl(kp.KRYCI_PROJ_SEKCE);
const SPOLECNA = ['obchodnik', 'nazevAkce', 'cisloCN', 'adresaStavby', 'hodnotaBezDph'];
test('Základní údaje: OCK začíná společnými poli',
  zaklOck.slice(0, SPOLECNA.length).map(p => p.id).join(',') === SPOLECNA.join(','),
  zaklOck.map(p => p.id).join(','));
test('Základní údaje: PROJ má stejné pořadí společných polí',
  zaklProj.slice(0, SPOLECNA.length).map(p => p.id).join(',') === SPOLECNA.join(','),
  zaklProj.map(p => p.id).join(','));
SPOLECNA.forEach(id => {
  const a = zaklOck.find(p => p.id === id), b = zaklProj.find(p => p.id === id);
  test('Základní údaje: shodný název pole „' + id + '“',
    !!a && !!b && a.label === b.label, (a && a.label) + ' vs ' + (b && b.label));
});

// KL-4: obchodník z Nastavení → Firma
test('KL-4 jméno obchodníka z Nastavení → Firma',
  najdi(bo, 'Jméno obchodníka') === D.zpracoval, najdi(bo, 'Jméno obchodníka'));

// KL-6: scoring je odkaz
const poleScoringP = kp.KRYCI_PROJ_SEKCE.flatMap(s => s.pole).find(p => p.id === 'scoring');
test('KL-6 scoring je typu link', poleScoringP && poleScoringP.typ === 'link', poleScoringP && poleScoringP.typ);

// KL-7: patička s podpisem v obou verzích
test('KL-7 BO obsahuje sekci Podpis', sekBo.includes('Podpis'), sekBo.join('|'));
test('KL-7 Techdata obsahuje sekci Podpis', sekTd.includes('Podpis'), sekTd.join('|'));
test('KL-7 podpis obchodníka předvyplněn',
  najdi(bo, 'Podpis obchodníka') === D.zpracoval, najdi(bo, 'Podpis obchodníka'));

// 7) ruční přepis má přednost a nemíchá se s krycím listem OCK
v.data.kryci = { hodnoty: { obchodnik: 'Jan Novák' } };
v.data.kryciProj = { hodnoty: { obchodnik: 'Petr Projektant' } };
test('ruční přepis obchodníka v PROJ',
  najdi(kp.kryciProjData(zak, v, JEKLY, 'bo'), 'Jméno obchodníka') === 'Petr Projektant');
test('krycí list OCK zůstal se svým obchodníkem',
  najdi(kr.kryciData(zak, v, JEKLY, 'bo'), 'Jméno obchodníka') === 'Jan Novák');

(async () => {
  // 8) generování .docx přes jednotný registr + zpětné rozbalení ZIP
  const res = await dokumentVygeneruj('kryciproj_bo', null, zak, v, JEKLY);
  const bytes = new Uint8Array(await res.blob.arrayBuffer());
  test('BO .docx je ZIP (PK)', bytes[0] === 0x50 && bytes[1] === 0x4B);
  test('název souboru BO', /KRYCI_LIST_PROJ_Backoffice_2026-OVP-CN-9002/.test(res.nazevSouboru), res.nazevSouboru);
  const polozky = await docx.zipPrecti(bytes);
  const doc = polozky.find(p => p.nazev === 'word/document.xml');
  test('obsahuje word/document.xml', !!doc);
  const xml = new TextDecoder().decode(doc.data);
  test('document.xml obsahuje nadpis Krycí list zakázky PROJ', xml.includes('Krycí list zakázky PROJ'));
  test('document.xml obsahuje Platební podmínky', xml.includes('Platební podmínky'));
  test('document.xml obsahuje ruční hodnotu (Petr Projektant)', xml.includes('Petr Projektant'));
  test('document.xml má tabulku', xml.includes('<w:tbl>'));

  const res2 = await dokumentVygeneruj('kryciproj_techdata', null, zak, v, JEKLY);
  const b2 = new Uint8Array(await res2.blob.arrayBuffer());
  const xml2 = new TextDecoder().decode((await docx.zipPrecti(b2)).find(p => p.nazev === 'word/document.xml').data);
  test('Techdata obsahuje Atypy a rizika PROJ', xml2.includes('Atypy a rizika PROJ'));
  test('Techdata obsahuje nadpis Techdata', xml2.includes('Techdata'));
  test('název souboru Techdata', /KRYCI_LIST_PROJ_Techdata_/.test(res2.nazevSouboru), res2.nazevSouboru);

  console.log(fail ? `\n${fail} CHYB` : '\nVŠECHNY TESTY KRYCÍ LIST PROJ OK');
  process.exit(fail ? 1 : 0);
})();
