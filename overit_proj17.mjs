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
/* 20. 8. 2026: Detail výpočtu PROJ dostal VLASTNÍ klíč v matici. Do té doby
 * sdílel právo s detailem OCK, takže je nešlo přidělit zvlášť — a projekční
 * detail přitom ukazuje hodinové sazby, konstrukční nikoli. */
test('záložka má vlastní klíč v matici zobrazení (tab.detailproj)',
  await p.evaluate(() => TAB_ZOBRAZENI_KLIC.detailproj === 'tab.detailproj'
    && !!zobrazeniPrvek('tab.detailproj')));

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
/* Oprava zadání ze 17. 8. večer II: věcné závorky u NÁZVŮ SEKCÍ zůstávají —
 * bez závorek jsou jen interní čísla úkolů v nadpisech karet. */
test('názvy sekcí nesou věcné závorky (pro 1 ks výtahu, celý projekt)',
  await p.evaluate(() => {
    const hlavy = [...document.querySelectorAll('#page-proj tr.sechd')].map(x => x.textContent);
    return hlavy.some(h => /KOLAUDACE \(pro 1 ks výtahu\)/.test(h))
      && hlavy.some(h => /celý projekt/.test(h));
  }));

/* ---------- 5) ZAMĚŘENÍ a STUDIE jsou na sobě NEZÁVISLÉ (20. 8. 2026) ----------
 * Do 20. 8. se ty dvě sekce vylučovaly: zapnutí jedné vyřadilo druhou, aby se
 * zaměření (část 1 studie) neúčtovalo dvakrát. Na pokyn J. V. je automatika
 * pryč — obchodník si obě sekce řídí sám. Sada proto hlídá OPAK: zapnutí
 * jedné té druhé nesahá. */
console.log('\nZAMĚŘENÍ × STUDIE se navzájem neovlivňují');
const vylouceni = await p.evaluate(() => {
  const iZa = PJ.sekce.findIndex(s => s.key === 'zamereni');
  const iSt = PJ.sekce.findIndex(s => s.key === 'studie');
  // výchozí stav: studie se počítá, zaměření je vyřazené (18. 8.)
  pjVyrazeno(iZa, 0, false);                       // zapnu první položku ZAMĚŘENÍ
  const poZapnutiZamereni = {
    zamereni: PJ.sekce[iZa].polozky[0].vyrazeno || false,
    studiePocita: PJ.sekce[iSt].polozky.some(q => !q.vyrazeno),
  };
  pjSekceVse(iSt, true);                           // a celou sekci STUDIE
  const poZapnutiStudie = {
    studie: PJ.sekce[iSt].polozky.every(q => !q.vyrazeno),
    zamereniPocita: PJ.sekce[iZa].polozky[0].vyrazeno !== true,
  };
  return { poZapnutiZamereni, poZapnutiStudie };
});
test('zapnutí položky ZAMĚŘENÍ nechá STUDII počítat dál',
  !vylouceni.poZapnutiZamereni.zamereni && vylouceni.poZapnutiZamereni.studiePocita, vylouceni);
test('zapnutí celé sekce STUDIE nevyřadí ZAMĚŘENÍ',
  vylouceni.poZapnutiStudie.studie && vylouceni.poZapnutiStudie.zamereniPocita, vylouceni);

