/* Ověření v prohlížeči: nález V23 (4. 9. 2026)
 * =============================================
 *
 * A) Otevřená ZAHRANIČNÍ zakázka se počítala tuzemským ceníkem — nabídka se
 *    sama podhodnotila zhruba o třetinu, přestože přepínač i štítek dál
 *    hlásily „Zahraničí".
 * B) Autosave tu přepočítanou verzi vzápětí uložil, takže stačilo si starší
 *    nabídku „jen otevřít" a uložená verze byla tiše přepsaná.
 *
 * Počítání hlídá `src/test_v23_zahranicni.js`. Tady jde o BĚŽÍCÍ APLIKACI:
 * že se po otevření nezmění ani haléř, že to platí i pro celkovou cenu
 * a že brána automatického ukládání bez zásahu uživatele mlčí.
 *
 * Spuštění: node overit_v23.mjs
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail === undefined ? '' : '  → ' + detail)); }
};

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const konzole = [];
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
await p.goto(KDE);
await p.waitForTimeout(600);

/* Dialogy jsou v aplikaci (2. 9. 2026) — potvrzovat je nemusíme, ale ať
 * případný dotaz test nezastaví. */
await p.evaluate(() => {
  window.potvrd = () => Promise.resolve(true);
  window.hlaska = () => Promise.resolve();
  NAST.jeAdmin = true;
});

/* ---------- příprava: platný ceník + zahraniční odchylky ---------- */
await p.evaluate(() => {
  DEFAULT_CENIK.montazHodKc = 400;
  DEFAULT_CENIK.cestovniKc = 15000;
  DEFAULT_CENIK.sken3dKc = 3000;
  DEFAULT_CENIK.marze = 0.30;
  CENIK_ZAHR.ceny = { 'C.montazHodKc': 1000, 'C.cestovniKc': 120000,
                      'C.sken3dKc': 20000, 'C.marze': 0.40 };
  CENIK_ZAHR.jenZahr = {};
});

/* Uložená zahraniční zakázka — tak, jak leží v databázi. */
const ulozena = await p.evaluate(() => {
  const zak = zajistiZamek(novaZakazka());
  zak.cislo = '2025 - OPR - 0636 - TEST';
  zak.nazevAkce = 'Kornpfortstraße Koblenz';
  const v = zak.varianty[0];
  v.data.cenikRada = 'zahr';
  v.data.cenik.rada = 'zahr';
  v.data.cenik.montazHodKc = 1000;
  v.data.cenik.cestovniKc = 120000;
  v.data.cenik.sken3dKc = 20000;
  v.data.cenik.marze = 0.40;
  v.data.cenikRucni = {};                 // nic nenastavoval ručně
  window.__ulozena = JSON.stringify(zak); // „soubor v databázi"
  return { cena: spocitejVariantu(v).ock.souhrn.zakladCena };
});

/* ---------- A) otevření zahraniční zakázky ---------- */
const poOtevreni = await p.evaluate(() => {
  ZAK = importZakazka(JSON.parse(window.__ulozena));
  syncVarianta();
  const prep = uloSrovnejSPlatnymCenikem();     // přesně to, co dělá otevření
  render();
  const v = aktivniVarianta(ZAK);
  return {
    montaz: v.data.cenik.montazHodKc, cestovni: v.data.cenik.cestovniKc,
    sken: v.data.cenik.sken3dKc, marze: v.data.cenik.marze,
    rada: cenikRadaVarianty(v.data),
    cena: spocitejVariantu(v).ock.souhrn.zakladCena,
    prepocteno: prep ? prep.prepocteno : -1,
  };
});
zkus('montáž zůstala zahraniční (1 000 Kč/h)', poOtevreni.montaz === 1000, poOtevreni.montaz);
zkus('cestovní náklady zůstaly zahraniční (120 000)', poOtevreni.cestovni === 120000, poOtevreni.cestovni);
zkus('3D sken zůstal zahraniční (20 000)', poOtevreni.sken === 20000, poOtevreni.sken);
zkus('globální přirážka zůstala 40 %, nespadla na 30 %', poOtevreni.marze === 0.40, poOtevreni.marze);
zkus('řada varianty je pořád Zahraničí', poOtevreni.rada === 'zahr', poOtevreni.rada);
zkus('celková cena po otevření sedí na haléř s uloženou',
  Math.abs(poOtevreni.cena - ulozena.cena) < 1e-9, ulozena.cena + ' × ' + poOtevreni.cena);
zkus('přepočet o sobě netvrdí, že něco přepočítal', poOtevreni.prepocteno === 0, poOtevreni.prepocteno);

