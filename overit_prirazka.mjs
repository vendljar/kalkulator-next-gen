/* Sekční přirážka projekce: prázdné pole ukazuje globální přirážku z ceníku
 * a jádro s ní počítá. Ověřuje se nad sestavením, ne nad zdrojáky – právě
 * tady se dřív rozešlo, co pole slibuje, s tím, co se počítá. */
import { chromium } from 'playwright';
import path from 'path';
const soubor = 'file://' + path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const zkus = (p, c, d) => { if (c) { ok++; console.log('  ✓ ' + p); } else { fail++; console.log('  ✕ ' + p + (d ? '  → ' + d : '')); } };
const b = await chromium.launch();
const s = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const chyby = [];
s.on('pageerror', e => chyby.push(String(e)));
s.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });
await s.goto(soubor); await s.waitForTimeout(500);

const stav = await s.evaluate(() => {
  const V = aktivniVarianta(ZAK);
  V.data.proj.cenik.marze = 0.30;                 // globální přirážka 30 %
  V.data.proj.zadani.sekce.forEach(x => { x.prirazkaPct = null; });
  const r = vypocetProj(V.data.proj.zadani, V.data.proj.cenik);
  return { pouzite: r.sekce.map(x => x.pouzitePct), vlastni: r.sekce.map(x => x.prirazkaPct) };
});
zkus('všechny sekce počítají s globální přirážkou 30 %',
  stav.pouzite.every(x => Math.abs(x - 30) < 1e-9), JSON.stringify(stav.pouzite));
zkus('žádná sekce nemá vlastní procento zapsané v datech',
  stav.vlastni.every(x => x === null), JSON.stringify(stav.vlastni));

/* Změna globální přirážky se musí projevit ve všech sekcích naráz. */
const po = await s.evaluate(() => {
  const V = aktivniVarianta(ZAK);
  V.data.proj.cenik.marze = 0.10;
  return vypocetProj(V.data.proj.zadani, V.data.proj.cenik).sekce.map(x => x.pouzitePct);
});
zkus('změna globální přirážky se propíše do všech sekcí',
  po.every(x => Math.abs(x - 10) < 1e-9), JSON.stringify(po));

/* Ruční lokální úprava jedné sekce přebije globální. */
const rucne = await s.evaluate(() => {
  const V = aktivniVarianta(ZAK);
  V.data.proj.cenik.marze = 0.30;
  V.data.proj.zadani.sekce[0].prirazkaPct = 5;
  const r = vypocetProj(V.data.proj.zadani, V.data.proj.cenik);
  return { prvni: r.sekce[0].pouzitePct, druha: r.sekce[1].pouzitePct };
});
zkus('ruční procento u jedné sekce přebije globální', rucne.prvni === 5, JSON.stringify(rucne));
zkus('ostatní sekce si globální přirážku podrží', Math.abs(rucne.druha - 30) < 1e-9, JSON.stringify(rucne));

/* A to hlavní: co pole slibuje v prázdném stavu, to se počítá. */
const popisek = await s.evaluate(() => {
  const V = aktivniVarianta(ZAK);
  V.data.proj.cenik.marze = 0.30;
  V.data.proj.zadani.sekce.forEach(x => { x.prirazkaPct = null; });
  if (typeof prepni === 'function') prepni('kalkulace-proj');
  if (typeof render === 'function') render();
  const el = document.querySelector('#kalkulace-proj-panel input[placeholder], .sechd input[placeholder]');
  return el ? el.getAttribute('placeholder') : null;
});
zkus('prázdné pole sekce ukazuje globální přirážku', popisek === '30', String(popisek));

zkus('žádná chyba v konzoli', chyby.length === 0, chyby.join(' | '));
await b.close();
console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
