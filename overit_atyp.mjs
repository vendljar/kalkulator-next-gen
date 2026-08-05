/* Ověření v prohlížeči: ATYP položky napojené na katalog a ceník (#7).
 *
 * Proč to má vlastní soubor: jednotkové testy (src/test_atyp_katalog.js)
 * hlídají počítání, tohle hlídá to, co uvidí obsluha – že sazba je v ceníku,
 * že se atypická položka dá přidat, a hlavně že položka bez ceny je vidět
 * na řádku, ne jen v kontrolách. Neoceněná práce navíc, která se tiše sečte
 * jako nula, je totiž ta nejdražší chyba: přijde se na ni až při fakturaci.
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
const konzole = [];
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail ? '  → ' + detail : '')); }
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
await p.goto(KDE);
await p.waitForTimeout(700);

/* Zkušební ceník ze `src/zkusebni_cenik.js` – sestavení samo nese samé nuly
 * (ostrý ceník se tahá z databáze) a z nul se „položka bez ceny" nepozná od
 * položky oceněné. Soubor se čte tady v Node a do stránky jde jako data. */
const { createRequire } = await import('module');
const ZC = createRequire(import.meta.url)('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  NAST.jeAdmin = true;
  ZAK = novaZakazka(); syncVarianta(); render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(250);

console.log('\nATYP položky – katalog, ceník, kontrola před nabídkou');

/* ---------- 1) sazba je v ceníku, ne schovaná v zakázce ---------- */
await p.click('#tab-cenik');
await p.waitForTimeout(250);
const cenikText = (await p.locator('#page-cenik').innerText()).toLowerCase();
zkus('ceník OCK zná sazbu atypické zámečnické práce',
  cenikText.includes('zámečník – ostatní práce (atyp)'.toLowerCase()));
zkus('ceník nabízí i vlastní sekci ATYP pro trvalé položky',
  cenikText.includes('atyp – prvky a práce navíc'.toLowerCase()));

/* ---------- 2) prázdné pole v zakázce = platí ceník ---------- */
const sazby = await p.evaluate(() => {
  const najdi = r => r.sekce.hrubaOck.find(x => (x.origNazev || x.nazev).indexOf('ZÁMEČNÍKA - OSTATNÍ') >= 0);
  const Zz = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
  Zz.zamecnikAtypKs = 2; Zz.zamecnikAtypKc = null;
  const zCenik = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, true));
  Zz.zamecnikAtypKc = 1234;
  const zPrepis = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, true));
  Zz.zamecnikAtypKc = 0;
  const zNula = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, true));
  return { cenik: zCenik && zCenik.cena, prepis: zPrepis && zPrepis.cena, nula: zNula && zNula.naklad,
           cenikovaSazba: DEFAULT_CENIK.zamecnikAtypKc };
});
zkus('prázdné pole v zakázce znamená „platí ceník"',
  sazby.cenik === sazby.cenikovaSazba && sazby.cenikovaSazba > 0, JSON.stringify(sazby));
zkus('vyplněné číslo přebije ceníkovou sazbu', sazby.prepis === 1234, String(sazby.prepis));
zkus('nula je platná dohoda („uděláme zdarma"), ne návrat k ceníku', sazby.nula === 0, String(sazby.nula));

/* ---------- 3) atypickou položku jde přidat přímo v kalkulaci ---------- */
await p.click('#tab-kalk');
await p.waitForTimeout(250);
const kalkText = await p.locator('#page-kalk').innerText();
zkus('v HRUBÉ OCK je tlačítko na atypickou položku',
  /přidat atypickou položku/i.test(kalkText));

const pridano = await p.evaluate(() => {
  vlastniAdd('atyp');
  const i = Z.vlastniPolozky.atyp.length - 1;
  vlastniSet('atyp', i, 'nazev', 'Napojení na stavbu – zkouška');
  vlastniSet('atyp', i, 'mnozstvi', 2);
  vlastniSet('atyp', i, 'cena', 0);
  const r = vypocet(Z, DEFAULT_CENIK, JEKLY, NAST.opravenyRezim !== false);
  const radek = r.sekce.hrubaOck.find(x => (x.origNazev || x.nazev).indexOf('Napojení na stavbu – zkouška') >= 0);
  return { je: !!radek, atyp: radek && radek.atyp, bezCeny: radek && radek.bezCeny };
});
zkus('atypická položka spadne do HRUBÉ OCK, ne do vlastní sekce', pridano.je === true);
zkus('a v datech je poznat, že je atypová', pridano.atyp === true);
zkus('bez ceny se označí jako neoceněná', pridano.bezCeny === true);

await p.evaluate(() => render());
await p.waitForTimeout(250);
const kalkPo = await p.locator('#page-kalk').innerText();
zkus('neoceněná položka je vidět na řádku, ne jen v kontrolách', /bez ceny/i.test(kalkPo));

/* ---------- 4) kontrola před nabídkou to zopakuje, ale nezastaví ---------- */
const kontrola = await p.evaluate(() => {
  const r = vypocet(Z, DEFAULT_CENIK, JEKLY, NAST.opravenyRezim !== false);
  const v = kontrolyProved({ zadani: Z, cenik: DEFAULT_CENIK, vysledek: r });
  const n = v.nalezy.find(x => x.kod === 'atypBezCeny');
  return { je: !!n, text: n && n.text, brani: v.kodyBrani.indexOf('atypBezCeny') >= 0 };
});
zkus('kontrola „atypBezCeny" se rozsvítí', kontrola.je === true);
zkus('a pojmenuje konkrétní položku', /Napojení na stavbu/.test(kontrola.text || ''), kontrola.text);
/* Běžný uživatel náklady nevidí (#36) – varování nesmí prozradit částku. */
zkus('varování neprozrazuje částky', !/\d[\d  ]*\s*Kč/.test(kontrola.text || ''), kontrola.text);
/* Zábrana zůstává jediná: nabídka bez ostrého ceníku. Neoceněná položka je
 * varování – blokovat se zatím nikde netvrdo (KONTROLY_UROVEN = 2). */
zkus('neoceněná položka nebrání vzniku dokumentu', kontrola.brani === false);

/* ---------- 5) po doplnění ceny varování zhasne ---------- */
const poDoplneni = await p.evaluate(() => {
  const i = Z.vlastniPolozky.atyp.length - 1;
  vlastniSet('atyp', i, 'cena', 3000);
  const r = vypocet(Z, DEFAULT_CENIK, JEKLY, NAST.opravenyRezim !== false);
  const radek = r.sekce.hrubaOck.find(x => (x.origNazev || x.nazev).indexOf('Napojení na stavbu – zkouška') >= 0);
  return { bezCeny: radek && radek.bezCeny, naklad: radek && radek.naklad,
           kody: kontrolyProved({ zadani: Z, cenik: DEFAULT_CENIK, vysledek: r }).kody };
});
zkus('po doplnění ceny se položka spočítá množství × cena', poDoplneni.naklad === 6000, String(poDoplneni.naklad));
zkus('a varování zhasne', poDoplneni.bezCeny === false && poDoplneni.kody.indexOf('atypBezCeny') < 0,
  (poDoplneni.kody || []).join(','));

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
