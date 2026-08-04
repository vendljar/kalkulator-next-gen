/* Kouřový test sestavené aplikace (dist/kalkulacka.html).
 *
 * Node testy v src/ ověřují jádro, ale nikdy nespustí prohlížeč. Jednosouborový
 * build přitom může selhat způsobem, který se v Node neprojeví: pořadí souborů
 * v bundlu, chybějící modul v build.py, překlep v inline onclick, výjimka při
 * prvním render(). Takové rozbití by se poznalo až u obchodníka.
 *
 * Test proto otevře opravdu sestavený soubor a hlídá to, co Node neuvidí:
 *   – žádná chyba v konzoli a žádná neodchycená výjimka při startu,
 *   – všechny záložky se přepnou a vykreslí,
 *   – historie (#1): Zpět/Znovu opravdu vrací stav, záloha se zapíše do
 *     úložiště a po refreshi se nabídne obnova,
 *   – štítek režimu výpočtu (#2) říká pravdu o fixes,
 *   – administrátorské panely nastavení včetně Slovníku (#5) se vykreslí.
 *
 * Spuštění: node smoke.mjs
 * Vyžaduje playwright (lokálně nebo globálně: npm i -g playwright).
 * Při globální instalaci je potřeba NODE_PATH=$(npm root -g).
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

// require (ne import) kvůli globální instalaci: import v ESM NODE_PATH ignoruje
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. Nainstalujte: npm i -g playwright'
    + '\na spusťte: NODE_PATH=$(npm root -g) node smoke.mjs');
  process.exit(2);
}

const SOUBOR = path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext();
const page = await ctx.newPage();

const chyby = [];
page.on('console', m => { if (m.type() === 'error') chyby.push('console: ' + m.text()); });
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));

await page.goto(pathToFileURL(SOUBOR).href);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(300);

/* ---- start bez chyb ---- */
test('aplikace nastartovala bez chyby v konzoli', chyby.length === 0, chyby);
/* Hned po startu, dokud jsme do zakázky nesáhli: prázdná historie. Kdyby se
 * sem něco dostalo, znamenalo by to, že se ZAK mění mezi prvním a druhým
 * renderem (migrace, katalog) a „Zpět" by uživatele vrátilo někam, kde nikdy
 * nebyl. Proto se to testuje dřív než cokoli jiného. */
test('tlačítko Zpět je po startu zakázané', await page.locator('#btnHistZpet').isDisabled());
test('výpočet se vykreslil', (await page.locator('#outputs').innerHTML()).length > 500);
test('verze je v hlavičce', /\d+\.\d+\.\d+/.test(await page.locator('body').innerText()));

/* ---- štítek režimu (#2) ---- */
const pill = page.locator('#rezimPill');
test('štítek režimu je vidět', await pill.isVisible());
test('výchozí režim je 1:1 s Excelem', (await pill.innerText()).includes('1:1'), await pill.innerText());
test('štítek varuje barvou', (await pill.getAttribute('class') || '').includes('warn'));

await page.evaluate(() => { set('OCK.fixes', 'fix'); });
await page.waitForTimeout(150);
test('po přepnutí režimu štítek přestane varovat',
  (await pill.innerText()).includes('opravený') && !(await pill.getAttribute('class') || '').includes('warn'),
  await pill.innerText());
await page.evaluate(() => { set('OCK.fixes', 'compat'); });
await page.waitForTimeout(150);

/* ---- záložky ---- */
const taby = await page.evaluate(() => TABY);
for (const t of taby) {
  await page.evaluate(x => prepniTab(x), t);
  await page.waitForTimeout(60);
}
await page.evaluate(() => prepniTab('kalk'));
test('všechny záložky se přepnuly bez chyby', chyby.length === 0, chyby);

/* ---- historie: Zpět / Znovu (#1) ---- */
const puvodni = await page.evaluate(() => Z.pocetZastavek);
await page.evaluate(() => { set('Z.pocetZastavek', String((+Z.pocetZastavek || 2) + 3)); });
await page.waitForTimeout(150);
test('změna zadání se projeví', await page.evaluate(() => Z.pocetZastavek) !== puvodni);
test('tlačítko Zpět se povolilo', !(await page.locator('#btnHistZpet').isDisabled()));

await page.locator('#btnHistZpet').click();
await page.waitForTimeout(200);
test('Zpět vrátilo původní hodnotu', await page.evaluate(() => Z.pocetZastavek) === puvodni,
  await page.evaluate(() => Z.pocetZastavek));

await page.locator('#btnHistZnovu').click();
await page.waitForTimeout(200);
test('Znovu vrátilo změnu', await page.evaluate(() => Z.pocetZastavek) !== puvodni);
await page.locator('#btnHistZpet').click();
await page.waitForTimeout(200);

