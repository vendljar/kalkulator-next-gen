/* Ověření v prohlížeči: vypnutý řádek (nález V22) + zápis přepisu (nález N8)
 * ==========================================================================
 *
 * V22 — zadání J. V. 4. 9. 2026: „Nula funguje jako množství, tj. vypnutí
 * výpočtu v řádku. Budeme to ale muset nějak v aplikaci ‚rozsvítit‘, resp.
 * vypnutý řádek zvýraznit." Počítání hlídá `src/test_vypnuty_radek.js`;
 * tady jde o to, co obchodník UVIDÍ: že řádek nese svou třídu a štítek, že
 * ztlumení nesahá na ovládací prvky (týž nález jsme měli u `.vyrazeno`
 * i u `.nezahrnuto`) a že to platí i u příplatků, volitelných a v PROJ.
 *
 * N8 — ověření, že se ruční přepis zapíše i při odchodu z pole Tabulátorem
 * nebo kliknutím jinam, ne až Enterem. Při ověření 4. 9. 2026 se nález
 * NEPOTVRDIL (pole mají onchange, který se spustí i na blur); kontrola tu
 * zůstává, aby se to nezměnilo nepozorovaně.
 *
 * Spuštění: node overit_vypnuty_radek.mjs
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

/* ---------- N8: zapisuje se hodnota i bez Enteru? ---------- */
const nazev = await p.evaluate(() =>
  String(spocitejVariantu(aktivniVarianta(ZAK)).ock.sekce.hrubaOck[0].origNazev));
const pole = () => p.locator(`#page-kalk input[onchange*="mnozstviSet('${nazev}'"]`).first();
const stavRadku = () => p.evaluate(n => {
  const r = spocitejVariantu(aktivniVarianta(ZAK)).ock.sekce.hrubaOck
    .find(x => String(x.origNazev || x.nazev) === n);
  return { mn: r.mnozstvi, naklad: r.naklad, prepsano: r.prepsano, auto: r.mnozstviAuto };
}, nazev);

const pred = await stavRadku();
await pole().click();
await pole().fill('3');
await p.keyboard.press('Tab');
await p.waitForTimeout(250);
zkus('N8: hodnota se zapíše i při odchodu Tabulátorem', (await stavRadku()).mn === 3,
  JSON.stringify(await stavRadku()));

await p.evaluate(n => { mnozstviSet(n, ''); render(); }, nazev);
await pole().click();
await pole().fill('7');
await p.locator('#page-kalk h2').first().click();
await p.waitForTimeout(250);
zkus('N8: a i při kliknutí jinam', (await stavRadku()).mn === 7, JSON.stringify(await stavRadku()));

await p.evaluate(n => { mnozstviSet(n, ''); render(); }, nazev);
zkus('vyprázdněním pole se vrátí vypočtené množství',
  Math.abs((await stavRadku()).mn - pred.mn) < 1e-9, JSON.stringify(await stavRadku()));

/* ---------- V22: nula řádek vypne a je to vidět ---------- */
await pole().click();
await pole().fill('0');
await p.keyboard.press('Tab');
await p.waitForTimeout(250);
const poNule = await stavRadku();
zkus('nula vypne výpočet řádku (množství i náklad 0)',
  poNule.mn === 0 && poNule.naklad === 0, JSON.stringify(poNule));
zkus('a vypočtené množství si řádek pamatuje pro ↺',
  Math.abs(poNule.auto - pred.mn) < 1e-9, poNule.auto);

const vzhled = await p.evaluate(n => {
  const tr = [...document.querySelectorAll('#page-kalk tr')]
    .find(x => x.textContent.indexOf(n) === 0 || x.querySelector(`input[onchange*="mnozstviSet('${n}'"]`));
  if (!tr) return { chyba: 'řádek nenalezen' };
  const st = getComputedStyle(tr.querySelector('td'));
  const inp = tr.querySelector('input[type=number]');
  const stInp = getComputedStyle(inp);
  const stitek = tr.querySelector('.pill.vyp');
  return {
    trida: tr.classList.contains('vypnuto-nulou'),
    stitek: !!stitek && /vypnuto \(množství 0\)/.test(stitek.textContent),
    bublina: stitek ? stitek.getAttribute('title') || '' : '',
    /* Ztlumení musí být BARVOU, ne opacity — jinak by světlala i zaškrtávátka. */
    opacityRadku: st.opacity,
    barvaTextu: st.color,
    opacityPole: stInp.opacity,
    preskrtnuto: st.textDecorationLine,
    poleFunguje: !inp.disabled && !inp.readOnly,
  };
}, nazev);
zkus('řádek nese třídu vypnuto-nulou', vzhled.trida, JSON.stringify(vzhled));
zkus('a štítek „vypnuto (množství 0)"', vzhled.stitek, JSON.stringify(vzhled));
zkus('bublina vysvětluje, že je to dohoda a jak ji vrátit',
  /dohoda/.test(vzhled.bublina) && /↺/.test(vzhled.bublina), vzhled.bublina);
