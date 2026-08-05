/* Test – složková databáze zakázek (uloziste.js).
 *
 * Testuje se model, ne souborové API: výběr složky a zápis na disk umí
 * jen prohlížeč a ověřily ho sondy (pokus_db*.mjs) plus zkušební stránka
 * na uživatelově počítači. Tady jde o pravidla, na kterých to stojí –
 * jak se jmenuje soubor, co se ještě považuje za zakázku, co drží
 * rejstřík a kdy se soubor nesmí přepsat kvůli uzamčené nabídce.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne. Funkce
 * sdílené mezi moduly se musí globalizovat ručně, jinak guardy
 * `typeof fn === 'function'` tiše spadnou do záložní větve a test by
 * ověřoval jinou cestu kódem, než jaká poběží v aplikaci. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil; global.slevaDefault = sl.slevaDefault;
const zk = require('./zakazka.js');
global.novaVarianta = zk.novaVarianta; global.novaVariantaData = zk.novaVariantaData;
global.aktivniVarianta = zk.aktivniVarianta; global.ridiciVarianta = zk.ridiciVarianta;
global.hlavickaVyplneno = zk.hlavickaVyplneno; global.ZAK_CISLO_PREDLOHA = zk.ZAK_CISLO_PREDLOHA;
const zm = require('./zamek.js');
global.zajistiZamek = zm.zajistiZamek; global.variantaCislo = zm.variantaCislo;
global.variantaUzamcena = zm.variantaUzamcena; global.zamekInfo = zm.zamekInfo;
global.dokumentZamyka = zm.dokumentZamyka; global.dokumentPopis = zm.dokumentPopis;
const sez = require('./seznam.js');
global.seznamNorm = sez.seznamNorm; global.seznamSlova = sez.seznamSlova;

const { novaZakazka } = zk;
const { zamkniVariantu, odemkniVariantu, klonujVariantu } = zm;
const U = require('./uloziste.js');
const { uloJmenoSouboru, uloJeZakazkovySoubor, uloKlicSouboru,
        uloRejstrikZaznam, uloRejstrikNormalizuj, uloRejstrikSloucit,
        uloRejstrikOdeber, uloRejstrikSerad, uloHledej,
        uloKontrolaZamku, uloProblemPopis, uloKolize, uloRazitko,
        uloRazitkoNove, ULO_REJSTRIK_SOUBOR,
        uloZalohaRozhodni, uloZalohaStariDni, ULO_ZALOHA_STARI_DNI } = U;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const zakazka = (cislo, opts) => {
  opts = opts || {};
  const z = novaZakazka();
  if (cislo != null) z.cislo = cislo;
  if (opts.nazevAkce != null) z.nazevAkce = opts.nazevAkce;
  if (opts.objednatel != null) z.objednatel = opts.objednatel;
  if (opts.datum != null) z.datum = opts.datum;
  return z;
};

/* ---------- 1) jméno souboru ---------- */

test('číslo zakázky dá čisté jméno souboru',
  uloJmenoSouboru(zakazka('2026 - OPR - CN - 0500')) === '2026-OPR-CN-0500.json',
  uloJmenoSouboru(zakazka('2026 - OPR - CN - 0500')));

test('diakritika a lomítka ve jménu nepřežijí',
  uloJmenoSouboru(zakazka('2026/OPR Žďár – CN 12')) === '2026-OPR-Zdar-CN-12.json',
  uloJmenoSouboru(zakazka('2026/OPR Žďár – CN 12')));

test('tečka přípony varianty zůstává (číslování #17)',
  uloKlicSouboru('2026 - OPR - CN - 0500.2') === '2026-OPR-CN-0500.2',
  uloKlicSouboru('2026 - OPR - CN - 0500.2'));

const bezCisla = zakazka(null, { datum: '2026-07-30' });
test('zakázka s nevyplněnou předlohou čísla dostane náhradní jméno',
  /^bez-cisla-2026-07-30-v[A-Za-z0-9]+\.json$/.test(uloJmenoSouboru(bezCisla)),
  uloJmenoSouboru(bezCisla));

test('dvě nevyplněné zakázky se nepřepíšou navzájem',
  uloJmenoSouboru(zakazka(null, { datum: '2026-07-30' })) !== uloJmenoSouboru(bezCisla));

test('jméno vyrobené z čísla projde vlastním filtrem',
  uloJeZakazkovySoubor(uloJmenoSouboru(zakazka('2026 - OPR - CN - 0500'))));

test('náhradní jméno bez čísla projde vlastním filtrem',
  uloJeZakazkovySoubor(uloJmenoSouboru(bezCisla)));

/* ---------- 2) co je a co není soubor zakázky ---------- */

