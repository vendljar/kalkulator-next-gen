/* Dvě kalkulace, dvě slevy, žádné prolnutí (#134).
 *
 * PROČ TAHLE SADA VZNIKLA
 *
 * V kalkulaci projekce stála karta „Sleva na nabídku" a byla v ní cena
 * výtahové šachty. Sleva se z ní počítala, marže po slevě se z ní počítala,
 * strop role se z ní počítal — a s projekcí to nemělo nic společného.
 * Projekce k tomu měla druhou, úplně jinou slevu (pole „Globální sleva PROJ")
 * bez schvalování a bez stropu, schovanou uvnitř procent jednotlivých sekcí.
 *
 * Zadání z 12. 8. 2026: „každá kalkulace tzn. ock i proj musí počítat slevy
 * ze svých vlastních cen a nepropisovat je vzájemně. do budoucna už nemíchej
 * mezi sebou kalkulace ock a kalkulace projekce. jsou to dvě odlišné
 * kalkulace, které mohou existovat (a většinou existují) nezávisle na sobě."
 *
 * Tahle sada je pojistka proti návratu. Neptá se na konkrétní částky ze
 * zkušebního ceníku — ptá se na PRAVIDLO: sáhne na jednu slevu a kouká, jestli
 * se hnula cena té druhé části. Kdyby se obě kalkulace zase propletly, chytí
 * to i s jiným ceníkem a jinými čísly.
 *
 * Běží v OBOU výpočetních režimech OCK (kompatibilní i opravený): sleva
 * s režimem nesouvisí, ale kdyby se to někdy rozešlo, ať je to vidět hned.
 */
const fs = require('fs');
const ZC = require('./zkusebni_cenik.js');
/* Moduly se v prohlížeči skládají do jednoho souboru a volají se navzájem přes
 * globální jména (často přes `typeof …=== 'function'`). V Node je proto musíme
 * do globálu vystavit sami — jinak by sleva tiše nepůsobila a sada by měřila
 * samé nuly, tedy „prošlo" i nad rozbitým kódem. */
