/* Kontrola v prohlížeči: záložka Schvalování slev (#137).
 *
 * Proč to nestačí ověřit v Node: pravidla rozhodování má `src/test_schvalovani.js`
 * (38 kontrol) — ta ale běží nad holými objekty. Tady jde o to, jestli je
 * celý řetěz opravdu propojený:
 *
 *   obchodník zadá slevu nad strop      →  stav „čeká na rozhodnutí"
 *   → záložka Schvalování slev            seznam žádostí za celou zakázku
 *   → tlačítko Schválit                 →  zápis KDO a KDY do varianty
 *   → zvýšení procenta                  →  schválení padá zpět na „čeká"
 *   → náhled cizí role                  →  tlačítka mizí i s vysvětlením
 *
 * Zvlášť se hlídají dvě věci, které se v jednotkových testech poznat nedají:
 * že se rozhodnutí podepisuje přihlášeným člověkem (dřív se do zakázky psala
 * jen ROLE, takže po půl roce nešlo zjistit, kdo slevu pustil), a že uzamčená
 * varianta — tedy nabídka, která už odešla zákazníkovi — nejde přeschválit.
 *
 * Aplikace tu běží OFFLINE, bez serveru: schvalování je práce s otevřenou
 * zakázkou v okně, žádné volání API k němu nepatří. Role se přepínají
 * náhledem administrátora (Nastavení → Zobrazení → „Zobrazit jako"), stejně
 * jako v overit_role_nahled.mjs.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_schvalovani.mjs
 */
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. NODE_PATH=$(npm root -g) node overit_schvalovani.mjs');
  process.exit(2);
}

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

