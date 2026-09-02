/* Ověření v prohlížeči: ruční přepis množství u příplatkových položek
 * (2. 9. 2026, zadání J. V. po testu „Kornpfortstraße").
 *
 * Proč harness a ne jen jednotkový test: počítání hlídá `src/test_prepisy.js`.
 * Tady jde o to, co uvidí administrátor — že u příplatku je pole (ne jen
 * text), že se přepis propíše do nákladu a že ho tlačítko ↺ vrátí zpátky.
 * Přesně tohle v aplikaci chybělo: předloha má u některých položek pod čarou
 * množství 0, aby se nenabízely, a nešlo to napodobit.
 *
 * Spuštění: node overit_priplatky.mjs
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail === undefined ? '' : '  → ' + detail)); }
};

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const konzole = [];
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
await p.goto(KDE);
await p.waitForTimeout(600);

await p.evaluate(() => { NAST.jeAdmin = true; prepniTab('kalk'); render(); });

/* ---------- 1) pole místo textu ---------- */
const pole = await p.evaluate(() => {
  const html = document.getElementById('page-kalk').innerHTML;
  return {
    maPole: /onchange="mnozstviSet\('ZÁBRANY DO DVEŘNÍCH VSTUPŮ'/.test(html),
    pozn: /Název, množství i jedn\. cenu lze přepsat/.test(html),
  };
});
zkus('u příplatku je pole pro množství, ne jen text', pole.maPole);
zkus('poznámka pod tabulkou o přepisu množství ví', pole.pozn);

/* ---------- 2) přepis se propíše do nákladu ---------- */
const prepis = await p.evaluate(() => {
  const najdi = () => spocitejVariantu(aktivniVarianta(ZAK)).ock.priplatky
    .find(x => (x.origNazev || x.nazev) === 'ZÁBRANY DO DVEŘNÍCH VSTUPŮ');
  const pred = najdi();
  mnozstviSet('ZÁBRANY DO DVEŘNÍCH VSTUPŮ', 0);
  const po = najdi();
  return { predMn: pred.mnozstvi, predNakl: pred.naklad,
           poMn: po.mnozstvi, poNakl: po.naklad, poPrepsano: po.prepsano,
           poAuto: po.mnozstviAuto };
});
zkus('přepis na 0 dá nulové množství i náklad',
  prepis.poMn === 0 && prepis.poNakl === 0, JSON.stringify(prepis));
zkus('řádek si pamatuje vypočtené množství pro ↺',
  prepis.poAuto === prepis.predMn && prepis.poPrepsano === true, JSON.stringify(prepis));

/* ---------- 3) tlačítko ↺ se objeví a vrátí automatiku ---------- */
const resetBtn = await p.evaluate(() => {
  render();
  const html = document.getElementById('page-kalk').innerHTML;
  return /onclick="mnozstviSet\('ZÁBRANY DO DVEŘNÍCH VSTUPŮ', ''\)"/.test(html);
});
zkus('u přepsaného příplatku svítí tlačítko ↺', resetBtn);

const poResetu = await p.evaluate(() => {
  mnozstviSet('ZÁBRANY DO DVEŘNÍCH VSTUPŮ', '');
  const x = spocitejVariantu(aktivniVarianta(ZAK)).ock.priplatky
    .find(y => (y.origNazev || y.nazev) === 'ZÁBRANY DO DVEŘNÍCH VSTUPŮ');
  return { mn: x.mnozstvi, prepsano: x.prepsano, nastupiste: Z.nastupiste };
});
zkus('↺ vrátí vypočtené množství',
  poResetu.mn === poResetu.nastupiste && poResetu.prepsano === false, JSON.stringify(poResetu));

/* ---------- 4) obchodník pole nemá ---------- */
const obchodnik = await p.evaluate(() => {
  NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
  const html = document.getElementById('page-kalk').innerHTML;
  NAST.jeAdmin = true; NAST.nahledRole = ''; render();
  return !/onchange="mnozstviSet\('ZÁBRANY DO DVEŘNÍCH VSTUPŮ'/.test(html);
});
zkus('obchodník pole pro množství u příplatku nevidí', obchodnik);

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.slice(0, 2).join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
