/* ============================================================
 * PRJ-1 — EDITOVATELNOST KALKULACE PROJ (#8)
 *
 * Do 30. 7. 2026 se dala v projekční kalkulaci přepsat jen hodina, rezerva
 * a název položky. Cokoliv dalšího se dodělávalo ručně mimo aplikaci:
 *
 *   – Fixní částka (PBŘ, elektro, kolaudace…) se dala změnit jen tak, že
 *     se přepsal CENÍK. Tím se ale změnila cena všem zakázkám, nejen té
 *     rozpracované. Obchodník, který si u jedné stavby domluvil s elektro
 *     projektantem jinou cenu, tím tiše posunul ceník celé firmě.
 *   – Hodinová sazba se dala jen vybrat ze tří ceníkových; sjednaná sazba
 *     pro jednu zakázku se nedala zapsat vůbec.
 *   – Položku, která se u téhle stavby nedělá, šlo jen smazat. Tím se ale
 *     ztratilo, kolik by stála, a při další variantě se musela naťukat znovu.
 *   – K položce nešlo napsat proč. Důvod žil v e-mailu jednoho člověka.
 *
 * Tahle sada hlídá, že se to všechno dá udělat UVNITŘ zakázky a že se to
 * promítne do součtů. Ceník zůstane nedotčený — to je celý smysl přepisu.
 *
 * Čísla jsou ze zkušebního ceníku (kulatá a schválně nesmyslná), takže se
 * dá v hlavě dopočítat, co má vyjít.
 * ============================================================ */

const { vypocetProj, DEFAULT_ZADANI_PROJ } = require('./engine_proj.js');
const { zkusebniCenikProj } = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
function t(nazev, podminka, detail) {
  if (podminka) { ok++; console.log('OK  ' + nazev); }
  else { fail++; console.log('FAIL ' + nazev + (detail ? ': ' + detail : '')); }
}
function tc(nazev, got, exp, tol = 1e-6) {
  t(nazev + ' = ' + got, Math.abs(got - exp) <= tol, 'očekáváno ' + exp);
}
const kopie = x => JSON.parse(JSON.stringify(x));
const zad = () => kopie(DEFAULT_ZADANI_PROJ);
const sek = (r, key) => r.sekce.find(s => s.key === key);
const pol = (r, key, nazev) => sek(r, key).polozky.find(p => p.nazev === nazev);

const C = zkusebniCenikProj();

/* ---------- 1) výchozí stav se změnou nesmí hnout ---------- */

const zaklad = vypocetProj(zad(), C);
t('1.1 výchozí výpočet projde', zaklad && zaklad.sekce.length === 9);
t('1.2 žádná položka není ve výchozím stavu vyřazená',
  zaklad.sekce.every(s => s.polozky.every(p => !p.vyrazeno)));

/* ---------- 2) vyřazení položky z výpočtu ---------- */
/* Vyřazená položka zůstane v datech i v seznamu, ale nepočítá se. Tím se
 * liší od smazání: příště se dá jedním kliknutím vrátit i s hodinami. */

{
  const z = zad();
  const dpz = z.sekce.find(s => s.key === 'dpz');
  const pbr = dpz.polozky.find(p => p.fixKey === 'pbr');
  pbr.vyrazeno = true;
  const r = vypocetProj(z, C);
  const s = sek(r, 'dpz');

  t('2.1 vyřazená položka v seznamu zůstala',
    s.polozky.some(p => p.fixKey === 'pbr'));
  t('2.2 vyřazená položka je označená příznakem',
    pol(r, 'dpz', 'PBŘ').vyrazeno === true);
  tc('2.3 vyřazená položka nepřispívá do nákladu', pol(r, 'dpz', 'PBŘ').naklad, 0);
  tc('2.4 náklad sekce klesl přesně o cenu PBŘ',
    s.naklad, sek(zaklad, 'dpz').naklad - C.fixy.pbr);
  t('2.5 celková cena klesla', r.souhrn.celkem < zaklad.souhrn.celkem);
  t('2.6 ceník se vyřazením nezměnil', C.fixy.pbr === zkusebniCenikProj().fixy.pbr);
}

{ /* vyřazení hodinové položky */
  const z = zad();
  z.sekce[0].polozky[0].vyrazeno = true;      // ZAMĚŘENÍ → Zaměření (5 h)
  const r = vypocetProj(z, C);
  tc('2.7 vyřazená hodinová položka nepřispívá', sek(r, 'zamereni').polozky[0].naklad, 0);
  tc('2.8 hodiny zůstaly v datech (jen se nepočítají)',
    sek(r, 'zamereni').polozky[0].hodinyCelkem, 5);
}

