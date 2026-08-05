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
  test('ZPRAC_JMENO ze zálohy', p.ZPRAC_JMENO === F.zpracoval, p.ZPRAC_JMENO);
  test('ZPRAC_TEL ze zálohy', p.ZPRAC_TEL === F.zpracovalTelefon, p.ZPRAC_TEL);
  test('ZPRAC_EMAIL ze zálohy', p.ZPRAC_EMAIL === F.zpracovalEmail, p.ZPRAC_EMAIL);
  test('ZPRAC_FUNKCE zůstává prázdná', p.ZPRAC_FUNKCE === '', p.ZPRAC_FUNKCE);
  /* Firemní symboly se bez přihlášení NEPŘEPISUJÍ – jinak by starší šablony
   * (v5) najednou ukazovaly něco jiného než dnes. */
  test('FIRMA_ZPRACOVAL se nepřepisuje', p.FIRMA_ZPRACOVAL === undefined, p.FIRMA_ZPRACOVAL);
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
  /* Telefon si kolega doplní v Můj profil. Než to udělá, je lepší poslat
   * firemní číslo na centrálu než nabídku bez jediného kontaktu. */
  test('chybějící telefon nahradí firemní', p.ZPRAC_TEL === F.zpracovalTelefon, p.ZPRAC_TEL);
  test('jméno zůstává uživatelovo', p.ZPRAC_JMENO === 'Ing. Jan Zkušební');
}
prihlas({ funkce: '' });
test('chybějící funkce nic nevymýšlí', Z.zpracovatelPlaceholders(F).ZPRAC_FUNKCE === '');

prihlas({ jmeno: '', titul: '' });
{
  const p = Z.zpracovatelPlaceholders(F);
  /* Účet bez jména je krajní případ (založí se e-mailem). Nabídka pak radši
   * ukáže firemní jméno, než aby v patičce svítila e-mailová adresa. */
  test('účet bez jména padá na firemní údaj', p.ZPRAC_JMENO === F.zpracoval, p.ZPRAC_JMENO);
}

prihlas({ podpis: '' });
test('uživatel bez podpisu neposílá obrázek', JSON.stringify(Z.zpracovatelObrazky()) === '{}');

/* ---------- 4) záloha pro krycí list ---------- */
odhlas();
test('krycí list bez přihlášení bere firmu', Z.zpracovatelJmenoProKryci(F) === F.zpracoval);
test('kontakt bez přihlášení bere firmu',
  Z.zpracovatelKontaktProKryci(F) === [F.zpracoval, F.zpracovalTelefon, F.zpracovalEmail].join(', '),
  Z.zpracovatelKontaktProKryci(F));
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
