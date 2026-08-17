/* Lešení – jediná fixní částka a jediný zdroj. A při té příležitosti
 * i základní počet hodin projekce.
 *
 * PROČ TAHLE SADA VZNIKLA
 *
 * Při porovnání s reálnou zakázkou se ukázalo, že předloha v Excelu vede
 * tutéž položku lešení dvakrát — jednou mezi volitelnými položkami, jednou
 * mezi příplatky — a pokaždé s jinou fixní částkou. Totéž u lešení pro
 * dokončení hlavy šachty: v jedné sekci fixní část nemá, ve druhé ano.
 *
 * To není zaokrouhlení, to je jiná cena za tutéž práci. Kdo přesunul lešení
 * ze základní ceny do příplatků (nebo naopak), změnil zákazníkovi cenu o
 * tisíce korun, aniž by cokoli přepsal. Rozhodnutí uživatele z 11. 8. 2026:
 * u lešení jedna jediná fixní částka a jedno jediné místo v ceníku, kde se
 * mění. Konkrétní čísla jsou v ceníku, ne tady — tenhle soubor je veřejný.
 *
 * Tyhle testy hlídají to pravidlo, ne konkrétní částku ze zkušebního ceníku:
 * ptají se, jestli obě větve dají STEJNÉ číslo, a jestli se změna jediného
 * klíče projeví v obou. Kdyby se do jádra vrátil druhý zdroj, chytí ho to
 * i s jinými cenami v ceníku.
 *
 * Poslední oddíl je o něčem jiném, ale ze stejného porovnání: předloha má od
 * 12. 3. 2025 v základu 50 hodin projekce, ne 40. Rozdíl 10 hodin × sazba je
 * na každé zakázce, tak ať to hlídá test a ne až obchodník u nabídky.
 */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
/* Test, který se ptá v obou režimech – režim se propíše do názvu, aby bylo
 * z výpisu hned vidět, který z nich spadl. */
const testR = (n, cond, info) => test(`${n} [${rezimNazev()}]`, cond, info);
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

const engProj = require('./engine_proj.js');
const zadani = () => JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const eng_proj_zadani = () => JSON.parse(JSON.stringify(engProj.DEFAULT_ZADANI_PROJ));
const cenik = () => ZC.zkusebniCenik();
const blizko = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/* OBA REŽIMY, ne jeden.
 *
 * Kalkulátor počítá ve dvou režimech: kompatibilní („1:1 jako Excel", včetně
 * zdokumentovaných chyb předlohy) a opravený. Když se testuje jen jeden,
 * druhý se může rozejít a nikdo si toho nevšimne — a přitom obchodník počítá
 * v tom druhém. Proto se všechno, co se dnes mění, ptá v obou režimech;
 * `REZIM` říká, který je zrovna na řadě, a je vidět v názvu každého testu.
 *
 * Výjimka jsou jen ty testy, které se ptají PŘÍMO na rozdíl mezi režimy —
 * ty mají režim v sobě a jsou dole v oddílu 5. */
let REZIM = false;
const rezimNazev = () => (REZIM ? 'opravený' : 'Excel 1:1');

function spocti(volby, uprav, rezim) {
  const z = zadani();
  z.volitelne = Object.assign({}, z.volitelne, volby);
  const c = cenik();
  if (uprav) uprav(c);
  return eng.vypocet(z, c, JEKLY, rezim === undefined ? REZIM : rezim);
}
/* Spustí blok testů dvakrát – jednou v každém režimu. */
function vObouRezimech(blok) {
  for (const r of [false, true]) { REZIM = r; blok(); }
  REZIM = false;
}
const volitelna = (r, nazev) => r.sekce.volitelne.find(x => x.origNazev === nazev);
const priplatek = (r, key) => r.priplatky.find(x => x.key === key);

const VNITRNI = 'LEŠENÍ - vnitřní';
const VNEJSI  = 'LEŠENÍ - vnější';
const HLAVA   = 'LEŠENÍ - dokončení hlavy šachty';

