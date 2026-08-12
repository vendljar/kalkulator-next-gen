/* Ověření v prohlížeči: ruční editace položek PROJ (#8 PRJ-1)
 * + vzhled kalkulace PROJ podle schváleného návrhu A2 (31. 7. 2026).
 *
 * Jednotkové testy (src/test_proj_editace.js, src/test_proj_vzhled.js) hlídají
 * výpočet a stavbu zdrojáku — tenhle soubor hlídá to, co z nich není vidět:
 * že se ovládací prvky opravdu vykreslí, že kliknutí projde až do čísel na
 * obrazovce a hlavně že se přepis ceny u JEDNÉ zakázky nepropíše do ceníku,
 * který je společný všem ostatním. Právě tahle chyba tu do 30. 7. 2026 byla —
 * pole fixní ceny zapisovalo rovnou do PC.fixy. Kontrola níž ji drží zavřenou.
 *
 * POZOR na strukturu: od návrhu A2 už každá sekce nemá vlastní kartu s vlastní
 * tabulkou. Celá kalkulace je JEDNA tabulka a sekce v ní jsou jen sledy řádků
 * mezi světlým pruhem s názvem (tr.sechd#proj-sek-i) a tmavým součtem
 * (tr.sectot) — přesně jako v kalkulaci OCK. Proto se tu řádky sekce hledají
 * procházením sourozenců, ne selektorem na kartu.
 *
 * Spouští se nad sestaveným buildem:
 *   NODE_PATH=$(npm root -g) node overit_proj_editace.mjs
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
const chyby = [];
const konzole = [];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));

await p.goto(KDE);
await p.waitForTimeout(700);

/* `ok()` bere jen název a podmínku — případná diagnostika musí být v názvu,
 * jinak se ztratí (stejná past jako v overit_lista.mjs). */
const ok = (co, podm) => { console.log((podm ? '  ✓ ' : '  ✗ ') + co); chyby.push(podm); };

