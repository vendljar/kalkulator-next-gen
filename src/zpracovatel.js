/* ============================================================
 * ZPRACOVATEL NABÍDKY (#146)
 *
 * Zadání z 5. 8. 2026: „V cenové nabídce se musí zobrazovat jméno a kontaktní
 * údaje obchodníka = Obchodního technika, která nabídku tvořil. Jedná se
 * o uživatele.“
 *
 * Do té doby měla aplikace jedinou firemní sadu údajů (Nastavení → Firma →
 * Zpracovatel nabídky) a v šabloně byl navíc jeden kolega vepsaný natvrdo
 * i s zapečeným skenem podpisu. Nabídku ale dělá ten, kdo je přihlášený.
 *
 * Modul je schválně tenký: bere profil z ONLINE_STAV.ja (ten se plní při
 * přihlášení a mění v okně Můj profil) a překládá ho na symboly {{ZPRAC_…}}
 * pro šablonu. Nic si nepamatuje – jediný zdroj pravdy je přihlášení.
 *
 * Firemní záloha z Nastavení → Firma SKONČILA 19. 8. 2026 (zadání J. V.);
 * bez přihlášení zůstává blok „Vypracoval" prázdný — dokumenty stejně
 * vznikají výhradně přihlášené (online databáze je jediná, #150).
 * ============================================================ */

/* Profil přihlášeného uživatele, nebo null. ONLINE_STAV existuje jen
 * v prohlížeči – v Node testech a v generátorech se sem prostě nedostaneme. */
function zpracovatelAktualni() {
  const j = (typeof ONLINE_STAV !== 'undefined' && ONLINE_STAV && ONLINE_STAV.ja) || null;
  if (!j || !j.email) return null;
  const t = x => String(x == null ? '' : x).trim();
  return { email: t(j.email), jmeno: t(j.jmeno), titul: t(j.titul),
           funkce: t(j.funkce), telefon: t(j.telefon), podpis: t(j.podpis) };
}

/* „Ing. Jan Novák“ – titul před jménem, jak si ho uživatel zadal.
 * Účet bez jména (založí se e-mailem) vrací prázdno; volající pak sáhne
 * po firemním údaji, protože e-mailová adresa v patičce nabídky vypadá
 * jako chyba, ne jako podpis. */
function zpracovatelJmeno(z) {
  if (!z) return '';
  return [z.titul, z.jmeno].filter(Boolean).join(' ').trim();
}

/* Symboly do šablony. Od 19. 8. 2026 (zadání J. V.: „měla by se vždy
 * vyplňovat podle uživatele, který zpracovává nabídku") je JEDINÝM zdrojem
 * přihlášený uživatel — firemní záloha z Nastavení → Firma skončila spolu
 * se sekcí „Zpracovatel nabídky" (dávalo smysl, dokud aplikace uživatele
 * neznala; dnes je online databáze jediná a dokumenty vznikají přihlášené).
 * FIRMA_ZPRACOVAL* se vyplňují VŽDY (i prázdné) — starší šablony (v5, v6)
 * je mají v bloku „Vypracoval" a nesmí v nich zůstat viset stará osoba ani
 * syrový symbol {{…}}. Parametr f zůstává kvůli volajícím, už se nečte. */
function zpracovatelPlaceholders(f) {
  const z = zpracovatelAktualni();
  const p = {
    ZPRAC_JMENO: zpracovatelJmeno(z),
    ZPRAC_FUNKCE: (z && z.funkce) || '',
    ZPRAC_TEL: (z && z.telefon) || '',
    ZPRAC_EMAIL: (z && z.email) || '',
  };
  p.FIRMA_ZPRACOVAL = p.ZPRAC_JMENO;
  p.FIRMA_ZPRACOVAL_TEL = p.ZPRAC_TEL;
  p.FIRMA_ZPRACOVAL_EMAIL = p.ZPRAC_EMAIL;
  return p;
}

/* Obrázky do šablony – zatím jediný: sken podpisu s razítkem. Předává se jako
 * data URL, přesně v té podobě, v jaké ho prohlížeč vyrobil při nahrání
 * a v jaké leží na serveru. Kdo podpis nahraný nemá, nabídka se vygeneruje
 * bez něj (a rámeček v šabloně se odstraní – viz docxgen.js). */
function zpracovatelObrazky() {
  const z = zpracovatelAktualni();
  return z && z.podpis ? { ZPRAC_PODPIS: z.podpis } : {};
}

/* ---------- předvyplnění krycího listu ----------
 * Krycí list má pole „Jméno obchodníka“ a „Nabídku vypracoval“. Dřív se braly
 * z Nastavení → Firma, protože aplikace přihlášeného uživatele neznala.
 * Dnes ho zná, takže krycí list ukazuje téhož člověka jako nabídka –
 * ruční přepis samozřejmě zůstává (↺ vrátí automatiku). */
function zpracovatelJmenoProKryci(f) {
  return zpracovatelJmeno(zpracovatelAktualni());
}
function zpracovatelKontaktProKryci(f) {
  const p = zpracovatelPlaceholders(f);
  return [p.ZPRAC_JMENO, p.ZPRAC_TEL, p.ZPRAC_EMAIL].filter(Boolean).join(', ');
}

if (typeof module !== 'undefined')
  module.exports = { zpracovatelAktualni, zpracovatelJmeno, zpracovatelPlaceholders,
    zpracovatelObrazky, zpracovatelJmenoProKryci, zpracovatelKontaktProKryci };