test('běžný soubor zakázky projde', uloJeZakazkovySoubor('2026-OPR-CN-0500.json'));
test('velké .JSON projde taky', uloJeZakazkovySoubor('2026-OPR-CN-0500.JSON'));
test('rejstřík se za zakázku nepovažuje', !uloJeZakazkovySoubor(ULO_REJSTRIK_SOUBOR));
test('soubor bez přípony neprojde', !uloJeZakazkovySoubor('2026-OPR-CN-0500'));
test('jiná přípona neprojde', !uloJeZakazkovySoubor('2026-OPR-CN-0500.txt'));
test('dočasný soubor synchronizace neprojde', !uloJeZakazkovySoubor('.tmp-0500.json'));
test('prázdné jméno neprojde', !uloJeZakazkovySoubor('.json'));
test('konfliktní kopie z Disku Google neprojde',
  !uloJeZakazkovySoubor('2026-OPR-CN-0500 (konfliktní kopie počítače notebook-jv 2026-07-30).json'));
test('kopie s pořadím v závorce neprojde', !uloJeZakazkovySoubor('2026-OPR-CN-0500 (1).json'));
test('mezera ve jménu neprojde', !uloJeZakazkovySoubor('2026 OPR CN 0500.json'));
test('null neprojde', !uloJeZakazkovySoubor(null));

/* ---------- 3) záznam v rejstříku ---------- */

const z1 = zakazka('2026 - OPR - CN - 0500', { nazevAkce: 'Výtah Ostrava', objednatel: 'Novák s.r.o.', datum: '2026-07-20' });
klonujVariantu(z1, z1.varianty[0].id);
zamkniVariantu(z1.varianty[0], { typ: 'nabidka', cislo: '2026 - OPR - CN - 0500' });
const r1 = uloRejstrikZaznam(z1, { razitko: '2026-07-30T10:00:00.000Z' });

test('záznam nese soubor, číslo, akci a objednatele',
  r1.soubor === '2026-OPR-CN-0500.json' && r1.cislo === '2026 - OPR - CN - 0500'
  && r1.nazevAkce === 'Výtah Ostrava' && r1.objednatel === 'Novák s.r.o.' && r1.datum === '2026-07-20',
  JSON.stringify(r1));
test('záznam počítá varianty i odeslané', r1.variant === 2 && r1.odeslane === 1, JSON.stringify(r1));
test('záznam přebírá razítko zápisu', r1.upraveno === '2026-07-30T10:00:00.000Z');
test('v záznamu nejsou žádné částky',
  !Object.keys(r1).some(k => /cena|castka|celkem|marze|naklad|sleva/i.test(k)), Object.keys(r1).join(','));
test('nevyplněná předloha čísla se do rejstříku nepíše',
  uloRejstrikZaznam(zakazka(null)).cislo === '');
test('bez razítka se vezme poslední úprava varianty',
  uloRejstrikZaznam(zakazka('2026 - OPR - CN - 1')).upraveno !== '');

/* ---------- 4) rejstřík: normalizace, slučování, odebírání ---------- */

test('z null je prázdný rejstřík', uloRejstrikNormalizuj(null).length === 0);
test('z textu je prázdný rejstřík', uloRejstrikNormalizuj('{}').length === 0);
test('obal { zakazky: [...] } se rozbalí',
  uloRejstrikNormalizuj({ zakazky: [{ soubor: 'a.json' }] }).length === 1);
test('záznam bez souboru se zahodí',
  uloRejstrikNormalizuj([{ cislo: 'x' }, null, 7, { soubor: 'a.json' }]).length === 1);
test('chybějící pole se doplní na prázdná',
  (() => { const z = uloRejstrikNormalizuj([{ soubor: 'a.json' }])[0];
           return z.cislo === '' && z.variant === 0 && z.odeslane === 0 && z.upraveno === ''; })());
test('nesmyslný počet variant se srovná na nulu',
  uloRejstrikNormalizuj([{ soubor: 'a.json', variant: 'pět' }])[0].variant === 0);

let R = uloRejstrikSloucit([], r1);
test('sloučení do prázdného rejstříku přidá záznam', R.length === 1);
R = uloRejstrikSloucit(R, uloRejstrikZaznam(z1, { razitko: '2026-07-30T11:00:00.000Z' }));
test('opakované uložení téže zakázky záznam přepíše, nezdvojí',
  R.length === 1 && R[0].upraveno === '2026-07-30T11:00:00.000Z', JSON.stringify(R));
