/* Kontrola dvou poruch nahlášených 5. 8. 2026 (#141):
 *   „Po aktualizaci mi zmizelo administrátorské přihlášení
 *    a nevidím záložku schvalování slev."
 *
 * Obě mají společného jmenovatele: aplikace vypadala funkčně, ale chyběl
 * prvek, kterým se dá stav napravit. Proto se tady kontroluje chování
 * v prohlížeči, ne jen logika v Node.
 *
 *  A) Nastavení uložené starší verzí (jeho `tabViditelnost` ještě neznala
 *     klíč `schvalovani`) nesmí záložku smazat. Nahrazení „na místě"
 *     nejdřív smaže všechny klíče cíle, takže bez dorovnání výchozími
 *     hodnotami by každý nový přepínač takhle zmizel všem, kdo mají
 *     uloženou starší konfiguraci.
 *
 *  B) Když překreslení aplikace spadne, musí zůstat viditelná cesta
 *     k přihlášení a hlášení o chybě. Dřív kreslil přihlášení až úplně
 *     poslední krok render(), takže chyba kdekoli předtím nechala roh
 *     hlavičky prázdný a překryv nevykreslený.
 *
 * Spuštění:  NODE_PATH=$(npm root -g) node overit_prihlaseni.mjs
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/* Dialogy jsou od 2. 9. 2026 v aplikaci (src/ui/dialog.js), ne nativní —
 * `page.on('dialog')` už tedy nic nechytí. Harness si proto potvrzování
 * zjednoduší: potvrd/hlaska/dotaz se nahradí funkcemi, které si text
 * zapamatují a rovnou odpoví „ano". Skutečný modál (kliknutí, Esc, Enter,
 * ovladatelnost stránky po zavření) ověřuje samostatný overit_dialogy.mjs. */
const dlgStub = async (page) => page.evaluate(() => {
  window.__dlgTexty = [];
  window.potvrd = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(true); };
  window.hlaska = (t) => { window.__dlgTexty.push(String(t)); return Promise.resolve(); };
  window.dotaz = (t, v) => { window.__dlgTexty.push(String(t)); return Promise.resolve(v == null ? '' : v); };
});
const dlgPosledni = async (page) => page.evaluate(() =>
  (window.__dlgTexty && window.__dlgTexty.length) ? window.__dlgTexty[window.__dlgTexty.length - 1] : '');


const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HTML = readFileSync('/home/claude/work/kng/dist/kalkulacka.html', 'utf8');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK   ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* Server bez /api: sonda selže, aplikace nabídne „Zkusit znovu / Pokračovat
 * bez přihlášení". Pro tyhle kontroly to stačí a je to zároveň nejhorší
 * reálný stav — přesně ten, ve kterém uživatel uvízl. */
const server = createServer((req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('{}'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
}).listen(0);
const port = server.address().port;

const prohlizec = await chromium.launch();
const page = await prohlizec.newPage();
const chyby = [];
page.on('pageerror', (e) => chyby.push(String(e)));
page.on('dialog', (d) => d.accept());
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });
await page.waitForTimeout(600);

await dlgStub(page);

/* ---------- A) záložka Schvalování slev přežije starou konfiguraci ---------- */

test('záložka Schvalování slev je po startu vidět',
  await page.evaluate(() => getComputedStyle(document.getElementById('tab-schvalovani')).display !== 'none'));

test('aplikace zná výchozí strukturu nastavení',
  await page.evaluate(() => typeof NAST_VYCHOZI === 'object' && !!NAST_VYCHOZI.tabViditelnost.schvalovani));

const poImportu = await page.evaluate(() => {
  const stara = {
    aplikace: 'Kalkulátor OCK', verze: 1,
    nastaveni: {
      /* přesně to, co uložila verze před vznikem záložky */
      tabViditelnost: { kalk: true, detail: true, spec: true, specdata: true, kryci: true,
        proj: true, kryciproj: true, cenik: true, cenikproj: true, zakazka: true },
      zobrazitNaklady: false, jazyk: 'cs',
    },
  };
  const v = konfiguraceImport(stara, { NAST }, { nastaveni: true });
  render();
  return {
    klic: NAST.tabViditelnost.schvalovani,
    display: getComputedStyle(document.getElementById('tab-schvalovani')).display,
    varovani: v.varovani,
  };
});
test('starý soubor nastavení klíč záložky nesmaže', poImportu.klic === true, JSON.stringify(poImportu));
test('záložka zůstane po importu viditelná', poImportu.display !== 'none', poImportu.display);
test('import na doplnění upozorní',
  poImportu.varovani.some((v) => /schvalovani/.test(v)), JSON.stringify(poImportu.varovani));

/* Vypnutí administrátorem se doplňováním nesmí obejít — jinak by šlo
 * záložky jen přidávat a nastavení viditelnosti by bylo k ničemu. */