/* ---------- 3) přepis fixní částky jen pro tuto zakázku ---------- */
/* U jedné stavby se elektro projektant domluvil jinak. Ceník firmy s tím
 * nemá co dělat. */

{
  const z = zad();
  const dpz = z.sekce.find(s => s.key === 'dpz');
  dpz.polozky.find(p => p.fixKey === 'pbr').cenaPrepis = 12345;
  const r = vypocetProj(z, C);
  const p = pol(r, 'dpz', 'PBŘ');

  tc('3.1 přepsaná fixní částka se použije', p.naklad, 12345);
  t('3.2 položka nese příznak přepisu', p.cenaPrepsana === true);
  tc('3.3 ceníková hodnota zůstala k dispozici pro vrácení', p.cenaZCeniku, C.fixy.pbr);
  tc('3.4 náklad sekce = základ − ceník + přepis',
    sek(r, 'dpz').naklad, sek(zaklad, 'dpz').naklad - C.fixy.pbr + 12345);
  t('3.5 ceník přepisem nedotčen', C.fixy.pbr === zkusebniCenikProj().fixy.pbr);
}

{ /* nula je platný přepis — nesmí propadnout na ceníkovou cenu */
  const z = zad();
  z.sekce.find(s => s.key === 'ic').polozky[0].cenaPrepis = 0;
  const r = vypocetProj(z, C);
  tc('3.6 přepis na nulu platí (nespadne zpět na ceník)', sek(r, 'ic').naklad, 0);
  t('3.7 nulový přepis je označený jako přepis',
    sek(r, 'ic').polozky[0].cenaPrepsana === true);
}

{ /* prázdný přepis = zpět na ceník */
  const z = zad();
  const p = z.sekce.find(s => s.key === 'ic').polozky[0];
  p.cenaPrepis = null;
  const r = vypocetProj(z, C);
  tc('3.8 prázdný přepis vrátí ceníkovou cenu', sek(r, 'ic').naklad, C.fixy.ic);
  t('3.9 vrácená položka už není označená jako přepsaná',
    !sek(r, 'ic').polozky[0].cenaPrepsana);
}

/* ---------- 4) přepis hodinové sazby jen pro tuto položku ---------- */

{
  const z = zad();
  z.sekce[0].polozky[0].sazbaPrepis = 1500;       // 5 h × 1500
  const r = vypocetProj(z, C);
  const p = sek(r, 'zamereni').polozky[0];

  tc('4.1 přepsaná sazba se použije', p.sazbaKc, 1500);
  tc('4.2 náklad položky = hodiny × přepsaná sazba', p.naklad, 5 * 1500);
  t('4.3 položka nese příznak přepisu sazby', p.sazbaPrepsana === true);
  tc('4.4 ceníková sazba zůstala k dispozici', p.sazbaZCeniku, C.sazby.zamereni);
  t('4.5 ceník sazbou nedotčen', C.sazby.zamereni === zkusebniCenikProj().sazby.zamereni);
}

{ /* sazba 0 je platný přepis (činnost zdarma jako ústupek) */
  const z = zad();
  z.sekce[0].polozky[0].sazbaPrepis = 0;
  const r = vypocetProj(z, C);
  tc('4.6 sazba 0 platí', sek(r, 'zamereni').polozky[0].naklad, 0);
  t('4.7 nulová sazba je označená jako přepis',
    sek(r, 'zamereni').polozky[0].sazbaPrepsana === true);
}

/* ---------- 5) vyřazení má přednost před přepisem ---------- */
/* Kdyby to bylo naopak, vyřazená položka s přepsanou cenou by se pořád
 * počítala a nikdo by nechápal proč. */

{
  const z = zad();
  const p = z.sekce.find(s => s.key === 'ic').polozky[0];
  p.cenaPrepis = 99999; p.vyrazeno = true;
  tc('5.1 vyřazená položka se nepočítá ani s přepisem',
    vypocetProj(z, C).sekce.find(s => s.key === 'ic').naklad, 0);
}

/* ---------- 6) poznámka k položce ---------- */
/* Poznámka je interní: putuje výpočtem, ale do zákaznických dokumentů ne. */

