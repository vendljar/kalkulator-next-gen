/* ============================================================
 * SLUŽBA VÝPOČTU (#24, krok K2 — 3. 8. 2026)
 *
 * Jedno místo, které ze surových dat (zakázka + program + jekly) spočítá
 * všechno, co obrazovky nebo server potřebují: výsledky OCK a PROJ, ceny
 * nabídek, marži, kontroly a porovnání variant. Nic tu nekreslí, nic
 * nesahá na DOM ani na globální stav obrazovek (ZAK/NAST/SL/ZO) — vstupy
 * přicházejí parametry, výstup je čistý objekt.
 *
 * Proč: obrazovky si dnes výpočty skládají samy z globálů, a server žádné
 * globály obrazovek mít nebude. Tahle služba je přesně ten kus, který
 * jednou zavolá server na rosti.cz nad zakázkou z databáze — a protože
 * je to čistá funkce, testuje se v Node stejně jako jádra (test_sluzba.js).
 * Žádný výpočet se tu NEVYMÝŠLÍ: služba jen volá existující jádra
 * (vypocet, vypocetProj, cenaNabidky*, marzePrehled, kontrolyProved,
 * porovnaniVariant) — stejná čísla jako v aplikaci, na haléř.
 *
 * `program` má tvar záznamu z _program.json: { cenik, cenikProj, slevy,
 * firma? } — slevy a firma jdou do kontextu kontrol a marže (minimum,
 * stropy). Ceníky varianty se NEPŘEPISUJÍ: varianta si nese zmrazenou
 * kopii, přesně jako v aplikaci (#39).
 * ============================================================ */

/* Výpočet jedné varianty. Chyba jednoho jádra nesmí vzít výsledek celku —
 * server musí odpovědět i na zakázku s rozbitou variantou (stejná filozofie
 * jako spocitejVariantu v UI). */
function sluzbaVarianta(zak, v, nast, jekly) {
  const d = (v && v.data) || {};
  let ock = null, proj = null;
  try { ock = vypocet(d.ock.zadani, d.cenik, jekly, d.ock.fixes); } catch (e) { ock = null; }
  try { proj = vypocetProj(d.proj.zadani, d.proj.cenik); } catch (e) { proj = null; }

  const jenProj = !!(zak && zak.jenProj);
  let cenaOck = null, cenaProj = null, marze = null, kontroly = null;
  try { cenaOck = (ock && typeof cenaNabidkyOck === 'function')
    ? cenaNabidkyOck(ock, d.sleva, d.zaokr) : null; } catch (e) {}
  /* Každá část nabídky má vlastní obchodní zaokrouhlení (4. 8. 2026);
   * u starších dat se PROJ spadne na dosavadní společné pole. */
  const zaokrP = (typeof zaokrProjZ === 'function') ? zaokrProjZ(d) : d.zaokr;
  try { cenaProj = (proj && typeof cenaNabidkyProj === 'function')
    ? cenaNabidkyProj(proj, d.slevaProj, zaokrP) : null; } catch (e) {}
  try { marze = (typeof marzePrehled === 'function')
    ? marzePrehled(jenProj ? null : ock, proj, jenProj ? null : d.sleva, nast, d.zaokr, zaokrP, d.slevaProj) : null; } catch (e) {}
  try { kontroly = (typeof kontrolyProved === 'function')
    ? kontrolyProved({ zadani: d.ock ? d.ock.zadani : null, vysledek: ock,
        projZadani: d.proj ? d.proj.zadani : null, projVysledek: proj,
        cenik: d.cenik, cenikProj: d.proj ? d.proj.cenik : null,
        sleva: d.sleva, slevaProj: d.slevaProj, nast, zak, zaokr: d.zaokr, zaokrProj: zaokrP, jenProj }) : null; } catch (e) {}

  return { id: v.id, nazev: v.nazev, ridici: !!v.ridici,
           ock, proj, cenaOck, cenaProj, marze, kontroly };
}

function sluzbaVypocet(zak, program, jekly) {
  const p = program || {};
  const nast = { slevy: p.slevy || null, firma: p.firma || null };
  const varianty = ((zak && zak.varianty) || []).map(v => sluzbaVarianta(zak, v, nast, jekly));

  let porovnani = null;
  try {
    porovnani = (typeof porovnaniVariant === 'function')
      ? porovnaniVariant(zak, varianty.map(x => ({ id: x.id, ock: x.ock, proj: x.proj })))
      : null;
  } catch (e) { porovnani = null; }

  return { varianty, porovnani };
}

if (typeof module !== 'undefined')
  module.exports = { sluzbaVypocet, sluzbaVarianta };