/* ---------- 6) sekce mimo rozsah se v nabídce neuvádějí ---------- */
console.log('\nnabídka bez sekcí mimo rozsah');
const nabidka = await p.evaluate(() => {
  /* Rozsah si tu sada nastaví sama: ZAMĚŘENÍ se počítá, STUDIE ne. Od 20. 8.
   * ji nevyřadí automatika (ta zanikla), takže se vyřadí výslovně. */
  const za = PJ.sekce.find(s => s.key === 'zamereni');
  za.polozky.forEach(q => { delete q.vyrazeno; });
  const st = PJ.sekce.find(s => s.key === 'studie');
  st.polozky.forEach(q => { q.vyrazeno = true; });
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
/* 17. 8. večer: v hlavičce je SVĚTLE ZELENÁ varianta znaku dolaru (tmavě
 * modrý na tmavé liště nebyl vidět); favicon zůstává tmavě modrý. */
test('ikona v hlavičce je zelený znak dolaru, favicon zůstal tmavě modrý',
  await p.evaluate(() => {
    const ikona = document.querySelector('header img, img[width="28"]');
    const fav = document.querySelector('link[rel*="icon"]');
    const svg = el => { try { return atob(String(el.src || el.href).split(',')[1] || ''); } catch (e) { return ''; } };
    return !!ikona && !!fav && /86E8AD/i.test(svg(ikona)) && /0B2E6B/i.test(svg(fav));
  }));

/* ---------- 9) večerní dávka II (17. 8.) ---------- */
console.log('\nvečerní dávka II');
test('výchozí rozsah: STUDIE počítaná, ZAMĚŘENÍ vyřazené — ale S hodinami (náklady zůstávají)',
  await p.evaluate(() => {
    const z = novaZakazka();
    const sekce = z.varianty[0].data.proj.zadani.sekce;
    const za = sekce.find(s => s.key === 'zamereni');
    const st = sekce.find(s => s.key === 'studie');
    const hod = s => s.polozky.reduce((a, q) => a + (+q.hodiny || 0), 0);
    return hod(st) > 0 && st.polozky.every(q => !q.vyrazeno)
      && hod(za) > 0 && za.polozky.every(q => q.vyrazeno);
  }));
test('sekční zaškrtávátko za/odškrtne všechny položky sekce',
  await p.evaluate(() => {
    const iSt = PJ.sekce.findIndex(s => s.key === 'studie');
    pjSekceVse(iSt, false);
    const vse = PJ.sekce[iSt].polozky.every(q => q.vyrazeno);
    pjSekceVse(iSt, true);
    const zpet = PJ.sekce[iSt].polozky.every(q => !q.vyrazeno);
    return vse && zpet;
  }));
test('sekční zaškrtávátko je v pruhu sekce a je tmavě modré',
  await p.evaluate(() => {
    /* Sloupec Počítat se řídí právem sloupce.naklad — podpisový test výše
     * nechal přihlášeného OBCHODNÍKA, tomu se sekční box správně nekreslí.
     * Pro tuhle kontrolu se role vrací na administrátora. */
    ONLINE_STAV.ja = null; NAST.jeAdmin = true; render();
    const chk = document.querySelector('#page-proj tr.sechd .sekce-chk');
    return !!chk && /1e3a8a/.test(chk.getAttribute('style') || '');
  }));
test('podnadpis části nese popis v závorce a body začínají pomlčkou',
  await p.evaluate(() => {
    const za = PJ.sekce.find(s => s.key === 'zamereni');
    za.polozky.forEach(q => { delete q.vyrazeno; });
    const d = nabidkaProjData(ZAK, aktivniVarianta(ZAK), 'cz');
    za.polozky.forEach(q => { q.vyrazeno = true; });
    const dpz = d.bloky.find(b => b.typ === 'rozsah' && /POVOLENÍ ZÁMĚRU/.test(b.nadpis));
    const hlavicka = dpz && dpz.radky.find(r => !r[1] && /část 1/.test(r[0]));
    const body = dpz ? dpz.radky.filter(r => r[1]) : [];
    return !!hlavicka && /\(Stavební část projektu\)/.test(hlavicka[0])
      && body.length > 0 && body.every(r => r[0] === '' && r[1].indexOf('– ') === 0);
  }));
test('termíny nesou hvězdičky *) jako ve VZORu',
  await p.evaluate(() => {
    const za = PJ.sekce.find(s => s.key === 'zamereni');
    za.polozky.forEach(q => { delete q.vyrazeno; });
    const d = nabidkaProjData(ZAK, aktivniVarianta(ZAK), 'cz');
    za.polozky.forEach(q => { q.vyrazeno = true; });
    const terminy = d.bloky.find(b => b.typ === 'pary' && /TERMÍNY/.test(b.nadpis));
    const texty = terminy ? terminy.radky.map(r => r[0]).join(' | ') : '';
    return /stanovisek dotčených orgánů \*\)/.test(texty);
  }));
test('hlavička nenese podtitulek s verzemi šablon',
  await p.evaluate(() => !/OCK dle šablony VZOR/.test(document.querySelector('header').innerHTML)));
test('tlačítko Uložit zakázku svítí červeně, dokud zakázka není uložená, po uložení zeleně',
  await p.evaluate(() => {
    const puvodni = window.zakUlozeniStav;
    window.zakUlozeniStav = () => ({ stav: 'ulozit', chybi: [], text: '' });
    const cervene = /vyzva/.test(zakTrojice()) && !/ulozeno-ok/.test(zakTrojice());
    window.zakUlozeniStav = () => ({ stav: 'ulozeno', chybi: [], text: 'Uloženo.' });
    const zelene = /ulozeno-ok/.test(zakTrojice()) && !/vyzva/.test(zakTrojice());
    window.zakUlozeniStav = puvodni;
    return cervene && zelene;
  }));
/* Průběh ukládání (22. 8. 2026): během zápisu tlačítko říká „Ukládám…",
 * svítí řádek a druhé kliknutí se ignoruje; mousedown řeší ztracený klik. */
test('během ukládání je vidět průběh a druhé kliknutí se ignoruje',
  await p.evaluate(() => {
    ZAKULO_STAV.uklada = true;
    const tl = /Ukládám…/.test(zakTrojice()) && /disabled/.test(zakTrojice());
    const radek = /Ukládám do databáze…/.test(zakUlozeniRadek());
    const druhy = zakUlozUI();   // musí se odmítnout, ne spustit další zápis
    ZAKULO_STAV.uklada = false;
    const mousedown = /onmousedown="zakUlozMousedown\(\)"/.test(zakTrojice());
    return tl && radek && mousedown && druhy && typeof druhy.then === 'function';
  }));

/* Hláška o uložení svítí JEN CHVÍLI po zápisu (21. 8. 2026 večer, zadání
 * J. V.: „informaci o uložení zobraz vždy jen jednou a po chvíli skryj").
 * Trvalý zelený pruh přestal nést informaci — stav teď drží tlačítko. */
test('zelený pruh o uložení se ukáže po zápisu a pak zmizí',
  await p.evaluate(() => {
    const puvodni = window.zakUlozeniStav;
    const puvodniKanal = window.zakKanal;
    const puvodniKdy = ONLINE_STAV.kdyUlozeno;
    window.zakKanal = () => 'online';
    window.zakUlozeniStav = () => ({ stav: 'ulozeno', chybi: [], text: 'Uloženo.' });
    ONLINE_STAV.kdyUlozeno = new Date();
    const hned = /ulozeno-ok/.test(zakUlozeniRadek());
    const okno = (typeof ZAKULO_OKNO !== 'undefined') ? ZAKULO_OKNO : 0;
    ONLINE_STAV.kdyUlozeno = new Date(Date.now() - 60000);   // minuta zpátky
    const pozdeji = zakUlozeniRadek();
    window.zakUlozeniStav = () => ({ stav: 'ceka', chybi: [], text: 'Změny se za chvíli uloží samy.' });
    const priZmene = zakUlozeniRadek();
    window.zakUlozeniStav = () => ({ stav: 'neprihlasen', chybi: [], text: 'Nejste přihlášeni.' });
    const varovani = zakUlozeniRadek();
    window.zakUlozeniStav = puvodni; window.zakKanal = puvodniKanal;
    ONLINE_STAV.kdyUlozeno = puvodniKdy;
    /* Tři vteřiny (upřesnění J. V. 21. 8. 2026 večer) — kdyby okno někdo
     * omylem nastavil na minuty, pruh by zase visel pořád. */
    return hned && okno > 0 && okno <= 5000
      && pozdeji === '' && priZmene === '' && /Nejste přihlášeni/.test(varovani);
  }));
test('jméno přihlášeného je v liště světle zelené a heat mapa stojí za Změnit heslo',
  await p.evaluate(() => {
    ONLINE_STAV.ja = { email: 'x@y.cz', jmeno: 'Test', role: 'Administrátor', funkce: 'jednatel' };
    NAST.jeAdmin = true;
    window.onlineMozne = () => true;        // file:// build jinak lištu vůbec nekreslí
    ONLINE_STAV.bezi = true; renderOnlineLista();
    const el = document.getElementById('onlineLista');
    const html = el ? el.innerHTML : '';
    return /color:#86e8ad/.test(html) && /jednatel/.test(html)
      && html.indexOf('Změnit heslo') < html.indexOf('Heat mapa')
      && html.indexOf('Heat mapa') < html.indexOf('Odhlásit');
  }));
test('na záložce Ceník je JEDNA karta Platný ceník programu (žádné dvě)',
  await p.evaluate(() => {
    const html = (document.getElementById('page-cenik') || {}).innerHTML || '';
    return /Platný ceník programu/.test(html)
      && !/Online ceník programu/.test(html) && !/Databáze programu \(ceníky/.test(html);
  }));

/* ---------- 10) jednotky a atyp v OCK (17. 8. pozdě večer) ---------- */
console.log('\njednotky a ATYP v OCK');
await p.click('#tab-kalk');
await p.waitForTimeout(300);
test('rezervy se zadávají v procentech (jednotka %, žádné „×")',
  await p.evaluate(() => {
    const html = document.getElementById('inputs').innerHTML;
    return !/%×/.test(html) && !/u">×</.test(html)
      && /REZERVA základ/.test(html) && /Rezerva profily/.test(html);
  }));
test('procentní pole zapisují do dat desetinný podíl (30 % → 0,30)',
  await p.evaluate(() => {
    Z.rezervaProfilyPct = 0.30; render();
    const radek = [...document.querySelectorAll('#inputs .row')]
      .find(r => /Rezerva profily/.test(r.textContent));
    const vstup = radek && radek.querySelector('input[type=number]');
    return !!vstup && +vstup.value === 30;
  }));
test('Engineering i Výstup ze zaměření jsou rolovací Ano/Ne (ukládají 1/0)',
  await p.evaluate(() => {
    const radky = [...document.querySelectorAll('#inputs .row')];
    const eng = radky.find(r => /Engineering/.test(r.textContent));
    const vys = radky.find(r => /Výstup ze zaměření/.test(r.textContent));
    const sel = vys && vys.querySelector('select');
    if (!sel) return false;
    sel.value = '1'; sel.dispatchEvent(new Event('change'));
    const jednicka = Z.vystupZamereni === 1;
    sel.value = '0'; sel.dispatchEvent(new Event('change'));
    return !!eng && !!eng.querySelector('select') && jednicka && Z.vystupZamereni === 0;
  }));
test('pole „Zámečník atyp – množství" zmizelo, zůstala jen částka v Kč',
  await p.evaluate(() => {
    const html = document.getElementById('inputs').innerHTML;
    return !/Zámečník atyp – množství/.test(html) && /Zámečník atyp \(prázdné = žádný\)/.test(html);
  }));
test('zaškrtnutí ATYP předvyplní rezervy 30 % a zámečníka 50 000 Kč',
  await p.evaluate(() => {
    atypPrepni(true);
    const po = Z.rezervaProfilyPct === 0.30 && Z.rezervaPlechyPct === 0.30
      && Z.rezervaZakladPct === 0.30 && Z.rezervaPriplatkyPct === 0.30
      && Z.zamecnikAtypKc === 50000 && Z.atyp === true;
    const radek = vypocet(Z, C, JEKLY, OCK.fixes).sekce.hrubaOck
      .find(x => /ZÁMEČNÍKA - OSTATNÍ/.test(x.origNazev || x.nazev));
    const vKalkulaci = !!radek && radek.mnozstvi === 1 && radek.naklad === 50000;
    atypPrepni(false);
    const zpet = Z.rezervaProfilyPct === 0 && Z.zamecnikAtypKc === null && Z.atyp === false;
    return po && vKalkulaci && zpet;
  }));

test('součtový řádek nese závorku až ZA slovem CELKEM',
  await p.evaluate(() => {
    const radky = [...document.querySelectorAll('#page-proj tr.sectot')].map(x => x.textContent);
    return radky.some(r => /KOLAUDACE CELKEM \(pro 1 ks výtahu\)/.test(r))
      && !radky.some(r => /\(pro 1 ks výtahu\) CELKEM/.test(r));
  }));

test('režimy výpočtu nesou označení Model 1 / Model 2 (výběr i štítek)',
  await p.evaluate(() => {
    const sel = (document.getElementById('kalk-hlavicka') || {}).innerHTML || '';
    const pill = (document.getElementById('rezimPill') || {}).textContent || '';
    const maSelect = /Model 2 – opravený/.test(sel) && /Model 1 – 1:1 jako Excel/.test(sel);
    const maPill = /výpočet: Model [12] – /.test(pill);
    return maSelect && maPill;
  }));

test('tlačítka nabídky PROJ jsou poskládaná jako v OCK (modrý tisk, Word bez barvy, tisk první)',
  await p.evaluate(() => {
    prepniTab('proj'); render();
    const html = document.getElementById('page-proj').innerHTML;
    const iNahled = html.indexOf('nabidkaProjNahled()');
    const iWord = html.indexOf('nabidkaProjWord()');
    const nahledPrimary = /class="primary"[^>]*onclick="nabidkaProjNahled\(\)"/.test(html);
    const wordBezBarvy = !/class="primary"[^>]*onclick="nabidkaProjWord\(\)"/.test(html);
    return iNahled >= 0 && iWord >= 0 && iNahled < iWord && nahledPrimary && wordBezBarvy;
  }));

test('smlouvy a plná moc mají modrá (primary) tlačítka',
  await p.evaluate(() => {
    /* Obě smlouvy i plná moc se 20. 8. 2026 přestěhovaly na KONEC krycích
     * listů (OCK → záložka Krycí list zakázky OCK, PROJ → Krycí list PROJ).
     * Modrá barva zůstává, jen se hledá tam. */
    prepniTab('kryci'); if (typeof renderKryci === 'function') renderKryci();
    const kryci = document.getElementById('page-kryci').innerHTML;
    prepniTab('kryciproj'); if (typeof renderKryciProj === 'function') renderKryciProj();
    const kryciProj = document.getElementById('page-kryciproj').innerHTML;
    const prim = (html, volani) => new RegExp('class="primary"[^>]*onclick="' + volani.replace(/[()']/g, x => '\\' + x) + '"').test(html);
    return prim(kryciProj, "sodWord('sodProj')") && prim(kryciProj, "sodWord('plnaMoc')") && prim(kryci, "sodWord('sod')");
  }));

/* Stěhování 20. 8. 2026 (zadání J. V.): na místě, kde smlouvy stály, musí být
 * zelené tlačítko na krycí list — jinak by cesta k dokumentu zmizela. */
test('místo smluv zůstalo zelené tlačítko „Přejít na krycí list" (OCK i PROJ)',
  await p.evaluate(() => {
    prepniTab('spec'); if (typeof renderTechspec === 'function') renderTechspec();
    const spec = document.getElementById('page-spec').innerHTML;
    prepniTab('proj'); if (typeof renderProj === 'function') renderProj();
    const proj = document.getElementById('page-proj').innerHTML;
    const zelene = (html, tab) => new RegExp("background:#86e8ad[^\"]*\"[^>]*onclick=\"prepniTab\\('" + tab + "'\\)").test(html)
      && /Přejít na krycí list/.test(html);
    return zelene(spec, 'kryci') && zelene(proj, 'kryciproj')
      && !/sodWord\('sod'\)/.test(spec) && !/sodWord\('sodProj'\)/.test(proj);
  }));

test('hlídka verze: štítek je bez rozdílu skrytý a s rozdílem svítí červeně',
  await p.evaluate(() => {
    const el = document.getElementById('verzePill');
    const skryty = el && el.style.display === 'none';
    ONLINE_STAV.serverVerze = '99.9.9';
    renderVerzePill();
    const sviti = el.style.display !== 'none' && /v99\.9\.9/.test(el.textContent)
      && /[Oo]bnov/.test(el.textContent) && el.className.includes('stara');
    ONLINE_STAV.serverVerze = '';
    renderVerzePill();
    const zaseSkryty = el.style.display === 'none';
    return skryty && sviti && zaseSkryty;
  }));

test('Nastavení → Firma už nemá sekci Zpracovatel nabídky',
  await p.evaluate(() =>
    !FIRMA_SEKCE.includes('Zpracovatel nabídky')
    && !JSON.stringify(FIRMA_POLE).includes('ZPRACOVAL')));

test('zpracovatel bez přihlášení nechává FIRMA_ZPRACOVAL* prázdné (žádná firemní záloha)',
  await p.evaluate(() => {
    const zaloha = ONLINE_STAV.ja; ONLINE_STAV.ja = null;   // dřívější kontroly se přihlašují
    const s = zpracovatelPlaceholders(typeof firmaAktualni === 'function' ? firmaAktualni() : null);
    ONLINE_STAV.ja = zaloha;
    return s.FIRMA_ZPRACOVAL === '' && s.FIRMA_ZPRACOVAL_TEL === '' && s.FIRMA_ZPRACOVAL_EMAIL === '';
  }));

test('hlavička je JEDNA společná pro OCK i PROJ (tatáž pole, žádné štítky, zápis do ZAK.*)',
  await p.evaluate(() => {
    ZAK.cislo = '2026 - OPR - CN - 0777'; ZAK.nazevAkce = 'Zkouška hlavičky';
    ZAK.objednatel = 'Objednatel s.r.o.'; ZAK.ico = '25596641';
    prepniTab('proj'); render();
    const bar = document.querySelector('#page-proj .zak-bar');
    const html = bar ? bar.innerHTML : '';
    const maHodnoty = html.includes('2026 - OPR - CN - 0777')
      && html.includes('Zkouška hlavičky') && html.includes('Objednatel s.r.o.')
      && html.includes('25596641');
    const bezStitku = !/z OCK/.test(html);
    const piseDoSpolecne = html.includes("set('ZAK.nazevAkce'")
      && !html.includes("set('ZAK.projHlavicka.nazevAkce'");
    return maHodnoty && bezStitku && piseDoSpolecne;
  }));

test('ceníky OCK i PROJ mají sekci CIZÍ MĚNA s Kurzem EUR',
  await p.evaluate(() => {
    const ock = JSON.stringify(CENIK_DEF), proj = JSON.stringify(CENIK_DEF_PROJ);
    return ock.includes('C.kurzEurKc') && ock.includes('CIZÍ MĚNA')
      && proj.includes('PC.kurzEurKc') && proj.includes('Kurz EUR')
      && DEFAULT_CENIK.kurzEurKc === 0 && DEFAULT_CENIK_PROJ.kurzEurKc === 0;
  }));

test('cizí mutace bez kurzu se zastaví; s kurzem nese jen celá eura',
  await p.evaluate(() => {
    let chyba = '';
    try { menaKc('en', 0); } catch (e) { chyba = e.message; }
    const eur = menaKc('en', 25.2);
    return /Kurz EUR/.test(chyba) && eur(96000) === '€ 3 810'.replace(' ', ' ')
      || (/Kurz EUR/.test(chyba) && /^€ /.test(eur(96000)) && !/[.,]\d/.test(eur(96000)));
  }));

test('karta Dimenze profilů je ve výchozím stavu sbalená (a jde rozbalit)',
  await p.evaluate(() => {
    prepniTab('kalk'); render();
    const karta = document.getElementById('ock-profily');
    const sbalena = karta && karta.classList.contains('closed');
    karta.classList.toggle('closed');
    const rozbalena = !karta.classList.contains('closed');
    karta.classList.add('closed');
    return sbalena && rozbalena;
  }));

test('obchodník smí přidat položku do sekce (výchozí právo, OCK i PROJ)',
  await p.evaluate(() => {
    const prvek = ZOBRAZENI_PRVKY.find(x => x.klic === 'kalk.pridatPolozku');
    return !!prvek && prvek.vychozi['Obchodník'] === true && prvek.vychozi['Vedoucí'] === true
      /* 19. 8. 2026 večer: popisky sjednocené na „+ přidat položku" (OCK)
       * a „+ přidat hodinovou/fixní položku" (PROJ); vedle nich má admin
       * „… trvale". */
      && document.getElementById('page-kalk').innerHTML.includes('+ přidat položku')
      && document.getElementById('page-proj').innerHTML.includes('+ přidat hodinovou položku');
  }));

test('ATYP předvyplní hodiny navíc (montáž 30 % z celkových, projekce 30 % ze základu)',
  await p.evaluate(() => {
    Z.montazZakladHod = 24; Z.projekceZakladHod = 50;
    Z.montazAtypHod = 0; Z.projekceAtypHod = 0;
    atypPrepni(true);
    const navic = vypocet(Z, C, JEKLY, OCK.fixes).montaz.hodinyNavicCelkem || 0;
    const okMont = Z.montazAtypHod === Math.round(0.30 * (24 + navic));
    const okProj = Z.projekceAtypHod === 15;
    atypPrepni(false);
    const zpet = Z.montazAtypHod === 0 && Z.projekceAtypHod === 0;
    return okMont && okProj && zpet;
  }));

test('dokumentová sekce OCK je na konci Technické specifikace a v kartě CN ji nahradilo tlačítko',
  await p.evaluate(() => {
    prepniTab('spec'); if (typeof renderTechspec === 'function') renderTechspec();
    const spec = document.getElementById('page-spec').innerHTML;
    /* 20. 8. 2026: smlouva o dílo je pryč (přesunula se na krycí list) a karta
     * se podle toho přejmenovala — tisk nabídky ve specifikaci zůstává. */
    const veSpec = spec.includes('nabidkaOckDokument()') && !spec.includes("sodWord('sod')")
      && spec.includes('Cenová nabídka (OCK)');
    prepniTab('kalk'); render();
    const kalk = document.getElementById('page-kalk').innerHTML;
    /* 19. 8. 2026 večer: tlačítko přejmenováno na „Přejít na technickou
     * specifikaci" a obarveno světle zeleně (už není modré primary). */
    const tlacitko = kalk.includes('>Přejít na technickou specifikaci</button>')
      && /background:#86e8ad[^>]*>Přejít na technickou specifikaci/.test(kalk);
    const bezTisku = !kalk.includes('nabidkaOckDokument()');
    return veSpec && tlacitko && bezTisku;
  }));

test('dílčí faktura č. 2 se dopočítává (záloha 70 % → 20 %, Bez zálohy → 90 %)',
  await p.evaluate(() =>
    kryciFaktura2Dopocet('70 % – po podpisu smlouvy', '10 % – po předání', '40 % – po zahájení montáže')
      === '20 % – po zahájení montáže'
    && kryciFaktura2Dopocet('Bez zálohy', '10 % – po předání', '40 % – po zahájení montáže')
      === '90 % – po zahájení montáže'));

test('duplicitní číslo a název se hlásí štítkem u hlavičky',
  await p.evaluate(() => {
    ZAK.cislo = '2026 - OPR - CN - 555'; ZAK.nazevAkce = 'Výtah Anděl';
    ONLINE_STAV.rejstrik = [{ soubor: 'cizi.json', cislo: '2026-OPR-CN-555', nazevAkce: 'vytah andel' }];
    ONLINE_STAV.soubor = '';
    render();
    const html = document.querySelector('#page-kalk .zak-bar').innerHTML;
    const sviti = (html.match(/duplicitní/g) || []).length >= 2;
    ONLINE_STAV.rejstrik = []; render();
    const zhaslo = !document.querySelector('#page-kalk .zak-bar').innerHTML.includes('duplicitní');
    return sviti && zhaslo;
  }));

test('číslo varianty ≥ 2 nese příponu .N v dokumentech OCK i PROJ',
  await p.evaluate(() => {
    const v2 = novaVarianta('Varianta 2'); ZAK.varianty.push(v2);
    const okc = cisloSVariantou(ZAK, v2) === '2026 - OPR - CN - 555.2';
    const prvni = cisloSVariantou(ZAK, ZAK.varianty[0]) === '2026 - OPR - CN - 555';
    ZAK.varianty.pop();
    return okc && prvni;
  }));

test('aplikace nehlásila chybu do konzole', konzole.length === 0, konzole.slice(0, 3).join(' | '));

await b.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
