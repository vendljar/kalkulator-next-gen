/* NASTAVENÍ ZOBRAZENÍ PODLE ROLÍ (zadání 5. 8. 2026)
 *
 * „Vytvořit v nastavení položku nastavení zobrazení, ve které bude podle rolí
 *  možné přiřazovat jednotlivá nastavení sloupců a funkcí v rozhraní napříč
 *  aplikací."
 *
 * Tahle sada hlídá tři věci, na kterých celá matice stojí:
 *
 * 1) SEZNAM PRVKŮ JE POUŽITELNÝ JAKO DOKUMENT. Ze `zobrazeni.js` se generuje
 *    souhrn „co je jen pro admina", podle kterého se rozhoduje o přidělení
 *    práv. Kdyby některému prvku chyběl popis nebo zdůvodnění, v souhrnu by
 *    zela díra a rozhodovalo by se naslepo. Proto se kontroluje úplnost všech
 *    polí, jedinečnost klíčů i to, že skupina prvku opravdu existuje.
 *
 * 2) ADMINISTRÁTOR NEPŘIJDE O NIC A PEVNÉ PRVKY SE NEDAJÍ PODSTRČIT. Kdyby
 *    šlo administrátorovi něco odebrat, neměl by se jak dostat zpátky
 *    k přepínači; kdyby šlo „přidělit" prvek, který drží server, aplikace by
 *    slibovala právo, na které vzápětí přijde chyba 403.
 *
 * 3) VÝCHOZÍ STAV = DNEŠEK, PŘESNĚ. Kdo matici neotevře, nesmí poznat, že
 *    přibyla. `zobrazeniZmeny(vychozi)` proto musí být prázdné a `vychozi`
 *    musí u drtivé většiny prvků říkat „nevidí ani obchodník, ani vedoucí" —
 *    tedy přesně to, co dnes dělá jediné dělítko `jeAdmin()`.
 */
