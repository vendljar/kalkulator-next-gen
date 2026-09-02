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

/* ---------- 2) prázdné pole v zakázce = platí ceník (MODEL 1:1 EXCEL) ----------
 * Od 1. 9. 2026 platí tohle pravidlo jen v modelu 1:1 jako Excel; opravený
 * model starou podobu (kusy × ceníková sazba) nezná — hlídá se níž, v oddílu 12. */
const sazby = await p.evaluate(() => {
  const najdi = (r) => r.sekce.hrubaOck.find(x => (x.origNazev || x.nazev).indexOf('ZÁMEČNÍKA - OSTATNÍ') >= 0);
  const Zz = JSON.parse(JSON.stringify(DEFAULT_ZADANI));
  Zz.zamecnikAtypKs = 2; Zz.zamecnikAtypKc = null;
  const zCenik = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, false));
  Zz.zamecnikAtypKc = 1234;
  const zPrepis = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, true));
  Zz.zamecnikAtypKc = 0;
  const zNula = najdi(vypocet(Zz, DEFAULT_CENIK, JEKLY, true));
  return { cenik: zCenik && zCenik.cena, prepis: zPrepis && zPrepis.cena, nula: zNula && zNula.naklad,
           cenikovaSazba: DEFAULT_CENIK.zamecnikAtypKc };
});
zkus('prázdné pole v zakázce znamená „platí ceník" (model 1:1 Excel)',
  sazby.cenik === sazby.cenikovaSazba && sazby.cenikovaSazba > 0, JSON.stringify(sazby));
zkus('vyplněné číslo přebije ceníkovou sazbu', sazby.prepis === 1234, String(sazby.prepis));
zkus('nula je platná dohoda („uděláme zdarma"), ne návrat k ceníku', sazby.nula === 0, String(sazby.nula));

/* ---------- 3) atypickou položku jde přidat přímo v kalkulaci ---------- */
await p.click('#tab-kalk');
await p.waitForTimeout(250);
const kalkText = await p.locator('#page-kalk').innerText();
/* Tlačítko „+ přidat atypickou položku (práce navíc)" bylo 20. 8. 2026 na
 * pokyn J. V. z Hrubé OCK ODEBRÁNO — od sjednocení přidávání (19. 8.) dělalo
 * totéž co „+ přidat položku". Sekce `atyp` ve výpočtu žije dál (starší
 * zakázky ji nesou a předvyplnění ATYP na ní stojí), což ověřují kontroly
 * níže: řádek přidaný přes vlastniAdd('atyp') se pořád počítá do Hrubé OCK. */
zkus('tlačítko na atypickou položku v HRUBÉ OCK už není',
  !/přidat atypickou položku/i.test(kalkText));
zkus('běžná přidávací tlačítka v sekci zůstala',
  /\+ přidat položku/i.test(kalkText));

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

/* ---------- 6) ceník řídí, čím se ATYP předvyplní (31. 8. 2026) ----------
 * Zadání J. V.: „do ceníku OCK v sekci atyp přidej ještě možnost editovat
 * atypické položky." Do teď byla ta čísla napsaná v kódu. */
const vCeniku = await p.evaluate(() => {
  const html = (() => { prepniTab('cenik'); render(); return document.getElementById('page-cenik').innerHTML; })();
  return {
    prirazka: /ATYP: přirážka za projekční a koordinační práce/.test(html),
    montaz: /ATYP: montáž navíc/.test(html),
    projekce: /ATYP: projekce navíc/.test(html),
    zamecnik: /ATYP: zámečník atyp/.test(html),
    rezervy: /ATYP: rezerva základ/.test(html) && /ATYP: rezerva příplatky/.test(html),
    vychozi: /Výchozí: montáž – základ/.test(html) && /Výchozí: projekce – základ/.test(html)
      && /Výchozí: oplechování ostatní – materiál/.test(html)
      && /Výchozí: oplechování ostatní – práce/.test(html),
  };
});
zkus('ceník má v sekci ATYP přirážku za ATYP', vCeniku.prirazka);
zkus('a podíly pro montáž i projekci navíc', vCeniku.montaz && vCeniku.projekce);
zkus('a předvyplněnou částku za zámečníka', vCeniku.zamecnik);
zkus('a obě rezervy', vCeniku.rezervy);
zkus('sekce REŽIE má výchozí rozsahy práce pro novou zakázku', vCeniku.vychozi);