/* Přepnutí tam a zpět je pojistka: kdyby se hodnoty rozešly, tenhle krok je
 * (podle hlášení J. V.) srovná — a rozdíl by se tu ukázal. */
const tamZpet = await p.evaluate(async () => {
  await cenikRadaPrepniUI('cr');
  await cenikRadaPrepniUI('zahr');
  const v = aktivniVarianta(ZAK);
  return { montaz: v.data.cenik.montazHodKc, marze: v.data.cenik.marze,
           cena: spocitejVariantu(v).ock.souhrn.zakladCena };
});
zkus('ruční přepnutí ČR → Zahraničí nic nezmění (hodnoty už jsou správné)',
  tamZpet.montaz === 1000 && Math.abs(tamZpet.cena - ulozena.cena) < 1e-9,
  JSON.stringify(tamZpet));
zkus('a přirážku ručním přepnutím taky nikdo neshodí', tamZpet.marze === 0.40, tamZpet.marze);

/* ---------- tuzemská zakázka se chová jako dřív ---------- */
const tuzemska = await p.evaluate(() => {
  const zak = zajistiZamek(novaZakazka());
  zak.cislo = '2026 - OPR - CN - 0248 - TEST';
  const v = zak.varianty[0];
  v.data.cenik.montazHodKc = 111;      // zastaralá cena
  v.data.cenik.marze = 0.20;           // rozhodnutí obchodníka
  v.data.cenikRucni = {};
  ZAK = zak; syncVarianta();
  uloSrovnejSPlatnymCenikem();
  const w = aktivniVarianta(ZAK);
  return { montaz: w.data.cenik.montazHodKc, marze: w.data.cenik.marze };
});
zkus('tuzemská zakázka se srovná s platným tuzemským ceníkem', tuzemska.montaz === 400, tuzemska.montaz);
zkus('ale její přirážka 20 % zůstává', tuzemska.marze === 0.20, tuzemska.marze);

/* ---------- B) autosave bez zásahu uživatele mlčí ---------- */
const brana = await p.evaluate(() => {
  /* Aplikace poběží „jako přihlášená" — server tu není, ale brána
   * automatického ukládání se rozhoduje ještě před voláním serveru. */
  ONLINE_STAV.ja = { email: 'test@example.com', jmeno: 'Test', role: 'Administrátor' };
  ONLINE_STAV.auto = true;
  ONLINE_STAV.pracuje = false;
  ONLINE_STAV.soubor = '2025-opr-0636-test.json';
  ONLINE_STAV.posledni = '';            // obsah se od uloženého liší
  ONLINE_STAV.zmenaUzivatele = false;   // ale nikdo se ničeho nedotkl
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  onlineTik();
  const bezZasahu = ONLINE_STAV.timer;
  /* Teď uživatel opravdu něco napíše. */
  document.dispatchEvent(new Event('change', { bubbles: true }));
  onlineTik();
  const poZasahu = ONLINE_STAV.timer;
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  return { bezZasahu: !!bezZasahu, poZasahu: !!poZasahu };
});
zkus('bez zásahu uživatele autosave nic neplánuje', brana.bezZasahu === false);
zkus('po skutečné editaci se zápis naplánuje jako dřív', brana.poZasahu === true);

/* Kliknutí do záložky editace není — jen do ovládacího prvku. */
const klik = await p.evaluate(() => {
  ONLINE_STAV.zmenaUzivatele = false;
  const div = document.createElement('div');
  document.body.appendChild(div);
  div.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const poDivu = ONLINE_STAV.zmenaUzivatele;
  const btn = document.createElement('button');
  document.body.appendChild(btn);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const poTlacitku = ONLINE_STAV.zmenaUzivatele;
  div.remove(); btn.remove();
  return { poDivu, poTlacitku };
});
zkus('klik mimo ovládací prvek se za změnu nepovažuje', klik.poDivu === false);
zkus('klik do tlačítka ano (přidat položku, ↺, zaškrtnutí)', klik.poTlacitku === true);

