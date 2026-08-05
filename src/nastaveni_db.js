/* ============================================================
 * NASTAVENÍ APLIKACE VE SLOŽCE  (_nastaveni.json)
 *
 * PROČ VZNIKLO
 * Nastavení aplikace – firemní údaje na dokumentech, uživatelé a role,
 * viditelnost záložek, jazyk dokumentů, číselníky technické specifikace
 * a slovník překladů – žilo dosud jen v paměti relace. Přežilo leda
 * ruční export konfigurace, na který si musel někdo vzpomenout. Zavřít
 * prohlížeč znamenalo začít znovu od výchozích hodnot ze sestavení.
 *
 * Tenhle modul dává nastavení stejný domov, jaký už mají zakázky a
 * ceník: složku. Vedle `_program.json` přibývá `_nastaveni.json`,
 * který se načte při připojení složky a přepíše se, kdykoli obsluha
 * něco v Nastavení změní. Podtržítko na začátku jména je záměr –
 * uloJeZakazkovySoubor() takové soubory nepovažuje za zakázky.
 *
 * DĚLBA PRÁCE S _program.json
 * Slevové stropy a katalog trvalých položek sem NEPATŘÍ, přestože je
 * obsluha nastavuje na stejných obrazovkách. Obojí jsou peníze: strop
 * slevy rozhoduje, za kolik smí nabídka odejít, katalog je součást
 * ceníku. A peníze musí být doložitelné zpětně, takže bydlí ve
 * verzovaném `_program.json`, kde každá změna dostane datum, autora a
 * zdůvodnění. Tady se naopak nic neverzuje – nastavení se ukládá při
 * změně a starý stav nikoho nezajímá. Kdyby obojí leželo v obou
 * souborech, jeden by druhý tiše přepisoval a nikdo by nepoznal který.
 *
 * FORMÁT
 * Záměrně tentýž jako `konfigurace.json` (SET-2), jen bez oddílů, které
 * patří jinam. Soubor ze složky jde tedy poslat kolegovi jako
 * konfiguraci a naopak – a hlavně nevznikl druhý formát pro tatáž data.
 * Marshalling proto dělá konfigurace.js; tenhle modul jen vybírá oddíly,
 * hlídá, co se nesmí propašovat dovnitř, a počítá otisk.
 *
 * Čistý model bez DOM a bez souborového API – práci se složkou dělá
 * ui/nastaveni_db_ui.js, protože File System Access API existuje jen
 * v prohlížeči. Díky tomu jde všechno níž otestovat v Node.
 * ============================================================ */

const NASTDB_SOUBOR = '_nastaveni.json';
const NASTDB_SCHEMA = 1;
const NASTDB_APLIKACE = 'Kalkulátor OCK';

/* Oddíly, které soubor nese. Zbytek konfigurace (katalog, šablony) je
 * odsud vyloučený – viz hlavička. */
const NASTDB_SEKCE = ['nastaveni', 'specifikace', 'slovnik'];

/* Oddíly, které do souboru nesmí, ani když je tam někdo ručně dopíše
 * (třeba zkopírováním celého konfigurace.json do složky). */
const NASTDB_CIZI = ['katalog', 'slevy', 'sablony'];

/* Klíče NAST, které se neukládají:
 *   slevy    – patří do _program.json (verzovaná cenová politika),
 *   jeAdmin  – role relace; uložená by po restartu mohla zamknout
 *              obsluhu mimo Nastavení, odkud se zpátky zapíná,
 *   panel    – která vnitřní záložka Nastavení byla otevřená,
 *   zobrazeni – matice „co která role vidí" (#136) bydlí na serveru
 *              (/api/zobrazeni). Kdyby ležela i tady, měl by ji odkud
 *              vzít jen administrátor se složkou _DB — tedy právě ten,
 *              koho se netýká; obchodníkovi by nikdy nedorazila. Navíc by
 *              se dvě kopie pravidla rozešly podle toho, kdo kdy připojil
 *              složku. Jeden zdroj pravdy je tu důležitější než záloha. */
const NASTDB_NEUKLADAT = ['slevy', 'jeAdmin', 'panel', 'zobrazeni'];