{
  const z = zad();
  z.sekce[0].polozky[0].pozn = 'sjednáno s investorem 12. 6.';
  const r = vypocetProj(z, C);
  t('6.1 poznámka projde výpočtem',
    sek(r, 'zamereni').polozky[0].pozn === 'sjednáno s investorem 12. 6.');
  tc('6.2 poznámka neovlivní částku', sek(r, 'zamereni').naklad, sek(zaklad, 'zamereni').naklad);
}

/* Generátory dokumentů PROJ nesmí poznámku k položce znát – stejné pravidlo
 * jako u interních poznámek k zakázce (#37). Čteme zdrojáky jako text. */
{
  const fs = require('fs');
  ['nabidka_proj.js', 'kryci_proj.js'].forEach(f => {
    const src = fs.readFileSync(__dirname + '/' + f, 'utf8');
    t('6.3 ' + f + ' nesahá na poznámku položky', !/polozk\w*\.pozn|p\.pozn\b/.test(src));
  });
}

/* ---------- 7) vlastní volný řádek ---------- */

{
  const z = zad();
  z.sekce.find(s => s.key === 'ic').polozky.push(
    { nazev: 'Zvláštní projednání', typ: 'fix', cena: 7000, vlastni: true });
  const r = vypocetProj(z, C);
  tc('7.1 vlastní fixní řádek se počítá', sek(r, 'ic').naklad, C.fixy.ic + 7000);
  t('7.2 vlastní řádek nese příznak', pol(r, 'ic', 'Zvláštní projednání').vlastni === true);

  const z2 = zad();
  z2.sekce.find(s => s.key === 'ic').polozky.push(
    { nazev: 'Extra konzultace', typ: 'hod', sazba: 'projektant', hodiny: 3, rezerva: 0, vlastni: true });
  tc('7.3 vlastní hodinový řádek se počítá',
    vypocetProj(z2, C).sekce.find(s => s.key === 'ic').naklad,
    C.fixy.ic + 3 * C.sazby.projektant);
}

/* ---------- 8) přepisy se promítnou do souhrnu i do sekce nabídky ---------- */

{
  const z = zad();
  z.sekce.find(s => s.key === 'kolaudace').polozky[0].cenaPrepis = 1000;
  const r = vypocetProj(z, C);
  const s = sek(r, 'kolaudace');
  /* kolaudace má vlastní přirážku 20 %, takže přepis musí projít celým
   * řetězcem náklad → marže → doprava → přirážka, ne jen do nákladu */
  tc('8.1 cena sekce vychází z přepsaného nákladu',
    s.celkem, (1000 * (1 + C.marze)) * 1.2);
  tc('8.2 souhrn odpovídá součtu sekcí',
    r.souhrn.celkem, r.sekce.reduce((a, x) => a + x.celkem, 0));
}

/* ---------- 8b) paušál dopravy z ceníku (2. 8. 2026) ----------
 * Položka „Doprava – paušál mimo Prahu" v ceníku do 2. 8. 2026 do výpočtu
 * vůbec nevstupovala — engine četl jen sazbu za km a ruční Kč paušál sekce.
 * Editovatelné pole ceníku bez účinku je past: kdo ho změní, věří, že změnil
 * cenu. Teď: zaškrtnutí „mimo Prahu" u dopravy sekce přičte paušál Z CENÍKU
 * (a při změně ceníku se přepočítá); ruční Kč pole zůstává jako příplatek
 * navíc a staré zakázky bez nového pole se počítají beze změny. */

{
  const z = zad();
  const s0 = z.sekce.find(s => s.doprava);
  s0.doprava.km = 10; s0.doprava.pausal = 0; s0.doprava.mimoPrahu = true;
  const r = vypocetProj(z, C);
  tc('8b.1 mimo Prahu přičte paušál z ceníku',
    sek(r, s0.key).dopravaKc, 10 * C.dopravaKmKc + C.dopravaPausalKc);

  const z2 = zad();
  const s2 = z2.sekce.find(s => s.doprava);
  s2.doprava.km = 10; s2.doprava.pausal = 0;      // mimoPrahu chybí (stará zakázka)
  const r2 = vypocetProj(z2, C);
  tc('8b.2 po Praze (bez zaškrtnutí) se paušál z ceníku nepřičítá',
    sek(r2, s2.key).dopravaKc, 10 * C.dopravaKmKc);

  const z3 = zad();
  const s3 = z3.sekce.find(s => s.doprava);
  s3.doprava.km = 0; s3.doprava.pausal = 1500; s3.doprava.mimoPrahu = true;
  const r3 = vypocetProj(z3, C);
  tc('8b.3 ruční Kč paušál je příplatek NAVÍC k paušálu z ceníku',
    sek(r3, s3.key).dopravaKc, C.dopravaPausalKc + 1500);

  /* doprava dál bez přirážky a uvnitř ceny sekce (dle předlohy O12 = O8 + O11) */
  tc('8b.4 paušál z ceníku nenese přirážku',
    sek(r, s0.key).cenaSDopravou, sek(r, s0.key).cena + sek(r, s0.key).dopravaKc);
}