/* Ctrl+Z mimo textové pole musí fungovat stejně jako tlačítko. */
await page.evaluate(() => { set('Z.pocetZastavek', String((+Z.pocetZastavek || 2) + 5)); });
await page.waitForTimeout(150);
await page.locator('body').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('Control+z');
await page.waitForTimeout(250);
test('Ctrl+Z vrací stejně jako tlačítko', await page.evaluate(() => Z.pocetZastavek) === puvodni,
  await page.evaluate(() => Z.pocetZastavek));

/* ---- záloha do úložiště a nabídka obnovy ---- */
await page.evaluate(() => { set('ZAK.nazevAkce', 'Kouřový test výtahu'); });
await page.waitForTimeout(1600);   // HIST_PRODLEVA + rezerva
const zaloha = await page.evaluate(() => { try { return localStorage.getItem('kng_rozpracovano_v1'); } catch (e) { return null; } });
test('záloha se zapsala do úložiště prohlížeče', !!zaloha && zaloha.indexOf('Kouřový test') > 0);
test('popisek zálohy je vidět', (await page.locator('#autoStav').innerText()).indexOf('zálohováno') >= 0,
  await page.locator('#autoStav').innerText());

await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(300);
test('po refreshi se nabídne obnova', await page.locator('#obnovaLista').isVisible());
test('lišta obnovy pojmenuje zakázku',
  (await page.locator('#obnovaLista').innerText()).indexOf('Kouřový test') > 0,
  await page.locator('#obnovaLista').innerText());

await page.locator('#obnovaLista button.primary').click();
await page.waitForTimeout(300);
test('obnova nahrála zálohovanou zakázku',
  await page.evaluate(() => ZAK.nazevAkce) === 'Kouřový test výtahu',
  await page.evaluate(() => ZAK.nazevAkce));

/* ---- horní lišta: jen Zpět/Znovu (zadání 4. 8. 2026) ----
 * „Z horní lišty odstraň 3 světlá tlačítka a zvýrazni nějak zpět a znovu."
 * Odstraněná tlačítka nesmí zmizet ze světa – jen z hlavičky: ukládání
 * a načítání žije na záložce Přehled cenových nabídek, tisk má každý
 * dokument u svého náhledu. Skrytý #fileIn musí v dokumentu zůstat,
 * protože „Načíst zakázku" na něj kliká za uživatele. */
const lista = await page.evaluate(() => {
  const h = document.querySelector('header');
  const t = h ? h.innerText : '';
  const b = id => {
    const e = document.getElementById(id); if (!e) return null;
    const s = getComputedStyle(e);
    return { pozadi: s.backgroundColor, stin: s.boxShadow, ram: s.borderColor, vidno: e.offsetParent !== null };
  };
  return { text: t, fileIn: !!document.getElementById('fileIn'),
           zpet: b('btnHistZpet'), znovu: b('btnHistZnovu') };
});
test('v hlavičce už není „Uložit zakázku"', !/Uložit zakázku/.test(lista.text), lista.text);
test('v hlavičce už není „Tisk / PDF"', !/Tisk\s*\/\s*PDF/.test(lista.text), lista.text);
test('v hlavičce už není samostatné „Načíst"', !/Načíst/.test(lista.text), lista.text);
test('skrytý vstup na soubor v dokumentu zůstal', lista.fileIn === true);
test('Zpět i Znovu v hlavičce jsou', !!lista.zpet && !!lista.znovu);
test('Zpět i Znovu jsou vidět', lista.zpet.vidno === true && lista.znovu.vidno === true);

/* Zvýraznění se pozná jen u činného tlačítka: zhasnuté má splývat s lištou,
 * činné být světlé a orámované. Historie je po obnově zálohy neprázdná, takže
 * Zpět tady musí být činné – kdyby nebylo, měřilo by se zhasnuté tlačítko
 * a test by mlčky prošel s nic neříkajícími hodnotami. Proto se tu napřed
 * schválně udělá změna – na prázdné historii by měření nedávalo smysl. */
await page.evaluate(() => { set('Z.pocetZastavek', String((+Z.pocetZastavek || 2) + 1)); });
/* Historie se zapisuje se zpožděním (HIST_PRODLEVA), aby psaní do políčka
 * nedělalo krok za každé písmeno – čeká se tedy na výsledek, ne na hodiny. */
await page.waitForFunction(() => !document.getElementById('btnHistZpet').disabled,
  null, { timeout: 5000 }).catch(() => {});
test('Zpět je po změně v zakázce činné', !(await page.locator('#btnHistZpet').isDisabled()));
const zvyrazneni = await page.evaluate(() => {
  const e = document.getElementById('btnHistZpet'), s = getComputedStyle(e);
  const h = document.querySelector('header'), sh = getComputedStyle(h);
  return { pozadi: s.backgroundColor, stin: s.boxShadow, lista: sh.backgroundColor };
});
test('činné Zpět je světlé, ne v barvě lišty',
  zvyrazneni.pozadi !== zvyrazneni.lista && /255,\s*255,\s*255/.test(zvyrazneni.pozadi),
  JSON.stringify(zvyrazneni));