// Sestavení nese prázdný ceník (samé nuly); podstrčíme zkušební, ať je z čeho počítat.
const { createRequire } = await import('module');
const ZC = createRequire(import.meta.url)('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta(); render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(200);

await p.click('#tab-proj');
await p.waitForTimeout(300);

/* Sekce DPZ (index 3 v předloze) má obojí: hodinové položky i fixní s fixKey,
 * takže na ní jde ověřit sazbový i cenový přepis. Index si necháme potvrdit
 * od aplikace, ať kontrola nespadne jen kvůli přeskládání předlohy. */
const iDpz = await p.evaluate(() => PJ.sekce.findIndex(s => s.key === 'dpz'));
ok('sekce DPZ je v zadání PROJ k nalezení', iDpz >= 0);

/* Řádky jedné sekce: od pruhu s názvem po tmavý součet včetně. Funkce se
 * předává do stránky jako text, protože uvnitř evaluate není nic z tohohle
 * souboru vidět. */
const RADKY_SEKCE = `(i) => {
  const zac = document.getElementById('proj-sek-' + i);
  const out = [];
  if (!zac) return out;
  for (let tr = zac.nextElementSibling; tr; tr = tr.nextElementSibling) {
    if (tr.classList.contains('sechd')) break;
    out.push(tr);
    if (tr.classList.contains('sectot')) break;
  }
  return out;
}`;

/* Kolik prvků daného selektoru je v řádcích sekce. */
const pocet = (i, sel) => p.evaluate(([i, sel, zdroj]) =>
  eval(zdroj)(i).reduce((a, tr) => a + tr.querySelectorAll(sel).length, 0),
  [i, sel, RADKY_SEKCE]);

/* Klik na první prvek daného selektoru (volitelně s daným textem) uvnitř sekce.
 * Klikáme přes DOM, ne myší: řádky sekce nejde adresovat jedním CSS selektorem
 * (nemají společného rodiče), a obsluha visí na onclick, takže .click() ji
 * spustí úplně stejně jako skutečné kliknutí. */
const klik = (i, sel, text) => p.evaluate(([i, sel, text, zdroj]) => {
  for (const tr of eval(zdroj)(i))
    for (const el of tr.querySelectorAll(sel))
      if (!text || el.textContent.includes(text)) { el.click(); return true; }
  return false;
}, [i, sel, text || '', RADKY_SEKCE]);

// --- ovládací prvky se vůbec vykreslí --------------------------------------
const pocetPolozek = await p.evaluate(i => PJ.sekce[i].polozky.length, iDpz);
ok('každý řádek DPZ má zaškrtávátko vyřazení',
   await pocet(iDpz, 'td.admincol input[type=checkbox]') === pocetPolozek);
ok('každý řádek DPZ má pole interní poznámky',
   await pocet(iDpz, 'input.pozn-ed') === pocetPolozek);
ok('poznámka má všude stejnou nápovědu „poznámka (interní)"',
   await pocet(iDpz, 'input.pozn-ed[placeholder="poznámka (interní)"]') === pocetPolozek);
ok('řádky DPZ nabízejí pole pro přepis sazby/ceny',
   await pocet(iDpz, 'input.prepis-ed') > 0);
ok('u hodinových řádků svítí drobný štítek činnosti (sazba zůstává v ceníku)',
   await pocet(iDpz, 'span.pill.mut') > 0);
ok('předlohová položka nejde smazat (chybí křížek)',
   await pocet(iDpz, 'button') > 0 === false || await klik(iDpz, 'button', '✕') === false);

const celkemSekce = () => p.evaluate(i => vypocetProj(PJ, PC).sekce[i], iDpz);
const cenikPbr = () => p.evaluate(() => PC.fixy.pbr);

const pred = await celkemSekce();
const pbrPred = await cenikPbr();

// --- přepis fixní ceny nesmí sáhnout do ceníku -----------------------------
const jPbr = await p.evaluate(i => PJ.sekce[i].polozky.findIndex(x => x.fixKey === 'pbr'), iDpz);
await p.evaluate(([i, j]) => pjPrepis(i, j, 'cenaPrepis', 12345), [iDpz, jPbr]);
await p.waitForTimeout(250);
ok('přepis fixní ceny se uloží do zakázky',
   await p.evaluate(([i, j]) => PJ.sekce[i].polozky[j].cenaPrepis, [iDpz, jPbr]) === 12345);
ok(`ceník PROJ zůstal nedotčený (pbr = ${pbrPred})`, await cenikPbr() === pbrPred);
const poPrepisu = await celkemSekce();
ok('přepsaná cena se propsala do součtu sekce',
   Math.abs((poPrepisu.naklad - pred.naklad) - (12345 - pbrPred)) < 0.001);
ok('u přepsané položky svítí zvýrazněné pole', await pocet(iDpz, 'input.prepis-ed.aktivni') >= 1);
ok('u přepsané položky je tlačítko návratu na ceník', await pocet(iDpz, 'button') >= 1);

// --- ↺ vrátí ceníkovou hodnotu ---------------------------------------------
ok('↺ se dá kliknout', await klik(iDpz, 'button', '↺'));
await p.waitForTimeout(250);
ok('↺ přepis zruší a vrátí cenu z ceníku',
   await p.evaluate(([i, j]) => PJ.sekce[i].polozky[j].cenaPrepis === undefined, [iDpz, jPbr]));
ok('po zrušení přepisu sedí náklad sekce zpátky na původní hodnotě',
   Math.abs((await celkemSekce()).naklad - pred.naklad) < 0.001);

// --- vyřazení položky ------------------------------------------------------
await p.evaluate(([i, j]) => pjVyrazeno(i, j, true), [iDpz, jPbr]);
await p.waitForTimeout(250);
const poVyrazeni = await celkemSekce();
ok(`vyřazená položka ubere přesně svou cenu (${pbrPred})`,
   Math.abs((pred.naklad - poVyrazeni.naklad) - pbrPred) < 0.001);
ok('vyřazená položka zůstává adminovi v seznamu',
   await p.evaluate(([i, zdroj]) => eval(zdroj)(i).filter(tr => tr.classList.contains('vyrazeno')).length,
     [iDpz, RADKY_SEKCE]) === 1);
ok('vyřazený řádek je adminovi vizuálně odlišený (přeškrtnutý)',
   await p.evaluate(([i, zdroj]) => {
     const tr = eval(zdroj)(i).find(t => t.classList.contains('vyrazeno'));
     return !!tr && getComputedStyle(tr.cells[0]).textDecorationLine.includes('line-through');
   }, [iDpz, RADKY_SEKCE]));

/* Zadání 31. 7. 2026: „Přeškrtnuté položky odstraň." Vyřazená položka je
 * informace pro nás — běžný uživatel ji nemá vidět vůbec. Admin ji vidět musí,
 * jinak by netušil, co u téhle stavby vyřadil. */
const vyrazenoRole = await p.evaluate(([i, zdroj]) => {
  const spocti = () => eval(zdroj)(i).filter(tr => tr.classList.contains('vyrazeno')).length;
  const puvodni = NAST.jeAdmin;
  NAST.jeAdmin = false; render();
  const uzivatel = spocti();
  const radkuUzivatel = eval(zdroj)(i).length;
  NAST.jeAdmin = true; render();
  const admin = spocti();
  const radkuAdmin = eval(zdroj)(i).length;
  NAST.jeAdmin = puvodni; render();
  return { uzivatel, admin, radkuUzivatel, radkuAdmin };
}, [iDpz, RADKY_SEKCE]);
ok(`běžný uživatel vyřazenou položku nevidí (přeškrtnutých ${vyrazenoRole.uzivatel})`,
   vyrazenoRole.uzivatel === 0);
ok(`a je o ten řádek kratší (${vyrazenoRole.radkuUzivatel} vs ${vyrazenoRole.radkuAdmin} u admina)`,
   vyrazenoRole.radkuUzivatel < vyrazenoRole.radkuAdmin);
ok('admin vyřazenou položku vidí dál', vyrazenoRole.admin === 1);

await p.evaluate(([i, j]) => pjVyrazeno(i, j, false), [iDpz, jPbr]);
await p.waitForTimeout(250);
ok('vrácená položka se zase počítá',
   Math.abs((await celkemSekce()).naklad - pred.naklad) < 0.001);

// --- vlastní řádek: přidat a smazat ----------------------------------------
const pocetPred = await p.evaluate(i => PJ.sekce[i].polozky.length, iDpz);
ok('řádek „+ přidat" nabízí fixní položku', await klik(iDpz, 'button', '+ přidat fixní položku'));
await p.waitForTimeout(250);
ok('vlastní fixní řádek se přidá',
   await p.evaluate(i => PJ.sekce[i].polozky.length, iDpz) === pocetPred + 1);
ok('vlastní řádek má křížek na smazání', await klik(iDpz, 'button', '✕'));
await p.waitForTimeout(250);
ok('vlastní řádek jde smazat',
   await p.evaluate(i => PJ.sekce[i].polozky.length, iDpz) === pocetPred);

// --- interní poznámka ------------------------------------------------------
await p.evaluate(([i, j]) => pjPozn(i, j, 'sleva dohodnutá s p. Novákem'), [iDpz, jPbr]);
await p.waitForTimeout(250);
ok('poznámka se uloží k položce',
   await p.evaluate(([i, j]) => PJ.sekce[i].polozky[j].pozn, [iDpz, jPbr]) === 'sleva dohodnutá s p. Novákem');
ok('poznámka nemění peníze', Math.abs((await celkemSekce()).naklad - pred.naklad) < 0.001);
/* Poznámka je interní (pravidlo #37): v zákaznických dokumentech nesmí být.
 * Ověřujeme na vygenerovaném textu nabídky i krycího listu, ne jen ve zdrojáku. */
const dokumenty = await p.evaluate(() => {
  const t = [];
  if (typeof nabidkaProjText === 'function') t.push(nabidkaProjText());
  if (typeof nabidkaProjKarta === 'function') t.push(nabidkaProjKarta());
  if (typeof kryciProjKarta === 'function') t.push(kryciProjKarta());
  if (typeof kryciProjText === 'function') t.push(kryciProjText());
  return t.join('\n');
});
ok('interní poznámka se do nabídky ani krycího listu nedostane',
   dokumenty.length > 0 && !dokumenty.includes('p. Novákem'));
ok('interní poznámku běžný uživatel vůbec nevidí',
   await p.evaluate(() => {
     const puvodni = NAST.jeAdmin;
     NAST.jeAdmin = false; render();
     const pole = document.querySelectorAll('#page-proj input.pozn-ed').length;
     const text = document.getElementById('page-proj').innerText.includes('p. Novákem');
     NAST.jeAdmin = puvodni; render();
     return pole === 0 && !text;
   }));

/* --- vzhled kalkulace PROJ: stejná stavba jako OCK (návrh A2) --------------
 * Dřív tu stálo, že nadpis karty sekce nesmí nést peníze a že rolovací pole
 * sazeb nemají mít hodnoty v závorkách. Karty ani rolovací pole už nejsou —
 * zůstalo ale to podstatné: název sekce je jen název, čísla patří do sloupců,
 * a globální přirážka platí i pro sekci, kterou u téhle stavby nepoužijeme
 * (jinak se po jejím zapnutí nedopočítá — to uživatel hlásil 31. 7. 2026). */
const MARZE_ZKUS = 0.42;                 // zkušební, ne ceníková hodnota
const zobrazeni = await p.evaluate(([marze, zdroj]) => {
  NAST.jeAdmin = true;
  PC.marze = marze;                      // ať je co ukazovat i u prázdné sekce
  render();
  const tab = document.querySelector('#proj-kalkulace table');
  const sechd = [...document.querySelectorAll('#page-proj tr.sechd')];
  const nazvy = sechd.map(tr => tr.querySelector('span') ? tr.querySelector('span').textContent.trim() : '');
  const r = vypocetProj(PJ, PC);
  const prazdna = r.sekce.findIndex(s => s.naklad === 0);
  const sectot = [...document.querySelectorAll('#page-proj tr.sectot')];
  const bunky = tr => [...tr.cells].map(c => c.textContent.trim());
  return {
    sekci: PJ.sekce.length,
    tabulek: document.querySelectorAll('#proj-kalkulace table').length,
    sechd: sechd.length, sectot: sectot.length,
    tot: document.querySelectorAll('#proj-kalkulace tr.tot').length,
    sec: document.querySelectorAll('#page-proj tr.sec').length,
    selectu: document.querySelectorAll('#proj-kalkulace select').length,
    /* Název sekce smí v pruhu stát sám. Hledat v něm číslici by nešlo —
     * „KOLAUDACE (pro 1 ks výtahu)" ji má přímo v názvu –, takže se porovnává
     * rovnou s tím, jak se sekce jmenuje v zadání. */
    navic: nazvy.filter((t, i) => t !== (PJ.sekce[i] || {}).nazev),
    hlavicka: tab ? [...tab.querySelectorAll('th')].map(t => t.textContent.trim()).join(' | ') : '',
    prm: document.querySelectorAll('#page-proj .prm').length,
    // sekce pod výpočtem (zadání 1. 8. 2026) – pořadí karet na stránce PROJ
    poradiKaret: [...document.querySelectorAll('#page-proj .card')]
      .map(c => c.id).filter(Boolean).join(','),
    slevaDole: !!document.querySelector('#proj-sleva'),
    zaokrDole: !!document.querySelector('#proj-zaokr'),
    slevaProjVKarte: !!document.querySelector('#proj-sleva input[onchange^="slevaProjSet"]'),
    zaokrRadky: [...document.querySelectorAll('#proj-zaokr table.sd-tbl tr td:first-child')]
      .map(t => t.textContent.trim()).join(' || '),
    prmText: [...document.querySelectorAll('#page-proj .prm .prm-l')].map(e => e.textContent.trim()).join(' || '),
    prazdna,
    prazdnaMaMarzi: prazdna >= 0 && r.sekce[prazdna].marze === 0
      && Math.abs(r.sekce[prazdna].pouzitePct - (PJ.sekce[prazdna].prirazkaPct == null
        ? (PJ.slevaPct || 0) : PJ.sekce[prazdna].prirazkaPct)) < 0.001,
    prazdnaSoucet: prazdna >= 0 && sectot[prazdna] ? bunky(sectot[prazdna]).join(' | ') : '',
    // po zapnutí sekce se přirážka dopočítá – to je jádro hlášené chyby
    poZapnuti: (() => {
      if (prazdna < 0) return null;
      const s = PJ.sekce[prazdna].polozky[0];
      const zaloha = JSON.stringify(s);
      if (s.typ === 'hod') s.hodiny = 10; else s.cenaPrepis = 10000;
      const v = vypocetProj(PJ, PC).sekce[prazdna];
      Object.assign(s, JSON.parse(zaloha));
      if (s.typ !== 'hod') delete s.cenaPrepis;
      return { naklad: v.naklad, marze: v.marze };
    })(),
    globPlaceholdery: [...document.querySelectorAll('#page-proj tr.sechd input[type=number]')]
      .map(x => x.placeholder),
  };
}, [MARZE_ZKUS, RADKY_SEKCE]);

ok(`celá kalkulace je jedna tabulka (${zobrazeni.tabulek})`, zobrazeni.tabulek === 1);
ok(`každá sekce má světlý pruh i tmavý součet (${zobrazeni.sechd}/${zobrazeni.sectot} z ${zobrazeni.sekci})`,
   zobrazeni.sechd === zobrazeni.sekci && zobrazeni.sectot === zobrazeni.sekci);
ok(`kalkulaci uzavírá jediný řádek CELKEM (${zobrazeni.tot})`, zobrazeni.tot === 1);
ok(`uvnitř sekcí nezůstal žádný mezisoučtový pruh tr.sec (${zobrazeni.sec})`, zobrazeni.sec === 0);
ok(`v kalkulaci není rolovací seznam sazeb (${zobrazeni.selectu})`, zobrazeni.selectu === 0);
ok(`pruh sekce nese jen název, žádné peníze (odchylek ${zobrazeni.navic.length}`
   + `${zobrazeni.navic.length ? ': „' + zobrazeni.navic[0] + '"' : ''} z ${zobrazeni.sekci})`,
   zobrazeni.navic.length === 0);
ok(`hlavička tabulky drží procento přirážky (${zobrazeni.hlavicka})`,
   /Přirážka/.test(zobrazeni.hlavicka) && zobrazeni.hlavicka.includes('42'));
/* Od 1. 8. 2026 zůstává v hlavičce jediná globální veličina – přirážka.
 * Sleva a obchodní zaokrouhlení mají vlastní sekci pod výpočtem, stejně
 * jako v Kalkulaci OCK. Přirážka a sleva jsou pořád dvě oddělené veličiny,
 * jen každá na svém místě. */
ok(`v hlavičce zůstala jediná globální veličina vpravo u pole (${zobrazeni.prm})`,
   zobrazeni.prm === 1);
ok(`a je to globální přirážka (${zobrazeni.prmText.slice(0, 80)})`,
   /Globální přirážka/.test(zobrazeni.prmText) && !/Globální sleva/.test(zobrazeni.prmText));
ok('pod výpočtem PROJ stojí sekce Sleva na nabídku', zobrazeni.slevaDole);
ok('pod výpočtem PROJ stojí sekce Obchodní zaokrouhlení', zobrazeni.zaokrDole);
ok(`sekce jdou hned za výpočtem, před souhrnem (${zobrazeni.poradiKaret})`,
   /proj-kalkulace,proj-sleva,proj-zaokr,proj-souhrn/.test(zobrazeni.poradiKaret));
ok('sleva projekce se zadává v kartě pod výpočtem projekce', zobrazeni.slevaProjVKarte);
/* Od 4. 8. 2026 karta v Kalkulaci PROJ ukazuje POUZE projekční práce – zadání:
 * „do kalkulace ock patří pouze část týkající se výtahové šachty, část týkající
 * se projekčních prací pak patří do sekce kalkulace proj." Řádek s výtahovou
 * šachtou by tu byl matoucí: obchodník ho nemá kde nastavit. */
ok(`zaokrouhlení ukazuje jen projekční práce (${zobrazeni.zaokrRadky.slice(0, 80)})`,
   /PROJ/.test(zobrazeni.zaokrRadky) && !/OCK/.test(zobrazeni.zaokrRadky));
ok(`i nevyužitá sekce (index ${zobrazeni.prazdna}) má svůj součtový řádek `
   + `(${zobrazeni.prazdnaSoucet.slice(0, 70)})`,
   zobrazeni.prazdna >= 0 && !!zobrazeni.prazdnaSoucet);
ok('po zapnutí nevyužité sekce se globální přirážka dopočítá',
   !!zobrazeni.poZapnuti && zobrazeni.poZapnuti.naklad > 0
   && Math.abs(zobrazeni.poZapnuti.marze - zobrazeni.poZapnuti.naklad * MARZE_ZKUS) < 0.001);
ok(`prázdné vlastní % sekce ukazuje globální hodnotu číslem (${zobrazeni.globPlaceholdery.join(',')})`,
   zobrazeni.globPlaceholdery.length > 0
   && zobrazeni.globPlaceholdery.every(x => x !== '' && !/glob/i.test(x)));

// --- po auditu 1. 8. 2026: jednost stavu a meze globální slevy ------------
/* Mutační testování ukázalo, že kartu jde „rozbít potichu": založit si druhý
 * stav, obrátit znaménko slevy, ztratit poznámku. Tady se to hlídá naživo. */
const audit = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  const identita = (SL === v.data.sleva) && (ZO === v.data.zaokr);
  /* #134 (12. 8. 2026): karty jsou dvě nad DVĚMA slevami. Poznámka zapsaná
   * u projekce se proto do karty OCK propsat NESMÍ — dřív to byl tentýž
   * objekt a psaní v jedné kartě přepisovalo druhou. */
  slevaProjSet('poznamka', 'pozn-projekce-123');
  slevaSet('poznamka', 'pozn-ock-456');
  const ockPozn = document.querySelector('#ock-sleva input[onchange^="slevaSet(\'poznamka\'"]');
  const projPozn = document.querySelector('#proj-sleva input[onchange^="slevaProjSet(\'poznamka\'"]');
  return { ockPozn: ockPozn ? ockPozn.value : null,
           projPozn: projPozn ? projPozn.value : null,
           dvaObjekty: aktivniVarianta(ZAK).data.sleva !== aktivniVarianta(ZAK).data.slevaProj,
           zamek: typeof slevaProjSet === 'function' && slevaProjSet._zamek === true };
});
ok('poznámka u slevy projekce zůstane u projekce', audit.projPozn === 'pozn-projekce-123', audit.projPozn);
ok('poznámka u slevy OCK zůstane u OCK', audit.ockPozn === 'pozn-ock-456', audit.ockPozn);
ok('slevy jsou dva samostatné objekty', audit.dvaObjekty);
ok('obsluha slevy projekce je chráněná zámkem varianty', audit.zamek);


