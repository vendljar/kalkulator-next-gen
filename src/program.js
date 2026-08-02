/* ============================================================
 * DATABÁZE PROGRAMU – ceníky, ceny a náklady ve složce (_program.json)
 *
 * PROČ VZNIKLA
 * Do včerejška platil ceník, který nesl SESTAVENÝ SOUBOR aplikace:
 * DEFAULT_CENIK a DEFAULT_CENIK_PROJ byly napsané ve zdrojovém kódu a
 * změna jedné ceny znamenala zásah do zdrojáku a nové sestavení. Katalog
 * trvalých položek a slevové stropy na tom byly ještě hůř – žily jen v
 * paměti relace a přežily leda ruční export konfigurace.
 *
 * Tenhle modul přesouvá platný ceník tam, kde už leží zakázky: do složky.
 * Jeden soubor `_program.json` vedle nich nese
 *   – ceník OCK a ceník PROJ (jednotkové ceny a náklady),
 *   – katalog trvalých položek (ty jsou taky ceník, jen se přidávají ručně),
 *   – slevové stropy podle rolí a minimální marži.
 * Podtržítko na začátku jména je záměr: uloJeZakazkovySoubor() takové
 * soubory nepovažuje za zakázky, takže se program nikdy neobjeví v
 * seznamu nabídek ani v rejstříku.
 *
 * VERZE, NE PŘEPIS
 * Ceník se nepřepisuje – přibývá. Každé zveřejnění odloží dosavadní
 * platnou verzi do historie a doplní jí datum, do kdy platila. Důvod je
 * praktický: nabídka z března musí jít i v prosinci vysvětlit cenami,
 * které tehdy platily, a k tomu je potřeba mít je pořád po ruce. Historie
 * je krátká a levná (pár kB na verzi), takže se ukládá celá; strop
 * PROG_HISTORIE_MAX je jen pojistka proti nekonečnému růstu souboru.
 *
 * CO TENHLE MODUL NEDĚLÁ
 * Nesahá na varianty. Ceník zamrzlý ve variantě zůstává, jak byl – to je
 * pravidlo z #35 a platí dál. Nová verze programové databáze jen změní,
 * co je „dnešní ceník", proti kterému se varianta porovnává, a z čeho se
 * skládá nová varianta. Přepočet zůstává vědomým krokem člověka.
 *
 * Čistý model bez DOM a bez souborového API – práci se složkou dělá
 * ui/program_ui.js, protože File System Access API existuje jen v
 * prohlížeči. Díky tomu jde všechno níž otestovat v Node.
 * ============================================================ */

const PROG_SOUBOR = '_program.json';
const PROG_SCHEMA = 1;
const PROG_APLIKACE = 'Kalkulátor OCK';
const PROG_HISTORIE_MAX = 60;

/* Oddíly databáze. Slouží k popisu i k výběrovému načtení – kdo si chce
 * vzít ze složky jen ceník a nechat si vlastní katalog, může. */
const PROG_ODDILY = [
  { kod: 'cenik', nazev: 'Ceník OCK – jednotkové ceny a náklady' },
  { kod: 'cenikProj', nazev: 'Ceník PROJ – sazby a fixní částky projekce' },
  { kod: 'katalog', nazev: 'Katalog trvalých položek ceníku' },
  { kod: 'slevy', nazev: 'Slevové stropy podle rolí a minimální marže' },
];

function progKopie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function progDnes(iso) { return String(iso || new Date().toISOString().slice(0, 10)); }
function progCas(iso) { return String(iso || new Date().toISOString()); }

/* ---------- otisk ----------------------------------------------------- */

/* Krátký otisk ceníků. Když je po ruce cenik_stari.js, počítá se přes
 * cenikOtisk() nad stejným seznamem sledovaných položek, jaký hlídá stáří
 * ceníku ve variantě – dvě různá čísla pro tutéž otázku by jen mátla.
 * Bez něj (samostatný test modulu) se použije stejná FNV-1a nad JSON. */
