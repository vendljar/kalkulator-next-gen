/* Test – kdy zakázka smí do databáze a co se o tom uživateli řekne
 * (zadání 4. 8. 2026: „Každá nová zakázka by se měla automaticky ukládat
 * do databáze. Pro potřeby tohoto kroku budeme vždy zakázku ukládat po
 * vyplnění hlavičky. Systém musí uživatele informovat, že je třeba
 * hlavičku vyplnit a zakázku uložit.").
 *
 * Proč to má vlastní sadu a vlastní funkce v modelu: do 4. 8. rozhodovaly
 * o samočinném ukládání dvě podmínky roztroušené v UI (`ONLINE_STAV.soubor`
 * u online, `ULO_STAV.soubor` u složky). Obě znamenaly totéž – „už jsme
 * jednou uložili ručně" – takže nová zakázka se sama neuložila NIKDY.
 * Rozhodnutí se proto přesouvá do modelu, kde se dá otestovat bez
 * prohlížeče, a UI se ho jen ptá.
 *
 * Konvence projektu: prohlížeč má jeden jmenný prostor, Node ne – funkce
 * z jiných modulů se musí globalizovat ručně, jinak guardy
 * `typeof fn === 'function'` tiše spadnou do záložní větve. */
const zk = require('./zakazka.js');
global.hlavickaVyplneno = zk.hlavickaVyplneno;
global.ZAK_CISLO_PREDLOHA = zk.ZAK_CISLO_PREDLOHA;

const U = require('./uloziste.js');
const { uloHlavickaChybi, uloHlavickaVyplnena, uloUlozeniStav, uloJmenoSouboru } = U;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* Zakázka jen jako holá data – kalkulační jádro tu nepotřebujeme, model
 * ukládání se dívá výhradně na hlavičky. */
const zakazka = (o) => Object.assign({
  cislo: zk.ZAK_CISLO_PREDLOHA, nazevAkce: '', objednatel: '', datum: '2026-08-04',
  projHlavicka: { cislo: zk.ZAK_CISLO_PREDLOHA, nazevAkce: '', objednatel: '', datum: '2026-08-04' },
  varianty: [{ id: 'v1' }],
}, o || {});

/* ---------- 1) co se počítá za vyplněnou hlavičku ---------- */

const prazdna = zakazka();
test('prázdná hlavička OCK není vyplněná', uloHlavickaVyplnena(prazdna) === false);
test('chybí obě povinná pole', uloHlavickaChybi(prazdna).join('|') === 'Číslo nabídky (CN)|Název akce',
  uloHlavickaChybi(prazdna).join('|'));

/* Předloha čísla („2026 - OPR - CN - ") sama o sobě vyplněné číslo NENÍ –
 * jinak by všechny nové zakázky mířily na jeden soubor. */
test('samotná předloha čísla nestačí',
  uloHlavickaChybi(zakazka({ nazevAkce: 'Hala Kladno' })).join('|') === 'Číslo nabídky (CN)');
test('samotné číslo bez názvu akce nestačí',
  uloHlavickaChybi(zakazka({ cislo: '2026 - OPR - CN - 0500' })).join('|') === 'Název akce');

const hotova = zakazka({ cislo: '2026 - OPR - CN - 0500', nazevAkce: 'Hala Kladno' });
test('číslo + název akce = hlavička vyplněná', uloHlavickaVyplnena(hotova) === true);
test('vyplněné hlavičce nechybí nic', uloHlavickaChybi(hotova).length === 0);

/* ---------- 2) hlavička PROJ je samostatná sada (nikdy se nesjednocuje) ---------- */

const proj = zakazka({ projHlavicka: { cislo: '2026 - OPR - CN - 0501', nazevAkce: 'Projekce Kladno' } });
test('PROJ hlavička se posuzuje zvlášť', uloHlavickaChybi(proj, 'proj').length === 0);
test('vyplněná PROJ hlavička neplní hlavičku OCK', uloHlavickaChybi(proj, 'ock').length === 2);
test('zakázka smí do databáze i tehdy, když je vyplněná jen hlavička PROJ',
  uloHlavickaVyplnena(proj) === true);

/* Zakázka vedená jen v PROJ dostane jméno souboru ze svého čísla PROJ –
 * do 4. 8. by skončila jako „bez-cisla-…", tedy nedohledatelná. */
test('jméno souboru se vezme z čísla PROJ, když OCK číslo chybí',
  uloJmenoSouboru(proj) === '2026-OPR-CN-0501.json', uloJmenoSouboru(proj));
test('číslo OCK má přednost před číslem PROJ',
  uloJmenoSouboru(zakazka({ cislo: '2026 - OPR - CN - 0500',
    projHlavicka: { cislo: '2026 - OPR - CN - 0501' } })) === '2026-OPR-CN-0500.json');
test('bez obou čísel zůstává nouzové jméno', /^bez-cisla-/.test(uloJmenoSouboru(prazdna)));

/* ---------- 3) hlášení pro uživatele + svolení k samočinnému uložení ---------- */

const st = (o) => uloUlozeniStav(Object.assign({
  zakazka: hotova, ulozeno: '', zmeneno: false, prihlasen: true, dostupne: true,
}, o || {}));

/* Nepřihlášený / bez serveru: nic se nesmí ukládat samo a věta to říká
 * rovnou, ať uživatel neztratí práci v domnění, že je zakázka v databázi. */
