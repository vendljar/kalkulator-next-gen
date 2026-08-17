/* Ověření: úpravy kalkulace PROJ ze 17. 8. 2026 (večerní dávka)
 *
 * Zadání J. V.: 1) záložka Detail výpočtu PROJ, 2) doprava mimo Prahu
 * = km / 60 × 1000 přičtená k dopravě, 3) sleva pod souhrnem, 4) nadpisy
 * sekcí bez závorek, 5) vzájemné vyloučení ZAMĚŘENÍ × STUDIE, 6) sekce
 * mimo rozsah se v nabídce neuvádějí vůbec, 7) podpis obchodníka na konci
 * tiskové nabídky, 8) ikona programu = favicon.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_proj17.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const test = (n, podm, info) => {
  if (podm) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n, info === undefined ? '' : info); }
};
const konzole = [];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
await p.goto(KDE);
await p.waitForTimeout(700);

const ZC = (await import('module')).createRequire(import.meta.url)('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta(); render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(300);

/* ---------- 1) záložka Detail výpočtu PROJ ---------- */
console.log('\ndetail výpočtu PROJ');
test('záložka Detail výpočtu PROJ existuje',
  await p.evaluate(() => !!document.getElementById('tab-detailproj')));
await p.click('#tab-detailproj');
await p.waitForTimeout(300);
test('rozpis se vykreslil a nese kroky výpočtu',
  await p.evaluate(() => /Detail výpočtu kalkulace PROJ/.test(document.getElementById('page-detailproj').innerHTML)
    && /Koncová cena/.test(document.getElementById('page-detailproj').innerHTML)));
test('rozpis zná vzorec dopravy mimo Prahu',
  await p.evaluate(() => /km \/ 60 × 1 000/.test(document.getElementById('page-detailproj').innerHTML)));
test('záložka se řídí týmž právem jako detail OCK (tab.detail)',
  await p.evaluate(() => TAB_ZOBRAZENI_KLIC.detailproj === 'tab.detail'));

/* ---------- 2) doprava mimo Prahu ---------- */
console.log('\ndoprava mimo Prahu (km / 60 × 1000)');
const doprava = await p.evaluate(() => {
  const s = PJ.sekce.find(x => x.doprava);
  s.doprava.km = 120; s.doprava.mimoPrahu = true; s.doprava.pausal = 0;
  const r = vypocetProj(PJ, PC);
  const rs = r.sekce.find(x => x.key === s.key);
  s.doprava.mimoPrahu = false;
  const r2 = vypocetProj(PJ, PC);
  const rs2 = r2.sekce.find(x => x.key === s.key);
  s.doprava.km = 0; render();
  return { se: rs.dopravaKc, bez: rs2.dopravaKc, kmKc: PC.dopravaKmKc };
});
test('zaškrtnutí mimo Prahu přičte km / 60 × 1000 (120 km ⇒ +2 000 Kč)',
  Math.abs(doprava.se - (120 * doprava.kmKc + 2000)) < 0.005, doprava);
test('bez zaškrtnutí jen km × sazba', Math.abs(doprava.bez - 120 * doprava.kmKc) < 0.005);

/* ---------- 3+4) pořadí karet a čisté nadpisy ---------- */
console.log('\npořadí karet a nadpisy');
await p.click('#tab-proj');
await p.waitForTimeout(300);
const stranka = await p.evaluate(() => document.getElementById('page-proj').innerHTML);
test('sleva stojí až POD souhrnem projekčních prací',
  stranka.indexOf('Souhrn projekčních prací') < stranka.indexOf('Sleva na nabídku PROJ'),
  [stranka.indexOf('Souhrn projekčních prací'), stranka.indexOf('Sleva na nabídku PROJ')]);