const html = readFileSync(path.resolve('dist/kalkulacka.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ADRESA = 'http://127.0.0.1:' + server.address().port;

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
let poslednihlaska = '';
page.on('dialog', d => { poslednihlaska = d.message(); d.accept(); });
const chyby = [];
page.on('pageerror', e => chyby.push(String(e)));
/* Offline: server neexistuje, volání API má tiše selhat. */
await page.route('**/api/**', route => route.fulfill({ status: 503, body: '{"ok":false}' }));

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(600);

/* ---------- nouzový režim bez serveru ----------
 * Stránka se tu podává z opravdového http serveru (kvůli file:// omezením),
 * takže aplikace považuje online provoz za možný a při mrtvém /api rozprostře
 * přes celé okno přihlašovací plachtu. Ta by každý klik v záložce spolkla –
 * Playwright hlásí „prihlaseni-overlay intercepts pointer events". Klikneme
 * proto na totéž tlačítko, které by v takové chvíli zmáčkl uživatel:
 * „Pokračovat bez přihlášení" (onlineNouzove()). Schvalování je práce
 * s otevřenou zakázkou v okně, žádné volání API k němu nepatří. */
await page.evaluate(() => onlineNouzove());
await page.waitForTimeout(200);
test('nouzový režim schová přihlašovací plachtu',
  await page.evaluate(() => document.getElementById('prihlaseni-overlay').style.display === 'none'));

/* ---------- zkušební ceník do běžícího sestavení ----------
 * Sestavení nese PRÁZDNÝ ceník (samé nuly) — ostré ceny do repozitáře nepatří.
 * Z nul se ale sleva vyhodnotit nedá: cena i náklad jsou nula, marže tedy
 * neexistuje a každá žádost by skončila jako „pod minimální marží". Podstrčí
 * se proto tentýž zkušební ceník, ze kterého počítají jednotkové testy —
 * čte se tady v Node a do stránky jde jako obyčejná data, do sestavení nevede.
 *
 * Zkušební ceník dává marži kolem 17 %, takže při firemním minimu 10 % by se
 * pod minimum propadla už sleva kolem 8 % a žádosti by se místo rozhodování
 * zase jen zamítaly. Minimum se proto pro průchod snižuje; samotnou hranici
 * marže prověřuje test_sleva.js. */
const ZC = require(path.resolve('src/zkusebni_cenik.js'));
await page.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta();
  NAST.slevy.minMarze = 0.02;
  NAST.slevy.stropy = { 'Obchodník': 0.05, 'Vedoucí': 0.15, 'Administrátor': 1 };
  render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await page.waitForTimeout(300);

const stav = () => page.evaluate(() => ({
  stav: SL.stav, procenta: SL.procenta, schvalil: SL.schvalil, schvalilKdy: SL.schvalilKdy,
  zamitl: SL.zamitl, zamitlKdy: SL.zamitlKdy, duvod: SL.zamitnutoDuvod,
  schvalenoProc: SL.schvalenoProc, zamitnutoProc: SL.zamitnutoProc,
  kategorie: schvalovaniKategorie(SL),
}));
const textZalozky = async () => {
  await page.evaluate(() => prepniTab('schvalovani'));
  await page.waitForTimeout(150);
  return page.locator('#page-schvalovani').innerText();
};
const tlacitko = (popis) => page.locator(`#page-schvalovani button:text-is("${popis}")`);

/* ---------- 1) záložka existuje a je propojená ---------- */

test('v liště je tlačítko záložky „Schvalování slev"',
  await page.locator('#tab-schvalovani').isVisible());
test('stránka záložky je v šabloně', await page.locator('#page-schvalovani').count() === 1);
test('záložka je v seznamu TABY',
  await page.evaluate(() => TABY.includes('schvalovani')));
test('viditelnost záložky jde vypnout v Nastavení',
  await page.evaluate(() => NAST_TAB_LABELS.schvalovani === 'Schvalování slev'
    && NAST.tabViditelnost.schvalovani === true));
test('render() záložku vykresluje',
  await page.evaluate(() => document.getElementById('page-schvalovani').innerHTML.length > 0));

/* ---------- 2) bez zadané slevy je seznam prázdný a vysvětlený ---------- */

let t = await textZalozky();
test('bez slevy se napíše, že není o čem rozhodovat', /není o čem rozhodovat/.test(t), t.slice(0, 200));
test('a poradí se, kde se sleva zadává', /Sleva na nabídku/.test(t));

/* ---------- 3) sleva nad strop role zadavatele → žádost ---------- */

await page.evaluate(() => { prepniTab('kalk'); slevaSet('role', 'Obchodník'); slevaSet('procenta', 8); });
await page.waitForTimeout(250);
let s = await stav();
test('sleva 8 % nad stropem obchodníka (5 %) čeká na rozhodnutí', s.kategorie === 'ceka', JSON.stringify(s));
test('karta slevy v kalkulaci odkáže na novou záložku',
  (await page.locator('#ock-sleva').innerText()).includes('Schvalování slev'));
test('a nabídne tlačítko pro přechod',
  await page.locator('#ock-sleva button:text-is("Přejít na schvalování")').isVisible());
test('staré tlačítko „Schválit slevu" v kartě už není',
  await page.locator('#ock-sleva button:text-is("Schválit slevu")').count() === 0);
test('a zmizel i rozbalovací seznam „Schvaluje (nadřízený)"',
  !(await page.locator('#ock-sleva').innerText()).includes('Schvaluje (nadřízený)'));

t = await textZalozky();
test('žádost je v seznamu vidět', /čeká na rozhodnutí/.test(t), t.slice(0, 300));
test('seznam ukazuje počty žádostí', /čeká: 1/.test(t));
test('a napíše, že neschválená sleva se do nabídky nepropíše',
  /nepropíše/.test(t));
test('administrátor má tlačítko Schválit', await tlacitko('Schválit').isVisible());
test('a tlačítko Zamítnout', await tlacitko('Zamítnout').isVisible());
test('rozhodnutí se podepisuje jménem, ne rolí',
  /Rozhodnutí se podepisuje jako/.test(t), t.slice(-300));

/* ---------- 4) schválení: kdo, kdy, a co se stane po zvýšení procenta ---------- */

await tlacitko('Schválit').click();
await page.waitForTimeout(250);
s = await stav();
test('po schválení je stav „schváleno"', s.kategorie === 'schvaleno', JSON.stringify(s));
test('zapsalo se KDO rozhodl', !!s.schvalil, s.schvalil);
test('zapsalo se KDY rozhodl', !!s.schvalilKdy, s.schvalilKdy);
test('schválení se váže na konkrétní procento', s.schvalenoProc === 8, s.schvalenoProc);

await page.evaluate(() => { prepniTab('kalk'); render(); });
await page.waitForTimeout(200);
test('schválení přežije překreslení', (await stav()).kategorie === 'schvaleno');

await page.evaluate(() => slevaSet('procenta', 12));
await page.waitForTimeout(250);
s = await stav();
test('zvýšení slevy sráží schválení zpět na „čeká"', s.kategorie === 'ceka', JSON.stringify(s));
test('a jméno schvalovatele se smaže', !s.schvalil, s.schvalil);

/* ---------- 5) zamítnutí s důvodem ---------- */

await textZalozky();
await page.evaluate(() => {
  const id = ZAK.aktivni;
  schvDuvod(id, 'Zákazník neposlal objednávku.');
});
await tlacitko('Zamítnout').click();
await page.waitForTimeout(250);
s = await stav();
test('po zamítnutí je stav „zamítnuto"', s.kategorie === 'zamitnuto', JSON.stringify(s));
test('zapsalo se KDO zamítl', !!s.zamitl, s.zamitl);
test('zapsal se i důvod', s.duvod === 'Zákazník neposlal objednávku.', s.duvod);
test('zamítnutí se váže na procento', s.zamitnutoProc === 12, s.zamitnutoProc);
t = await textZalozky();
test('důvod zamítnutí je v seznamu vidět', /neposlal objednávku/.test(t));
test('zamítnutou žádost lze vrátit', await tlacitko('Vrátit rozhodnutí').isVisible());

await tlacitko('Vrátit rozhodnutí').click();
await page.waitForTimeout(250);
s = await stav();
test('vrácení uvolní žádost zpět na „čeká"', s.kategorie === 'ceka', JSON.stringify(s));
test('a smaže stopu po zamítnutí', !s.zamitl && s.zamitnutoProc === undefined, JSON.stringify(s));

/* ---------- 6) náhled cizí role: obchodník nerozhoduje ---------- */

await page.evaluate(() => zobrNahled('Obchodník'));
await page.waitForTimeout(300);
t = await textZalozky();
test('obchodník svou žádost v seznamu vidí', /čeká na rozhodnutí/.test(t), t.slice(0, 200));
test('ale tlačítko Schválit nemá', await tlacitko('Schválit').count() === 0);
test('a dozví se, kdo o slevě rozhoduje', /rozhoduje vedoucí nebo administrátor/.test(t));
test('otevřít variantu v kalkulaci smí i tak', await tlacitko('Otevřít v kalkulaci').isVisible());

/* Obchvat z konzole nesmí projít — právo se kontroluje i v obsluze. */
poslednihlaska = '';
await page.evaluate(() => schvRozhodni(ZAK.aktivni, 'schvalit'));
await page.waitForTimeout(250);
s = await stav();
test('schválení z konzole bez práva neprojde', s.kategorie === 'ceka', JSON.stringify(s));
test('a řekne se proč', /Schvalování slevy nad strop role/.test(poslednihlaska), poslednihlaska);

/* ---------- 7) vedoucí: rozhoduje jen do svého stropu ---------- */

await page.evaluate(() => { zobrNahled(''); zobrSet('sleva.schvalovani', 'Vedoucí', true); });
await page.waitForTimeout(200);
test('administrátor smí právo schvalování přidělit vedoucímu',
  await page.evaluate(() => zobrazeniSmi('Vedoucí', 'sleva.schvalovani', NAST.zobrazeni) === true));

await page.evaluate(() => { prepniTab('kalk'); slevaSet('procenta', 20); });
await page.waitForTimeout(250);
await page.evaluate(() => zobrNahled('Vedoucí'));
await page.waitForTimeout(300);
t = await textZalozky();
test('sleva 20 % je nad stropem vedoucího (15 %) – tlačítko Schválit nemá',
  await tlacitko('Schválit').count() === 0);
test('a seznam napíše, kdo o ní rozhodne', /přesahuje strop role/.test(t), t.slice(0, 400));

await page.evaluate(() => { zobrNahled(''); prepniTab('kalk'); slevaSet('procenta', 10); });
await page.waitForTimeout(250);
await page.evaluate(() => zobrNahled('Vedoucí'));
await page.waitForTimeout(300);
/* Poslední prepniTab('kalk') nechal otevřenou kalkulaci – stránka schvalování
 * je tím pádem skrytá a tlačítko v ní by nešlo kliknout, i když v DOM je. */
t = await textZalozky();
test('sleva 10 % je v jeho stropu – tlačítko Schválit má',
  await tlacitko('Schválit').isVisible(), t.slice(0, 300));
await tlacitko('Schválit').click();
await page.waitForTimeout(250);
s = await stav();
test('vedoucí slevu do svého stropu schválí', s.kategorie === 'schvaleno', JSON.stringify(s));
test('a podepíše se rolí Vedoucí', /Vedoucí/.test(s.schvalil || ''), s.schvalil);

/* ---------- 8) uzamčená varianta se nepřeschvaluje ---------- */

await page.evaluate(() => {
  zobrNahled('');
  zamkniVariantu(aktivniVarianta(ZAK), { typ: 'CN', cislo: 'ZK-000/25' });
  render();
});
await page.waitForTimeout(300);
t = await textZalozky();
test('uzamčená varianta je v seznamu označená', /uzamčená/.test(t), t.slice(0, 300));
test('a rozhodovat u ní nejde', await tlacitko('Zamítnout').count() === 0);
test('vysvětlí se to větou, ne prázdným sloupcem', /uzamčená jako odeslaná nabídka/.test(t));

poslednihlaska = '';
await page.evaluate(() => schvRozhodni(ZAK.aktivni, 'zamitnout'));
await page.waitForTimeout(250);
s = await stav();
test('ani obchvatem z konzole', s.kategorie === 'schvaleno', JSON.stringify(s));
test('a řekne se proč', /uzamčená/.test(poslednihlaska), poslednihlaska);
test('přepočet uzamčenou variantu nepřepisuje',
  (await stav()).schvalenoProc === 10, JSON.stringify(await stav()));

test('žádná chyba JavaScriptu', chyby.length === 0, chyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