const poVypnuti = await page.evaluate(() => {
  konfiguraceImport({ aplikace: 'Kalkulátor OCK', verze: 1,
    nastaveni: { tabViditelnost: { kalk: true, zakazka: true, schvalovani: false } } },
    { NAST }, { nastaveni: true });
  render();
  return { klic: NAST.tabViditelnost.schvalovani,
    display: getComputedStyle(document.getElementById('tab-schvalovani')).display };
});
test('vědomě vypnutá záložka zůstane v importovaném nastavení vypnutá',
  poVypnuti.klic === false, JSON.stringify(poVypnuti));
/* 20. 8. 2026: `tabViditelnost` je MRTVÉ POLE — viditelnost záložek řídí
 * matice zobrazení (Nastavení → Zobrazení), která platí po rolích a bydlí
 * na serveru. Import starého souboru ho tedy smí donést, ale na obrazovku
 * už nemá vliv; kontrola se proto ptá na matici. */
test('na obrazovku má vliv jen matice zobrazení, ne staré pole',
  poVypnuti.display !== 'none', poVypnuti.display);
test('a maticí se záložka schvalování vypnout DÁ',
  await page.evaluate(() => {
    NAST.zobrazeni['tab.schvalovani'] = { 'Obchodník': false, 'Vedoucí': false };
    NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
    const skryta = getComputedStyle(document.getElementById('tab-schvalovani')).display === 'none';
    NAST.jeAdmin = true; NAST.nahledRole = '';
    NAST.zobrazeni['tab.schvalovani'] = { 'Obchodník': true, 'Vedoucí': true }; render();
    return skryta;
  }));

/* ---------- B) cesta k přihlášení přežije chybu překreslení ---------- */

await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(600);
await dlgStub(page);

test('bez přihlášení nabízí roh hlavičky „Přihlásit se"',
  (await page.locator('#onlineLista').innerHTML()).includes('Přihlásit se'));
test('přihlašovací překryv je vidět',
  await page.evaluate(() => getComputedStyle(document.getElementById('prihlaseni-overlay')).display !== 'none'));

/* Nouzový režim = uživatel pokračuje bez přihlášení. Překryv zmizí, ale
 * tlačítko zpět k přihlášení musí zůstat. */
await page.evaluate(() => onlineNouzove());
await page.waitForTimeout(200);
test('v nouzovém režimu překryv zmizí',
  await page.evaluate(() => getComputedStyle(document.getElementById('prihlaseni-overlay')).display === 'none'));
test('a tlačítko zpět k přihlášení zůstává',
  (await page.locator('#onlineLista').innerHTML()).includes('Přihlásit se'));

/* Umělá porucha uprostřed překreslení: renderZakazka() je hluboko v těle
 * render(), daleko za výpočtem viditelnosti záložek a před vykreslením
 * přihlášení v původním pořadí. */
const poPoruse = await page.evaluate(() => {
  const puvodni = window.renderZakazka;
  window.renderZakazka = () => { throw new Error('zkušební porucha překreslení'); };
  try { render(); } catch (e) { /* render chybu chytá sám */ }
  const stav = {
    lista: document.getElementById('onlineLista').innerHTML,
    banner: (document.getElementById('render-chyba') || {}).textContent || '',
    bannerVidet: !!document.getElementById('render-chyba')
      && getComputedStyle(document.getElementById('render-chyba')).display !== 'none',
  };
  window.renderZakazka = puvodni;
  return stav;
});
test('po chybě překreslení zůstane cesta k přihlášení',
  poPoruse.lista.includes('Přihlásit se'), poPoruse.lista.slice(0, 80));
test('po chybě se ukáže hlášení, ne tichá poloviční obrazovka',
  poPoruse.bannerVidet && /zkušební porucha/.test(poPoruse.banner), poPoruse.banner.slice(0, 120));

await page.waitForTimeout(300);
test('chyba se vyhodí dál, aby ji zachytila konzole i testy',
  chyby.some((c) => /zkušební porucha/.test(c)), chyby.join(' | ').slice(0, 160));

/* Po úspěšném překreslení hlášení zmizí — jinak by na obrazovce zůstalo
 * viset i poté, co je dávno po problému. */
const poUzdraveni = await page.evaluate(() => {
  render();
  const b = document.getElementById('render-chyba');
  return !b || getComputedStyle(b).display === 'none';
});
test('po povedeném překreslení hlášení zmizí', poUzdraveni);

const jineChyby = chyby.filter((c) => !/zkušební porucha/.test(c));
test('žádná jiná chyba JavaScriptu', jineChyby.length === 0, jineChyby.slice(0, 2).join(' | '));

await prohlizec.close();
server.close();

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
