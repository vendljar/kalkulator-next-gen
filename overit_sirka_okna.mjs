/* Šířka okna Nastavení. Seznam uživatelů má devět sloupců (e-mail, titul,
 * jméno, funkce, telefon, role, aktivní a tři tlačítka) a v původních 760 px
 * se poslední z nich vysunuly za okraj okna – tlačítko „Smazat…" nešlo trefit.
 * Test hlídá, že se obsah do okna vejde, ne konkrétní pixely. */
import { chromium } from 'playwright';
import path from 'path';
const soubor = 'file://' + path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const zkus = (p, c, d) => { if (c) { ok++; console.log('  ✓ ' + p); } else { fail++; console.log('  ✕ ' + p + (d ? '  → ' + d : '')); } };
const b = await chromium.launch();
const s = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await s.goto(soubor); await s.waitForTimeout(400);
await s.evaluate(() => { if (typeof otevriNastaveni === 'function') otevriNastaveni(); });
await s.waitForTimeout(300);

const m = await s.evaluate(() => {
  const el = document.getElementById('nastaveni-panel');
  const r = el.getBoundingClientRect();
  return { sirka: Math.round(r.width), preteka: el.scrollWidth > el.clientWidth + 1,
           pocetZalozek: el.querySelectorAll('.nast-tabs button').length };
});
zkus('okno Nastavení je širší než 1000 px', m.sirka > 1000, m.sirka + ' px');
zkus('obsah okna Nastavení nepřetéká', !m.preteka);
zkus('záložky Nastavení se vykreslily', m.pocetZalozek >= 6, String(m.pocetZalozek));

/* Vejde se do okna i na užším monitoru? Okno se má zúžit s ním, ne přetéct. */
await s.setViewportSize({ width: 1024, height: 900 });
await s.waitForTimeout(200);
const uzke = await s.evaluate(() => {
  const el = document.getElementById('nastaveni-panel');
  return { sirka: Math.round(el.getBoundingClientRect().width),
           preteka: el.scrollWidth > el.clientWidth + 1 };
});
zkus('na užším monitoru se okno zúží a nepřetéká',
  uzke.sirka < 1024 && !uzke.preteka, JSON.stringify(uzke));

/* Široká tabulka uvnitř umí rolovat vodorovně – pojistka pro případ, že se
 * do seznamu uživatelů přidá další sloupec. */
const roluje = await s.evaluate(() => {
  const d = document.createElement('div');
  d.className = 'tab-scroll';
  d.innerHTML = '<table><tr><td>x</td></tr></table>';
  document.getElementById('nastaveni-panel').appendChild(d);
  const st = getComputedStyle(d);
  const minw = getComputedStyle(d.querySelector('table')).minWidth;
  const out = { overflow: st.overflowX, minw };
  d.remove();
  return out;
});
zkus('široká tabulka v Nastavení umí rolovat vodorovně',
  roluje.overflow === 'auto', JSON.stringify(roluje));
zkus('tabulka v Nastavení má zaručenou minimální šířku',
  parseInt(roluje.minw, 10) >= 900, roluje.minw);

await b.close();
console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
