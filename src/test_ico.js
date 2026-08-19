/* Test: IČO objednatele v hlavičkách kalkulací (zadání z 30. 7. 2026).
 *
 * Pole IČO patří do obou hlaviček mezi Kontaktní osobu a Sazbu DPH. Vypadá to
 * jako triviální přidání jednoho řetězce, ale visí na něm čtyři věci, které se
 * v téhle aplikaci rozejdou vždycky ve stejném pořadí:
 *
 *  1) DVĚ NEZÁVISLÉ HLAVIČKY. OCK sedí přímo na zakázce, PROJ v projHlavicka.
 *     Kdyby se IČO přidalo jen do jedné, projekční nabídka by IČO tiše ztrácela
 *     a nikdo by si toho nevšiml, dokud by nechyběla na krycím listu.
 *  2) STARÉ SOUBORY. Zakázka uložená včera pole nemá. Migrace ho musí doplnit,
 *     jinak se `undefined` propíše do dokumentu jako prázdné místo – nebo hůř,
 *     jako slovo „undefined".
 *  3) PROTOKOL (#41). Protokol popisuje změny podle mapy popisků. Pole, které
 *     v mapě chybí, se v protokolu ukáže jako holý klíč `ico` – doklad
 *     o kalkulaci pak mluví jazykem zdrojáku, ne uživatele.
 *  4) KONTROLA (#33). IČO se dá zadat s překlepem a pořád vypadá jako IČO.
 *     Kontrola je proto na kontrolní číslici, ne na délce, a je to VAROVÁNÍ –
 *     nikde se nic neblokuje (zadání Ad2 z 30. 7. 2026). Prázdné IČO se
 *     nehlásí vůbec: spousta nabídek odchází dřív, než je objednatel jistý.
 */
const fs = require('fs');

/* Prohlížeč má jeden jmenný prostor, Node ne – podstrčíme totéž, co udělá build. */
const eng = require('./engine.js');
Object.keys(eng).forEach(k => { if (global[k] === undefined) global[k] = eng[k]; });
const ep = require('./engine_proj.js');
Object.keys(ep).forEach(k => { if (global[k] === undefined) global[k] = ep[k]; });
const tsm = require('./techspec.js');
Object.keys(tsm).forEach(k => { if (global[k] === undefined) global[k] = tsm[k]; });
const slm = require('./sleva.js');
Object.keys(slm).forEach(k => { if (global[k] === undefined) global[k] = slm[k]; });
const zom = require('./zaokrouhleni.js');
Object.keys(zom).forEach(k => { if (global[k] === undefined) global[k] = zom[k]; });
const mzm = require('./marze.js');
Object.keys(mzm).forEach(k => { if (global[k] === undefined) global[k] = mzm[k]; });
const pzm = require('./poznamky.js');
Object.keys(pzm).forEach(k => { if (global[k] === undefined) global[k] = pzm[k]; });
const zk = require('./zakazka.js');
Object.keys(zk).forEach(k => { if (global[k] === undefined) global[k] = zk[k]; });
const pr = require('./protokol.js');
Object.keys(pr).forEach(k => { if (global[k] === undefined) global[k] = pr[k]; });
const kt = require('./kontroly.js');
Object.keys(kt).forEach(k => { if (global[k] === undefined) global[k] = kt[k]; });
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { if (global[k] === undefined) global[k] = fm[k]; });
const kr = require('./kryci.js');
Object.keys(kr).forEach(k => { if (global[k] === undefined) global[k] = kr[k]; });
const krp = require('./kryci_proj.js');
Object.keys(krp).forEach(k => { if (global[k] === undefined) global[k] = krp[k]; });

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

/* ---------- 1) pole existuje v obou hlavičkách ---------- */

const z = novaZakazka();
test('nová zakázka má IČO v hlavičce OCK', z.ico === '', z.ico);
test('nová zakázka má IČO v hlavičce PROJ', z.projHlavicka.ico === '', z.projHlavicka);
test('IČO je v seznamu polí hlavičky', ZAK_HLAVICKA_POLE.indexOf('ico') >= 0, ZAK_HLAVICKA_POLE);
/* Pořadí v seznamu není kosmetika: podle něj se vypisují kolize při ručním
 * přenosu hlavičky a uživatel čte seznam polí ve stejném sledu, v jakém je
 * má na obrazovce. Zadání zní „mezi Kontaktní osobu a Sazbu DPH"; sazba DPH
 * není pole hlavičky (je v ceníku varianty), takže hned za kontaktem. */
