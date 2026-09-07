/* Ověření v prohlížeči: online cenové nabídky OCK i PROJ (5. 9. 2026)
 * ===================================================================
 *
 * Zadání J. V.:
 *   – nabídky se generují BEZ DPH; zobrazení DPH a ceny s DPH jde zapnout,
 *   – z výtisku zmizí hlavička prohlížeče (čas, název stránky) a patička
 *     (about:blank) — řeší se nulovým okrajem stránky a paddingem uvnitř,
 *   – podpis s razítkem je dvakrát tak velký,
 *   – vyřazená položka kalkulace PROJ se v nabídce neobjeví ani textem.
 *
 * Nabídka se otevírá do NOVÉHO OKNA (window.open), takže se tu pracuje
 * s druhou stránkou, ne s aplikací.
 *
 * Spuštění: node overit_nabidky_dph.mjs
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail === undefined ? '' : '  → ' + detail)); }
};

const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 } });
const p = await ctx.newPage();
const konzole = [];
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
await p.goto(KDE);
/* Stránka se skládá po načtení; bez čekání na globální stav aplikace by
 * evaluate běžel dřív, než vůbec existuje. */
/* `const NAST` není vlastnost window (je v lexikálním rozsahu skriptu),
 * proto se ptáme typeof, ne window.NAST. */
await p.waitForFunction(() => typeof NAST !== 'undefined' && typeof render === 'function',
  null, { timeout: 15000 });
await p.waitForTimeout(400);
await p.evaluate(() => {
  NAST.jeAdmin = true;
  window.potvrd = () => Promise.resolve(true);
  window.hlaska = () => Promise.resolve();
  /* Ceny musí být nenulové, jinak se sekce v nabídce vůbec neuvedou. */
  Object.keys(PC.fixy || {}).forEach(k => { if (!PC.fixy[k]) PC.fixy[k] = 12000; });
  Object.keys(PC.sazby || {}).forEach(k => { if (!PC.sazby[k]) PC.sazby[k] = 850; });
  PJ.sekce.forEach(s => s.polozky.forEach(x => { x.vyrazeno = false; }));
  /* Dokument se nevytvoří nad ukázkovým ceníkem (#40) — v sestavení je
   * značka `ukazkove` a bez jejího sundání by se okno vůbec neotevřelo. */
  const bezZnacek = o => { if (o) { delete o.ukazkove; delete o.prazdny; } };
  [DEFAULT_CENIK, DEFAULT_CENIK_PROJ, C, PC, NAST.slevy, NAST.firma].forEach(bezZnacek);
  ZAK.varianty.forEach(v => { bezZnacek(v.data.cenik); bezZnacek(v.data.proj.cenik); });
  ZAK.cislo = '2026 - OVP - CN - 0365'; ZAK.nazevAkce = 'Zkouška nabídky';
  ZAK.objednatel = 'Zkušební zákazník'; ZAK.adresa = 'Ulice 1, Praha';
  render();
});

/* Otevře nabídku v novém okně a vrátí jeho stránku. */
async function nabidka(fn) {
  const [okno] = await Promise.all([
    ctx.waitForEvent('page'),
    /* Funkce nabídky jsou také jen v rozsahu skriptu — voláme je jménem
     * přes nepřímý eval, ne přes window[…]. */
    p.evaluate(f => (0, eval)(f + '()'), fn),
  ]);
  await okno.waitForLoadState('domcontentloaded');
  await okno.waitForTimeout(400);
  return okno;
}

/* ---------- nabídka PROJ ---------- */
const proj = await nabidka('nabidkaProjNahled');

const stavDph = (o) => o.evaluate(() => {
  const dok = document.getElementById('dok');
  const radky = [...document.querySelectorAll('.dph-radek')];
  return {
    bezDph: !!dok && dok.classList.contains('bez-dph'),
    radku: radky.length,
    videt: radky.filter(r => r.offsetParent !== null).length,
    prepinac: !!document.getElementById('tiskDphCheck'),
  };
});
let s = await stavDph(proj);
zkus('PROJ: nabídka se generuje bez DPH', s.bezDph && s.videt === 0, JSON.stringify(s));
zkus('PROJ: řádky DPH v dokumentu existují (jen se netisknou)', s.radku >= 2, s.radku);
zkus('PROJ: v liště je přepínač zobrazení DPH', s.prepinac);