test('nadpis slevy je bez „(ZAK-10)"', !stranka.includes('ZAK-10'));
test('nadpis zaokrouhlení je bez „(#38)"', !/Obchodní zaokrouhlení[^<]*\(#38\)/.test(stranka));
test('nadpisy sekcí kalkulace jsou bez závorek (KOLAUDACE, EZC)',
  await p.evaluate(() => {
    const hlavy = [...document.querySelectorAll('#page-proj tr.sechd')].map(x => x.textContent);
    return hlavy.some(h => /KOLAUDACE/.test(h)) && !hlavy.some(h => /\(pro 1 ks|celý projekt/.test(h));
  }));

/* ---------- 5) vyloučení ZAMĚŘENÍ × STUDIE ---------- */
console.log('\nZAMĚŘENÍ × STUDIE se vylučují');
const vylouceni = await p.evaluate(() => {
  const iZa = PJ.sekce.findIndex(s => s.key === 'zamereni');
  const iSt = PJ.sekce.findIndex(s => s.key === 'studie');
  // výchozí stav: zaměření se počítá; zapnu první položku studie
  pjVyrazeno(iSt, 0, false);
  const poZapnutiStudie = {
    studie: PJ.sekce[iSt].polozky[0].vyrazeno || false,
    zamereniVyrazeno: PJ.sekce[iZa].polozky.every(q => q.vyrazeno),
  };
  // a zpět: zapnu položku zaměření → studie se vyřadí
  pjVyrazeno(iZa, 0, false);
  const poZapnutiZamereni = {
    zamereni: PJ.sekce[iZa].polozky[0].vyrazeno || false,
    studieVyrazena: PJ.sekce[iSt].polozky.every(q => q.vyrazeno),
  };
  return { poZapnutiStudie, poZapnutiZamereni };
});
test('zapnutí položky STUDIE vyřadí všechny položky ZAMĚŘENÍ',
  vylouceni.poZapnutiStudie.zamereniVyrazeno && !vylouceni.poZapnutiStudie.studie, vylouceni);
test('zapnutí položky ZAMĚŘENÍ vyřadí všechny položky STUDIE',
  vylouceni.poZapnutiZamereni.studieVyrazena && !vylouceni.poZapnutiZamereni.zamereni, vylouceni);

/* ---------- 6) sekce mimo rozsah se v nabídce neuvádějí ---------- */
console.log('\nnabídka bez sekcí mimo rozsah');
const nabidka = await p.evaluate(() => {
  // studie + projednání mimo rozsah, zaměření v rozsahu (výchozí stav po testu výše)
  const d = nabidkaProjData(ZAK, aktivniVarianta(ZAK), 'cz');
  const nadpisy = d.bloky.map(b => b.nadpis || b.text || '').join(' | ');
  return {
    nadpisy,
    zadnaNeuvedena: d.bloky.filter(b => b.typ === 'cena').every(b => !b.neuvedena),
    rekapKlice: d.rekapitulace.map(x => x[0]),
  };
});
test('žádný cenový blok nenese „není součástí této nabídky"', nabidka.zadnaNeuvedena);
test('bloky neoceněné STUDIE v dokumentu nejsou',
  !/CENA ZA STUDII PROVEDITELNOSTI – část 2/.test(nabidka.nadpisy)
  && !/PLATEBNÍ PODMÍNKY STUDIE/.test(nabidka.nadpisy), nabidka.nadpisy.slice(0, 300));
test('oceněné ZAMĚŘENÍ v dokumentu je',
  /CENA ZA ZAMĚŘENÍ/.test(nabidka.nadpisy) && /PLATEBNÍ PODMÍNKY ZAMĚŘENÍ/.test(nabidka.nadpisy));
test('obecné bloky (DPH, CENA NEZAHRNUJE, TERMÍNY) zůstávají',
  /DPH, SPLATNOST/.test(nabidka.nadpisy) && /CENA NEZAHRNUJE/.test(nabidka.nadpisy)
  && /TERMÍNY/.test(nabidka.nadpisy));

/* ---------- 7) podpis obchodníka v tiskové nabídce ---------- */
console.log('\npodpis obchodníka');
test('podpisový blok se skládá ze zpracovatele včetně obrázku podpisu',
  await p.evaluate(() => {
    ONLINE_STAV.ja = { email: 'obchodnik@x.cz', jmeno: 'Testovací Obchodník', role: 'Obchodník',
      funkce: 'obchodní technik', telefon: '+420 000 000 000',
      podpis: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGNgYGBgAAAABQABXvMqOgAAAABJRU5ErkJggg==' };
    const html = dokPodpisHtml(x => x);
    return /Vypracoval/.test(html) && /Testovací Obchodník/.test(html)
      && /obchodní technik/.test(html) && /<img src="data:image\/png/.test(html);
  }));
test('tiskový náhled PROJ podpisový blok volá',
  /dokPodpisHtml/.test(readFileSync('/home/claude/work/kng/src/ui/nabidka_proj_ui.js', 'utf8')));
test('tiskový náhled OCK podpisový blok volá',
  (readFileSync('/home/claude/work/kng/src/ui/zakazka_ui.js', 'utf8').match(/dokPodpisHtml/g) || []).length >= 1);

/* ---------- 8) ikona programu = favicon ---------- */
console.log('\nikona programu');
test('ikona v hlavičce aplikace je tentýž obrázek jako favicon',
  await p.evaluate(() => {
    const ikona = document.querySelector('header img, img[width="28"]');
    const fav = document.querySelector('link[rel*="icon"]');
    return !!ikona && !!fav && ikona.src === fav.href;
  }));

test('aplikace nehlásila chybu do konzole', konzole.length === 0, konzole.slice(0, 3).join(' | '));

await b.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
