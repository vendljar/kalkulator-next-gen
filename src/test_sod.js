/* Test: generování smluv a plné moci z dat aplikace (#143, 14. 8. 2026)
 *
 * SoD realizace (typ `sod`), SoD projekčních prací (`sodProj`) a plná moc
 * (`plnaMoc`) se plní STEJNÝMI daty jako cenové nabídky — buildery smluv
 * jsou obálky nad nabidkaData/nabidkaProjData, takže smlouva nikdy nemůže
 * nést jinou cenu než nabídka, ze které vzešla. Symboly, které aplikace
 * nezná (termíny, splátky, zástupci objednatele — SOD_*, SODP_*, PM_*,
 * OBJEDNATEL_*), zůstávají v dokumentu VIDITELNÉ jako {{…}} a doplní se
 * ve Wordu; docxgen neznámý symbol nechává být (nahradPlaceholdery).
 */
const nacti = f => { const m = require(f); Object.keys(m).forEach(k => { global[k] = m[k]; }); };
nacti('./preklad.js'); nacti('./format.js'); nacti('./engine.js'); nacti('./engine_proj.js');
nacti('./techspec.js'); nacti('./zakazka.js'); nacti('./zamek.js'); nacti('./sleva.js');
nacti('./zaokrouhleni.js'); nacti('./firma.js'); nacti('./zpracovatel.js');
nacti('./kryci.js'); nacti('./kryci_proj.js'); nacti('./dokumenty.js');
nacti('./nabidka.js'); nacti('./nabidka_proj.js');
const ZC = require('./zkusebni_cenik.js');
global.DEFAULT_CENIK = ZC.zkusebniCenik();
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
nacti('./sod.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let fails = 0, passes = 0;
function test(name, cond, info) {
  if (cond) { passes++; console.log('  ok  ' + name); }
  else { fails++; console.log('  FAIL ' + name + (info !== undefined ? '  -> ' + JSON.stringify(info) : '')); }
}

const zak = novaZakazka();
zak.cislo = '2026 - OPR - CN - 0155';
zak.objednatel = 'SVJ Zkušební 9'; zak.adresa = 'Zkušební 9, Praha';
zak.nazevAkce = 'Přístavba výtahu — test SoD';
Object.assign(zak.projHlavicka, { cislo: '2026 OVP CN 0155', objednatel: 'SVJ Zkušební 9',
  adresa: 'Zkušební 9, Praha', nazevAkce: 'Projekce — test SoD' });
const v = zak.varianty[0];

// ---- registrace v jednotném registru dokumentů ------------------------------
['sod', 'sodProj', 'plnaMoc'].forEach(typ =>
  test('dokument „' + typ + '" je registrovaný', !!DOKUMENTY[typ]));

// ---- SoD realizace = data nabídky OCK ---------------------------------------
const sod = sodData(zak, v, JEKLY, 'cz');
const nab = nabidkaData(zak, v, JEKLY, 'cz');
test('SoD realizace nese cenu z nabídky OCK (stejné číslo, žádný druhý výpočet)',
  sod.placeholders.CENA_BEZ_DPH === nab.placeholders.CENA_BEZ_DPH,
  [sod.placeholders.CENA_BEZ_DPH, nab.placeholders.CENA_BEZ_DPH]);
test('SoD nese objednatele z hlavičky OCK', sod.placeholders.OBJEDNATEL === 'SVJ Zkušební 9');
test('SoD nese platební podmínky z krycího listu (PODM_*)',
  'PODM_SPLATNOST_DNI_CISLO' in sod.placeholders && 'PODM_POKUTA_SPLATNOST_PROC' in sod.placeholders,
  Object.keys(sod.placeholders).filter(k => k.startsWith('PODM_')).length + ' PODM_ symbolů');
test('SoD má vlastní jméno souboru', sod.nazevSouboru.indexOf('SOD_') === 0, sod.nazevSouboru);
test('jméno souboru SoD nenese zakázané znaky', !/[\\/:*?"<>|]/.test(sod.nazevSouboru));
/* SOD_* symboly builder NEPLNÍ — mají v dokumentu zůstat vidět k doplnění.
 * Kdyby je plnil prázdnem, zmizely by a nikdo by nevěděl, že tam co chybí. */
test('symboly SOD_* se neplní (zůstávají viditelné k doplnění)',
  !('SOD_TERMIN_MONTAZ_OD' in sod.placeholders) && !('SOD_CISLO_SMLOUVY' in sod.placeholders));

// ---- SoD projekce = data nabídky PROJ ---------------------------------------
const sodP = sodProjData(zak, v, 'cz');
const nabP = nabidkaProjData(zak, v, 'cz');
test('SoD projekce nese cenu z nabídky PROJ',
  sodP.placeholders.PROJ_CELKEM_BEZ_DPH === nabP.placeholders.PROJ_CELKEM_BEZ_DPH);
/* Číslo nabídky PROJ se bere z hlavičky OCK (rozhodnutí 29. 7. 2026 —
 * jedna zakázka, jedno číslo; projCisloNabidky v zakazka.js). Smlouva ho
 * jen zrcadlí z nabídky PROJ, nesmí si vymýšlet vlastní. */
test('SoD projekce nese stejné číslo nabídky jako nabídka PROJ',
  sodP.placeholders.CISLO_NABIDKY === nabP.placeholders.CISLO_NABIDKY
  && sodP.placeholders.CISLO_NABIDKY === '2026-OPR-CN-0155', sodP.placeholders.CISLO_NABIDKY);
test('SoD projekce má vlastní jméno souboru', sodP.nazevSouboru.indexOf('SOD_PROJ_') === 0,
  sodP.nazevSouboru);
test('symboly SODP_* se neplní (platby po fázích doplní obchodník)',
  !('SODP_PLATBA1_KC' in sodP.placeholders));

// ---- OBJEDNATEL_SIDLO / OBJEDNATEL_ICO / OBJEDNATEL_DIC (19. 8. 2026) -------
/* Šablony SoD tyhle symboly používají, ale aplikace je do 19. 8. neposílala,
 * takže smlouva zela {{…}} i tam, kde zakázka údaje MÁ. Plní se JEN
 * neprázdné hodnoty: prázdný symbol má v dokumentu zůstat viditelně
 * k ručnímu doplnění — nikdy se nesmí nahradit prázdnem. */
const zakU = novaZakazka();
zakU.cislo = '2026 - OPR - CN - 0156';
zakU.objednatel = 'SVJ Zkušební 9'; zakU.nazevAkce = 'SoD s údaji objednatele';
zakU.adresaObjednatele = 'Sídlištní 12, Praha 4';
zakU.ico = '12345678'; zakU.dic = 'CZ12345678';
const sodU = sodData(zakU, zakU.varianty[0], JEKLY, 'cz');
test('SoD nese sídlo objednatele (OBJEDNATEL_SIDLO)',
  sodU.placeholders.OBJEDNATEL_SIDLO === 'Sídlištní 12, Praha 4');
test('SoD nese IČO objednatele (OBJEDNATEL_ICO)',
  sodU.placeholders.OBJEDNATEL_ICO === '12345678');
test('SoD nese DIČ objednatele (OBJEDNATEL_DIC)',
  sodU.placeholders.OBJEDNATEL_DIC === 'CZ12345678');
const sodPU = sodProjData(zakU, zakU.varianty[0], 'cz');
test('SoD projekce nese OBJEDNATEL_SIDLO/ICO/DIC stejně',
  sodPU.placeholders.OBJEDNATEL_SIDLO === 'Sídlištní 12, Praha 4'
  && sodPU.placeholders.OBJEDNATEL_ICO === '12345678'
  && sodPU.placeholders.OBJEDNATEL_DIC === 'CZ12345678');
/* prázdné údaje → symbol se NEplní a v dokumentu zůstává vidět */
test('prázdné sídlo/IČO/DIČ se do placeholders nedávají (symbol zůstane vidět)',
  !('OBJEDNATEL_SIDLO' in sod.placeholders) && !('OBJEDNATEL_ICO' in sod.placeholders)
  && !('OBJEDNATEL_DIC' in sod.placeholders));
const xmlU = '<w:t>{{OBJEDNATEL_SIDLO}} {{OBJEDNATEL_DIC}}</w:t>';
test('nevyplněný symbol objednatele zůstává v dokumentu viditelný',
  require('./docxgen.js').nahradPlaceholdery(xmlU, sod.placeholders)
    .includes('{{OBJEDNATEL_SIDLO}}'));
/* nové pole dic v zakázce + dotažení z ARES */
test('novaZakazka má pole dic (prázdné)', novaZakazka().dic === '');
test('ARES_POLE nabízí DIČ objednatele',
  (() => { const A = require('./ares.js');
    const p = A.ARES_POLE.find(x => x.klic === 'dic');
    return !!p && p.label === 'DIČ objednatele' && p.z({ dic: 'CZ999' }) === 'CZ999'; })());
/* zamčené symboly se dál NEplní (rozhodnutí trvá) */
test('OBJEDNATEL_ZASTUPCE_* a OBJEDNATEL_BANKA se dál neplní',
  !('OBJEDNATEL_ZASTUPCE_JMENO' in sodU.placeholders)
  && !('OBJEDNATEL_BANKA' in sodU.placeholders)
  && !('OBJEDNATEL_UCET' in sodU.placeholders));

// ---- plná moc ---------------------------------------------------------------
const pm = plnaMocData(zak, v);
test('plná moc nese firemní údaje ({{FIRMA_*}})',
  'FIRMA_NAZEV' in pm.placeholders && 'FIRMA_SIDLO' in pm.placeholders && 'FIRMA_ICO' in pm.placeholders);
test('plná moc nese adresu stavby z hlavičky PROJ', pm.placeholders.ADRESA === 'Zkušební 9, Praha');
test('plná moc má vlastní jméno souboru', pm.nazevSouboru.indexOf('PLNA_MOC') === 0, pm.nazevSouboru);
test('prázdné pole plné moci se neplní — ve Wordu zůstane {{…}} k dopsání',
  !('PM_ZMOCNITEL_NAROZEN' in pm.placeholders));

/* Od 23. 8. 2026 mají zmocnitel i jednající osoba pole v krycím listu PROJ
 * (zadání J. V.: „máme všechny žluté položky plné moci a smlouvy postiženy
 * v krycím listu?"). Vyplněné se do dokumentu propíšou, prázdné zůstanou
 * viditelné jako {{…}} — prázdné plnění by symbol beze stopy smazalo. */
{
  const zakPM = novaZakazka();
  zakPM.adresa = 'Pod Kavalírkou 38, Praha 5';
  const vPM = zakPM.varianty[0];
  vPM.data.kryciProj = { hodnoty: {
    pmZmocnitel: 'Jan Novák', pmZmocnitelNarozen: '1. 1. 1970',
    pmZmocnitelBytem: 'Pod Kavalírkou 38, Praha 5', pmJednajici: 'Ing. Jiří Skovajsa, jednatel',
  } };
  const pm2 = plnaMocData(zakPM, vPM);
  test('zmocnitel z krycího listu PROJ jde do plné moci',
    pm2.placeholders.PM_ZMOCNITEL === 'Jan Novák'
    && pm2.placeholders.PM_ZMOCNITEL_NAROZEN === '1. 1. 1970'
    && pm2.placeholders.PM_ZMOCNITEL_BYTEM === 'Pod Kavalírkou 38, Praha 5',
    JSON.stringify(pm2.placeholders.PM_ZMOCNITEL));
  test('jednající osoba zhotovitele jde do plné moci',
    pm2.placeholders.PM_JEDNAJICI === 'Ing. Jiří Skovajsa, jednatel');

  vPM.data.kryciProj.hodnoty.sodpPlatba1 = '95 880 Kč';
  vPM.data.kryciProj.hodnoty.sodpSpravniPoplatky = '5 000 Kč';
  vPM.data.kryciProj.hodnoty.objPodpis2Jmeno = 'Petra Dvořáková';
  vPM.data.kryciProj.hodnoty.objKopie1 = 'vybor1@svj.cz';
  const sodP = sodProjData(zakPM, vPM);
  test('splátky a doplňky z krycího listu jdou do SoD projekce',
    sodP.placeholders.SODP_PLATBA1_KC === '95 880 Kč'
    && sodP.placeholders.SODP_SPRAVNI_POPLATKY === '5 000 Kč'
    && sodP.placeholders.OBJEDNATEL_PODPIS2_JMENO === 'Petra Dvořáková'
    && sodP.placeholders.OBJEDNATEL_KONTAKT_KOPIE1 === 'vybor1@svj.cz');
  test('nevyplněná splátka zůstane ve smlouvě vidět jako {{…}}',
    !('SODP_PLATBA5_KC' in sodP.placeholders));
}
/* Když hlavička PROJ adresu nemá, bere se adresa stavby z hlavičky OCK —
 * plná moc se vyřizuje pro OBJEKT, ne pro konkrétní kalkulaci. */
const zakBez = novaZakazka(); zakBez.adresa = 'Náhradní 1, Brno';
test('bez adresy v hlavičce PROJ spadne plná moc na adresu OCK',
  plnaMocData(zakBez, zakBez.varianty[0]).placeholders.ADRESA === 'Náhradní 1, Brno');

// ---- zamykání ---------------------------------------------------------------
test('SoD realizace zamyká variantu (podepsaná smlouva se needituje)', dokumentZamyka('sod'));
test('SoD projekce zamyká variantu', dokumentZamyka('sodProj'));
test('plná moc variantu NEZAMYKÁ (administrativa, ne cena)', !dokumentZamyka('plnaMoc'));

// ---- neznámé symboly zůstávají v dokumentu ----------------------------------
const { nahradPlaceholdery } = require('./docxgen.js');
const xml = '<w:t>{{OBJEDNATEL}} … {{SOD_TERMIN_MONTAZ_OD}}</w:t>';
const po = nahradPlaceholdery(xml, sod.placeholders);
test('známý symbol se vyplní, neznámý zůstane viditelný',
  po.includes('SVJ Zkušební 9') && po.includes('{{SOD_TERMIN_MONTAZ_OD}}'), po);

/* ---- zástupci a kontakty zákazníka (20. 8. 2026) ---------------------------
 * Symboly, které do 20. 8. zůstávaly ve smlouvě prázdné. Sada hlídá tři věci:
 * telefon a e-mail jsou v aplikaci DVĚ pole a slepenec vzniká až tady;
 * osoba ve věcech smluvních plní i podpisovou doložku (je to týž člověk);
 * a prázdné pole se nikdy nevloží jako prázdno — symbol musí zůstat vidět. */
const zakZ = JSON.parse(JSON.stringify(zak));
zakZ.zastupci = {
  smluvniJmeno: 'Ing. Petr Sedlák', smluvniPozice: 'předseda výboru',
  smluvniTel: '+420 601 111 222', smluvniEmail: 'sedlak@svj.cz',
  obchodniJmeno: 'Jana Malá', obchodniTel: '+420 602 333 444', obchodniEmail: '',
  technickyJmeno: 'Karel Technik', technickyTel: '', technickyEmail: 'technik@svj.cz',
  fakturyEmail: 'faktury@svj.cz', fakturyTel: '',
  banka: 'Komerční banka, a.s.', ucet: '123456789/0100', zapis: 'spolkový rejstřík MS v Praze',
};
const ph = sodData(zakZ, v, JEKLY, 'cz').placeholders;
test('bankovní a rejstříkové údaje zákazníka se vyplní',
  ph.OBJEDNATEL_BANKA === 'Komerční banka, a.s.' && ph.OBJEDNATEL_UCET === '123456789/0100'
  && ph.OBJEDNATEL_ZAPIS === 'spolkový rejstřík MS v Praze');
test('zástupce ve věcech smluvních nese jméno i pozici',
  ph.OBJEDNATEL_ZASTUPCE_SMLUVNI === 'Ing. Petr Sedlák, předseda výboru', ph.OBJEDNATEL_ZASTUPCE_SMLUVNI);
test('a je to zároveň podepisující osoba (žádná zvláštní podpisová pole)',
  ph.OBJEDNATEL_PODPIS_JMENO === 'Ing. Petr Sedlák' && ph.OBJEDNATEL_PODPIS_FUNKCE === 'předseda výboru');
test('telefon a e-mail se slepí až do dokumentu, každý z vlastního pole',
  ph.OBJEDNATEL_ZASTUPCE_OBCHODNI_KONTAKT === '+420 602 333 444'
  && ph.OBJEDNATEL_ZASTUPCE_TECHNICKY_KONTAKT === 'technik@svj.cz',
  ph.OBJEDNATEL_ZASTUPCE_OBCHODNI_KONTAKT + ' | ' + ph.OBJEDNATEL_ZASTUPCE_TECHNICKY_KONTAKT);
test('nevyplněný symbol se NEplní prázdnem (zůstane {{…}} v dokumentu)',
  ph.SOD_TERMIN_DOKONCENI === undefined && ph.OBJEDNATEL_ZASTUPCE_OBCHODNI === 'Jana Malá');

const { sodVedouciMontaziDoplna } = require('./sod.js');
const vedM = sodVedouciMontaziDoplna({ FIRMA_VEDOUCI_MONTAZI: 'Tomáš Montér',
  FIRMA_VEDOUCI_MONTAZI_TEL: '+420 603 555 666', FIRMA_VEDOUCI_MONTAZI_EMAIL: 'monter@firma.cz' });
test('vedoucí montáží se překládá z firemního údaje na smluvní symbol',
  vedM.SOD_VEDOUCI_MONTAZI === 'Tomáš Montér'
  && vedM.SOD_VEDOUCI_MONTAZI_KONTAKT === '+420 603 555 666 / monter@firma.cz');
test('a bez firemního údaje se symbol nevyrobí',
  sodVedouciMontaziDoplna({}).SOD_VEDOUCI_MONTAZI === undefined);

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
