/* ============================================================
 * DOKUMENTY – jednotný registr generovaných dokumentů
 * Staví nad společným engine docxgen.js (šablona .docx → vyplněný .docx).
 * Každý typ dokumentu se ZAREGISTRUJE: název + builder(zak, varianta, jekly)
 * → { placeholders, priplatky?, nazevSouboru }.
 * Nové typy (krycí list BO/Techdata, objednávka, smlouva o dílo) se přidávají
 * pouhou registrací, bez zásahu do engine. Tím je generování všech dokumentů
 * sjednocené: jedna cesta kód → šablona → .docx.
 * ============================================================ */

const DOKUMENTY = {};

function dokumentRegistruj(typ, def) { DOKUMENTY[typ] = def; }
function dokumentDef(typ) { return DOKUMENTY[typ] || null; }
function dokumentTypy() { return Object.keys(DOKUMENTY); }

/* Vyplní šablonu daty daného typu a vrátí { blob, nazevSouboru, data }.
 * templateArrayBuffer = obsah .docx šablony (ArrayBuffer).
 * lang (volitelně) = jazyk dosazovaných hodnot: 'cz' (výchozí) | 'en' | 'de' | 'fr';
 * builder si ho převezme jako 4. parametr (viz nabidka.js). Pro jazykovou mutaci
 * se předává i přeložená šablona – tu vyrobí docxPrelozSablonu (docxgen.js). */
async function dokumentVygeneruj(typ, templateArrayBuffer, zak, varianta, jekly, lang) {
  /* Poslední pojistka před nulovou nabídkou (30. 7. 2026). Tlačítka jsou
   * zhasnutá už v UI, ale sem vede jediná cesta ke každému dokumentu –
   * tudíž je to jediné místo, kde stačí hlídat jednou. Zábrana žije v UI
   * vrstvě (ui/ukazkove_ui.js), protože potřebuje stav běžící aplikace;
   * v Node testech funkce neexistuje a podmínka je tím pádem neškodná. */
  if (typeof dokumentZabrana === 'function') {
    const duvod = dokumentZabrana(typ);
    if (duvod) throw new Error(duvod);
  }
  const def = DOKUMENTY[typ];
  if (!def) throw new Error('Neznámý typ dokumentu: ' + typ);
  // Režim A – dokument generovaný od nuly (bez šablony): def.generate → {blob, nazevSouboru}
  if (typeof def.generate === 'function') {
    const g = await def.generate(zak, varianta, jekly, lang);
    return { blob: g.blob, nazevSouboru: g.nazevSouboru, data: g.data };
  }
  // Režim B – vyplnění existující .docx šablony placeholdery {{...}}
  if (typeof def.builder !== 'function') throw new Error('Dokument „' + typ + '" nemá builder ani generate.');
  const data = def.builder(zak, varianta, jekly, lang);
  /* data.obrazky = { SYMBOL: 'data:image/…' } – obrázky, které se v šabloně
   * vymění za tvar označený alternativním textem {{SYMBOL}} (#146: sken
   * podpisu a razítka zpracovatele). Builder, který žádné nedodá, se chová
   * jako dřív. */
  const blob = await docxVyplnSablonu(templateArrayBuffer, data.placeholders,
    data.priplatky || [], data.obrazky || {});
  return { blob, nazevSouboru: data.nazevSouboru, data };
}
/* seznam typů daného „druhu" (např. všechny krycí listy) dle prefixu */
function dokumentTypyPrefix(prefix) { return Object.keys(DOKUMENTY).filter(t => t.indexOf(prefix) === 0); }

if (typeof module !== 'undefined')
  module.exports = { DOKUMENTY, dokumentRegistruj, dokumentDef, dokumentTypy, dokumentTypyPrefix, dokumentVygeneruj };