/* ---------- 9) zpětná kompatibilita ---------- */
/* Zakázka uložená před 30. 7. 2026 nemá ani jedno z nových polí. Musí se
 * spočítat na haléř stejně jako dřív. */

{
  const stare = zad();
  const r = vypocetProj(stare, C);
  tc('9.1 zakázka bez nových polí se počítá beze změny',
    r.souhrn.celkem, zaklad.souhrn.celkem);
  t('9.2 fix bez fixKey a bez přepisu bere vlastní cenu', (() => {
    const z = zad();
    z.sekce[4].polozky = [{ nazev: 'IČ', typ: 'fix', cena: 4321 }];
    return vypocetProj(z, C).sekce[4].naklad === 4321;
  })());
}

/* ---------- 10) sekční přirážka: nula je rozhodnutí, ne prázdno ----------
 * Stejné pravidlo jako u přepisu ceny a sazby (3.6, 4.6), jen o patro výš.
 * Prázdné pole (null) znamená „u téhle sekce platí globální přirážka
 * z ceníku", kdežto zadaná NULA znamená „u téhle sekce nepřirážíme nic".
 * Kdyby se nula brala jako nevyplněno, vědomé rozhodnutí obchodníka by
 * ceníková přirážka tiše přebila a sekce, kterou chtěl nechat bez přirážky,
 * by odešla dražší.
 *
 * Sleva je zvlášť: přirážka říká, kolik si účtujeme, sleva kolik z toho
 * zákazníkovi odpustíme. Sekce s nulovou přirážkou tedy slevu pořád dostane —
 * to je rozdíl proti stavu do 11. 8. 2026, kdy sleva a přirážka sdílely jedno
 * pole a nula znamenala „nesahat sem vůbec". */

{
  const GLOBALNI = -10;                 // globální sleva 10 %
  const MARZE = C.marze * 100;          // globální přirážka z ceníku, v %
  const z = zad();
  z.slevaPct = GLOBALNI;
  const sNula = z.sekce.find(s => s.key === 'dpz');
  const sGlobal = z.sekce.find(s => s.key === 'dps');     // srovnávací sekce
  sNula.prirazkaPct = 0;
  sGlobal.prirazkaPct = null;
  const r = vypocetProj(z, C);
  const nula = sek(r, 'dpz'), global = sek(r, 'dps');

  tc('10.1 sekce s nulovou přirážkou žádnou přirážku nedostane, jen slevu',
    nula.pouzitePct, GLOBALNI);
  tc('10.2 sleva u sekce s nulovou přirážkou je z ceny včetně dopravy',
    nula.slevaKc, nula.cenaSDopravou * (GLOBALNI / 100));
  t('10.3 nulová přirážka zůstane v datech jako zadaná (není z ní prázdno)',
    nula.prirazkaPct === 0, String(nula.prirazkaPct));
  /* Kontrolní vzorek: sousední sekce s prázdným polem dostane ceníkovou
   * přirážku i slevu. Bez toho by 10.1 prošlo i tehdy, kdyby se nepočítalo
   * nikde nic. */
  tc('10.4 sekce s prázdným polem dostane ceníkovou přirážku i slevu',
    global.pouzitePct, MARZE + GLOBALNI);
  /* A totéž na jedné a téže sekci: s nulou musí vyjít LEVNĚJI než s prázdnem,
   * protože prázdno pustí ke slovu ceníkovou přirážku. Do 11. 8. 2026 to bylo
   * obráceně, protože prázdno tenkrát pouštělo ke slovu slevu. */
  const zProti = zad();
  zProti.slevaPct = GLOBALNI;
  zProti.sekce.find(s => s.key === 'dpz').prirazkaPct = null;
  t('10.5 táž sekce s nulou vyjde levněji než s prázdným polem',
    nula.celkem < sek(vypocetProj(zProti, C), 'dpz').celkem,
    nula.celkem + ' vs ' + sek(vypocetProj(zProti, C), 'dpz').celkem);
}

