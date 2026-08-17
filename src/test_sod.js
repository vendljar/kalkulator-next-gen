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

// ---- plná moc ---------------------------------------------------------------
const pm = plnaMocData(zak, v);
test('plná moc nese firemní údaje ({{FIRMA_*}})',
  'FIRMA_NAZEV' in pm.placeholders && 'FIRMA_SIDLO' in pm.placeholders && 'FIRMA_ICO' in pm.placeholders);
test('plná moc nese adresu stavby z hlavičky PROJ', pm.placeholders.ADRESA === 'Zkušební 9, Praha');
test('plná moc má vlastní jméno souboru', pm.nazevSouboru.indexOf('PLNA_MOC') === 0, pm.nazevSouboru);
test('symboly PM_* (zmocnitel) se neplní — doplní se ručně',
  !('PM_ZMOCNITEL' in pm.placeholders));
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

console.log('\nPASS=' + passes + ' FAIL=' + fails);
process.exit(fails ? 1 : 0);