/* ---------- C) zámek otevřené zakázky (jen ke čtení) ---------- */
const zamek = await p.evaluate(() => {
  ONLINE_STAV.ja = { email: 'obchod@eng.cz', jmeno: 'Obchodník', role: 'Obchodník' };
  ZAK = importZakazka(JSON.parse(window.__ulozena));
  ZAK.autor = 'obchod@eng.cz';
  syncVarianta();
  zamekCteniZapni();          // to, co udělá otevření z databáze
  prepniTab('kalk'); render();
  const html = document.getElementById('kalk-hlavicka').innerHTML;
  return {
    lista: /Nabídka je otevřená jen ke čtení/.test(html),
    tlacitko: /zamekCteniOdemkniUI\(\)/.test(html),
    trida: !!document.querySelector('#inputs.cteni-zamceno'),
    hlavickaTrida: !!document.querySelector('.zak-bar.cteni-zamceno'),
  };
});
zkus('po otevření svítí lišta „jen ke čtení"', zamek.lista);
zkus('a je v ní tlačítko Odemknout k úpravám', zamek.tlacitko);
zkus('data kalkulace jsou ztlumená a needitovatelná', zamek.trida);
zkus('hlavička zakázky taky (jinak by se do ní psalo nadarmo)', zamek.hlavickaTrida);

const zapisZamceno = await p.evaluate(() => {
  window.hlaska = (t) => { window.__hlaska = String(t); return Promise.resolve(); };
  const pred = Z.nastupiste;
  set('Z.nastupiste', 9);
  const poZadani = Z.nastupiste;
  const predNazev = ZAK.nazevAkce;
  set('ZAK.nazevAkce', 'Pokus o přepis');
  return { zmenaZadani: poZadani !== pred, zmenaHlavicky: ZAK.nazevAkce !== predNazev,
           hlaska: window.__hlaska || '' };
});
zkus('v zamčené nabídce se do zadání nezapíše', zapisZamceno.zmenaZadani === false);
zkus('ani do hlavičky', zapisZamceno.zmenaHlavicky === false);
zkus('a aplikace řekne, jak dál', /Odemknout k úpravám/.test(zapisZamceno.hlaska),
  zapisZamceno.hlaska.slice(0, 60));

const branaZamek = await p.evaluate(() => {
  ONLINE_STAV.auto = true; ONLINE_STAV.pracuje = false;
  ONLINE_STAV.soubor = '2025-opr-0636-test.json';
  ONLINE_STAV.posledni = ''; ONLINE_STAV.zmenaUzivatele = true;   // i kdyby uživatel klikal
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  onlineTik();
  const t = ONLINE_STAV.timer;
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  return !!t;
});
zkus('v zamčené nabídce autosave mlčí i po kliknutí', branaZamek === false);

const poOdemceni = await p.evaluate(() => {
  zamekCteniOdemkniUI();
  const pred = Z.nastupiste;
  set('Z.nastupiste', 9);
  const html = document.getElementById('kalk-hlavicka').innerHTML;
  ONLINE_STAV.posledni = ''; ONLINE_STAV.zmenaUzivatele = true;
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  onlineTik();
  const t = ONLINE_STAV.timer;
  if (ONLINE_STAV.timer) { clearTimeout(ONLINE_STAV.timer); ONLINE_STAV.timer = null; }
  return { zapsano: Z.nastupiste === 9 && pred !== 9, lista: /jen ke čtení/.test(html), timer: !!t };
});
zkus('po odemčení jde do zakázky psát', poOdemceni.zapsano);
zkus('lišta zmizela', poOdemceni.lista === false);
zkus('a autosave zase plánuje zápis', poOdemceni.timer === true);

/* Cizí zakázku obchodník neodemkne — tlačítko nedostane. */
const cizi = await p.evaluate(() => {
  ZAK = importZakazka(JSON.parse(window.__ulozena));
  ZAK.autor = 'kolega@eng.cz'; ZAK.autorJmeno = 'Kolega Novák';
  syncVarianta(); zamekCteniZapni(); render();
  const html = document.getElementById('kalk-hlavicka').innerHTML;
  return { tlacitko: /zamekCteniOdemkniUI\(\)/.test(html), duvod: /Kolega Novák/.test(html) };
});
zkus('cizí nabídku obchodník odemknout nemůže', cizi.tlacitko === false);
zkus('a v liště stojí, koho o to požádat', cizi.duvod);

const jakoVedouci = await p.evaluate(() => {
  ONLINE_STAV.ja = { email: 'v@eng.cz', jmeno: 'Vedoucí', role: 'Vedoucí' };
  render();
  return /zamekCteniOdemkniUI\(\)/.test(document.getElementById('kalk-hlavicka').innerHTML);
});
zkus('vedoucí odemknout může', jakoVedouci === true);

/* Nová zakázka se zakládá k psaní, ne ke čtení. */
const nova = await p.evaluate(() => {
  ZAK = novaZakazka(); syncVarianta(); zakOdpojUlozeni(); render();
  return zamekCteniJe();
});
zkus('nová zakázka je rovnou odemčená', nova === false);

zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.slice(0, 2).join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
