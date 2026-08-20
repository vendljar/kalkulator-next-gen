/* Ověření: analytika užívání a heat mapa (#25 + #26 + #27, 17. 8. 2026)
 *
 * Jednotkové testy hlídají logiku (src/test_analytika.js) a server
 * (netlify/test_funkce.mjs, test_prava.mjs). Tenhle skript hlídá to,
 * co z nich vidět není — chování v živé aplikaci:
 *   – sběr NEBĚŽÍ bez přihlášení a odposlech nepíše nic osobního,
 *   – klik na tlačítko skončí ve správném klíči (bez argumentů volání),
 *   – záložka Analytika je v Nastavení JEN pro administrátora,
 *   – heat mapa se nakreslí z dat, po vypnutí nezůstane ani pixel
 *     (přesně tahle vada byla v návrhu vizuálu — sem patří regresní test),
 *   – přepínač v liště vidí jen administrátor.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_analytika.mjs
 */
import { chromium } from 'playwright';

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

/* ---------- 1) bez přihlášení se nesbírá ---------- */
console.log('\nsběr a soukromí');
test('bez přihlášení sběr neběží (analytikaBezi = false)',
  await p.evaluate(() => typeof analytikaBezi === 'function' && analytikaBezi() === false));
test('klik bez přihlášení nezaloží žádnou frontu',
  await p.evaluate(() => { document.querySelector('#tab-proj').click(); return ANL.den === null; }));

/* přihlášení „nasucho": stav se nastaví ručně — server tu není, hlídá se
 * chování klienta (skutečná práva serveru hlídá netlify/test_prava.mjs) */
await p.evaluate(() => {
  ONLINE_STAV.ja = { email: 'test@x.cz', jmeno: 'Test', role: 'Administrátor' };
  NAST.jeAdmin = true; ANL.sber = true; analytikaStart(); render();
});
await p.waitForTimeout(200);

test('po přihlášení se klik zapíše do denního agregátu',
  await p.evaluate(() => {
    document.querySelector('#tab-kalk').click();
    return ANL.den && Object.keys(ANL.den.kliky).length > 0;
  }));