test('IČO stojí v seznamu polí hned za kontaktní osobou',
  ZAK_HLAVICKA_POLE.indexOf('ico') === ZAK_HLAVICKA_POLE.indexOf('kontakt') + 1,
  ZAK_HLAVICKA_POLE);

/* ---------- 2) obě hlavičky zůstávají nezávislé ---------- */

z.ico = '00177041';
test('zápis IČO do OCK nezmění PROJ', z.projHlavicka.ico === '', z.projHlavicka.ico);
test('odlišné IČO hlásí hlavičky jako odlišné', zakazkaHlavickyShodne(z) === false);
test('kolize při přenosu IČO nehlásí (cíl je prázdný)',
  zakazkaHlavickaKolize(z, 'doProj').indexOf('ico') < 0, zakazkaHlavickaKolize(z, 'doProj'));

z.projHlavicka.ico = '45274649';
test('kolize hlásí neprázdné odlišné IČO',
  zakazkaHlavickaKolize(z, 'doProj').indexOf('ico') >= 0, zakazkaHlavickaKolize(z, 'doProj'));
zakazkaKopirujHlavicku(z, 'doProj');
test('ruční přenos OCK → PROJ přenese IČO', z.projHlavicka.ico === '00177041', z.projHlavicka.ico);

/* Efektivní hlavička pro výstupy: prázdné IČO v PROJ se přečte z OCK, aby
 * krycí list PROJ nezůstal prázdný jen proto, že se hlavička ručně nepřevzala. */
const zE = novaZakazka();
zE.ico = '00177041';
test('výstupní hlavička PROJ doplní IČO z OCK', projHlavickaEfektivni(zE).ico === '00177041',
  projHlavickaEfektivni(zE).ico);
zE.projHlavicka.ico = '45274649';
/* Od 19. 8. 2026 je hlavička jedna společná: vyplněné pole OCK má přednost;
 * stará hodnota z dob oddělené hlavičky PROJ se použije, jen když je OCK prázdné. */
test('společná hlavička: OCK má přednost před starým polem PROJ', projHlavickaEfektivni(zE).ico === '00177041',
  projHlavickaEfektivni(zE).ico);
zE.ico = '';
test('prázdné OCK zachrání stará hodnota PROJ', projHlavickaEfektivni(zE).ico === '45274649',
  projHlavickaEfektivni(zE).ico);
zE.ico = '00177041';

/* ---------- 3) staré soubory ---------- */

const stara = novaZakazka();
stara.objednatel = 'Stará stavba a.s.';
stara.ico = '00177041';
delete stara.ico;                    // zakázka uložená před touhle změnou
delete stara.projHlavicka.ico;
const m = importZakazka(JSON.parse(JSON.stringify(stara)));
test('migrace doplní IČO do hlavičky OCK', m.ico === '', m.ico);
test('migrace doplní IČO do hlavičky PROJ', m.projHlavicka.ico === '', m.projHlavicka);
test('migrace nevyrobí undefined', String(m.ico) !== 'undefined' && String(m.projHlavicka.ico) !== 'undefined');

/* Kolečko uložení → načtení: IČO musí přežít obě hlavičky zvlášť. */
const zR = novaZakazka();
zR.ico = '00177041'; zR.projHlavicka.ico = '45274649';
const zpet = importZakazka(JSON.parse(JSON.stringify(zR)));
test('IČO OCK přežije uložení a načtení', zpet.ico === '00177041', zpet.ico);
test('IČO PROJ přežije uložení a načtení', zpet.projHlavicka.ico === '45274649', zpet.projHlavicka.ico);

/* ---------- 4) protokol o kalkulaci ---------- */

test('protokol sleduje pole IČO', PROTOKOL_HLAVICKA_POLE.indexOf('ico') >= 0, PROTOKOL_HLAVICKA_POLE);
test('protokol zná český popisek IČO', protokolNazevPole('ico') === 'IČO objednatele', protokolNazevPole('ico'));