const z2 = zakazka('2026 - OPR - CN - 0501', { nazevAkce: 'Šachta Brno', objednatel: 'Dvořák a syn', datum: '2026-07-25' });
R = uloRejstrikSloucit(R, uloRejstrikZaznam(z2, { razitko: '2026-07-29T08:00:00.000Z' }));
test('jiná zakázka se přidá vedle', R.length === 2);
test('sloučení nemění vstupní pole', uloRejstrikSloucit(R, uloRejstrikZaznam(zakazka('2026 - OPR - CN - 0502'))).length === 3 && R.length === 2);
test('odebrání smaže právě jeden záznam',
  uloRejstrikOdeber(R, '2026-OPR-CN-0501.json').length === 1);
test('odebrání neznámého souboru nic neudělá',
  uloRejstrikOdeber(R, 'neexistuje.json').length === 2);

test('řazení dá nejnovější nahoru',
  uloRejstrikSerad(R)[0].soubor === '2026-OPR-CN-0500.json', JSON.stringify(uloRejstrikSerad(R)));

/* ---------- 5) hledání ---------- */

test('prázdný dotaz vrátí všechno', uloHledej(R, '').length === 2);
test('hledání podle čísla', uloHledej(R, '0501').length === 1);
test('hledání podle objednatele bez diakritiky',
  uloHledej(R, 'dvorak').length === 1, JSON.stringify(uloHledej(R, 'dvorak')));
test('hledání podle akce s diakritikou', uloHledej(R, 'Šachta').length === 1);
test('dvě slova musí sedět obě', uloHledej(R, 'brno dvorak').length === 1);
test('dvě slova z různých zakázek nevrátí nic', uloHledej(R, 'brno novak').length === 0);
test('neznámé slovo nevrátí nic', uloHledej(R, 'xyz').length === 0);

/* ---------- 6) pojistka na uzamčené varianty ---------- */

const naDisku = () => JSON.parse(JSON.stringify(z1));

test('shodná zakázka projde', uloKontrolaZamku(naDisku(), naDisku()).ok);

const bezZamcene = naDisku();
bezZamcene.varianty = bezZamcene.varianty.filter(v => !v.zamek);
let k = uloKontrolaZamku(naDisku(), bezZamcene);
test('zmizelá uzamčená varianta se pozná',
  !k.ok && k.problemy.length === 1 && k.problemy[0].duvod === 'chybi', JSON.stringify(k));
test('problém nese číslo varianty', k.problemy[0].cislo === '2026 - OPR - CN - 0500', JSON.stringify(k.problemy[0]));
test('popis problému je věta v češtině', /uzamčená varianta/.test(uloProblemPopis(k.problemy[0])), uloProblemPopis(k.problemy[0]));

const potichuOdemcena = naDisku();
potichuOdemcena.varianty[0].zamek = null;
k = uloKontrolaZamku(naDisku(), potichuOdemcena);
test('tiše ztracený zámek se pozná',
  !k.ok && k.problemy[0].duvod === 'odemcena', JSON.stringify(k));

const radneOdemcena = naDisku();
test('řádné odemčení správcem projde',
  odemkniVariantu(radneOdemcena.varianty[0], { jeAdmin: true, duvod: 'chyba v ceně, po dohodě se zákazníkem' }).ok
  && uloKontrolaZamku(naDisku(), radneOdemcena).ok,
  JSON.stringify(uloKontrolaZamku(naDisku(), radneOdemcena)));

const prepsanyZamek = naDisku();
prepsanyZamek.varianty[0].zamek.otisk = { ockZaklad: 1 };
k = uloKontrolaZamku(naDisku(), prepsanyZamek);
test('změněný otisk odeslaných částek se pozná',
  !k.ok && k.problemy[0].duvod === 'zmenena', JSON.stringify(k));

const zmenenaNezamcena = naDisku();
zmenenaNezamcena.varianty[1].nazev = 'Přejmenováno';
test('změna nezamčené varianty nevadí', uloKontrolaZamku(naDisku(), zmenenaNezamcena).ok);

test('prázdný soubor na disku nic neblokuje', uloKontrolaZamku(null, naDisku()).ok);

/* ---------- 7) kolize souběžného zápisu ---------- */

test('nic na disku není kolize', uloKolize(null, '').kolize === false);
const sRazitkem = naDisku(); sRazitkem.uloRazitko = '2026-07-30T09:00:00.000Z';
test('shodné razítko není kolize', uloKolize(sRazitkem, '2026-07-30T09:00:00.000Z').kolize === false);
test('jiné razítko je kolize', uloKolize(sRazitkem, '2026-07-30T08:00:00.000Z').kolize === true);
test('soubor, který jsme odsud nenačetli, je taky kolize', uloKolize(sRazitkem, '').kolize === true);
test('kolize hlásí, co je na disku', uloKolize(sRazitkem, '').naDisku === '2026-07-30T09:00:00.000Z');
test('razítko chybí u zakázky uložené ručním exportem', uloRazitko(naDisku()) === '');
test('nové razítko je ISO čas', /^\d{4}-\d{2}-\d{2}T/.test(uloRazitkoNove()));
test('nové razítko lze předat zvenčí', uloRazitkoNove('2026-01-01T00:00:00.000Z') === '2026-01-01T00:00:00.000Z');