/* ============================================================
 * 11) Globální přirážka z ceníku je výchozí přirážkou sekcí (#132)
 * ============================================================
 *
 * Do 11. 8. 2026 seděla procenta natvrdo ve výchozím zadání: zaměření 30 %,
 * kolaudace 20 %, ostatní prázdno. Mělo to dvě vady. Procento přirážky je
 * obchodní údaj a ve zveřejněném kódu nemá co dělat; a hlavně se výchozí
 * zadání nemá odkud obnovit, takže nasazená verze o ta procenta přišla
 * a nikdo se to nedozvěděl (#130).
 *
 * Nové pravidlo je jednodušší: výchozí hodnotou každé sekce je globální
 * přirážka z ceníku PROJ. Zvláštní ceníkové pole pro tohle není potřeba —
 * jedno číslo, jedno místo. Obchodník smí procento u konkrétní sekce ručně
 * přepsat; to je ta lokální úprava, kvůli které pole zůstává.
 */
{
  const cenik = (marze) => Object.assign(kopie(C), { marze });
  const bezVlastni = () => {
    const z = zad();
    z.sekce.forEach(sx => { sx.prirazkaPct = null; });
    return z;
  };

  /* Základ celé věci: sekce bez vlastního procenta si vezme globální přirážku. */
  const r30 = vypocetProj(bezVlastni(), cenik(0.30));
  t('11.1 sekce bez vlastního procenta dostane globální přirážku z ceníku',
    r30.sekce.every(sx => Math.abs(sx.pouzitePct - 30) < 1e-9),
    r30.sekce.map(sx => sx.pouzitePct));

  /* Změna globální přirážky se propíše všude. */
  const r10 = vypocetProj(bezVlastni(), cenik(0.10));
  t('11.2 změna globální přirážky se propíše do všech sekcí',
    r10.sekce.every(sx => Math.abs(sx.pouzitePct - 10) < 1e-9),
    r10.sekce.map(sx => sx.pouzitePct));
  t('11.3 vyšší globální přirážka znamená vyšší celkovou cenu',
    r30.souhrn.celkem > r10.souhrn.celkem,
    r30.souhrn.celkem + ' vs ' + r10.souhrn.celkem);

  /* Vlastní % sekce má přednost — to je ta ruční lokální úprava. */
  const zVlastni = bezVlastni();
  zVlastni.sekce.find(s => s.key === 'dpz').prirazkaPct = 5;
  const rVlastni = vypocetProj(zVlastni, cenik(0.30));
  tc('11.4 vlastní % sekce přebije globální přirážku', sek(rVlastni, 'dpz').pouzitePct, 5);
  tc('11.5 ostatní sekce si globální přirážku podrží', sek(rVlastni, 'dps').pouzitePct, 30);

  /* Nulová globální přirážka je platná: nabídka bez přirážky nad rámec marže
   * u položek. Nesmí propadnout na nic jiného. */
  const r0 = vypocetProj(bezVlastni(), cenik(0));
  t('11.6 nulová globální přirážka znamená u sekcí nulu',
    r0.sekce.every(sx => Math.abs(sx.pouzitePct) < 1e-9), r0.sekce.map(sx => sx.pouzitePct));

  /* Sleva se k přirážce přičítá, takže dolehne i na sekce, které mají vlastní
   * procento. Dřív je míjela a poskytnutá sleva nebyla celá poskytnutá. */
  const zSleva = bezVlastni();
  zSleva.slevaPct = -10;
  zSleva.sekce.find(s => s.key === 'dpz').prirazkaPct = 30;
  const rSleva = vypocetProj(zSleva, cenik(0.30));
  tc('11.7 sleva dolehne i na sekci s vlastním procentem', sek(rSleva, 'dpz').pouzitePct, 20);
  tc('11.8 sleva dolehne i na sekci bez vlastního procenta', sek(rSleva, 'dps').pouzitePct, 20);
}

console.log(fail ? '\n' + fail + ' TESTŮ SELHALO (' + ok + ' OK)'
                 : '\nVŠECHNY TESTY PRJ-1 OK (' + ok + ')');
process.exit(fail ? 1 : 0);