vObouRezimech(() => {

/* ============================================================
 * 1) Volitelná položka a příplatek dávají tutéž cenu
 * ============================================================ */

/* Vnitřní lešení: jednou zapnuté (je ve volitelných), jednou vypnuté (spadne
 * do příplatků). Náklad musí vyjít na korunu stejně – jinak se cena mění
 * pouhým přesunutím řádku mezi sekcemi. */
{
  const sZap = spocti({ leseniVnitrni: true });
  const sVyp = spocti({ leseniVnitrni: false });
  const vol = volitelna(sZap, VNITRNI);
  const pri = priplatek(sVyp, 'leseniVnitrni');
  testR('vnitřní lešení je ve volitelných, když je zaškrtnuté', !!vol);
  testR('vnitřní lešení je v příplatcích, když zaškrtnuté není', !!pri);
  testR('vnitřní lešení stojí stejně ve volitelných i v příplatcích',
    vol && pri && blizko(vol.naklad, pri.naklad), vol && pri && [vol.naklad, pri.naklad]);
}

/* Totéž pro vnější lešení. Dřív mělo vlastní fixní klíč a v předloze i vlastní
 * částku – proto se ptáme zvlášť, ne jen na jedno z lešení. */
{
  const sZap = spocti({ leseniVnejsi: true });
  const sVyp = spocti({ leseniVnejsi: false });
  const vol = volitelna(sZap, VNEJSI);
  const pri = priplatek(sVyp, 'leseniVnejsi');
  testR('vnější lešení stojí stejně ve volitelných i v příplatcích',
    vol && pri && blizko(vol.naklad, pri.naklad), vol && pri && [vol.naklad, pri.naklad]);
}

/* Hlava šachty je nástavba už postaveného lešení. Fixní část nemá nikde –
 * ani ve volitelných, ani v příplatcích. */
{
  const sZap = spocti({ leseniHlava: true });
  const sVyp = spocti({ leseniHlava: false });
  const vol = volitelna(sZap, HLAVA);
  const pri = priplatek(sVyp, 'leseniHlava');
  const c = cenik();
  const cekej = zadani().prejezd * c.priplatky.leseniHlavaKc;
  testR('hlava šachty se počítá jen z metrů přejezdu, bez fixní části',
    vol && blizko(vol.naklad, cekej), vol && [vol.naklad, cekej]);
  testR('hlava šachty stojí stejně ve volitelných i v příplatcích',
    vol && pri && blizko(vol.naklad, pri.naklad), vol && pri && [vol.naklad, pri.naklad]);
}

/* ============================================================
 * 2) Fixní část má jediný zdroj
 * ============================================================ */

/* Změna jediného klíče se musí projevit u vnitřního i vnějšího lešení. Kdyby
 * v jádře zůstal druhý (zapomenutý) zdroj, jedno z nich by se nehnulo. */
{
  const PRIDANO = 7000;
  const zaklad = spocti({ leseniVnitrni: true, leseniVnejsi: true });
  const zvyseno = spocti({ leseniVnitrni: true, leseniVnejsi: true },
    c => { c.leseniFix += PRIDANO; });
  const dV = volitelna(zvyseno, VNITRNI).naklad - volitelna(zaklad, VNITRNI).naklad;
  const dE = volitelna(zvyseno, VNEJSI).naklad - volitelna(zaklad, VNEJSI).naklad;
  testR('zvýšení C.leseniFix se projeví u vnitřního lešení', blizko(dV, PRIDANO), dV);
  testR('zvýšení C.leseniFix se projeví u vnějšího lešení', blizko(dE, PRIDANO), dE);

  /* A u hlavy šachty se projevit NESMÍ – ta fixní část nemá. */
  const zakladH = spocti({ leseniHlava: true });
  const zvysenoH = spocti({ leseniHlava: true }, c => { c.leseniFix += PRIDANO; });
  testR('zvýšení C.leseniFix se u hlavy šachty neprojeví',
    blizko(volitelna(zvysenoH, HLAVA).naklad, volitelna(zakladH, HLAVA).naklad));
}

/* Změna se musí propsat i do příplatkové větve – tam se na starý stav
 * přišlo. */
{
  const PRIDANO = 4000;
  const zaklad = spocti({ leseniVnitrni: false, leseniVnejsi: false });
  const zvyseno = spocti({ leseniVnitrni: false, leseniVnejsi: false },
    c => { c.leseniFix += PRIDANO; });
  const dV = priplatek(zvyseno, 'leseniVnitrni').naklad - priplatek(zaklad, 'leseniVnitrni').naklad;
  const dE = priplatek(zvyseno, 'leseniVnejsi').naklad - priplatek(zaklad, 'leseniVnejsi').naklad;
  testR('zvýšení C.leseniFix se projeví i u příplatku za vnitřní lešení', blizko(dV, PRIDANO), dV);
  testR('zvýšení C.leseniFix se projeví i u příplatku za vnější lešení', blizko(dE, PRIDANO), dE);
}

/* Staré klíče v ceníku už nesmí nic ovlivňovat. Kdyby je jádro četlo dál,
 * měli bychom dva zdroje a byli bychom tam, kde jsme začali. */
{
  const zaklad = spocti({ leseniVnitrni: true, leseniVnejsi: true });
  const sPodvrhem = spocti({ leseniVnitrni: true, leseniVnejsi: true }, c => {
    c.leseniVnitrniFix = 99999; c.leseniVnejsiFix = 99999;
    c.priplatky.leseniHlavaFix = 99999;
  });
  testR('staré fixní klíče lešení už jádro nečte',
    blizko(volitelna(sPodvrhem, VNITRNI).naklad, volitelna(zaklad, VNITRNI).naklad) &&
    blizko(volitelna(sPodvrhem, VNEJSI).naklad, volitelna(zaklad, VNEJSI).naklad));
}

/* Poznámka u řádku musí hlásit tutéž částku, která se do ceny opravdu
 * přičetla. Nesouhlasná poznámka je horší než žádná – obchodník podle ní
 * vysvětluje cenu zákazníkovi. */
{
  const r = spocti({ leseniVnitrni: true, leseniVnejsi: true }, c => { c.leseniFix = 12345; });
  const vol = volitelna(r, VNITRNI);
  testR('poznámka u lešení hlásí částku, která se skutečně přičetla',
    vol && /12345/.test(vol.pozn || ''), vol && vol.pozn);
}


});