/* Výchozí seznam pro případ, že by konfigurace.js nebyl po ruce
 * (samostatný test modulu). V aplikaci se bere z KONFIG_NAST_KLICE, ať
 * se oba seznamy nerozejdou. */
const NASTDB_KLICE_ZALOHA = ['tabViditelnost', 'zobrazitNaklady', 'kpiViditelne', 'jazyk',
  'firma', 'role', 'uzivatele'];

function nastdbKlice() {
  const zdroj = (typeof KONFIG_NAST_KLICE !== 'undefined' && Array.isArray(KONFIG_NAST_KLICE))
    ? KONFIG_NAST_KLICE : NASTDB_KLICE_ZALOHA;
  return zdroj.filter(k => NASTDB_NEUKLADAT.indexOf(k) < 0);
}

function nastdbKopie(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function nastdbCas(iso) { return String(iso || new Date().toISOString()); }

const NASTDB_POPIS = 'Nastavení Kalkulátoru OCK – firemní údaje, uživatelé a role, '
  + 'viditelnost záložek, jazyk dokumentů, číselníky specifikace a slovník překladů. '
  + 'Zapisuje aplikace při každé změně v Nastavení. Ceny, slevové stropy ani katalog '
  + 'tu nejsou – ty jsou ve verzovaném _program.json.';

/* ---------- co se ukládá --------------------------------------------- */

/* Vyhodí ze souboru vše, co do něj nepatří. Volá se na obou koncích –
 * při zápisu i po načtení – protože soubor leží na sdíleném disku a
 * mohl mezitím projít cizí rukou. */
function nastdbOcisti(d) {
  if (!d || typeof d !== 'object') return d;
  NASTDB_CIZI.forEach(k => { delete d[k]; });
  if (d.nastaveni && typeof d.nastaveni === 'object')
    NASTDB_NEUKLADAT.forEach(k => { delete d.nastaveni[k]; });
  return d;
}

/* ctx = { NAST, TS_C, TECHSPEC_DEF, build, datum, kdy, kdo } */
function nastdbData(ctx) {
  ctx = ctx || {};
  const volby = { nastaveni: true, specifikace: true, slovnik: true };
  const out = (typeof konfiguraceExport === 'function')
    ? konfiguraceExport(ctx, volby)
    : { aplikace: NASTDB_APLIKACE, build: String(ctx.build || ''), vytvoreno: String(ctx.datum || '') };
  return nastdbOcisti(out);
}

function nastdbNovy(ctx) {
  ctx = ctx || {};
  const d = nastdbData(ctx);
  d._popis = NASTDB_POPIS;
  d.aplikace = NASTDB_APLIKACE;
  d.schema = NASTDB_SCHEMA;
  d.razitko = nastdbCas(ctx.kdy);
  d.zapsano = d.razitko;
  d.kdo = String(ctx.kdo || '');
  return d;
}

/* ---------- otisk ----------------------------------------------------- */

/* Stabilní JSON: klíče objektů seřazené. Po načtení ze složky se objekty
 * skládají znovu a jejich pořadí klíčů se může lišit; bez seřazení by
 * aplikace považovala tatáž nastavení za změněná a při každém spuštění
 * zbytečně zapisovala na Disk, kde jeden zápis stojí kolem třetiny
 * vteřiny. */
function nastdbSerializuj(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(nastdbSerializuj).join(',') + ']';
  const klice = Object.keys(v).sort();
  return '{' + klice.map(k => JSON.stringify(k) + ':' + nastdbSerializuj(v[k])).join(',') + '}';
}

function nastdbHash(text) {
  if (typeof progOtiskText === 'function') return progOtiskText(text);
  let h = 0x811c9dc5;
  const s = String(text == null ? '' : text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* Otisk počítá JEN z obsahu oddílů. Razítko, autor ani sestavení do něj
 * nepatří – jinak by se soubor přepisoval sám sebou pokaždé, co se
 * aplikace spustí z jiného buildu. */
function nastdbOtisk(db) {
  const jadro = {};
  NASTDB_SEKCE.forEach(s => { if (db && db[s] !== undefined) jadro[s] = db[s]; });
  return nastdbHash(nastdbSerializuj(jadro));
}

function nastdbStejne(a, b) {
  if (!a || !b) return false;
  return nastdbOtisk(a) === nastdbOtisk(b);
}

/* ---------- načtení a obrana proti poškozenému souboru ---------------- */

function nastdbNormalizuj(data) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); }
    catch (e) { throw new Error('Soubor nastavení není platný JSON: ' + e.message); }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Soubor nastavení není platný objekt.');
  if (data.aplikace && data.aplikace !== NASTDB_APLIKACE)
    throw new Error('Soubor patří jiné aplikaci: ' + data.aplikace);
  if (+data.schema > NASTDB_SCHEMA)
    throw new Error('Soubor nastavení je z novější verze aplikace (schéma ' + data.schema
      + ', tato zná ' + NASTDB_SCHEMA + ').');
  if (typeof KONFIG_VERZE !== 'undefined' && +data.verze > KONFIG_VERZE)
    throw new Error('Soubor nastavení je z novější verze aplikace (formát ' + data.verze
      + ', tato zná ' + KONFIG_VERZE + ').');
  if (!NASTDB_SEKCE.some(s => data[s]))
    throw new Error('Soubor neobsahuje žádný známý oddíl nastavení.');

  const out = nastdbKopie(data);
  out.aplikace = NASTDB_APLIKACE;
  out.schema = NASTDB_SCHEMA;
  out.razitko = String(data.razitko || '');
  out.kdo = String(data.kdo || '');
  return nastdbOcisti(out);
}

