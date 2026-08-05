/* ============================================================
 * VERZE A DATUM SESTAVENÍ
 *
 * Značky __VERZE__ a __SESTAVENO__ nahradí build.py při skládání aplikace.
 * V Node testech se nic nenahrazuje a značky zůstanou tak, jak jsou zapsané –
 * proto se ven nedávají přímo, ale přes funkce, které nejdřív ověří tvar.
 * Bez té kontroly by testy i vývojový běh tvrdily, že aplikace je ze dne
 * „__SESTAVENO__", a počítaly z toho stáří.
 * ============================================================ */

const BUILD_VERZE_ZNACKA = '__VERZE__';
const BUILD_DATUM_ZNACKA = '__SESTAVENO__';

function buildVerze() {
  return /^v\d/.test(BUILD_VERZE_ZNACKA) ? BUILD_VERZE_ZNACKA : '';
}
function buildDatum() {
  return /^\d{4}-\d{2}-\d{2}$/.test(BUILD_DATUM_ZNACKA) ? BUILD_DATUM_ZNACKA : '';
}

/* ------------------------------------------------------------------
 * STÁŘÍ SESTAVENÍ (#40)
 *
 * Aplikace se rozesílá jako jeden HTML soubor. Kopie se rozlezou po discích,
 * do příloh e-mailů a na flash disky a nic je nedrží pohromadě – dřív nebo
 * později někdo počítá nabídku na souboru z loňska a nemá jak to poznat.
 *
 * Hranice jsou schválně měkké a jen dvě. 90 dní je zhruba čtvrtletí, tedy
 * doba, po které už stojí za to se zeptat, jestli existuje novější soubor;
 * 180 dní je půl roku, kdy je pravděpodobnost, že mezitím přišla oprava
 * výpočtu nebo ceny, tak vysoká, že je poctivé to říct důrazněji. Ani jedna
 * hranice nic neblokuje – kdo pracuje offline u zákazníka, musí dopočítat.
 * ------------------------------------------------------------------ */

const BUILD_STARI_DNU = { starsi: 90, stare: 180 };

function buildDniOd(iso, dnes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const a = Date.parse(iso + 'T00:00:00Z');
  const b = Date.parse(String(dnes || '') + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* stupen: '' = nic neříkat, 'starsi' = zeptej se, 'stare' = ověř to.
 * Bez data sestavení (Node testy, ručně upravený soubor) mlčíme – tvrdit
 * něco o stáří, které neznáme, by bylo horší než mlčet. */
function buildStari(dnes, datumSestaveni) {
  /* datumSestaveni se předává jen v testech; v aplikaci se bere ze značky. */
  const datum = datumSestaveni != null ? datumSestaveni : buildDatum();
  const d = dnes || new Date().toISOString().slice(0, 10);
  const dni = buildDniOd(datum, d);
  let stupen = '';
  if (dni != null && dni >= BUILD_STARI_DNU.stare) stupen = 'stare';
  else if (dni != null && dni >= BUILD_STARI_DNU.starsi) stupen = 'starsi';
  return { datum, dni, stupen, verze: buildVerze() };
}

function buildDatumCz(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return (d && m && y) ? (+d) + '. ' + (+m) + '. ' + y : String(iso || '');
}

function buildStariText(s) {
  if (!s || !s.stupen) return '';
  const kdy = buildDatumCz(s.datum) + ' (před ' + s.dni + ' dny)';
  const uvod = 'Tento soubor kalkulačky ' + (s.verze ? s.verze + ' ' : '') + 'je sestavený ' + kdy + '.';
  return s.stupen === 'stare'
    ? uvod + ' Za půl roku se výpočet i ceník obvykle několikrát změní – než '
           + 'z něj pošlete nabídku, ověřte si, že nemáte pracovat na novějším souboru.'
    : uvod + ' Není to nutně chyba, ale stojí za ověření, jestli mezitím nevyšel novější.';
}

if (typeof module !== 'undefined')
  module.exports = { buildVerze, buildDatum, buildDniOd, buildStari, buildDatumCz,
                     buildStariText, BUILD_STARI_DNU };