/* ============================================================
 * 3) Migrace starých ceníků
 * ============================================================ */

/* Uložená zakázka i zveřejněný ceník z doby před sloučením nesou tři staré
 * klíče. Migrace musí převzít hodnotu vnitřního lešení – to je ta, kterou
 * uživatel označil za platnou. Kdyby migrace mlčela, fixní část by spadla na
 * nulu a cena zakázky by se po otevření tiše propadla. */
{
  const stary = { leseniVnitrniFix: 11111, leseniVnejsiFix: 22222,
                  priplatky: { leseniHlavaFix: 33333, prechMontKc: 44444 } };
  eng.cenikMigraceLeseni(stary);
  test('migrace převezme fixní část z vnitřního lešení', stary.leseniFix === 11111, stary.leseniFix);
  test('migrace zahodí starý klíč vnitřního lešení', !('leseniVnitrniFix' in stary));
  test('migrace zahodí starý klíč vnějšího lešení', !('leseniVnejsiFix' in stary));
  test('migrace zahodí starý klíč hlavy šachty', !('leseniHlavaFix' in stary.priplatky));
  test('migrace nesahá na ostatní příplatkové sazby', stary.priplatky.prechMontKc === 44444);
}

/* Ceník, který novou hodnotu už má, se přepsat nesmí – to by z migrace
 * udělala tichá oprava ceny při každém otevření. */
{
  const novy = { leseniFix: 55555, leseniVnitrniFix: 11111, priplatky: {} };
  eng.cenikMigraceLeseni(novy);
  test('migrace nepřepíše už nastavenou fixní část', novy.leseniFix === 55555, novy.leseniFix);
}