// --- přepínač „jen projekce" i v kalkulaci PROJ (3. 8. 2026) ---------------
/* Uživatel ho hledal v hlavičce kalkulace projekce — tak tam je: týž stav
 * ZAK.jenProj, druhé vykreslení (stejný vzor jako karty slevy). */
const jp = await p.evaluate(() => {
  const sel = 'input[onchange*="ZAK.jenProj"]';
  const naProj = document.querySelector('#page-proj ' + sel);
  const naZak = document.querySelector('#page-zakazka ' + sel);
  if (!naProj || !naZak) return { nalezen: false };
  naProj.click();                                    // zaškrtnout → set() → render()
  const poZaskrtnuti = ZAK.jenProj === true
    && document.querySelector('#page-zakazka ' + sel).checked === true;
  document.querySelector('#page-proj ' + sel).click();   // vrátit zpět
  return { nalezen: true, poZaskrtnuti, vraceno: ZAK.jenProj === false };
});
ok('přepínač „jen projekce" je i v kalkulaci PROJ', jp.nalezen === true);
ok('je to týž stav jako v hlavičce PROJ (obě místa se propisují)',
   jp.poZaskrtnuti === true && jp.vraceno === true, JSON.stringify(jp));

// --- souhrn ----------------------------------------------------------------
console.log('');
if (konzole.length) { console.log('Konzole hlásí:'); konzole.forEach(z => console.log('   ' + z)); }
else console.log('Konzole čistá.');
const spatne = chyby.filter(x => !x).length;
console.log(spatne ? `\n${spatne} z ${chyby.length} kontrol selhalo.` : `\nVšech ${chyby.length} kontrol prošlo.`);
await b.close();
process.exit(spatne ? 1 : 0);