const klice = await p.evaluate(() => Object.keys(ANL.den.kliky));
test('klíče nesou záložku i prvek', klice.every(k => k.split('|').length === 3), klice.slice(0, 3));
test('klíče NEnesou argumenty volání (žádná data zakázky)',
  klice.every(k => !/\('/.test(k) && k.indexOf('(…)') === -1 || k.includes('(…)')), klice.slice(0, 5));
test('přepnutí záložky se počítá i jako otevření záložky',
  await p.evaluate(() => (ANL.den.zalozky.kalk || 0) >= 1), await p.evaluate(() => ANL.den.zalozky));
test('v celé frontě není e-mail ani jméno přihlášeného',
  await p.evaluate(() => !JSON.stringify(ANL.den).includes('test@x.cz')
    && !JSON.stringify(ANL.den).includes('Test')));

/* měření času (#25): dvě rychlé interakce v OCK záložce → čas jde zakázce */
test('aktivní práce se přičítá otevřené zakázce (odděleně OCK/PROJ)',
  await p.evaluate(() => {
    ZAK.cislo = '2026 - OPR - CN - 0500';
    ANL.cas = casNovy(); ANL.casy = {};
    analytikaAktivita();                              // první interakce v kalk
    ANL.cas.posledni -= 30000;                        // „před 30 vteřinami"
    analytikaAktivita();
    const c = ANL.casy['2026 - OPR - CN - 0500'];
    return c && c.ock >= 29 && c.ock <= 31 && c.proj === 0;
  }), await p.evaluate(() => ANL.casy));

/* ---------- 2) záložka Analytika v Nastavení ---------- */
console.log('\nzáložka Nastavení → Analytika');
test('administrátor záložku Analytika vidí',
  await p.evaluate(() => nastPanelyViditelne().some(x => x.id === 'analytika')));
test('obchodník (bez admin pohledu) záložku NEvidí',
  await p.evaluate(() => {
    NAST.jeAdmin = false;
    const vidi = nastPanelyViditelne().some(x => x.id === 'analytika');
    NAST.jeAdmin = true;
    return !vidi;
  }));
test('tělo záložky bez načtených dat hlásí načítání, ne chybu',
  await p.evaluate(() => { ANL.prehled = { chyba: 'server tu není' }; return /nenačetla/.test(nastAnalytika()); }));
test('GDPR text je zatím prázdný a záložka to poctivě říká (čeká na právníka)',
  await p.evaluate(() => ANALYTIKA_GDPR_TEXT === '' && /právník/i.test((() => {
    ANL.prehled = { celkem: analytikaNovyDen(), poMesicich: {}, casy: {}, dnu: 0, rezim: { sber: true } };
    return nastAnalytika();
  })())));

/* ---------- 3) heat mapa ---------- */
console.log('\nheat mapa');
test('přepínač 🔥 se kreslí jen administrátorovi',
  await p.evaluate(() => {
    const adminVidi = /Heat mapa/.test(heatPrepinacHtml());
    NAST.jeAdmin = false;
    const obchodnikVidi = /Heat mapa/.test(heatPrepinacHtml());
    NAST.jeAdmin = true;
    return adminVidi && !obchodnikVidi;
  }));

/* mapa z podvržených dat — server tu není, kreslení se zkouší přímo */
/* Otisk PŘED zapnutím: pár prvků nese inline styl už z návrhu (např. zelené
 * tlačítko „Přejít na technickou specifikaci", 19. 8. 2026) — kontrola úklidu
 * po vypnutí se proto měří proti stavu před zapnutím, ne proti nule. */
const stylyPred = await p.evaluate(() =>
  [...document.querySelectorAll('button,select,input')]
    .filter(e => e.style.background || e.style.outline || e.style.boxShadow).length);
const nakresleno = await p.evaluate(() => {
  ANL.heat = true;
  ANL.heatData = analytikaNovyDen();
  /* skutečné klíče prvků právě otevřené záložky — ať se opravdu trefí */
  const prvky = [...document.querySelectorAll('button')].filter(e => e.offsetParent).slice(0, 6);
  prvky.forEach((el, i) => { ANL.heatData.kliky[analytikaKlicPrvku(el)] = (i + 1) * 10; });
  heatKresli(); heatPanel();
  return {
    odznaky: document.querySelectorAll('.heat-badge').length,
    obarvene: document.querySelectorAll('[data-heat-styl]').length,
    nulove: [...document.querySelectorAll('[data-heat-styl]')].filter(e => e.style.outline.includes('dashed')).length,
    panel: !!document.getElementById('heatPanel'),
  };
});
test('mapa nakreslila odznaky s počty', nakresleno.odznaky > 0, nakresleno);
test('prvky dostaly podbarvení / rámeček', nakresleno.obarvene > 0);
test('nepoužité prvky dostaly šedý čárkovaný rámeček', nakresleno.nulove > 0);
test('plovoucí panel s metrikou a obdobím stojí', nakresleno.panel);

/* REGRESE z návrhu vizuálu: po vypnutí nesmí zůstat ANI PIXEL */
const poVypnuti = await p.evaluate(() => {
  ANL.heat = false; heatSmaz(); heatPanelSmaz();
  return {
    odznaky: document.querySelectorAll('.heat-badge').length,
    styly: [...document.querySelectorAll('button,select,input')]
      .filter(e => e.style.background || e.style.outline || e.style.boxShadow).length,
    panel: !!document.getElementById('heatPanel'),
  };
});
test('po vypnutí nezůstal žádný odznak', poVypnuti.odznaky === 0);
test('po vypnutí nezůstalo žádné podbarvení ani rámeček (nad stav před zapnutím)',
  poVypnuti.styly === stylyPred, JSON.stringify({ pred: stylyPred, po: poVypnuti.styly }));
test('po vypnutí zmizel i plovoucí panel', !poVypnuti.panel);

/* překreslení aplikace mapu neshodí (jede s uživatelem) */
test('po překreslení aplikace se zapnutá mapa nakreslí znovu',
  await p.evaluate(async () => {
    ANL.heat = true; render();
    await new Promise(r => setTimeout(r, 200));
    return document.querySelectorAll('.heat-badge').length > 0;
  }));
await p.evaluate(() => { ANL.heat = false; heatSmaz(); heatPanelSmaz(); });

test('aplikace nehlásila chybu do konzole', konzole.length === 0, konzole.slice(0, 3).join(' | '));

await b.close();
console.log('\n' + (fail ? fail + ' KONTROL SELHALO (z ' + (ok + fail) + ')'
  : 'VŠECHNY KONTROLY (' + ok + ') OK'));
process.exit(fail ? 1 : 0);