const pA = novaZakazka();
protokolZajisti(pA);
const otiskA = protokolOtisk(pA);          // otisk je JSON řetězec
pA.ico = '00177041';
const zmeny = protokolRozdil(JSON.parse(otiskA), JSON.parse(protokolOtisk(pA)));
test('změna IČO se do protokolu zapíše', zmeny.some(z => /IČO/.test(z.co)),
  zmeny.map(z => z.co));
test('protokolový záznam o IČO nese novou hodnotu',
  zmeny.some(z => String(z.po).indexOf('00177041') >= 0), zmeny);

/* ---------- 5) kontrola zadání (#33) ---------- */

test('IČO s platnou kontrolní číslicí projde', icoPlatne('00177041') === true);
test('IČO s mezerami projde (lidé je tak píšou)', icoPlatne('001 770 41') === true);
test('IČO s překlepem neprojde', icoPlatne('00177042') === false);
test('sedmimístné číslo neprojde', icoPlatne('0017704') === false);
test('text místo IČO neprojde', icoPlatne('CZ00177041') === false);
test('prázdné IČO se za chybné nepovažuje', icoPlatne('') === false && icoVyplneno('') === false);

/* Kontrola běží nad hotovým kontextem stejně jako ostatní pravidla. Zajímá nás
 * jen pravidlo `ico`, ostatní nálezy jsou tady šum. */
const jekly = JSON.parse(fs.readFileSync('./jekly.json', 'utf8'));
global.JEKLY = jekly;
function ctxSIco(hodnota) {
  const zak = novaZakazka();
  zak.cislo = 'CN-1'; zak.nazevAkce = 'Zkouška'; zak.objednatel = 'Objednatel s.r.o.';
  zak.ico = hodnota;
  return { zak };
}
const kody = v => (v.nalezy || []).map(n => n.kod);
const spatne = kontrolyProved(ctxSIco('00177042'));
test('kontrola pozná chybné IČO', kody(spatne).indexOf('ico') >= 0, kody(spatne));
test('nález o IČO je varování, ne zábrana',
  (spatne.nalezy.find(n => n.kod === 'ico') || {}).uroven === 2,
  spatne.nalezy.find(n => n.kod === 'ico'));
test('chybné IČO mlčí o penězích',
  !/Kč/.test((spatne.nalezy.find(n => n.kod === 'ico') || {}).text || ''));
test('kontrola mlčí u platného IČO', kody(kontrolyProved(ctxSIco('00177041'))).indexOf('ico') < 0);
test('kontrola mlčí u prázdného IČO', kody(kontrolyProved(ctxSIco(''))).indexOf('ico') < 0);
test('IČO je v katalogu pravidel', kontrolyPravidla().some(r => r.kod === 'ico'),
  kontrolyPravidla().map(r => r.kod));

/* Prázdná hlavička IČO nevyžaduje: nabídka se často posílá dřív, než je
 * objednatel potvrzený, a tvrdé „chybí IČO" by to hlásilo pořád. */
const prazdna = kontrolyProved({ zak: { cislo: '', nazevAkce: '', objednatel: '' } });
const nalezHlavicka = (prazdna.nalezy.find(n => n.kod === 'hlavicka') || {}).text || '';
test('prázdná hlavička se IČO nedožaduje', !/IČO/.test(nalezHlavicka), nalezHlavicka);

/* ---------- 6) krycí listy převezmou IČO z hlavičky ---------- */

const polOck = KRYCI_SEKCE.reduce((a, s) => a.concat(s.pole), []).find(p => p.id === 'ico');
test('krycí list OCK má pole IČO', !!polOck);
test('krycí list OCK předvyplní IČO z hlavičky',
  !!polOck && typeof polOck.prefill === 'function'
  && polOck.prefill({ zak: { ico: '00177041' } }) === '00177041');

const polProj = KRYCI_PROJ_SEKCE.reduce((a, s) => a.concat(s.pole), []).find(p => p.id === 'ico');
test('krycí list PROJ má pole IČO', !!polProj);
test('krycí list PROJ předvyplní IČO z hlavičky PROJ',
  !!polProj && typeof polProj.prefill === 'function'
  && polProj.prefill({ hl: { ico: '45274649' } }) === '45274649');

console.log('\nPASS=' + ok + ' FAIL=' + fail);
process.exit(fail ? 1 : 0);