const pct = await p.evaluate(() => {
  /* Procento se zadává lidsky (30) a ukládá jako podíl (0,30). */
  set('C.atypRezervaZakladPct', 40 / 100);
  prepniTab('cenik'); render();
  const html = document.getElementById('page-cenik').innerHTML;
  return { data: aktivniVarianta(ZAK).data.cenik.atypRezervaZakladPct,
           vidiSe: /value="40"/.test(html) };
});
zkus('procento se ukládá jako podíl a zobrazuje v %', pct.data === 0.4 && pct.vidiSe, JSON.stringify(pct));

const predvypln = await p.evaluate(() => {
  prepniTab('kalk');
  const c = aktivniVarianta(ZAK).data.cenik;
  c.atypRezervaZakladPct = 0.40; c.atypRezervaPriplatkyPct = 0.25;
  c.atypZamecnikKc = 70000; c.atypMontazPct = 0.50; c.atypProjekcePct = 0.10;
  Z.montazZakladHod = 24; Z.projekceZakladHod = 50;
  atypPrepni(true);
  return { rezZ: Z.rezervaZakladPct, rezP: Z.rezervaPriplatkyPct, zam: Z.zamecnikAtypKc,
           mont: Z.montazAtypHod, proj: Z.projekceAtypHod };
});
zkus('zaškrtnutí ATYP vezme rezervy z ceníku',
  predvypln.rezZ === 0.40 && predvypln.rezP === 0.25, JSON.stringify(predvypln));
zkus('a částku za zámečníka taky', predvypln.zam === 70000, predvypln.zam);
zkus('a hodiny navíc podle ceníkových podílů',
  predvypln.mont >= 12 && predvypln.proj === 5, JSON.stringify(predvypln));

const vychoziZak = await p.evaluate(() => {
  DEFAULT_CENIK.vychMontazZakladHod = 32;
  DEFAULT_CENIK.vychProjekceZakladHod = 60;
  DEFAULT_CENIK.vychOplechOstatniKg = 15;
  DEFAULT_CENIK.vychOplechOstatniHod = 8;
  const d = novaVariantaData();
  DEFAULT_CENIK.vychMontazZakladHod = 0;   // 0 = nenastaveno → platí sestavení
  const d0 = novaVariantaData();
  return { hod: d.ock.zadani.montazZakladHod, proj: d.ock.zadani.projekceZakladHod,
           kg: d.ock.zadani.oplechOstatniKg, praceHod: d.ock.zadani.oplechOstatniHod,
           nula: d0.ock.zadani.montazZakladHod };
});
zkus('nová zakázka bere výchozí rozsahy práce z ceníku',
  vychoziZak.hod === 32 && vychoziZak.proj === 60 && vychoziZak.kg === 15 && vychoziZak.praceHod === 8,
  JSON.stringify(vychoziZak));
zkus('nula v ceníku znamená nenastaveno, platí hodnota ze sestavení',
  vychoziZak.nula === 24, vychoziZak.nula);

/* ---------- 7) ceník je zdroj pravdy i pro rozdělanou zakázku (1. 9. 2026) ----------
 * Zadání J. V.: „hodnoty z ceníku se do atypů a režií nepropisují." Do teď se
 * ceník použil jen při založení zakázky a při zaškrtnutí ATYP. */
