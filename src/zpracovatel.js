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
 * Firemní údaje zůstávají jako ZÁLOHA. Kalkulačka umí běžet i bez přihlášení
 * (offline, jednosouborové HTML na ploše) a v takovém případě je lepší poslat
 * nabídku s údaji na centrálu než s prázdnou patičkou.
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

function zpracFirma(f, id) {
  if (typeof firmaHodnota === 'function') return firmaHodnota(f, id) || '';
  return (f && f[id]) || '';
}

/* Symboly do šablony. Vrací vždycky ZPRAC_*; FIRMA_ZPRACOVAL* přepisuje jen
 * tehdy, když je někdo přihlášený – starší šablony (v5, v6) mají v bloku
 * „Vypracoval“ právě je a mají ukázat téhož člověka jako nová šablona.
 * Bez přihlášení se firemní symboly nechávají na pokoji, aby se nabídka
 * vygenerovaná offline nezměnila proti tomu, co uživatel zná. */
function zpracovatelPlaceholders(f) {
  const z = zpracovatelAktualni();
  const jmeno = zpracovatelJmeno(z);
  const p = {
    ZPRAC_JMENO: jmeno || zpracFirma(f, 'zpracoval'),
    ZPRAC_FUNKCE: (z && z.funkce) || '',
    ZPRAC_TEL: (z && z.telefon) || zpracFirma(f, 'zpracovalTelefon'),
    ZPRAC_EMAIL: (z && z.email) || zpracFirma(f, 'zpracovalEmail'),
  };
  if (jmeno) {
    p.FIRMA_ZPRACOVAL = p.ZPRAC_JMENO;
    p.FIRMA_ZPRACOVAL_TEL = p.ZPRAC_TEL;
    p.FIRMA_ZPRACOVAL_EMAIL = p.ZPRAC_EMAIL;
  }
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
  return zpracovatelJmeno(zpracovatelAktualni()) || zpracFirma(f, 'zpracoval');
}
function zpracovatelKontaktProKryci(f) {
  const p = zpracovatelPlaceholders(f);
  return [p.ZPRAC_JMENO, p.ZPRAC_TEL, p.ZPRAC_EMAIL].filter(Boolean).join(', ');
}

if (typeof module !== 'undefined')
  module.exports = { zpracovatelAktualni, zpracovatelJmeno, zpracovatelPlaceholders,
    zpracovatelObrazky, zpracovatelJmenoProKryci, zpracovatelKontaktProKryci };
