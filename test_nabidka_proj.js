/* Test nabidka.js – kompletnost placeholderů a základní hodnoty */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const zk = require('./zakazka.js');
const fm = require('./firma.js');   // SET-3 – firemní údaje do nabídky
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const { nabidkaData } = require('./nabidka.js');
const JEKLY = JSON.parse(require('fs').readFileSync(__dirname + '/jekly.json', 'utf8'));

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9001'; zak.objednatel = 'Vzorový odběratel s.r.o.'; zak.kontakt = 'Ing. Jan Vzorový / jednatel';
zak.adresa = 'Vzorová 163/17, Praha 10'; zak.datum = '2026-04-21';
zak.varianty[0].data.ock.fixes = true;   // tyto testy ověřují opravený režim (výchozí je nyní 1:1 Excel)
const v = zak.varianty[0];
const d = nabidkaData(zak, v, JEKLY);
const p = d.placeholders;

/* Očekávané částky se DOPOČÍTÁVAJÍ ze stejného ceníku, ne opisují jako čísla.
 * V repozitáři jsou ukázkové ceny (skutečné leží v _DB/_program.json), takže
 * opsaná částka by hlídala vzorek místo toho, co má: že se do nabídky dostane
 * přesně to, co spočítal engine, a se správným naformátováním. */
const C = v.data.cenik;
const R = eng.vypocet(v.data.ock.zadani, C, JEKLY, true);
const kc = x => x.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Kč';

// všechny placeholdery šablony musí existovat a nebýt undefined
const POZADOVANE = ['OBJEDNATEL','OBJEDNATEL_KONTAKT','DATUM','NAZEV_AKCE','CISLO_NABIDKY','ADRESA',
 'TS_UMISTENI','TS_UMISTENI_STROJE','TS_ULOZENI','TS_VYSKA_CELKOVA','TS_SIRKA_VNITRNI','TS_HLOUBKA_VNITRNI',
 'TS_SIRKA_VNEJSI','TS_HLOUBKA_VNEJSI','TS_ZDVIH','TS_DOLNI_PREJEZD','TS_HORNI_PREJEZD','TS_STANICE','TS_KABINA',
 'TS_PUDORYS','TS_USAZENI_CELNI','TS_USAZENI_BOCNI','TS_USAZENI_ZADNI','TS_TYP_KONSTRUKCE','TS_SVISLE_NOSNE',
 'TS_PROFIL_SLOUPKU','TS_VODOROVNE_NOSNE','TS_ROZTEC','TS_PROFIL_PRICNIKU','TS_KOTVENI_POLOHA','TS_KOTVENI_TYP',
 'TS_PORTALY_PROSTOR','TS_PORTALY_CLENENI','TS_POVRCH_UPRAVA','TS_HAKY','TS_STRECHA','TS_POZARNI',
 'TS_TYP_OPLASTENI','TS_MATERIAL_OPLASTENI','TS_POVRCH_OPLASTENI','TS_OPLASTENI_CELA','TS_ROZSAH_OPLASTENI',
 'TS_OPLASTENI_NADSVETLIKU','TS_UMISTENI_OPLASTENI','TS_KOTVENI_OPLASTENI','TS_PARAMETRY_KOTVY','TS_NAPOJENI_DVERI',
 'TS_MONTAZNI_NOSNIK','TS_PRIPRAVA_KOTVENI','TS_ODVETRANI','TS_PODCHOZI_OCK','TS_PRECHODOVE_PLECHY',
 'TS_LESENI_UVNITR','TS_LESENI_VNE','TS_ZABRANY_VSTUPY','TS_SKEN3D','TS_VYSTUP_ZAMERENI','TS_DILENSKA_DOK',
 'TS_STATIKA','TS_NENI_OSVETLENI','TS_NENI_VENTILATOR','TS_NENI_LESENI','TS_NENI_ODBERNE','TS_NENI_ULOZNE',
 'TS_NENI_DOZDENI','TS_NENI_STAVEBNI','TS_NENI_SOKL','TS_NENI_NAPAJENI','TS_NENI_PROHLUBEN','TS_NENI_PRISTUP',
 'CENA_BEZ_DPH','DPH_SAZBA','DPH_NAZEV','DPH_KC','CENA_S_DPH','PRIP_LESENI_VNEJSI','PRIP_SKN']
 .concat(fm.firmaSymboly());   // FIRMA_* (SET-3)