/* ---------- použití v běžící aplikaci --------------------------------- */

/* Mění NAST, TS_C a slovník NA MÍSTĚ – reference z otevřených formulářů
 * tak zůstanou platné a nic se „neodpojí". Slevy a katalog se nedotknou,
 * protože v souboru nejsou (a nastdbOcisti hlídá, že tam nebudou ani
 * omylem). */
function nastdbPouzij(db, ctx) {
  if (!db) return { zmeneno: [], varovani: [] };
  if (typeof konfiguraceImport !== 'function')
    throw new Error('Modul konfigurace není k dispozici.');
  return konfiguraceImport(nastdbOcisti(nastdbKopie(db)), ctx || {},
    { nastaveni: true, specifikace: true, slovnik: true });
}

/* ---------- popis pro obsluhu ----------------------------------------- */

function nastdbPocetSlovem(n, jedna, dva, pet) {
  return n + ' ' + (n === 1 ? jedna : (n >= 2 && n <= 4 ? dva : pet));
}

function nastdbSouhrn(db) {
  if (!db || !NASTDB_SEKCE.some(s => db[s])) return 'nastavení ze složky není načtené';
  const n = db.nastaveni || {};
  const casti = [];
  const firma = (n.firma && String(n.firma.nazev || '').trim()) || '';
  if (firma) casti.push(firma);
  if (Array.isArray(n.uzivatele)) casti.push(nastdbPocetSlovem(n.uzivatele.length, 'uživatel', 'uživatelé', 'uživatelů'));
  if (Array.isArray(n.role)) casti.push(nastdbPocetSlovem(n.role.length, 'role', 'role', 'rolí'));
  if (db.specifikace && db.specifikace.ciselniky)
    casti.push(nastdbPocetSlovem(Object.keys(db.specifikace.ciselniky).length, 'číselník', 'číselníky', 'číselníků'));
  if (db.slovnik && db.slovnik.hesla)
    casti.push(nastdbPocetSlovem(Object.keys(db.slovnik.hesla).length, 'heslo', 'hesla', 'hesel') + ' slovníku');
  return casti.join(' · ') || 'prázdné nastavení';
}

if (typeof module !== 'undefined')
  module.exports = { NASTDB_SOUBOR, NASTDB_SCHEMA, NASTDB_APLIKACE, NASTDB_SEKCE,
    NASTDB_CIZI, NASTDB_NEUKLADAT, NASTDB_POPIS,
    nastdbKlice, nastdbKopie, nastdbOcisti, nastdbData, nastdbNovy,
    nastdbSerializuj, nastdbOtisk, nastdbStejne, nastdbNormalizuj, nastdbPouzij,
    nastdbSouhrn };