/* Prázdné a chybějící vstupy nesmí migraci shodit – běží při otevření každé
 * zakázky, i té poškozené. */
{
  let spadlo = false;
  try {
    eng.cenikMigraceLeseni(null); eng.cenikMigraceLeseni(undefined);
    eng.cenikMigraceLeseni({}); eng.cenikMigraceLeseni({ priplatky: null });
  } catch (e) { spadlo = true; }
  test('migrace nespadne na prázdném ani poškozeném ceníku', !spadlo);
}

/* Ceník bez jakéhokoli lešení (třeba oříznutý export) nesmí dostat vymyšlenou
 * hodnotu. Prázdno není nula a není ani 18 000. */
{
  const prazdny = { priplatky: {} };
  eng.cenikMigraceLeseni(prazdny);
  test('migrace nevymýšlí fixní část tam, kde žádná nebyla',
    prazdny.leseniFix === undefined, prazdny.leseniFix);
}

/* ============================================================
 * 4) Základ projekce je 50 hodin
 * ============================================================ */

/* Předloha má od 12. 3. 2025 v základu 50 hodin dílenské dokumentace. My jsme
 * dlouho počítali 40 – rozdíl 10 hodin × sazba projektanta chyběl na každé
 * jediné zakázce. */
{
  test('základní počet hodin projekce je 50', eng.DEFAULT_ZADANI.projekceZakladHod === 50,
    eng.DEFAULT_ZADANI.projekceZakladHod);
  const r = spocti({});
  const dok = r.sekce.rezie.find(x => x.origNazev === 'DÍLENSKÁ DOKUMENTACE');
  test('dílenská dokumentace se počítá z 50 hodin', dok && dok.mnozstvi === 50, dok && dok.mnozstvi);

  /* Atypické hodiny se k základu přičítají, nenahrazují ho. */
  const z = zadani(); z.projekceAtypHod = 6;
  const r2 = eng.vypocet(z, cenik(), JEKLY, false);
  const dok2 = r2.sekce.rezie.find(x => x.origNazev === 'DÍLENSKÁ DOKUMENTACE');
  test('atypické hodiny projekce se k základu přičtou', dok2 && dok2.mnozstvi === 56, dok2 && dok2.mnozstvi);
}

/* Výchozí hodiny projekční části. Tentýž nález jako u montáže, jen ve větším:
 * příprava dat pro GitHub nulovala celý DEFAULT_ZADANI_PROJ, takže nasazená
 * verze začínala novou kalkulaci projekce s nulou hodin ve všech sekcích.
 * Hodiny nejsou ceny a nemají se odkud obnovit — ceník se nahrává zvlášť,
 * výchozí zadání ne. Test hlídá, že v nich zůstávají nenulová čísla; konkrétní
 * hodnoty jsou v jádře, tady se ptáme jen na to, že tam něco je. */
{
  const sekce = k => eng_proj_zadani().sekce.find(s => s.key === k);
  const hodin = s => s.polozky.filter(p => p.typ === 'hod').reduce((a, p) => a + p.hodiny, 0);
  /* od 17. 8. 2026 je zaměření ve výchozím stavu PRÁZDNÉ (rozhodnutí J. V.,
   * studie ho obsahuje jako část 1) — hlídka nulování mířív na studii */
  test('sekce STUDIE má nenulový základ hodin', hodin(sekce('studie')) > 0);
  test('sekce DPZ má nenulový základ hodin', hodin(sekce('dpz')) > 0);
  test('sekce DPS má nenulový základ hodin', hodin(sekce('dps')) > 0);

  /* Sekční přirážky ve výchozím zadání ŽÁDNÉ nejsou (rozhodnutí 11. 8. 2026:
   * „globální přirážka má být výchozí přirážkou sekcí"). Prázdno u sekce
   * znamená „platí globální přirážka z ceníku"; nula by znamenala „u téhle
   * sekce nepřirážíme nic", což je něco jiného a nesmí to tam spadnout samo.
   * Vedlejší efekt, o který šlo taky: ve zveřejněném kódu není žádné procento
   * přirážky, takže se nemá co ztratit ani unikat. */
  test('žádná sekce nemá ve výchozím zadání vlastní přirážku',
    eng_proj_zadani().sekce.every(s => s.prirazkaPct === null),
    eng_proj_zadani().sekce.filter(s => s.prirazkaPct !== null).map(s => s.key));
}