function progOtiskText(text) {
  let h = 0x811c9dc5;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* Záznam ceníku ve tvaru, jaký očekává cenik_stari.js: { cenik, proj:{cenik} }.
 * Díky tomu jde programová verze porovnat s ceníkem varianty beze změny
 * čehokoli v #35. */
function programData(zaznam) {
  return { cenik: (zaznam && zaznam.cenik) || {},
           proj: { cenik: (zaznam && zaznam.cenikProj) || {} } };
}

function programOtisk(zaznam) {
  if (typeof cenikOtisk === 'function' && typeof cenikSledovane === 'function')
    return cenikOtisk(programData(zaznam));
  return progOtiskText(JSON.stringify([(zaznam || {}).cenik, (zaznam || {}).cenikProj]));
}

/* ---------- záznam jedné verze --------------------------------------- */

/* ctx = { cenik, cenikProj, katalog, slevy, build, kdo, poznamka, kdy, platnoOd } */
function programZaznam(ctx, verze) {
  ctx = ctx || {};
  const z = {
    verze: Math.max(1, Math.floor(+verze || 1)),
    platnoOd: progDnes(ctx.platnoOd),
    zapsano: progCas(ctx.kdy),
    kdo: String(ctx.kdo || ''),
    poznamka: String(ctx.poznamka || ''),
    build: String(ctx.build || ''),
    cenik: progKopie(ctx.cenik) || {},
    cenikProj: progKopie(ctx.cenikProj) || {},
    katalog: progKopie(ctx.katalog) || null,
    slevy: progKopie(ctx.slevy) || null,
  };
  z.otisk = programOtisk(z);
  return z;
}

function programNovy(ctx) {
  return {
    _popis: 'Databáze programu Kalkulátor OCK – platné ceníky, ceny a náklady. '
      + 'Zapisuje aplikace; ruční úpravy tohoto souboru dělejte jen s rozmyslem, '
      + 'historie verzí je jediný doklad o tom, za jaké ceny která nabídka odešla.',
    aplikace: PROG_APLIKACE,
    schema: PROG_SCHEMA,
    razitko: progCas((ctx || {}).kdy),
    platny: programZaznam(ctx, 1),
    historie: [],
  };
}

/* ---------- načtení a obrana proti poškozenému souboru ---------------- */

/* Soubor leží na sdíleném disku: může být poškozený, ručně upravený,
 * z novější verze aplikace nebo úplně cizí. Všechno, co se s databází
 * dělá, prochází tudy, aby se nikde jinde nemuselo předpokládat, že má
 * správný tvar. Nesrozumitelný soubor je výjimka, ne tichá prázdnota –
 * tiše nahradit platný ceník prázdnem je to nejhorší, co se může stát. */
function programNormalizuj(data) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch (e) { throw new Error('Soubor databáze programu není platný JSON: ' + e.message); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Soubor databáze programu není platný objekt.');
  if (data.aplikace && data.aplikace !== PROG_APLIKACE)
    throw new Error('Soubor patří jiné aplikaci: ' + data.aplikace);
  if (+data.schema > PROG_SCHEMA)
    throw new Error('Soubor je z novější verze aplikace (schéma ' + data.schema
      + ', tato zná ' + PROG_SCHEMA + '). Aktualizujte kalkulátor, ať se ceník nepoškodí.');
  if (!data.platny || typeof data.platny !== 'object')
    throw new Error('Soubor neobsahuje platnou verzi ceníku.');
  if (!data.platny.cenik || typeof data.platny.cenik !== 'object')
    throw new Error('Platná verze v souboru nemá ceník OCK.');

  const zaznam = (z, i) => {
    const v = programZaznam({
      cenik: z.cenik, cenikProj: z.cenikProj, katalog: z.katalog, slevy: z.slevy,
      build: z.build, kdo: z.kdo, poznamka: z.poznamka, kdy: z.zapsano, platnoOd: z.platnoOd,
    }, z.verze || i);
    // Otisk v souboru se přebírá, jen když sedí: přepsat ho potichu by
    // znamenalo zamlčet, že se se souborem někdo ručně přehraboval.
    if (z.otisk && z.otisk !== v.otisk) v.otiskNesedi = String(z.otisk);
    if (z.platnoDo) v.platnoDo = String(z.platnoDo);
    return v;
  };

  const out = {
    _popis: String(data._popis || ''),
    aplikace: PROG_APLIKACE,
    schema: PROG_SCHEMA,
    razitko: String(data.razitko || ''),
    platny: zaznam(data.platny, 1),
    historie: [],
  };
  delete out.platny.platnoDo;                 // platná verze konec platnosti nemá
  const h = Array.isArray(data.historie) ? data.historie : [];
  out.historie = h.filter(z => z && typeof z === 'object' && z.cenik)
    .map((z, i) => zaznam(z, i + 1))
    .sort((a, b) => b.verze - a.verze);
  return out;
}

/* ---------- nová verze ------------------------------------------------ */

/* Rozdíly proti platné verzi. Vrací se položku po položce, protože právě
 * ty se ukazují správci před zveřejněním – „ceník se změnil" bez výčtu
 * nikomu nepomůže rozhodnout, jestli je změna zamýšlená. */
function programRozdily(db, ctx) {
  const stary = (db && db.platny) || null;
  const novy = programZaznam(ctx || {}, 1);
  if (typeof cenikRozdily === 'function')
    return cenikRozdily(programData(stary), programData(novy));
  return [];
}

function progStejne(a, b) { return JSON.stringify(a === undefined ? null : a)
                                === JSON.stringify(b === undefined ? null : b); }

/* Beze změny se nová verze nezakládá. Jinak by každé kliknutí vyrobilo
 * verzi lišící se jen časem a historie by přestala něco znamenat. */
function programBezeZmeny(db, ctx) {
  const p = (db && db.platny) || null;
  if (!p) return false;
  const n = programZaznam(ctx || {}, 1);
  return p.otisk === n.otisk
    && progStejne(p.katalog, n.katalog)
    && progStejne(p.slevy, n.slevy);
}

/* Zveřejnění: dosavadní platná verze se odloží do historie s datem, do
 * kdy platila, a novou verzi dostane další pořadové číslo. Vrací NOVÝ
 * objekt, aby se při neúspěšném zápisu na disk nedalo skončit s databází
 * v paměti, která na disku není. */
function programNovaVerze(db, ctx) {
  ctx = ctx || {};
  const zaklad = db ? programNormalizuj(db) : null;
  if (!zaklad) return programNovy(ctx);
  const stary = zaklad.platny;
  const nova = programZaznam(ctx, (+stary.verze || 0) + 1);
  stary.platnoDo = nova.platnoOd;
  const historie = [stary].concat(zaklad.historie).slice(0, PROG_HISTORIE_MAX);
  return {
    _popis: zaklad._popis || programNovy(ctx)._popis,
    aplikace: PROG_APLIKACE,
    schema: PROG_SCHEMA,
    razitko: progCas(ctx.kdy),
    platny: nova,
    historie,
  };
}

/* ---------- dotazy nad historií --------------------------------------- */

function programVerze(db, cislo) {
  if (!db) return null;
  const c = +cislo;
  if (db.platny && +db.platny.verze === c) return db.platny;
  return (db.historie || []).find(z => +z.verze === c) || null;
}

/* Která verze platila k danému dni. Odpovídá na otázku „za jaké ceny to
 * tehdy odešlo", když varianta razítko ceníku nemá (starší zakázky). */
function programProDatum(db, iso) {
  if (!db) return null;
  const d = String(iso || '');
  if (!d) return db.platny || null;
  const vse = [db.platny].concat(db.historie || []).filter(Boolean)
    .filter(z => !z.platnoOd || z.platnoOd <= d)
    .sort((a, b) => (a.platnoOd < b.platnoOd ? 1 : a.platnoOd > b.platnoOd ? -1 : b.verze - a.verze));
  return vse[0] || null;
}

/* ---------- popisy pro UI --------------------------------------------- */

function programPocetKatalogu(zaznam) {
  const k = zaznam && zaznam.katalog;
  if (!k || !k.polozky) return 0;
  return Object.keys(k.polozky).reduce((a, s) =>
    a + (Array.isArray(k.polozky[s]) ? k.polozky[s].length : 0), 0);
}

function programPopisVerze(zaznam) {
  if (!zaznam) return '';
  const d = (typeof cenikDatumCz === 'function') ? cenikDatumCz(zaznam.platnoOd) : zaznam.platnoOd;
  let t = 'verze ' + zaznam.verze + ' od ' + d;
  if (zaznam.platnoDo) t += ' do ' + ((typeof cenikDatumCz === 'function')
    ? cenikDatumCz(zaznam.platnoDo) : zaznam.platnoDo);
  if (zaznam.kdo) t += ' · ' + zaznam.kdo;
  return t;
}

function programSouhrn(db) {
  if (!db || !db.platny) return 'databáze programu není načtená';
  const p = db.platny;
  return programPopisVerze(p) + ' · katalog ' + programPocetKatalogu(p) + ' položek'
    + ' · otisk ' + p.otisk + ' · ' + ((db.historie || []).length) + ' starších verzí';
}

if (typeof module !== 'undefined')
  module.exports = { PROG_SOUBOR, PROG_SCHEMA, PROG_APLIKACE, PROG_HISTORIE_MAX, PROG_ODDILY,
    progOtiskText, programData, programOtisk, programZaznam, programNovy, programNormalizuj,
    programRozdily, programBezeZmeny, programNovaVerze, programVerze, programProDatum,
    programPocetKatalogu, programPopisVerze, programSouhrn };
