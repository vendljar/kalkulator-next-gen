/* Test – ZPRACOVATEL NABÍDKY (#146)
 *
 * Zadání: „V cenové nabídce se musí zobrazovat jméno a kontaktní údaje
 * obchodníka = Obchodního technika, která nabídku tvořil. Jedná se
 * o uživatele.“ Do 5. 8. 2026 měla aplikace jen jednu firemní sadu údajů
 * (Nastavení → Firma → Zpracovatel nabídky), takže pod každou nabídkou byl
 * týž člověk bez ohledu na to, kdo ji vypracoval.
 *
 * Tenhle modul je tenká vrstva mezi přihlášeným uživatelem a šablonou.
 * Testujeme hlavně přechody: přihlášený vs. nepřihlášený, chybějící titul,
 * chybějící telefon, a to, že se firemní údaje pořád použijí jako záloha –
 * nabídka se musí dát vygenerovat i offline, kdy aplikace o uživateli neví.
 *
 * Spuštění: node test_zpracovatel.js
 */
const fs = require('fs');
const firma = require('./firma.js');
for (const k of Object.keys(firma)) global[k] = firma[k];
const Z = require('./zpracovatel.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };

/* Vymyšlený účet – skutečná jména kolegů do repozitáře nepatří. */
const JA = { email: 'jan.zkusebni@priklad.cz', jmeno: 'Jan Zkušební', titul: 'Ing.',
             funkce: 'Obchodní technik', telefon: '+420 111 222 333', role: 'Obchodník',
             podpis: 'data:image/png;base64,AAAA' };
const prihlas = j => { global.ONLINE_STAV = j ? { ja: Object.assign({}, JA, j) } : { ja: null }; };
const odhlas = () => { delete global.ONLINE_STAV; };

/* Firemní záloha = výchozí ukázkové údaje z firma.js (vymyšlené). */
const F = firma.FIRMA_DEFAULT || firma.DEFAULT_FIRMA;

/* ---------- 1) nepřihlášený uživatel – platí firemní údaje ---------- */
odhlas();
test('bez přihlášení není zpracovatel', Z.zpracovatelAktualni() === null);
{
  const p = Z.zpracovatelPlaceholders(F);
  /* Od 19. 8. 2026 je jediným zdrojem přihlášený uživatel — firemní záloha
   * (Nastavení → Firma → Zpracovatel nabídky) skončila. Bez přihlášení je
   * blok „Vypracoval" prázdný; dokumenty stejně vznikají jen přihlášené. */
  test('ZPRAC_JMENO bez přihlášení prázdné', p.ZPRAC_JMENO === '', p.ZPRAC_JMENO);
  test('ZPRAC_TEL bez přihlášení prázdný', p.ZPRAC_TEL === '', p.ZPRAC_TEL);
  test('ZPRAC_EMAIL bez přihlášení prázdný', p.ZPRAC_EMAIL === '', p.ZPRAC_EMAIL);
  test('ZPRAC_FUNKCE zůstává prázdná', p.ZPRAC_FUNKCE === '', p.ZPRAC_FUNKCE);
  /* FIRMA_ZPRACOVAL* se vyplňují VŽDY (i prázdné) — ve starší šabloně nesmí
   * zůstat viset syrový symbol {{FIRMA_ZPRACOVAL}} ani stará osoba. */
  test('FIRMA_ZPRACOVAL je vždy vyplněný (prázdnem)', p.FIRMA_ZPRACOVAL === '', p.FIRMA_ZPRACOVAL);
  test('bez podpisu se obrázek neposílá',
    JSON.stringify(Z.zpracovatelObrazky()) === '{}', JSON.stringify(Z.zpracovatelObrazky()));
}

/* ---------- 2) přihlášený uživatel ---------- */
prihlas({});
{
  const z = Z.zpracovatelAktualni();
  test('zpracovatel je přihlášený uživatel', z && z.email === JA.email);
  test('podpis se přenáší', z && z.podpis === JA.podpis);
  const p = Z.zpracovatelPlaceholders(F);
  test('titul je před jménem', p.ZPRAC_JMENO === 'Ing. Jan Zkušební', p.ZPRAC_JMENO);
  test('funkce z profilu', p.ZPRAC_FUNKCE === 'Obchodní technik', p.ZPRAC_FUNKCE);
  test('telefon z profilu', p.ZPRAC_TEL === '+420 111 222 333', p.ZPRAC_TEL);
  test('e-mail je přihlašovací', p.ZPRAC_EMAIL === JA.email, p.ZPRAC_EMAIL);
  /* Starší šablony (v5, v6) mají jen {{FIRMA_ZPRACOVAL}}. Aby i z nich odešla
   * nabídka se správným člověkem, přepisujeme je týmiž hodnotami. */
  test('FIRMA_ZPRACOVAL přepsán uživatelem', p.FIRMA_ZPRACOVAL === 'Ing. Jan Zkušební', p.FIRMA_ZPRACOVAL);
  test('FIRMA_ZPRACOVAL_TEL přepsán', p.FIRMA_ZPRACOVAL_TEL === '+420 111 222 333');
  test('FIRMA_ZPRACOVAL_EMAIL přepsán', p.FIRMA_ZPRACOVAL_EMAIL === JA.email);
  const o = Z.zpracovatelObrazky();
  test('podpis jde do šablony pod klíčem ZPRAC_PODPIS', o.ZPRAC_PODPIS === JA.podpis, JSON.stringify(o));
}

/* ---------- 3) neúplný profil ---------- */
prihlas({ titul: '' });
test('bez titulu jen jméno', Z.zpracovatelPlaceholders(F).ZPRAC_JMENO === 'Jan Zkušební');
prihlas({ titul: '  Ing. arch.  ', jmeno: '  Jan Zkušební ' });
test('mezery navíc se ořežou', Z.zpracovatelPlaceholders(F).ZPRAC_JMENO === 'Ing. arch. Jan Zkušební',
  Z.zpracovatelPlaceholders(F).ZPRAC_JMENO);

prihlas({ telefon: '' });
{
  const p = Z.zpracovatelPlaceholders(F);
  /* Telefon si kolega doplní v Můj profil — firemní záloha skončila 19. 8.
   * 2026, do té doby zůstává místo v dokumentu prázdné (nic se nevymýšlí). */
  test('chybějící telefon zůstává prázdný', p.ZPRAC_TEL === '', p.ZPRAC_TEL);
  test('jméno zůstává uživatelovo', p.ZPRAC_JMENO === 'Ing. Jan Zkušební');
}
prihlas({ funkce: '' });
test('chybějící funkce nic nevymýšlí', Z.zpracovatelPlaceholders(F).ZPRAC_FUNKCE === '');

prihlas({ jmeno: '', titul: '' });
{
  const p = Z.zpracovatelPlaceholders(F);
  /* Účet bez jména je krajní případ (založí se e-mailem). Jméno se nevymýšlí
   * ani nebere z firmy — administrátor ho doplní v profilu uživatele. */
  test('účet bez jména nechává jméno prázdné', p.ZPRAC_JMENO === '', p.ZPRAC_JMENO);
}

prihlas({ podpis: '' });
test('uživatel bez podpisu neposílá obrázek', JSON.stringify(Z.zpracovatelObrazky()) === '{}');

/* ---------- 4) záloha pro krycí list ---------- */
odhlas();
test('krycí list bez přihlášení nechává obchodníka prázdného',
  Z.zpracovatelJmenoProKryci(F) === '', Z.zpracovatelJmenoProKryci(F));
test('kontakt bez přihlášení je prázdný',
  Z.zpracovatelKontaktProKryci(F) === '', Z.zpracovatelKontaktProKryci(F));
prihlas({});
test('krycí list ukáže přihlášeného', Z.zpracovatelJmenoProKryci(F) === 'Ing. Jan Zkušební');
test('kontakt ukáže přihlášeného',
  Z.zpracovatelKontaktProKryci(F) === 'Ing. Jan Zkušební, +420 111 222 333, ' + JA.email,
  Z.zpracovatelKontaktProKryci(F));

/* ---------- 5) modul nesmí spadnout mimo prohlížeč ---------- */
odhlas();
{
  let chyba = null;
  try { Z.zpracovatelPlaceholders(null); Z.zpracovatelObrazky(); Z.zpracovatelJmenoProKryci(null); }
  catch (e) { chyba = e.message; }
  test('bez firmy i bez přihlášení modul nespadne', chyba === null, chyba);
}

/* ---------- 6) symboly jsou opravdu zapsané v šabloně ---------- */
{
  const zdroj = fs.readFileSync(__dirname + '/zpracovatel.js', 'utf8');
  for (const s of ['ZPRAC_JMENO', 'ZPRAC_FUNKCE', 'ZPRAC_TEL', 'ZPRAC_EMAIL', 'ZPRAC_PODPIS'])
    test('symbol ' + s + ' modul zná', zdroj.includes(s));
}

console.log(fail ? `\n${fail} TESTŮ SELHALO` : `\nVŠECHNY TESTY (${ok}) OK`);
process.exit(fail ? 1 : 0);