/* Základ montáže je 24 hodin – tentýž nález, tatáž příčina (příprava dat pro
 * GitHub obě pole nulovala, protože je pokládala za ceny). Bez testu by se to
 * mohlo vrátit. */
{
  test('základní počet hodin montáže je 24', eng.DEFAULT_ZADANI.montazZakladHod === 24,
    eng.DEFAULT_ZADANI.montazZakladHod);
  const r = spocti({});
  const mont = r.sekce.hrubaOck.find(x => x.origNazev === 'MONTÁŽ NA STAVBĚ');
  test('montáž na stavbě počítá se čtyřmi lidmi nad základem 24 hodin',
    mont && mont.mnozstvi > 4 * 24, mont && mont.mnozstvi);
}

/* ============================================================
 * 5) Montáž přechodových plechů má vlastní přepínač
 * ============================================================ */

/* V excelovém souboru zakázky CN-0327 čte montáž zapnutí z přepínače
 * materiálu (vzorec sahá o řádek výš, protože vlastní buňka zůstala prázdná)
 * a jako jediný řádek volitelných položek se tam zaokrouhluje na tisíce.
 * Rozhodnutí uživatele z 11. 8. 2026: obojí je úprava toho JEDNOHO souboru,
 * ne pravidlo původní šablony — nenapodobuje se to ani v kompatibilním režimu.
 * U nás má proto montáž vlastní přepínač v obou režimech a nezaokrouhluje se
 * nikde. Prázdný přepínač znamená „řídí se materiálem", takže se dosavadním
 * zakázkám nemění cena ani o korunu. */

const MONT = 'PŘECHODOVÉ PLECHY - NEREZ (MONTÁŽ)';
const montaz = r => r.sekce.volitelne.find(x => x.origNazev === MONT);

vObouRezimech(() => {
  /* Žádná volitelná položka se nezaokrouhluje — zaokrouhlení nahoru na tisíce
   * patří jen příplatkům. */
  {
    const r = spocti({ leseniVnitrni: true, leseniVnejsi: true, leseniHlava: true, haky: true });
    const spatne = r.sekce.volitelne.filter(x => !blizko(x.sMarzi, x.naklad * (1 + cenik().marze)));
    testR('žádná volitelná položka se nezaokrouhluje na tisíce',
      spatne.length === 0, spatne.map(x => x.origNazev));
  }

  /* Vlastní přepínač montáže. */
  {
    const bezMontaze = { prechodove: true, prechMont: false };
    testR('montáž jde vypnout samostatně', !montaz(spocti(bezMontaze)));
    /* A opačně: materiál vypnutý, montáž zapnutá. */
    testR('montáž jde zapnout i bez materiálu',
      !!montaz(spocti({ prechodove: false, prechMont: true })));
    /* Prázdný přepínač = „řídí se materiálem", tedy beze změny ceny proti
     * dosavadnímu stavu. Kdyby prázdno znamenalo „vypnuto", zmizela by montáž
     * ze všech starších zakázek. */
    testR('prázdný přepínač montáže znamená „řídí se materiálem"',
      !!montaz(spocti({ prechodove: true, prechMont: null })));
    testR('prázdný přepínač montáže s vypnutým materiálem montáž nezapne',
      !montaz(spocti({ prechodove: false, prechMont: null })));
    /* Vypnutá montáž nezmizí, spadne mezi příplatky. Neúčtovaná práce je horší
     * než práce v příplatcích — tam je aspoň vidět. */
    testR('vypnutá montáž se objeví mezi příplatky',
      !!spocti(bezMontaze).priplatky.find(x => x.key === 'prechMont'));
  }
});

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail) process.exit(1);