const propis = await p.evaluate(() => {
  prepniTab('kalk'); render();
  atypPrepni(true);
  const pred = { mont: Z.montazZakladHod, rez: Z.rezervaZakladPct, zam: Z.zamecnikAtypKc,
                 mAtyp: Z.montazAtypHod, opl: Z.oplechOstatniKg };
  set('C.vychMontazZakladHod', 32);
  set('C.vychOplechOstatniKg', 15);
  set('C.atypRezervaZakladPct', 0.10);
  set('C.atypZamecnikKc', 25000);
  set('C.atypMontazPct', 0.50);
  const po = { mont: Z.montazZakladHod, rez: Z.rezervaZakladPct, zam: Z.zamecnikAtypKc,
               mAtyp: Z.montazAtypHod, opl: Z.oplechOstatniKg };
  set('Z.montazZakladHod', 99);
  set('C.vychMontazZakladHod', 40);
  return { pred, po, poRucnim: Z.montazZakladHod,
           rucni: Object.keys(aktivniVarianta(ZAK).data.zadaniRucni || {}) };
});
zkus('změna ceníku se hned propíše do rozsahů práce',
  propis.po.mont === 32 && propis.po.opl === 15, JSON.stringify(propis.po));
zkus('a do atypových polí taky',
  propis.po.rez === 0.10 && propis.po.zam === 25000, JSON.stringify(propis.po));
zkus('hodiny navíc se přepočítají podle ceníkového podílu',
  propis.po.mAtyp > propis.pred.mAtyp, propis.pred.mAtyp + ' → ' + propis.po.mAtyp);
zkus('ruční přepis obchodníka ceník nepřebije', propis.poRucnim === 99, propis.poRucnim);
zkus('a je poznamenaný jako ruční', propis.rucni.indexOf('montazZakladHod') >= 0,
  JSON.stringify(propis.rucni));

/* ---------- 8) ceníková tabulka se vejde do karty (1. 9. 2026) ----------
 * Hlášeno J. V.: „popisný text se nám v ceníku nevejde na stránku." Se
 * sloupcem Cena Zahraničí má tabulka šest sloupců a poznámka utíkala mimo. */
const sirka = await p.evaluate(() => {
  NAST.jeAdmin = true; prepniTab('cenik'); render();
  const tb = document.querySelector('#page-cenik .ceniktbl');
  const karta = tb.closest('.card');
  const pozn = document.querySelector('#page-cenik .ceniktbl td.c-pozn');
  return { tab: tb.scrollWidth, karta: karta.clientWidth,
           poznVpravo: pozn ? Math.round(pozn.getBoundingClientRect().right) : 0,
           kartaVpravo: Math.round(karta.getBoundingClientRect().right),
           text: pozn ? pozn.textContent.trim().slice(0, 30) : '' };
});
zkus('tabulka ceníku se vejde do karty', sirka.tab <= sirka.karta + 1,
  sirka.tab + ' vs ' + sirka.karta);
zkus('sloupec s poznámkou je celý vidět', sirka.poznVpravo <= sirka.kartaVpravo + 1,
  sirka.poznVpravo + ' vs ' + sirka.kartaVpravo);
zkus('a poznámka opravdu nějaký text nese', sirka.text.length > 3, sirka.text);

/* ---------- 9) klíče položek pro administrátora (1. 9. 2026) ----------
 * Zadání J. V.: „přidej k textu položek v ceníku a v kalkulaci jen pro
 * administrátora malým textem klíč, který bude vzájemným klíčem." */
const klice = await p.evaluate(() => {
  NAST.jeAdmin = true; prepniTab('cenik'); render();
  const cenik = document.getElementById('page-cenik').innerHTML;
  prepniTab('kalk'); render();
  const kalk = document.getElementById('page-kalk').innerHTML;
  NAST.jeAdmin = false; NAST.nahledRole = 'Obchodník'; render();
  const obchodnikKalk = document.getElementById('page-kalk').innerHTML;
  prepniTab('cenik'); render();
  const obchodnikCenik = document.getElementById('page-cenik').innerHTML;
  NAST.jeAdmin = true; NAST.nahledRole = ''; prepniTab('kalk'); render();
  return {
    cenikMa: /class="klic"[^>]*>C\.montazHodKc</.test(cenik),
    cenikMaAtyp: /class="klic"[^>]*>C\.atypRezervaZakladPct</.test(cenik),
    kalkMa: /class="klic"[^>]*>C\.montazHodKc</.test(kalk),
    /* Od 2. 9. 2026 se v kalkulaci ukazuje jen klíč; celá vazba je v bublině. */
    kalkMaVazbu: /class="klic"[^>]*>Z\.montazZakladHod</.test(kalk)
      && /title="[^"]*C\.vychMontazZakladHod[^"]*"/.test(kalk)
      && !/>Z\.montazZakladHod ←/.test(kalk),
    obchodnik: /class="klic"/.test(obchodnikKalk) || /class="klic"/.test(obchodnikCenik),
  };
});
zkus('ceník ukazuje administrátorovi klíč položky', klice.cenikMa && klice.cenikMaAtyp,
  JSON.stringify(klice));
