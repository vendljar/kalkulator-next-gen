/* ============================================================
 * NAČTENÍ JÁDRA DO SERVEROVÉ FUNKCE (4. 8. 2026)
 *
 * Obal nad `jadro_moduly.cjs`. Dělá dvě věci, kvůli kterým stojí za samostatný
 * soubor:
 *
 * 1) NAČÍTÁ AŽ PŘI PRVNÍM POUŽITÍ. Kdyby se jádro tahalo statickým importem
 *    v hlavičce funkce, každý problém při načtení by shodil celý modul dřív,
 *    než se stihne spustit jediný řádek obsluhy – a Netlify by odpovědělo
 *    holou chybou 502 bez jediného slova o tom, co se stalo. Přesně tohle
 *    uživatel 4. 8. 2026 viděl: „Neuloženo online: server odpověděl 502",
 *    a z aplikace se nedalo poznat vůbec nic.
 *
 * 2) DÁVÁ SROZUMITELNOU ODPOVĚĎ. Když se jádro načíst nepovede, funkce vrátí
 *    české vysvětlení a stav 500. Rozdíl je praktický: 502 znamená „zeptej se
 *    někoho, kdo umí číst logy Netlify", zatímco tahle odpověď rovnou říká,
 *    co je rozbité. Aplikace ji ukáže v liště stejně jako každou jinou hlášku.
 *
 * Jádro se načte jednou za život instance funkce a pak se drží v paměti –
 * další volání ho jen dostanou hotové.
 * ============================================================ */

let JADRO = null;
let CHYBA = null;

export async function jadro() {
  if (JADRO) return JADRO;
  if (CHYBA) throw CHYBA;
  try {
    const m = await import('./jadro_moduly.cjs');
    JADRO = m.default || m;
    return JADRO;
  } catch (e) {
    CHYBA = e;
    throw e;
  }
}

/* Odpověď pro případ, že jádro nejde načíst. Text je psaný pro obchodníka
 * u počítače, ne pro logy: řekne, že je chyba na serveru, že o práci nepřijde
 * (může ji uložit do souboru) a co má vyřídit dál. */
export function jadroChyba(e) {
  return Response.json({
    ok: false,
    chyba: 'Serverová část aplikace se nenačetla, proto se teď do databáze uložit nedá. '
      + 'Práci si zatím odložte tlačítkem „Uložit do souboru (JSON)" a dejte vědět správci – '
      + 'jde o chybu nasazení, ne o vaši zakázku. Podrobnost: ' + (e && e.message ? e.message : e),
  }, { status: 500 });
}