/* ---------- 8) záloha rozpracované práce v prohlížeči ----------------
 *
 * Zadání 4. 8. 2026: „odstraň nějakou historickou nabídku, která vždy při
 * spuštění vyžaduje potvrzení o rozpracovanosti nebo zahození". Lišta
 * s dotazem se do teď ukázala pokaždé, když v prohlížeči ležela jakákoli
 * záloha – bez ohledu na to, jak byla stará, jestli už je táž zakázka
 * dávno v databázi a jestli se uživatel minule vyjádřil. Rozhodnutí, kdy
 * má smysl se ptát, patří sem do modelu, aby šlo otestovat bez prohlížeče. */

const TED = '2026-08-04T12:00:00.000Z';
const pred = (dni, hodin) => new Date(Date.parse(TED) - ((dni * 24 + (hodin || 0)) * 3600e3)).toISOString();
const zaloha = (uprav) => Object.assign({
  verze: 1, kdy: pred(0, 1), cislo: '2026 - OPR - CN - 5', nazevAkce: 'Šachta Ostrava',
  zakazka: '{"cislo":"2026 - OPR - CN - 5"}',
}, uprav || {});

test('prázdné úložiště se neptá', uloZalohaRozhodni(null, { ted: TED }).nabidnout === false);
test('záznam bez zakázky se neptá a uklidí se',
  uloZalohaRozhodni({ kdy: TED }, { ted: TED }).smazat === true);

const cerstva = uloZalohaRozhodni(zaloha(), { ted: TED });
test('čerstvá rozpracovaná zakázka se nabídne', cerstva.nabidnout === true, JSON.stringify(cerstva));
test('čerstvá záloha se nemaže', cerstva.smazat === false);

const stara = uloZalohaRozhodni(zaloha({ kdy: pred(8) }), { ted: TED });
test('záloha starší než týden se nenabízí', stara.nabidnout === false, JSON.stringify(stara));
test('záloha starší než týden se uklidí sama', stara.smazat === true);
test('týden stará záloha se ještě nabídne',
  uloZalohaRozhodni(zaloha({ kdy: pred(6, 23) }), { ted: TED }).nabidnout === true);

const bezHlavicky = uloZalohaRozhodni(zaloha({ cislo: '', nazevAkce: '' }), { ted: TED });
test('záloha bez čísla i názvu se nenabízí (nedá se poznat, co to je)',
  bezHlavicky.nabidnout === false, JSON.stringify(bezHlavicky));
test('záloha bez čísla i názvu se uklidí', bezHlavicky.smazat === true);
test('stačí název akce, číslo chybět může',
  uloZalohaRozhodni(zaloha({ cislo: '' }), { ted: TED }).nabidnout === true);

const shodna = uloZalohaRozhodni(zaloha(), { ted: TED, otevrena: '{"cislo":"2026 - OPR - CN - 5"}' });
test('záloha shodná s otevřenou zakázkou se nenabízí', shodna.nabidnout === false, JSON.stringify(shodna));
test('záloha shodná s otevřenou zakázkou se ale nemaže', shodna.smazat === false);

const odlozena = uloZalohaRozhodni(zaloha({ kdy: '2026-08-04T09:00:00.000Z' }),
  { ted: TED, odlozeno: '2026-08-04T09:00:00.000Z' });
test('jednou odložená a od té doby nezměněná záloha se už neptá',
  odlozena.nabidnout === false, JSON.stringify(odlozena));
test('odložená záloha se nemaže – uživatel ji nezahodil', odlozena.smazat === false);
test('novější záloha se po odložení té starší zeptá znovu',
  uloZalohaRozhodni(zaloha({ kdy: pred(0, 1) }), { ted: TED, odlozeno: '2026-08-04T09:00:00.000Z' }).nabidnout === true);

test('záloha bez času se posuzuje jako čerstvá (radši se zeptat)',
  uloZalohaRozhodni(zaloha({ kdy: '' }), { ted: TED }).nabidnout === true);
test('nesmyslný čas zálohu nezahodí',
  uloZalohaRozhodni(zaloha({ kdy: 'včera odpoledne' }), { ted: TED }).smazat === false);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