zkus('kalkulace ukazuje u řádku TÝŽ klíč ceníku', klice.kalkMa);
zkus('a u polí zadání i vazbu na ceníkovou položku', klice.kalkMaVazbu);
zkus('obchodník klíče nevidí', klice.obchodnik === false);

/* ---------- 10) sazby DPH jako předvolby z ceníku (1. 9. 2026) ---------- */
const dph = await p.evaluate(() => {
  prepniTab('cenik'); render();
  const cenik = document.getElementById('page-cenik').innerHTML;
  prepniTab('cenikproj'); render();
  const cenikProj = document.getElementById('page-cenikproj').innerHTML;
  set('C.dphZakladni', 0.19); set('C.dphSnizena', 0.09);
  prepniTab('kalk'); render();
  /* Předvolby v hlavičce PROJ se berou z TÉHOŽ ceníku OCK. */
  prepniTab('proj'); render();
  const projMoznosti = [...document.querySelectorAll('#page-proj option')]
    .map(o => o.textContent).join(' ; ');
  prepniTab('kalk'); render();
  window.__projDph = projMoznosti;
  const moznosti = [...document.querySelectorAll('#page-kalk select')]
    .map(s => [...s.options].map(o => o.value + '|' + o.textContent).join(' ; '))
    .filter(t => /DPH|%/.test(t));
  const text = moznosti.join(' || ');
  set('C.dph', 0.15);
  render();
  const sVlastni = [...document.querySelectorAll('#page-kalk option')]
    .some(o => /vlastní sazba zakázky/.test(o.textContent));
  set('C.dph', 0.19); render();
  return { cenik: /SAZBY DPH/.test(cenik),
           /* Hledá se řádek SEKCE, ne jakákoli zmínka — poznámka pod tabulkou
            * na obě sekce odkazuje slovy, a to je v pořádku. */
           cenikProj: /class="sec"[^>]*><td[^>]*>SAZBY DPH/.test(cenikProj)
             || /class="sec"[^>]*><td[^>]*>CIZÍ MĚNA/.test(cenikProj),
           projText: window.__projDph || '',
           projPozn: /Sazby DPH a kurz EUR jsou společné s ceníkem OCK/.test(cenikProj),
           text, sVlastni, sazba: aktivniVarianta(ZAK).data.cenik.dph };
});
/* Od 2. 9. 2026 má DPH i kurz JEDEN zdroj pravdy — ceník OCK. V ceníku PROJ
 * tyhle sekce schválně nejsou, jen poznámka, kde se nastavují. */
zkus('sekce SAZBY DPH je v ceníku OCK', dph.cenik);
zkus('v ceníku PROJ vlastní sekce DPH ani kurz nejsou', dph.cenikProj === false,
  JSON.stringify({ proj: dph.cenikProj }));
zkus('hlavička nabízí sazby z ceníku', /19 % základní/.test(dph.text) && /9 % snížená/.test(dph.text),
  dph.text.slice(0, 160));
zkus('a nabízí i nulovou sazbu', /0 % bez DPH/.test(dph.text), dph.text.slice(0, 160));
zkus('sazba mimo předvolby se nabídne jako vlastní a nepřepíše se', dph.sVlastni);
zkus('výběr sazby se uloží do zakázky', Math.abs(dph.sazba - 0.19) < 1e-9, dph.sazba);
zkus('hlavička PROJ nabízí TYTÉŽ sazby z ceníku OCK',
  /19 % základní/.test(dph.projText) && /9 % snížená/.test(dph.projText), dph.projText.slice(0, 120));
zkus('ceník PROJ řekne, kde se DPH a kurz nastavují', dph.projPozn);