await proj.check('#tiskDphCheck');
s = await stavDph(proj);
zkus('PROJ: zaškrtnutím se DPH i cena s DPH ukáže', !s.bezDph && s.videt === s.radku, JSON.stringify(s));
await proj.uncheck('#tiskDphCheck');
s = await stavDph(proj);
zkus('PROJ: a odškrtnutím zase zmizí', s.bezDph && s.videt === 0, JSON.stringify(s));

/* Tisková stránka bez hlavičky a patičky prohlížeče. */
const tisk = await proj.evaluate(() => {
  const pravidla = [...document.styleSheets].flatMap(ss => {
    try { return [...ss.cssRules].map(r => r.cssText); } catch (e) { return []; }
  });
  return {
    page: pravidla.filter(x => x.indexOf('@page') === 0).join(' | '),
    padding: pravidla.filter(x => /@media print/.test(x)).join(' | '),
  };
});
zkus('PROJ: stránka tisku má nulový okraj (jinak Chrome dotiskne své záhlaví)',
  /@page[^{]*\{[^}]*margin:\s*0/.test(tisk.page), tisk.page.slice(0, 90));
zkus('PROJ: okraj dokumentu dělá padding uvnitř stránky',
  /padding:\s*14mm/.test(tisk.padding), tisk.padding.slice(0, 120));

/* Vyřazená položka se do textu nabídky nepropíše. */
const textPred = await proj.evaluate(() => document.getElementById('dok').innerText);
zkus('PROJ: plná nabídka elektro projekt uvádí',
  /technická zpráva elektro/i.test(textPred));
await proj.close();

await p.evaluate(() => {
  const s = PJ.sekce.find(x => x.key === 'dpz');
  s.polozky.find(x => x.nazev === 'Elektro projekt').vyrazeno = true;
  render();
});
const proj2 = await nabidka('nabidkaProjNahled');
const textPo = await proj2.evaluate(() => document.getElementById('dok').innerText);
zkus('PROJ: po vyřazení elektro projektu text z nabídky zmizí',
  !/technická zpráva elektro v rozsahu pro stavební povolení/i.test(textPo));
zkus('PROJ: a věta u ceny DPZ ho už neslibuje',
  !/včetně[^\n]*ELEKTRO PROJEKTU/i.test((textPo.match(/Zpracování projektu pro DPZ[^\n]*/) || [''])[0]),
  (textPo.match(/Zpracování projektu pro DPZ[^\n]*/) || [''])[0]);
zkus('PROJ: zbytek DPZ v nabídce zůstal',
  /technická zpráva statika/i.test(textPo) && /DOKUMENTACI PRO POVOLENÍ ZÁMĚRU/i.test(textPo));

/* Podpis: dvojnásobná velikost proti stavu do 4. 9. 2026 (168 px). */
const podpis = await proj2.evaluate(() => {
  const img = document.querySelector('.podpis-blok img');
  return img ? img.getAttribute('style') : 'bez podpisu';
});
zkus('PROJ: podpis s razítkem má dvojnásobnou velikost (336 px)',
  podpis === 'bez podpisu' || /max-height:\s*336px/.test(podpis), podpis);
await proj2.close();

/* ---------- nabídka OCK ---------- */
await p.evaluate(() => { prepniTab('spec'); render(); });
const ock = await nabidka('nabidkaOckDokument');
s = await stavDph(ock);
zkus('OCK: nabídka se generuje bez DPH', s.bezDph && s.videt === 0, JSON.stringify(s));
zkus('OCK: v liště je přepínač zobrazení DPH', s.prepinac);
await ock.check('#tiskDphCheck');
s = await stavDph(ock);
zkus('OCK: zaškrtnutím se DPH ukáže', !s.bezDph && s.videt === s.radku, JSON.stringify(s));

const textOck = await ock.evaluate(() => document.getElementById('dok').innerText);
zkus('OCK: cena bez DPH je v nabídce vždycky', /bez DPH/i.test(textOck));
const tiskOck = await ock.evaluate(() => [...document.styleSheets]
  .flatMap(ss => { try { return [...ss.cssRules].map(r => r.cssText); } catch (e) { return []; } })
  .filter(x => x.indexOf('@page') === 0).join(' | '));
zkus('OCK: stránka tisku má nulový okraj', /margin:\s*0/.test(tiskOck), tiskOck.slice(0, 90));
await ock.close();

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.slice(0, 2).join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