const bezServeru = st({ dostupne: false });
test('bez serveru se neukládá samo', bezServeru.muzeSam === false);
test('bez serveru je stav „nedostupne"', bezServeru.stav === 'nedostupne');
test('bez serveru věta upozorňuje, že zakázka není v databázi',
  /není v databázi/i.test(bezServeru.text), bezServeru.text);

const neprihlasen = st({ prihlasen: false });
test('nepřihlášený se neukládá samo', neprihlasen.muzeSam === false);
test('nepřihlášenému se řekne, ať se přihlásí', /přihlas/i.test(neprihlasen.text), neprihlasen.text);

/* Nevyplněná hlavička: informujeme, NEBLOKUJEME (KONTROLY_UROVEN = 2). */
const vyplnit = st({ zakazka: prazdna });
test('nevyplněná hlavička = stav „vyplnit"', vyplnit.stav === 'vyplnit');
test('nevyplněná hlavička se sama neukládá', vyplnit.muzeSam === false);
test('věta jmenuje, co v hlavičce chybí',
  vyplnit.text.includes('Číslo nabídky (CN)') && vyplnit.text.includes('Název akce'), vyplnit.text);
test('věta vybízí k uložení zakázky', /ulož/i.test(vyplnit.text), vyplnit.text);
test('nevyplněná hlavička nic neblokuje', vyplnit.blokuje !== true);

/* Vyplněná, ale ještě neuložená: tady se poprvé uloží samo. */
const ulozit = st({ zakazka: hotova, ulozeno: '' });
test('vyplněná a neuložená = stav „ulozit"', ulozit.stav === 'ulozit');
test('vyplněná hlavička uvolní samočinné uložení', ulozit.muzeSam === true);
test('věta říká, že zakázka ještě není v databázi',
  /ještě není v databázi/i.test(ulozit.text), ulozit.text);

/* Po prvním uložení se ukládá dál po každé změně – i kdyby se hlavička
 * mezitím vyprázdnila, uložený soubor už existuje a musí zůstat aktuální. */
const zmeneno = st({ ulozeno: '2026-OPR-CN-0500.json', zmeneno: true });
test('uložená zakázka se změnou = stav „ceka"', zmeneno.stav === 'ceka');
test('uložená zakázka se ukládá samo dál', zmeneno.muzeSam === true);
test('věta o čekající změně zmiňuje samočinné uložení', /sam/i.test(zmeneno.text), zmeneno.text);

const ulozeno = st({ ulozeno: '2026-OPR-CN-0500.json', zmeneno: false });
test('uložená zakázka beze změn = stav „ulozeno"', ulozeno.stav === 'ulozeno');
test('věta o uložené zakázce nese jméno souboru',
  ulozeno.text.includes('2026-OPR-CN-0500.json'), ulozeno.text);

/* „Uloženo v 14:32" — bez času vypadá lišta celý den stejně a obchodník
 * z ní nepozná, jestli se poslední úprava opravdu dostala na server, nebo
 * jestli tam visí věta z rána. Čas je to jediné, co tenhle rozdíl ukáže. */
const KDY = new Date('2026-08-05T14:32:07');
const sCasem = st({ ulozeno: '2026-OPR-CN-0500.json', zmeneno: false, kdy: KDY });
test('věta o uložené zakázce nese čas uložení', /14:32/.test(sCasem.text), sCasem.text);
test('čas se vrací i samostatně (pro lištu)', sCasem.cas === '14:32', sCasem.cas);
test('bez známého času se žádný čas nevymýšlí',
  ulozeno.cas === '' && !/\d\d:\d\d/.test(ulozeno.text), ulozeno.text);
test('nečitelný čas model neshodí a jen se vynechá',
  st({ ulozeno: 'x.json', zmeneno: false, kdy: 'nesmysl' }).cas === '');
test('čas jde přijmout i jako text z ISO', st({ ulozeno: 'x.json', zmeneno: false,
  kdy: '2026-08-05T14:32:07' }).cas === '14:32');
/* Čekající změna má čas ukázat taky – „naposledy uloženo v 14:32" je přesně
 * ta informace, kterou člověk hledá, když si není jistý, co se stihlo uložit. */
const cekaSCasem = st({ ulozeno: '2026-OPR-CN-0500.json', zmeneno: true, kdy: KDY });
test('čekající změna nese čas posledního uložení', /14:32/.test(cekaSCasem.text), cekaSCasem.text);
test('čekající změna pořád říká, že se uloží sama', /sam/i.test(cekaSCasem.text), cekaSCasem.text);

const prazdnaUlozena = st({ zakazka: prazdna, ulozeno: '2026-OPR-CN-0500.json', zmeneno: true });
test('už uložená zakázka se ukládá samo i s vyprázdněnou hlavičkou',
  prazdnaUlozena.muzeSam === true);

/* Vstup smí být i neúplný (UI se ptá i před dokončeným startem aplikace) –
 * model nesmí spadnout, jinak by render() shodil celou stránku. */
test('model přežije prázdný vstup', uloUlozeniStav({}).stav === 'nedostupne');
test('model přežije úplně bez vstupu', uloUlozeniStav().muzeSam === false);
test('model přežije zakázku bez hlaviček', uloHlavickaChybi({}).length === 2);

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
