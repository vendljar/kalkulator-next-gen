/* Test interních poznámek a příloh k zakázce (#37).
 *
 * Poznámky jsou jediné místo v aplikaci, kde se píše to, co se nesmí dostat
 * ven: proč se dala sleva, co obchodník slíbil, na čem se čeká. Proto se tu
 * hlídají čtyři věci, a každá z nich je jiný způsob, jak by to mohlo selhat:
 *
 *   a) poznámka patří ZAKÁZCE, ne variantě – jinak by se ztratila při klonu
 *      po odeslání nabídky, tedy přesně ve chvíli, kdy je nejpotřebnější,
 *   b) zámek odeslané varianty (#34) je o ceně, ne o interním zápisníku –
 *      dopsat „zákazník volal, chce to o týden dřív" musí jít i potom,
 *   c) smazaná poznámka nezmizí beze stopy; „kdo co slíbil" se nemá dát
 *      tiše přepsat, jinak zápisník nikomu neposlouží jako důkaz,
 *   d) NIC z toho se netiskne. To je celý smysl funkce a zároveň to jediné,
 *      co by při chybě odešlo zákazníkovi.
 */
const fs = require('fs');

/* Prohlížeč má jeden jmenný prostor, Node ne – sdílené funkce se musí
 * zglobalizovat ručně, jinak zakazka.js nenajde DEFAULT_ZADANI. */
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.vypocetProj = ep.vypocetProj;
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const slm = require('./sleva.js');
global.slevaPodil = slm.slevaPodil; global.slevaDefault = slm.slevaDefault;
const zom = require('./zaokrouhleni.js');
global.zaokrDefault = zom.zaokrDefault;
const zk = require('./zakazka.js');
Object.keys(zk).forEach(k => { if (global[k] === undefined) global[k] = zk[k]; });
const zam = require('./zamek.js');
Object.keys(zam).forEach(k => { if (global[k] === undefined) global[k] = zam[k]; });
const pz = require('./poznamky.js');
const { POZN_DRUHY, POZN_MAX_PRILOHA, POZN_MAX_CELKEM,
        poznamkyZajisti, poznamkyPridej, poznamkyUprav, poznamkySmaz, poznamkyObnov,
        poznamkySeznam, poznamkyShrnuti, poznamkyText, poznamkyVelikostText,
        prilohyPridej, prilohySmaz, prilohySeznam, prilohyVelikost } = pz;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

const nova = () => poznamkyZajisti(zk.novaZakazka());

/* ---------- 1) druhy poznámek ---------- */
test('druhů je pět a mají kód i název',
  POZN_DRUHY.length === 5 && POZN_DRUHY.every(d => d.kod && d.nazev));
test('kódy druhů jsou jedinečné',
  new Set(POZN_DRUHY.map(d => d.kod)).size === POZN_DRUHY.length);

/* ---------- 2) zajištění polí ---------- */
const z = nova();
test('zajisti vytvoří obě pole', Array.isArray(z.poznamky) && Array.isArray(z.prilohy));
test('zajisti je idempotentní', poznamkyZajisti(z) === z && z.poznamky.length === 0);
test('zajisti snese null', poznamkyZajisti(null) === null);

/* Zakázka uložená před #37 pole nemá – po importu se musí objevit prázdná,
 * ne chybět (jinak by první zápis spadl na undefined.push). */
const stara = zk.importZakazka(JSON.parse(JSON.stringify(zk.novaZakazka())));
poznamkyZajisti(stara);
test('starší zakázka pole dostane', Array.isArray(stara.poznamky));

/* ---------- 3) zápis poznámky ---------- */
const p1 = poznamkyPridej(z, '  Sleva 6 % kvůli třem šachtám v jedné budově.  ',
  { kdo: 'Vendl', druh: 'sleva', kdy: '2026-07-30T08:00:00.000Z' });
test('poznámka se přidá', z.poznamky.length === 1);
test('text se ořízne od mezer', p1.text === 'Sleva 6 % kvůli třem šachtám v jedné budově.');
test('poznámka si pamatuje kdo, kdy a druh',
  p1.kdo === 'Vendl' && p1.kdy === '2026-07-30T08:00:00.000Z' && p1.druh === 'sleva');
test('poznámka má vlastní id', !!p1.id);

const p2 = poznamkyPridej(z, 'Objednatel chce termín o týden dřív.', { kdo: 'Vendl' });
test('id se neopakuje', p2.id !== p1.id, p1.id + ' / ' + p2.id);
test('neznámý druh spadne do „jiné"', p2.druh === 'jine', p2.druh);

test('prázdná poznámka se nezapíše',
  poznamkyPridej(z, '   ') === null && poznamkyPridej(z, null) === null
  && z.poznamky.length === 2);

/* Poznámka smí nést variantu, ke které se váže – ale patří pořád zakázce,
 * takže ji klon ani jiná otevřená varianta neskryje. */
const p3 = poznamkyPridej(z, 'K variantě se sklem: zákazník váhá nad cenou.',
  { varianta: 'v-2', kdo: 'Vendl' });