const chybi = POZADOVANE.filter(k => p[k] == null || String(p[k]).includes('undefined'));
test('všech ' + POZADOVANE.length + ' placeholderů vyplněno', chybi.length === 0, chybi.join(','));

test('datum česky', p.DATUM === '21.04.2026', p.DATUM);
test('vnitřní šířka mm', p.TS_SIRKA_VNITRNI === '1510', p.TS_SIRKA_VNITRNI);
test('zdvih', p.TS_ZDVIH === '17,325', p.TS_ZDVIH);
test('umístění z kalkulace', p.TS_UMISTENI === 'v exteriéru', p.TS_UMISTENI);
const norm = s => String(s).replace(/[\s  ]/g, ' ');   // toLocaleString používá nezlomitelné mezery
/* Koncová cena bez DPH = základ z kalkulace (bez slevy a bez zaokrouhlení –
 * zakázka žádnou slevu nemá a cenaNabidkyOck() tu v Node není podstrčené,
 * takže nabidka.js jde stejnou cestou jako tenhle výpočet). */
test('cena bez DPH odpovídá souhrnu z kalkulace', norm(p.CENA_BEZ_DPH) === norm(kc(R.souhrn.zakladCena)),
  p.CENA_BEZ_DPH + ' vs ' + kc(R.souhrn.zakladCena));
test('DPH je z téže částky', norm(p.DPH_KC) === norm(kc(R.souhrn.zakladCena * C.dph)), p.DPH_KC);
test('cena s DPH je z téže částky',
  norm(p.CENA_S_DPH) === norm(kc(R.souhrn.zakladCena * (1 + C.dph))), p.CENA_S_DPH);
test('DPH sazba', p.DPH_SAZBA === '12' && p.DPH_NAZEV === 'snížená', p.DPH_SAZBA);
test('příplatek SKN je částka', /Kč$/.test(p.PRIP_SKN), p.PRIP_SKN);
test('lešení vnější jako příplatek', /Kč$/.test(p.PRIP_LESENI_VNEJSI), p.PRIP_LESENI_VNEJSI);
test('sokl není v dodávce', p.TS_NENI_SOKL === 'není součástí nabídky');
test('název souboru', d.nazevSouboru === 'NABÍDKA_2026-OPR-CN-9001', d.nazevSouboru);

// lešení vnější zvolené ve volitelných => „v základní ceně“
const v2 = JSON.parse(JSON.stringify(v));
v2.data.ock.zadani.volitelne.leseniVnejsi = true;
test('lešení v základní ceně', nabidkaData(zak, v2, JEKLY).placeholders.PRIP_LESENI_VNEJSI === 'v základní ceně');

// příplatky do nabídky: seznam s množstvím a cenou, filtr přes priplatkyVynechat
test('příplatky obsahují položky', d.priplatky.length >= 5, d.priplatky.length);
test('příplatek má množství v popisu', d.priplatky.every(x => x.popis.startsWith('množství: ')));
test('příplatek má cenu v Kč', d.priplatky.every(x => /Kč$/.test(x.cena)));
const vV = JSON.parse(JSON.stringify(v));
vV.data.ock.zadani.priplatkyVynechat = ['skn', 'ventilator'];
const dV = nabidkaData(zak, vV, JEKLY);
test('vynechané příplatky se negenerují', dV.priplatky.length === d.priplatky.length - 2
  && !dV.priplatky.some(x => x.nazev.includes('SKN')), dV.priplatky.length);

