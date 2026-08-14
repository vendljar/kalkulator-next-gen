/* ============================================================
 * CENTRÁLNÍ ŠABLONY DOKUMENTŮ (#139, 13. 8. 2026)
 *
 * Šablony cenových nabídek (.docx) bydlí na serveru vedle platného ceníku
 * a řídí se stejnými pravidly: ZVEŘEJNIT smí jen administrátor, verze se
 * číslují po typech, historie se drží a každá verze nese otisk obsahu,
 * jméno souboru, kdo ji zveřejnil a kdy. Obchodník po přihlášení dostane
 * platnou šablonu automaticky — nikdo netiskne ze staré verze, protože
 * žádnou „svoji" verzi nemá.
 *
 * Proč vlastní modul a ne přílepek k programu (ceníku): ceník je JSON
 * s čísly a rozdílovým porovnáním; šablona je binární soubor, který se
 * porovnává otiskem. Sdílejí myšlenku, ne kód.
 *
 * REJSTŘÍK vs. SOUBORY. Rejstřík (jeden malý JSON) nese jen metadata —
 * verze, otisky, jména. Soubory leží v úložišti zvlášť pod klíčem
 * `data/<typ>/<verze>` a nikdy se nepřepisují: zveřejnění nové verze starou
 * nechává na místě, takže se dá kdykoli doložit, ze které šablony která
 * nabídka vznikla, a případně se k ní vrátit.
 *
 * REŽIM. `prisny` (výchozí): bez serverové šablony dokument nevznikne —
 * stejné pravidlo jako „bez platného ceníku není nabídka". `mekky`: výběr
 * souboru z disku je povolen jako nouzová cesta při výpadku; přepnout smí
 * jen administrátor a rejstřík si pamatuje kdo a kdy, aby tisk mimo
 * centrální šablonu nešel zapřít.
 * ============================================================ */

/* Základní typy drží krok s registrem dokumentů (dokumenty.js) a s obrazovkou
 * Nastavení → Šablony. Jazykové mutace se ukládají jako `typ_jazyk`. */
const SABLONY_ONLINE_TYPY = ['nabidka', 'nabidkaProj', 'sod', 'sodProj', 'plnaMoc'];
const SABLONY_ONLINE_JAZYKY = ['en', 'de', 'fr'];

/* Strop velikosti souboru v base64. Buffered požadavek Netlify unese 6 MB
 * a binární data cestou bobtnají o ~třetinu; 5 MB base64 (≈ 3,7 MB souboru)
 * nechává rezervu na obal JSONu. Šablona OCK má 82 kB, PROJ po zmenšení
 * fotek 550 kB — strop je tu proti omylu (nahrání souboru plného fotek
 * v plném rozlišení), ne proti běžné práci. */
const SABLONA_MAX_B64 = 5 * 1000 * 1000;

function sablonaTypPlatny(typ) {
  if (typeof typ !== 'string' || !typ) return false;
  if (SABLONY_ONLINE_TYPY.includes(typ)) return true;
  const m = /^([a-zA-Z]+)_([a-z]{2})$/.exec(typ);
  return !!(m && SABLONY_ONLINE_TYPY.includes(m[1]) && SABLONY_ONLINE_JAZYKY.includes(m[2]));
}

/* .docx je ZIP a base64 ZIPu začíná „UEsDB" (PK\x03\x04). Kontrola tady,
 * při zveřejnění — kdyby se pustilo dál třeba PDF, spadlo by generování až
 * obchodníkovi při tisku, v nejhorší možné chvíli. */
function sablonaJeDocxB64(b64) {
  return typeof b64 === 'string' && b64.indexOf('UEsDB') === 0;
}

/* Otisk obsahu (FNV-1a nad base64 textem). Není to podpis, jen rozpoznání
 * změny: stejná data = stejný otisk, a to musí platit v prohlížeči i na
 * serveru bez jediné závislosti. */
function sablonaOtisk(b64) {
  const s = String(b64 || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  /* dvě kola s posunutým začátkem – 32 bitů málo, 64 se skládá ze dvou */
  let h2 = 0x811c9dc5;
  for (let i = s.length - 1; i >= 0; i--) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function sablonyNovyRejstrik() {
  return { verze: 1, rezim: 'prisny', rezimZmenil: '', rezimKdy: '', typy: {} };
}

/* Klíč souboru v úložišti. Verze je vždy číslo z rejstříku, typ prošel
 * sablonaTypPlatny — do klíče se tedy nedostane nic, co by cestu rozbilo. */
function sablonaKlicSouboru(typ, verze) {
  return 'data/' + typ + '/' + (+verze || 0);
}

/* Zveřejnění nové verze. Vrací NOVÝ rejstřík, nebo null, když vstup nedává
 * smysl — volající pak nic nezapíše a starý rejstřík zůstává netknutý. */
function sablonyZverejni(rej, info) {
  if (!rej || !info || !sablonaTypPlatny(info.typ)) return null;
  const nazev = String(info.nazev || '').trim();
  if (!nazev || !info.otisk) return null;
  const out = JSON.parse(JSON.stringify(rej));
  const t = out.typy[info.typ] || { platna: null, historie: [] };
  const verze = (t.platna ? t.platna.verze : 0) + 1;
  if (t.platna) t.historie.unshift(t.platna);
  t.platna = {
    verze,
    nazev,
    otisk: String(info.otisk),
    velikost: +info.velikost || 0,
    zverejnil: String(info.kdo || ''),
    kdy: String(info.kdy || ''),
    poznamka: String(info.poznamka || ''),
  };
  out.typy[info.typ] = t;
  return out;
}

function sablonaPlatna(rej, typ) {
  const t = rej && rej.typy && rej.typy[typ];
  return (t && t.platna) || null;
}

/* Přepnutí režimu. Neznámá hodnota se tiše nezapíše — vrací se rejstřík
 * beze změny, aby překlep nevypnul přísný režim. */
function sablonyRezimNastav(rej, rezim, kdo, kdy) {
  if (!rej || (rezim !== 'prisny' && rezim !== 'mekky')) return rej;
  const out = JSON.parse(JSON.stringify(rej));
  out.rezim = rezim;
  out.rezimZmenil = String(kdo || '');
  out.rezimKdy = String(kdy || '');
  return out;
}

if (typeof module !== 'undefined')
  module.exports = { SABLONY_ONLINE_TYPY, SABLONY_ONLINE_JAZYKY, SABLONA_MAX_B64,
                     sablonaTypPlatny, sablonaJeDocxB64, sablonaOtisk,
                     sablonyNovyRejstrik, sablonaKlicSouboru, sablonyZverejni,
                     sablonaPlatna, sablonyRezimNastav };