test('činné Zpět má zvýrazňující obrys', zvyrazneni.stin !== 'none' && zvyrazneni.stin !== '',
  zvyrazneni.stin);

/* A totéž z druhé strany: co z hlavičky zmizelo, musí být k nalezení jinde. */
await page.evaluate(() => prepniTab('zakazka'));
await page.waitForTimeout(200);
const zak = await page.locator('#page-zakazka').innerText();
/* Od 4. 8. 2026 se cesty rozdělily: do databáze ukládá trojice v liště
 * („Uložit zakázku"), do souboru na disk pak dvojice na téhle záložce,
 * přejmenovaná tak, aby z názvu bylo poznat, co dělá. Obojí musí být
 * k nalezení, aby se práce nedala ztratit ani při výpadku databáze. */
test('„Uložit do souboru (JSON)" je na záložce Přehled cenových nabídek', zak.includes('Uložit do souboru (JSON)'));
test('„Načíst ze souboru" je na záložce Přehled cenových nabídek', zak.includes('Načíst ze souboru'));
test('trojice pro databázi je na záložce taky (Uložit zakázku)', zak.includes('Uložit zakázku'));
await page.evaluate(() => prepniTab('kalk'));
await page.waitForTimeout(150);

/* ---- nastavení včetně Slovníku (#5) ---- */
await page.evaluate(() => { NAST.jeAdmin = true; otevriNastaveni(); });
await page.waitForTimeout(200);
const panely = ['obecne', 'firma', 'uzivatele', 'slevy', 'sablony', 'konfigurace', 'slovnik'];
for (const p of panely) {
  await page.evaluate(x => nastPanel(x), p);
  await page.waitForTimeout(80);
  const delka = (await page.locator('#nastaveni-panel .body').innerHTML()).length;
  test('panel nastavení „' + p + '" se vykreslil', delka > 200, delka);
}
test('záložka Slovník je v liště', (await page.locator('.nast-tabs').innerText()).includes('Slovník'));
test('Slovník vysvětlí, že se nic nezapíše samo',
  (await page.locator('#nastaveni-panel .body').innerText()).includes('Nic se nezapíše samo'));
await page.evaluate(() => zavriNastaveni());

/* ---- ATYP přirážka (#22) ---- */
await page.evaluate(() => { NAST.jeAdmin = true; nastPanel('obecne'); otevriNastaveni(); });
await page.waitForTimeout(150);
test('nastavení ATYP přirážky je dostupné',
  (await page.locator('#nastaveni-panel .body').innerText()).toUpperCase().includes('ATYP'));
await page.evaluate(() => zavriNastaveni());

/* ---- rozvržení OCK na plnou šířku (zadání 3. 8. 2026) ----
 * Zadání šachty, Dimenze profilů a Práce a režie stojí v hlavním sloupci
 * mezi souhrnem a Cenovou kalkulací — jako v kalkulaci PROJ. */
const rozvrzeni = await page.evaluate(() => {
  const deti = [...document.querySelectorAll('#page-kalk > *')].map(e => e.id || e.className);
  const souhrnNadZadanim = (() => {
    const s2 = document.getElementById('kalk-souhrn'), z = document.getElementById('ock-zadani');
    return s2 && z && s2.getBoundingClientRect().top <= z.getBoundingClientRect().top;
  })();
  const poradiKaret = ['ock-zadani', 'ock-profily', 'ock-prace', 'ock-kalkulace']
    .map(id => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().top : null; });
  const sirky = ['ock-zadani', 'ock-kalkulace'].map(id => document.getElementById(id).getBoundingClientRect().width);
  return { deti, poradiKaret, souhrnNadZadanim, rozdilSirek: Math.abs(sirky[0] - sirky[1]),
           gridPryc: !document.querySelector('#page-kalk .kalk-grid') };
});
test('vstupy stojí v hlavním sloupci (žádný boční sloupec)', rozvrzeni.gridPryc,
  JSON.stringify(rozvrzeni.deti));
test('souhrn kalkulace stojí NAD zadáním šachty', rozvrzeni.souhrnNadZadanim === true);
test('pořadí: zadání → dimenze → práce a režie → cenová kalkulace',
  rozvrzeni.poradiKaret.every((t, i, a) => t != null && (i === 0 || t >= a[i - 1])),
  JSON.stringify(rozvrzeni.poradiKaret));
test('karty zadání mají plnou šířku jako kalkulace', rozvrzeni.rozdilSirek < 2,
  String(rozvrzeni.rozdilSirek));

/* ---- nic se cestou nerozbilo ---- */
test('za celý průchod nevznikla chyba v konzoli', chyby.length === 0, chyby);

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