const nacti = (f) => { const m = require(f); Object.keys(m).forEach(k => { if (global[k] === undefined) global[k] = m[k]; }); return m; };
const eng = nacti('./engine.js');
global.DEFAULT_CENIK = ZC.zkusebniCenik();
const engProj = nacti('./engine_proj.js');
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
nacti('./techspec.js');
const slv = nacti('./sleva.js');
const zo = nacti('./zaokrouhleni.js');
const mz = nacti('./marze.js');
nacti('./poznamky.js');
nacti('./zamek.js');
nacti('./protokol.js');
nacti('./firma.js');
const zk = nacti('./zakazka.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
const blizko = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const schvalena = (procenta) => ({ procenta, schema: '', role: 'Vedoucí', poznamka: '',
                                   stav: 'schváleno', schvalil: 'Vedoucí', schvalilKdy: '2026-08-12T00:00:00.000Z' });
const cekajici = (procenta) => ({ procenta, schema: '', role: 'Obchodník', poznamka: '',
                                  stav: 'čeká na schválení', schvalil: '', schvalilKdy: '' });

const cenikOck = () => ZC.zkusebniCenik();
const cenikProj = () => ZC.zkusebniCenikProj();
const zadaniOck = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const zadaniProj = () => JSON.parse(JSON.stringify(engProj.DEFAULT_ZADANI_PROJ));

const spoctiOck = (fixes) => eng.vypocet(zadaniOck(), cenikOck(), JEKLY, fixes);
const spoctiProj = () => engProj.vypocetProj(zadaniProj(), cenikProj());

/* ============================================================
 * 1) Sleva jedné části nesahá na cenu té druhé
 * ============================================================ */

for (const fixes of [false, true]) {
  const rezim = fixes ? 'opravený' : 'Excel 1:1';
  const ock = spoctiOck(fixes);
  const proj = spoctiProj();
  const zaokr = { krok: 100, smer: 'nahoru' };

  const cenaProjBez = zo.cenaNabidkyProj(proj, null, zaokr).cena;
  const cenaOckBez = zo.cenaNabidkyOck(ock, null, zaokr).cena;

  /* Sleva na výtahovou šachtu a cena projekce. */
  const cenaProjSeSlevouOck = zo.cenaNabidkyProj(proj, null, zaokr).cena;
  test(`sleva OCK nezmění cenu projekce [${rezim}]`,
    blizko(cenaProjSeSlevouOck, cenaProjBez));
  test(`sleva OCK 20 % změní cenu OCK [${rezim}]`,
    zo.cenaNabidkyOck(ock, schvalena(20), zaokr).cena < cenaOckBez);

  /* A obráceně. */
  test(`sleva projekce 20 % změní cenu projekce [${rezim}]`,
    zo.cenaNabidkyProj(proj, schvalena(20), zaokr).cena < cenaProjBez);
  test(`sleva projekce nezmění cenu OCK [${rezim}]`,
    blizko(zo.cenaNabidkyOck(ock, null, zaokr).cena, cenaOckBez));

  /* Obě části se stejnou slevou musí každá klesnout o své procento ze SVÉ
   * ceny. Kdyby se někde vzal cizí základ, poměry se rozejdou. */
  const p = 0.10;
  const oSleva = zo.cenaNabidkyOck(ock, schvalena(10), null);
  const pSleva = zo.cenaNabidkyProj(proj, schvalena(10), null);
  test(`sleva OCK se počítá ze základu OCK [${rezim}]`,
    blizko(oSleva.slevaKc, ock.souhrn.zakladCena * p), oSleva.slevaKc);
  test(`sleva projekce se počítá ze základu projekce [${rezim}]`,
    blizko(pSleva.slevaKc, proj.souhrn.celkem * p), pSleva.slevaKc);
  /* Nejtvrdší kontrola celé sady: kdyby se základy prohodily, tenhle test
   * spadne, i kdyby všechno ostatní vypadalo správně. */
  test(`slevy nemají shodou okolností stejný základ [${rezim}]`,
    !blizko(ock.souhrn.zakladCena, proj.souhrn.celkem),
    ock.souhrn.zakladCena + ' vs ' + proj.souhrn.celkem);
}

/* ============================================================
 * 2) Neschválená sleva nepůsobí — v obou částech stejně
 * ============================================================ */
{
  const proj = spoctiProj();
  const bez = zo.cenaNabidkyProj(proj, null, null).cena;
  test('čekající sleva projekce se do ceny nepropíše',
    blizko(zo.cenaNabidkyProj(proj, cekajici(25), null).cena, bez));
  test('schválená sleva projekce se do ceny propíše',
    zo.cenaNabidkyProj(proj, schvalena(25), null).cena < bez);
  /* Nula je platná hodnota, ne chybějící sleva. */
  test('nulová sleva projekce cenu nemění',
    blizko(zo.cenaNabidkyProj(proj, schvalena(0), null).cena, bez));
}

/* ============================================================
 * 3) Rozpad ceny projekce sedí sám v sobě
 * ============================================================ */
{
  const proj = spoctiProj();
  const c = zo.cenaNabidkyProj(proj, schvalena(15), { krok: 1000, smer: 'nahoru' });
  test('základ − sleva + zaokrouhlení = cena (projekce)',
    blizko(c.zaklad - c.slevaKc + c.zaokrKc, c.cena, 0.01), JSON.stringify(c));
  test('cena projekce nese i náklad včetně dopravy',
    c.naklad === proj.souhrn.naklad + (proj.souhrn.doprava || 0));
  /* Podpis funkce je stejný jako u OCK. Kdyby se lišil, snadno se do něj
   * podá cizí sleva na cizím místě. */
  test('cenaNabidkyProj má stejný tvar jako cenaNabidkyOck',
    zo.cenaNabidkyProj.length === zo.cenaNabidkyOck.length);
}

/* ============================================================
 * 4) Marže: každá část se poměřuje se svou cenou po své slevě
 * ============================================================ */
{
  const ock = spoctiOck(false);
  const proj = spoctiProj();
  const nast = { slevy: { minMarze: 0.05 } };

  const bezSlev = mz.marzePrehled(ock, proj, null, nast, null, null, null);
  const seSlevouProj = mz.marzePrehled(ock, proj, null, nast, null, null, schvalena(20));
  const seSlevouOck = mz.marzePrehled(ock, proj, schvalena(20), nast, null, null, null);

  test('sleva projekce snižuje marži projekce',
    seSlevouProj.proj.celek.marze < bezSlev.proj.celek.marze,
    [bezSlev.proj.celek.marze, seSlevouProj.proj.celek.marze]);
  test('sleva projekce nesnižuje marži OCK',
    blizko(seSlevouProj.ock.marze, bezSlev.ock.marze));
  test('sleva OCK snižuje marži OCK',
    seSlevouOck.ock.marze < bezSlev.ock.marze);
  test('sleva OCK nesnižuje marži projekce',
    blizko(seSlevouOck.proj.celek.marze, bezSlev.proj.celek.marze));
  /* Kdo sedmý parametr nepodá, počítá marži projekce z ceny bez slevy —
   * horší odhad, ale nikdy ne cizí číslo. */
  test('bez sedmého parametru se marže projekce počítá bez slevy',
    blizko(mz.marzePrehled(ock, proj, schvalena(20), nast, null, null).proj.celek.marze,
           bezSlev.proj.celek.marze));
}

/* ============================================================
 * 5) Datový model a migrace
 * ============================================================ */
{
  const zak = zk.novaZakazka();
  const d = zak.varianty[0].data;
  test('nová varianta má obě slevy', !!d.sleva && !!d.slevaProj);
  test('slevy jsou dva různé objekty, ne dvě jména téhož',
    d.sleva !== d.slevaProj);
  d.sleva.procenta = 10;
  test('změna slevy OCK nemění slevu projekce', +d.slevaProj.procenta === 0);

  /* Migrace: zakázka uložená před 12. 8. 2026 nese slevu projekce ve
   * zrušeném poli `proj.zadani.slevaPct` (záporně). Musí se převzít, jinak by
   * rozpracovaná nabídka po otevření podražila. */
  const stara = zk.novaZakazka();
  delete stara.varianty[0].data.slevaProj;
  stara.varianty[0].data.proj.zadani.slevaPct = -12;
  const m = zk.importZakazka(JSON.parse(JSON.stringify(stara)));
  const md = m.varianty[0].data;
  test('migrace založí slevu projekce', !!md.slevaProj);
  test('migrace převezme procento ze zrušeného pole', +md.slevaProj.procenta === 12,
    md.slevaProj && md.slevaProj.procenta);
  test('převzatá sleva platí, aby se cena nezměnila', slv.slevaPlati(md.slevaProj),
    md.slevaProj && md.slevaProj.stav);
  test('je vidět, odkud se sleva vzala', /globální/i.test(md.slevaProj.schvalil || ''),
    md.slevaProj && md.slevaProj.schvalil);
  test('zrušené pole se v datech nedrží', md.proj.zadani.slevaPct === undefined);

  /* Kladná hodnota byla přirážka, ne sleva – ta se nepřevádí. */
  const sPrirazkou = zk.novaZakazka();
  delete sPrirazkou.varianty[0].data.slevaProj;
  sPrirazkou.varianty[0].data.proj.zadani.slevaPct = 15;
  const mp = zk.importZakazka(JSON.parse(JSON.stringify(sPrirazkou)));
  test('kladná hodnota (přirážka) se na slevu nepřevádí',
    +mp.varianty[0].data.slevaProj.procenta === 0);

  /* Zakázka, která slevu projekce už má, se migrací přepsat nesmí. */
  const nova = zk.novaZakazka();
  nova.varianty[0].data.slevaProj.procenta = 7;
  nova.varianty[0].data.proj.zadani.slevaPct = -30;
  const mn = zk.importZakazka(JSON.parse(JSON.stringify(nova)));
  test('migrace nepřepíše už zadanou slevu projekce',
    +mn.varianty[0].data.slevaProj.procenta === 7,
    mn.varianty[0].data.slevaProj.procenta);
}

/* ============================================================
 * 6) Výpočet projekce o slevě neví
 * ============================================================ */
{
  const z = zadaniProj();
  const bez = engProj.vypocetProj(z, cenikProj()).souhrn.celkem;
  const zSlevou = zadaniProj(); zSlevou.slevaPct = -40;
  test('zrušené pole slevaPct výpočet projekce neovlivňuje',
    blizko(engProj.vypocetProj(zSlevou, cenikProj()).souhrn.celkem, bez));
  /* Sekce vykazuje přirážku, ne slevu – jméno pole to má říkat. */
  const r = engProj.vypocetProj(z, cenikProj());
  test('sekce vykazuje přirážku pod vlastním jménem',
    r.sekce.every(s => typeof s.prirazkaKc === 'number' && s.slevaKc === undefined));
  test('souhrn vykazuje přirážku, ne slevu',
    typeof r.souhrn.prirazka === 'number' && r.souhrn.sleva === undefined);
}

/* ============================================================
 * 7) Porovnání variant vykazuje obě slevy zvlášť
 * ============================================================ */
{
  const zak = zk.novaZakazka();
  const v = zak.varianty[0];
  v.data.sleva = schvalena(10);
  v.data.slevaProj = schvalena(20);
  const ock = spoctiOck(false), proj = spoctiProj();
  const por = zk.porovnaniVariant(zak, [{ id: v.id, ock, proj }], { slevaPodil: slv.slevaPodil });
  const m = k => por.metriky.find(x => x.klic === k);
  const h = k => { const x = m(k); return x ? x.hodnoty[0] : undefined; };

  test('porovnání ukazuje slevu OCK', blizko(h('slevaPct'), 0.10), h('slevaPct'));
  test('porovnání ukazuje slevu PROJ', blizko(h('slevaProjPct'), 0.20), h('slevaProjPct'));
  test('sleva OCK je počítaná ze základu OCK',
    blizko(h('slevaKc'), ock.souhrn.zakladCena * 0.10), h('slevaKc'));
  test('sleva PROJ je počítaná ze základu PROJ',
    blizko(h('slevaProjKc'), proj.souhrn.celkem * 0.20), h('slevaProjKc'));
  test('celkem je součet obou částí po jejich vlastních slevách',
    blizko(h('celkemBezDph'), h('ockPoSleve') + h('projCelkem'), 0.01),
    [h('celkemBezDph'), h('ockPoSleve'), h('projCelkem')]);
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