const Z = require('./zobrazeni.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

const ROLE = Z.ZOBRAZENI_ROLE_PRIDELITELNE;
const ADMIN = Z.ZOBRAZENI_ROLE_VZDY;

/* ---------- 1) seznam prvků jako podklad k rozhodnutí ---------- */

test('role, které se přidělují, jsou Obchodník a Vedoucí',
  ROLE.length === 2 && ROLE.indexOf('Obchodník') >= 0 && ROLE.indexOf('Vedoucí') >= 0, ROLE);
test('role, která vidí vždy vše, je Administrátor', ADMIN === 'Administrátor', ADMIN);
test('administrátor není zároveň v přidělitelných rolích', ROLE.indexOf(ADMIN) < 0);

test('seznam prvků není prázdný', Z.ZOBRAZENI_PRVKY.length > 0);
test('skupiny mají jedinečné klíče',
  new Set(Z.ZOBRAZENI_SKUPINY.map(s => s.klic)).size === Z.ZOBRAZENI_SKUPINY.length);

const klice = Z.ZOBRAZENI_PRVKY.map(p => p.klic);
test('klíče prvků jsou jedinečné', new Set(klice).size === klice.length,
  klice.filter((k, i) => klice.indexOf(k) !== i));

const skupiny = Z.ZOBRAZENI_SKUPINY.map(s => s.klic);
const bezSkupiny = Z.ZOBRAZENI_PRVKY.filter(p => skupiny.indexOf(p.skupina) < 0).map(p => p.klic);
test('každý prvek patří do existující skupiny', bezSkupiny.length === 0, bezSkupiny);

const prazdna = Z.ZOBRAZENI_PRVKY.filter(p =>
  !['klic', 'nazev', 'kde', 'popis', 'proc'].every(k => typeof p[k] === 'string' && p[k].trim().length > 0)
).map(p => p.klic);
test('každý prvek má název, místo v aplikaci, popis i zdůvodnění', prazdna.length === 0, prazdna);

/* Popis a zdůvodnění nejsou jen „vyplněno" — jdou do dokumentu, který uživatel
 * čte, aby se rozhodl. Jednoslovná poznámka by mu nepomohla. */
const strohe = Z.ZOBRAZENI_PRVKY.filter(p => p.popis.length < 30 || p.proc.length < 60).map(p => p.klic);
test('popis i zdůvodnění jsou souvislé věty, ne poznámky', strohe.length === 0, strohe);

const bezMatice = Z.ZOBRAZENI_PRVKY.filter(p =>
  !ROLE.every(r => typeof (p.vychozi || {})[r] === 'boolean' && typeof (p.navrh || {})[r] === 'boolean')
).map(p => p.klic);
test('u každého prvku je vyplněný dnešek i návrh pro obě role', bezMatice.length === 0, bezMatice);

/* Prvek, který drží server, nemá smysl někomu navrhovat — návrh by se nikdy
 * nedal splnit. */
const pevneNavrzene = Z.ZOBRAZENI_PRVKY.filter(p => p.pevne &&
  ROLE.some(r => p.navrh[r] || p.vychozi[r])).map(p => p.klic);
test('prvky držené serverem se nikomu nenavrhují ani dnes nesvítí', pevneNavrzene.length === 0, pevneNavrzene);

test('aspoň jeden prvek je pevný (jinak by se pravidlo netestovalo)',
  Z.ZOBRAZENI_PRVKY.some(p => p.pevne));
test('aspoň jeden prvek se návrhem liší od dneška (jinak nemá o čem rozhodovat)',
  Z.ZOBRAZENI_PRVKY.some(p => ROLE.some(r => p.navrh[r] !== p.vychozi[r])));

/* ---------- 2) pravidla: administrátor a pevné prvky ---------- */

test('administrátor vidí každý prvek, i pevný',
  klice.every(k => Z.zobrazeniSmi(ADMIN, k, {}) === true));

const maticeVse = {};
klice.forEach(k => { maticeVse[k] = { 'Obchodník': true, 'Vedoucí': true }; });
test('administrátorovi nejde nic odebrat ani maticí',
  klice.every(k => Z.zobrazeniSmi(ADMIN, k, { [k]: { 'Obchodník': false, 'Vedoucí': false } }) === true));

const pevne = Z.ZOBRAZENI_PRVKY.filter(p => p.pevne).map(p => p.klic);
test('pevný prvek zůstane skrytý, i když ho matice přidělí',
  pevne.every(k => ROLE.every(r => Z.zobrazeniSmi(r, k, maticeVse) === false)), pevne);

test('neznámá role nevidí nic z přidělitelného',
  klice.every(k => Z.zobrazeniSmi('Skladník', k, maticeVse) === false));
test('prázdná role nevidí nic z přidělitelného',
  klice.every(k => Z.zobrazeniSmi(undefined, k, maticeVse) === false));

/* Neznámý klíč vrací true schválně: překlep v UI nemá utnout kus rozhraní. */
test('neznámý klíč se nikomu neskrývá', Z.zobrazeniSmi('Obchodník', 'neco.co.neexistuje', {}) === true);

/* ---------- 3) výchozí stav = dnešek ---------- */

const vych = Z.zobrazeniVychozi();
test('výchozí matice pokrývá všechny prvky', Object.keys(vych).length === klice.length);
test('výchozí matice odpovídá poli vychozi u prvků',
  Z.ZOBRAZENI_PRVKY.every(p => ROLE.every(r => vych[p.klic][r] === !!p.vychozi[r])));
test('proti výchozí matici nehlásí zobrazeniZmeny žádnou změnu',
  Z.zobrazeniZmeny(vych).length === 0, Z.zobrazeniZmeny(vych));
test('bez uložené matice (undefined) se chová stejně jako s výchozí',
  klice.every(k => ROLE.every(r => Z.zobrazeniSmi(r, k, undefined) === Z.zobrazeniSmi(r, k, vych))));
test('neúplná matice se u chybějícího prvku vrátí k dnešku',
  Z.zobrazeniSmi('Vedoucí', klice[0], { 'jiny.klic': { 'Vedoucí': true } })
    === !!Z.zobrazeniPrvek(klice[0]).vychozi['Vedoucí']);

/* Dnešek znamená jediné dělítko jeAdmin(): kromě dvou záložek Nastavení, které
 * se sice vykreslují, ale jsou nedostupné (celé ozubené kolo je admin-only),
 * nevidí běžný uživatel nic z tohoto seznamu. */
const dnesViditelne = Z.ZOBRAZENI_PRVKY.filter(p => ROLE.some(r => p.vychozi[r])).map(p => p.klic);
test('dnes je pro běžné role viditelné jen to, co je zdokumentované jako nedopatření',
  dnesViditelne.every(k => k === 'nastaveni.slevy' || k === 'nastaveni.sablony'), dnesViditelne);
test('vedoucí dnes nemá proti obchodníkovi v zobrazení žádnou výhodu',
  Z.ZOBRAZENI_PRVKY.every(p => p.vychozi['Vedoucí'] === p.vychozi['Obchodník']));

/* ---------- 4) očista uložené matice ---------- */

const spinava = { 'tab.detail': { 'Vedoucí': true }, 'davno.zruseny.prvek': { 'Vedoucí': true } };
const cista = Z.zobrazeniOciste(spinava);
test('očista zahodí klíč, který v seznamu není', cista['davno.zruseny.prvek'] === undefined);
test('očista zachová platnou volbu', cista['tab.detail']['Vedoucí'] === true);
test('očista doplní chybějící prvky dneškem',
  Object.keys(cista).length === klice.length && cista['tab.cenik']['Obchodník'] === false);
test('očista srazí pevný prvek na false', (() => {
  const c = Z.zobrazeniOciste(maticeVse);
  return pevne.every(k => ROLE.every(r => c[k][r] === false));
})());
test('očista snese nesmysl na vstupu',
  Object.keys(Z.zobrazeniOciste(null)).length === klice.length
  && Object.keys(Z.zobrazeniOciste('ne')).length === klice.length
  && Z.zobrazeniOciste({ 'tab.detail': 'ne' })['tab.detail']['Vedoucí'] === false);

test('zobrazeniZmeny vypíše jen to, co se od dneška liší', (() => {
  const zm = Z.zobrazeniZmeny({ 'tab.detail': { 'Vedoucí': true } });
  return zm.length === 1 && zm[0].klic === 'tab.detail' && zm[0].role === 'Vedoucí' && zm[0].nyni === true;
})(), Z.zobrazeniZmeny({ 'tab.detail': { 'Vedoucí': true } }));

test('zobrazeniPrvek najde prvek podle klíče a jinak vrátí null',
  Z.zobrazeniPrvek('tab.detail') !== null && Z.zobrazeniPrvek('nic') === null);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