// ruční přepis množství v kalkulaci se propíše do ceny
const vM = JSON.parse(JSON.stringify(v));
vM.data.ock.zadani.mnozstviPrepis = { 'HÁKY NA MYTÍ ŠACHTY (EXT)': 6 };
const rM = eng.vypocet(vM.data.ock.zadani, vM.data.cenik, JEKLY, true);
const haky = rM.sekce.volitelne.find(x => x.nazev.includes('HÁKY'));
test('přepis množství háků 3→6', haky.mnozstvi === 6 && haky.naklad === 6 * C.hakyKc && haky.prepsano, haky.naklad);
const rM0 = eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, true);
test('bez přepisu háky 3 ks', rM0.sekce.volitelne.find(x => x.nazev.includes('HÁKY')).naklad === 3 * C.hakyKc);

// vlastní ruční položka ve Volitelných
const vC = JSON.parse(JSON.stringify(v));
vC.data.ock.zadani.volitelneVlastni = [{ nazev: 'Atypický žebřík', mnozstvi: 2, cena: 4500 }];
const rC = eng.vypocet(vC.data.ock.zadani, vC.data.cenik, JEKLY, true);
const zebrik = rC.sekce.volitelne.find(x => x.nazev === 'Atypický žebřík');
test('vlastní položka ve volitelných',
  zebrik && zebrik.naklad === 9000 && Math.abs(zebrik.sMarzi - 9000 * (1 + C.marze)) < 0.01,
  zebrik && [zebrik.naklad, zebrik.sMarzi]);

// struktura náhledu po sekcích (9 původních + DODAVATEL ze SET-3)
const sekce = require('./nabidka.js').nabidkaNahledSekce(p);
test('náhled má 10 sekcí (vč. dodavatele)', sekce.length === 10, sekce.length);
test('náhled: základní parametry 14 řádků', sekce[1].radky.length === 14, sekce[1].radky.length);
const dod = sekce[sekce.length - 1];
test('poslední sekce je DODAVATEL', dod.sekce === 'DODAVATEL', dod.sekce);
test('dodavatel obsahuje název firmy', dod.radky.some(r => r[1] === fm.DEFAULT_FIRMA.nazev),
  JSON.stringify(dod.radky[0]));

// --- SET-3: firemní údaje v placeholderech ---
const FD = fm.DEFAULT_FIRMA;
test('FIRMA_NAZEV z výchozích údajů', p.FIRMA_NAZEV === FD.nazev, p.FIRMA_NAZEV);
test('FIRMA_SIDLO složené z ulice/PSČ/města',
  p.FIRMA_SIDLO === FD.sidloUlice + ', ' + FD.sidloPsc + ' ' + FD.sidloMesto, p.FIRMA_SIDLO);
test('FIRMA_KORESPONDENCNI = sídlo (shodná adresa)', p.FIRMA_KORESPONDENCNI === p.FIRMA_SIDLO, p.FIRMA_KORESPONDENCNI);
test('FIRMA_ICO_DIC bez prázdného DIČ', p.FIRMA_ICO_DIC === 'IČO: ' + FD.ico, p.FIRMA_ICO_DIC);
test('FIRMA_PATICKA obsahuje název, sídlo i web',
  [FD.nazev, FD.sidloUlice, FD.web].every(x => p.FIRMA_PATICKA.includes(x)), p.FIRMA_PATICKA);
test('FIRMA_ZPRACOVAL vyplněn', p.FIRMA_ZPRACOVAL === FD.zpracoval, p.FIRMA_ZPRACOVAL);

// ruční přepis v technické specifikaci má přednost
const v3 = JSON.parse(JSON.stringify(v));
v3.data.techspec.hodnoty.rozsahOplasteni = 'pravá stěna cca polovinou bez opláštění';
v3.data.techspec.hodnoty.rozmerVnejsi = '1730 × 1665';
const p3 = nabidkaData(zak, v3, JEKLY).placeholders;
test('ruční rozsah opláštění', p3.TS_ROZSAH_OPLASTENI === 'pravá stěna cca polovinou bez opláštění');
test('vnější rozměr z přepisu', p3.TS_SIRKA_VNEJSI === '1730' && p3.TS_HLOUBKA_VNEJSI === '1665',
     p3.TS_SIRKA_VNEJSI + '/' + p3.TS_HLOUBKA_VNEJSI);

console.log(fail ? `\n${fail} TESTŮ SELHALO` : '\nVŠECHNY TESTY NABÍDKA OK');
process.exit(fail ? 1 : 0);