/* ---------- 11) osm příplatků z předlohy + klíče souhrnů (1. 9. 2026) ---------- */
const osm = await p.evaluate(() => {
  prepniTab('cenik'); render();
  const cenik = document.getElementById('page-cenik').innerHTML;
  prepniTab('kalk');
  const c = aktivniVarianta(ZAK).data.cenik;
  c.priplatky.zabranyPadKc = 12000; c.priplatky.destovySvodKc = 3400;
  render();
  const r = spocitejVariantu(aktivniVarianta(ZAK));
  const naj = n => r.ock.priplatky.find(x => String(x.origNazev || x.nazev) === n);
  const souhrn = r.ock.sekce.hrubaOck.filter(x => x.cenaSkupina).map(x => x.cenaSkupina);
  return {
    montazDveri: r.ock.priplatky.some(x => /MONTÁŽ ŠACHETNÍCH DVEŘÍ/.test(String(x.origNazev || x.nazev))),
    zabranyMn: (() => { const x = naj('ZÁBRANY PROTI PÁDU DO ŠACHTY'); return x && x.mnozstvi; })(),
    nastupiste: aktivniVarianta(ZAK).data.ock.zadani.nastupiste,
    vCeniku: ['Zábrany proti pádu do šachty', 'Demontáž stávajícího ohrazení', 'Malba schodnic',
      'Nátěr celého ohrazení', 'Nátěr pouze okopových plechů', 'Prosklená stěna vedle šachty',
      'Demontáž stávajícího výtahu', 'Dešťový svod'].filter(n => cenik.includes(n)).length,
    zabrany: (() => { const x = naj('ZÁBRANY PROTI PÁDU DO ŠACHTY'); return x && [x.mnozstvi, x.cena, x.naklad]; })(),
    svod: (() => { const x = naj('DEŠŤOVÝ SVOD'); return x && x.naklad; })(),
    souhrn,
  };
});
zkus('všech osm příplatků z předlohy je v ceníku', osm.vCeniku === 8, osm.vCeniku);
zkus('zábrany proti pádu se počítají na všechna nástupiště (jako v předloze)',
  osm.zabranyMn === osm.nastupiste, osm.zabranyMn + ' vs ' + osm.nastupiste);
zkus('montáž šachetních dveří se automaticky nepočítá (2. 9. 2026)', osm.montazDveri === false);
zkus('a počítají se jako množství 1 × cena z ceníku',
  JSON.stringify(osm.zabrany) === JSON.stringify([osm.nastupiste, 12000, osm.nastupiste * 12000])
  && osm.svod === 3400,
  JSON.stringify(osm));
zkus('souhrnné řádky nesou klíč skupiny ceníku',
  osm.souhrn.includes('C.spojovaci.*') && osm.souhrn.includes('C.lak.*'), JSON.stringify(osm.souhrn));

/* ---------- 12) zámečník atyp podle modelu výpočtu ---------- */
const zam = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  v.data.cenik.zamecnikAtypKc = 900;
  Z.zamecnikAtypKs = 3; delete Z.zamecnikAtypKc;
  const najdi = fixes => {
    const r = vypocet(Z, v.data.cenik, JEKLY, fixes);
    return r.sekce.hrubaOck.find(x => /ZÁMEČNÍKA - OSTATNÍ/.test(String(x.origNazev || x.nazev)));
  };
  const m1 = najdi(false), m2 = najdi(true);
  Z.zamecnikAtypKc = 25000;
  const m2b = najdi(true);
  delete Z.zamecnikAtypKs; delete Z.zamecnikAtypKc;
  return { m1: m1 && [m1.mnozstvi, m1.naklad], m2: !!m2, m2b: m2b && [m2b.mnozstvi, m2b.naklad] };
});
zkus('model 1:1 Excel počítá kusy × ceníkovou sazbu',
  JSON.stringify(zam.m1) === JSON.stringify([3, 2700]), JSON.stringify(zam.m1));
zkus('opravený model bez částky řádek nedělá', zam.m2 === false);
zkus('opravený model počítá jednu částku', JSON.stringify(zam.m2b) === JSON.stringify([1, 25000]),
  JSON.stringify(zam.m2b));

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