zkus('řádek se ztlumuje BARVOU, ne opacity', vzhled.opacityRadku === '1', vzhled.opacityRadku);
zkus('text řádku je opravdu ztlumený', vzhled.barvaTextu !== 'rgb(0, 0, 0)', vzhled.barvaTextu);
zkus('pole zůstává v plné barvě a editovatelné',
  vzhled.opacityPole === '1' && vzhled.poleFunguje, JSON.stringify(vzhled));
zkus('řádek není přeškrtnutý — položka není zrušená',
  vzhled.preskrtnuto === 'none', vzhled.preskrtnuto);

const soucet = await p.evaluate(() => {
  const tr = [...document.querySelectorAll('#page-kalk tr.sectot')]
    .find(x => /HRUBÁ OCK CELKEM/.test(x.textContent));
  return tr ? tr.textContent.replace(/\s+/g, ' ') : '';
});
zkus('součet sekce tiše hlásí, kolik položek je vypnuto',
  /1 položka vypnuta/.test(soucet), soucet.slice(0, 80));

/* Řádek jde zase zapnout — to je celý smysl toho, že zůstal editovatelný. */
await pole().click();
await pole().fill('');
await p.keyboard.press('Tab');
await p.waitForTimeout(250);
zkus('↺ resp. vyprázdnění řádek zase zapne',
  Math.abs((await stavRadku()).mn - pred.mn) < 1e-9, JSON.stringify(await stavRadku()));
zkus('a třída i štítek zmizí', await p.evaluate(n => {
  const tr = [...document.querySelectorAll('#page-kalk tr')]
    .find(x => x.querySelector(`input[onchange*="mnozstviSet('${n}'"]`));
  return !!tr && !tr.classList.contains('vypnuto-nulou') && !tr.querySelector('.pill.vyp');
}, nazev));

/* ---------- V22: příplatková položka ---------- */
const priplatek = await p.evaluate(() => {
  const x = spocitejVariantu(aktivniVarianta(ZAK)).ock.priplatky.find(y => y.mnozstvi > 0);
  const n = String(x.origNazev || x.nazev);
  mnozstviSet(n, 0); render();
  const tr = [...document.querySelectorAll('#page-kalk tr')]
    .find(t => t.querySelector(`input[onchange*="mnozstviSet('${n.replace(/'/g, "\\'")}'"]`));
  return { nazev: n, trida: !!tr && tr.classList.contains('vypnuto-nulou'),
           stitek: !!tr && !!tr.querySelector('.pill.vyp') };
});
zkus('vypnutý příplatek nese třídu i štítek',
  priplatek.trida && priplatek.stitek, JSON.stringify(priplatek));

/* ---------- V22: kalkulace PROJ ---------- */
const proj = await p.evaluate(() => {
  prepniTab('proj');
  /* Hodinová položka bez hodin — v PROJ se tím položka vypíná. */
  const s = PJ.sekce.findIndex(x => (x.polozky || []).some(y => y.typ === 'hod'));
  const j = PJ.sekce[s].polozky.findIndex(y => y.typ === 'hod');
  PJ.sekce[s].polozky[j].hodiny = 0;
  PJ.sekce[s].polozky[j].rezerva = 0;
  PJ.sekce[s].polozky[j].vyrazeno = false;
  render();
  const nazev = PJ.sekce[s].polozky[j].nazev;
  const tr = [...document.querySelectorAll('#page-proj tr')]
    .find(t => t.querySelector(`input[onchange*="polozky.${j}.hodiny"]`)
      || (t.textContent || '').includes(nazev));
  const soucet = [...document.querySelectorAll('#page-proj tr.sectot')]
    .map(t => t.textContent.replace(/\s+/g, ' ')).join(' | ');
  return { nazev, trida: !!tr && tr.classList.contains('vypnuto-nulou'),
           stitek: !!tr && !!tr.querySelector('.pill.vyp'),
           soucet: /položka vypnuta|položky vypnuty|položek vypnuto/.test(soucet) };
});
zkus('vypnutá hodinová položka PROJ nese třídu', proj.trida, JSON.stringify(proj));
zkus('a štítek taky', proj.stitek, JSON.stringify(proj));
zkus('součet sekce PROJ o vypnutých ví', proj.soucet, JSON.stringify(proj));

/* Vyřazená položka je JINÝ stav a nesmí se s vypnutou slévat. */
const rozliseni = await p.evaluate(() => {
  const s = PJ.sekce.findIndex(x => (x.polozky || []).some(y => y.typ === 'hod'));
  const j = PJ.sekce[s].polozky.findIndex(y => y.typ === 'hod');
  PJ.sekce[s].polozky[j].vyrazeno = true;
  render();
  const tr = [...document.querySelectorAll('#page-proj tr')]
    .find(t => t.querySelector(`input[onchange*="polozky.${j}.hodiny"]`));
  PJ.sekce[s].polozky[j].vyrazeno = false; render();
  return { vyrazeno: !!tr && tr.classList.contains('vyrazeno'),
           vypnuto: !!tr && tr.classList.contains('vypnuto-nulou') };
});
zkus('vyřazená položka má svůj stav, ne stav vypnuté',
  rozliseni.vyrazeno && !rozliseni.vypnuto, JSON.stringify(rozliseni));

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.slice(0, 2).join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