test('poznámka si zapamatuje variantu', p3.varianta === 'v-2');
test('poznámky žijí na zakázce, ne ve variantě',
  z.poznamky.length === 3 && z.varianty.every(v => v.poznamky === undefined));

/* ---------- 4) úprava ---------- */
const u = poznamkyUprav(z, p1.id, 'Sleva 6 % – tři šachty v jedné budově, dohoda s p. Novákem.',
  { kdo: 'Vendl', kdy: '2026-07-30T09:00:00.000Z' });
test('úprava změní text', u.text.indexOf('Novákem') > 0);
test('úprava nezmění původní čas vzniku', u.kdy === '2026-07-30T08:00:00.000Z');
test('úprava se zaznamená zvlášť',
  !!u.upraveno && u.upraveno.kdy === '2026-07-30T09:00:00.000Z' && u.upraveno.kdo === 'Vendl');
test('úprava neznámého id nic neudělá', poznamkyUprav(z, 'nic', 'x') === null);
test('úprava na prázdno se neprovede',
  poznamkyUprav(z, p1.id, '   ') === null && z.poznamky[0].text === u.text);

/* ---------- 5) mazání nechává stopu ----------
 * Kdyby poznámka mizela úplně, dal by se zápisník tiše pročistit – a věta
 * „tohle jsme zákazníkovi slíbili" by přestala být k něčemu dobrá. */
const s = poznamkySmaz(z, p2.id, { kdo: 'Vendl', kdy: '2026-07-30T10:00:00.000Z' });
test('smazání vrátí poznámku', s && s.id === p2.id);
test('smazaná poznámka v datech zůstává', z.poznamky.length === 3);
test('smazaná poznámka nese kdo a kdy',
  s.smazano && s.smazano.kdo === 'Vendl' && s.smazano.kdy === '2026-07-30T10:00:00.000Z');
test('smazaná není v běžném seznamu',
  poznamkySeznam(z).length === 2 && !poznamkySeznam(z).some(x => x.id === p2.id));
test('smazané se dají vypsat zvlášť',
  poznamkySeznam(z, { smazane: true }).length === 3);
test('smazat dvakrát nepřepíše první záznam',
  poznamkySmaz(z, p2.id) === null);
const o = poznamkyObnov(z, p2.id);
test('obnovení poznámku vrátí', !!o && !o.smazano && poznamkySeznam(z).length === 3);
poznamkySmaz(z, p2.id, { kdo: 'Vendl' });

/* ---------- 6) řazení a filtr ---------- */
test('seznam je od nejnovější', (() => {
  const l = poznamkySeznam(z);
  for (let i = 1; i < l.length; i++) if (l[i - 1].kdy < l[i].kdy) return false;
  return true;
})(), poznamkySeznam(z).map(x => x.kdy).join(' | '));
test('filtr podle druhu', poznamkySeznam(z, { druh: 'sleva' }).length === 1);
test('filtr podle varianty', poznamkySeznam(z, { varianta: 'v-2' }).length === 1);
test('neznámý filtr nevrátí nic', poznamkySeznam(z, { druh: 'nesmysl' }).length === 0);

/* ---------- 7) přílohy ---------- */
const zp = nova();
const soubor = (nazev, bajtu) => ({ nazev, typ: 'application/pdf', velikost: bajtu,
  data: 'data:application/pdf;base64,' + 'A'.repeat(Math.max(4, Math.round(bajtu / 100))) });

const r1 = prilohyPridej(zp, soubor('Zadani_investora.pdf', 120000), { kdo: 'Vendl' });
test('příloha se přidá', r1.ok === true && zp.prilohy.length === 1);
test('příloha si pamatuje název i velikost',
  r1.priloha.nazev === 'Zadani_investora.pdf' && r1.priloha.velikost === 120000);

const r2 = prilohyPridej(zp, soubor('Obrovsky.pdf', POZN_MAX_PRILOHA + 1));
test('příliš velká příloha se odmítne', r2.ok === false && /velk/i.test(r2.duvod), r2.duvod);
test('a do zakázky se nedostane', zp.prilohy.length === 1);

test('příloha bez názvu nebo dat se odmítne',
  prilohyPridej(zp, { nazev: '', data: 'x' }).ok === false
  && prilohyPridej(zp, { nazev: 'a.pdf', data: '' }).ok === false);

test('velikost se sečte', prilohyVelikost(zp) === 120000);

/* Souhrnný strop je tam kvůli souboru zakázky: ten se posílá e-mailem a
 * nosí se s sebou. Sto megabajtů příloh z něj udělá něco, co se nedá otevřít. */
const zvelky = nova();
let i = 0, posledni = { ok: true };
while (posledni.ok && i < 60) { posledni = prilohyPridej(zvelky, soubor('p' + i + '.pdf', 4 * 1024 * 1024)); i++; }
test('souhrnný strop příloh drží', posledni.ok === false && /dohromady|celkem/i.test(posledni.duvod),
  posledni.duvod);
test('a nepřekročí se', prilohyVelikost(zvelky) <= POZN_MAX_CELKEM);

const sm = prilohySmaz(zp, r1.priloha.id, { kdo: 'Vendl' });
test('příloha se smaže doopravdy (data neseme v souboru)',
  !!sm && zp.prilohy.length === 0 && prilohySeznam(zp).length === 0);
test('po příloze zůstane záznam bez dat',
  Array.isArray(zp.prilohySmazane) && zp.prilohySmazane.length === 1
  && zp.prilohySmazane[0].nazev === 'Zadani_investora.pdf'
  && zp.prilohySmazane[0].data === undefined);

/* ---------- 8) shrnutí a text pro protokol ---------- */
const sh = poznamkyShrnuti(z);
test('shrnutí spočítá poznámky bez smazaných', sh.pocet === 2, JSON.stringify(sh));
test('shrnutí zná i počet smazaných', sh.smazanych === 1);
test('shrnutí zná poslední zápis', !!sh.posledni && sh.posledni.kdy >= '2026-07-30');
test('prázdná zakázka má nulové shrnutí', (() => {
  const s0 = poznamkyShrnuti(nova());
  return s0.pocet === 0 && s0.prilohy === 0 && s0.bajtu === 0 && s0.posledni === null;
})());
test('shrnutí snese null', poznamkyShrnuti(null).pocet === 0);

const txt = poznamkyText(z);
test('text obsahuje poznámky', /Novákem/.test(txt), txt);
test('text neobsahuje smazané', !/o týden dřív/.test(txt), txt);
test('text prázdné zakázky je prázdný', poznamkyText(nova()) === '');

test('velikost se čte lidsky',
  /kB|MB/.test(poznamkyVelikostText(120000)) && poznamkyVelikostText(0) === '0 B',
  poznamkyVelikostText(120000));

/* ---------- 9) přenos souborem ---------- */
const kopie = zk.importZakazka(JSON.parse(zk.StorageAdapter.exportuj(z)));
poznamkyZajisti(kopie);
test('poznámky přežijí uložení a načtení',
  poznamkySeznam(kopie).length === poznamkySeznam(z).length, JSON.stringify(poznamkySeznam(kopie).length));
test('a smazané taky', poznamkySeznam(kopie, { smazane: true }).length === 3);

/* Klon varianty (#34) je běžná cesta, jak pokračovat po odeslané nabídce.
 * Poznámky visí na zakázce, takže se klonem nesmí ani ztratit, ani zdvojit. */
const zk2 = nova();
poznamkyPridej(zk2, 'Před odesláním: sleva domluvená telefonicky.', { kdo: 'Vendl' });
zam.klonujVariantu(zk2, zk2.varianty[0].id);
test('klon varianty poznámky nezdvojí ani neztratí', poznamkySeznam(zk2).length === 1);
test('klon nedostane vlastní kopii poznámek',
  zk2.varianty.every(v => v.poznamky === undefined));

/* ---------- 10) NIC z toho se netiskne ----------
 * Tohle je ta kontrola, kvůli které funkce vůbec smí existovat. Poznámky
 * se musí objevit v zakázce a nikde jinde: ani v placeholderech nabídky,
 * ani v krycím listu, ani v technické specifikaci. */
const TAJNE = 'TAJNÁ INTERNÍ VĚTA 4711';
const zt = nova();
poznamkyPridej(zt, TAJNE, { kdo: 'Vendl' });
prilohyPridej(zt, soubor('Interni_kalkulace.pdf', 1000), { kdo: 'Vendl' });
zt.cislo = '2026 - OPR - CN - 099';
zt.nazevAkce = 'Bytový dům Kolbenova';
zt.objednatel = 'Stavby s.r.o.';

const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
const varianta = zt.varianty[0];
let dokumenty = '';
try { const nb = require('./nabidka.js');
      dokumenty += JSON.stringify(nb.nabidkaData(zt, varianta, JEKLY, 'cz')); } catch (e) {}
try { const kr = require('./kryci.js');
      dokumenty += JSON.stringify(kr.kryciData(zt, varianta, JEKLY)); } catch (e) {}
try { const ts = require('./techspec.js');
      dokumenty += JSON.stringify(ts.techspecRadky
        ? ts.techspecRadky(varianta.data.techspec) : varianta.data.techspec); } catch (e) {}
test('poznámka se nedostane do žádného dokumentu',
  dokumenty.length > 0 && dokumenty.indexOf(TAJNE) < 0, dokumenty.length);
test('ani název přílohy',
  dokumenty.indexOf('Interni_kalkulace') < 0);

/* A do zdrojáků generátorů se poznámky nesmí dostat ani omylem: kdyby někdo
 * do šablony nabídky přidal `ZAK.poznamky`, test výš by to nemusel chytit
 * (poznámka by tam byla jen když nějaká je). Proto ještě čtení textu. */
const GENERATORY = ['nabidka.js', 'nabidka_proj.js', 'kryci.js', 'kryci_proj.js',
                    'docxgen.js', 'dokumenty.js', 'techspec.js'];
const hrisnici = GENERATORY.filter(f =>
  /\bpoznamky\b|\bprilohy\b/.test(fs.readFileSync(__dirname + '/' + f, 'utf8')));
test('generátory dokumentů o poznámkách vůbec nevědí',
  hrisnici.length === 0, hrisnici.join(', '));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
