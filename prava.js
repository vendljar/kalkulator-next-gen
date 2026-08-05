/* ============================================================
 * INTERNÍ POZNÁMKY A PŘÍLOHY K ZAKÁZCE (#37)
 *
 * Proč se dala sleva, co obchodník po telefonu slíbil, na čem se čeká,
 * kdo z investorovy strany rozhoduje. Dnes to žije v e-mailech jednoho
 * člověka a při předání zakázky kolegovi se to ztratí. Tenhle modul dává
 * těmhle větám místo přímo v zakázce, aby cestovaly spolu s ní.
 *
 * Čtyři rozhodnutí, která stojí za vysvětlení:
 *
 * 1) Poznámka patří ZAKÁZCE, ne variantě. Po odeslané (a tedy zamčené)
 *    nabídce se pokračuje klonem varianty – kdyby poznámky visely na
 *    variantě, zmizely by přesně ve chvíli, kdy jsou nejpotřebnější:
 *    když si po měsíci připomínáme, proč jsme šli s cenou dolů.
 *    Vazba na konkrétní variantu se dá zapsat do pole `varianta`, ale je
 *    to jen štítek pro filtrování, ne vlastnictví.
 *
 * 2) Zámek odeslané varianty (#34) se poznámek netýká. Zámek chrání cenu,
 *    která odešla ven. Zápisník je uvnitř firmy a musí zůstat živý –
 *    „zákazník volal, chce to o týden dřív" se dopisuje hlavně potom.
 *    Proto žádná z těchto funkcí nepatří do ZAMEK_CHRANENE.
 *
 * 3) Poznámka se maže měkce: zůstane v datech se záznamem kdo a kdy ji
 *    smazal, jen se přestane zobrazovat. Zápisník, ze kterého jde tiše
 *    vygumovat věta „tohle jsme slíbili", nikomu neposlouží jako opora
 *    při reklamaci. Obnovit se dá jedním klikem.
 *    Přílohy se naopak mažou natvrdo – nosí se v souboru zakázky jako
 *    data URL a ponechaný obsah by ten soubor nafukoval napořád. Zůstane
 *    po nich záznam bez dat (název, velikost, kdo a kdy), takže je pořád
 *    vidět, že tam něco bylo.
 *
 * 4) NIC z toho se netiskne. To je celý smysl funkce: je to místo pro
 *    věty, které zákazník vidět nemá. Žádný generátor dokumentů proto
 *    tento modul nevolá a ani nezná názvy jeho polí; hlídá to test
 *    v test_poznamky.js, který zdrojáky generátorů čte jako text.
 *
 * Stropy velikosti jsou tu kvůli souboru zakázky. Ten se posílá e-mailem
 * a otevírá v prohlížeči; sto megabajtů příloh z něj udělá něco, co se
 * nedá ani odeslat, ani načíst.
 * ============================================================ */

/* Druhy poznámky. Slouží k barevnému odlišení a filtru – nic víc na nich
 * nevisí, takže přidat další je bezpečné. `jine` je záchytný druh: cokoliv
 * neznámého (třeba poznámka ze starší verze) do něj spadne, aby se zápis
 * nikdy neztratil kvůli neznámému kódu. */
const POZN_DRUHY = [
  { kod: 'obchod',   nazev: 'Obchodní jednání' },
  { kod: 'sleva',    nazev: 'Důvod slevy' },
  { kod: 'technika', nazev: 'Technické řešení' },
  { kod: 'termin',   nazev: 'Termíny a čekání' },
  { kod: 'jine',     nazev: 'Jiné' },
];
const POZN_DRUH_VYCHOZI = 'jine';

/* 8 MB na soubor: pohodlně se do toho vejde naskenované zadání investora
 * nebo fotka ze stavby, a přitom to jednu zakázku neznečitelní.
 * 24 MB dohromady je hranice, za kterou přestává být rozumné posílat
 * zakázku e-mailem. */
const POZN_MAX_PRILOHA = 8 * 1024 * 1024;
const POZN_MAX_CELKEM = 24 * 1024 * 1024;

let _poznCitac = 0;
function poznamkyId(predpona) {
  return (predpona || 'p') + Date.now().toString(36) + (_poznCitac++).toString(36);
}

function poznamkyTed() { return new Date().toISOString(); }

/* Zajistí pole na zakázce. Volá se před každým zápisem i po importu –
 * zakázka uložená před #37 tahle pole nemá a první `push` by spadl. */
function poznamkyZajisti(zak) {
  if (!zak) return zak;
  if (!Array.isArray(zak.poznamky)) zak.poznamky = [];
  if (!Array.isArray(zak.prilohy)) zak.prilohy = [];
  if (!Array.isArray(zak.prilohySmazane)) zak.prilohySmazane = [];
  return zak;
}

function poznamkyDruhPlatny(kod) {
  return POZN_DRUHY.some(d => d.kod === kod) ? kod : POZN_DRUH_VYCHOZI;
}

function poznamkyNajdi(zak, id) {
  if (!zak || !Array.isArray(zak.poznamky) || !id) return null;
  return zak.poznamky.find(p => p.id === id) || null;
}

function poznamkyPridej(zak, text, opts) {
  if (!zak) return null;
  const o = opts || {};
  const t = (text == null) ? '' : String(text).trim();
  if (!t) return null;               // prázdný zápis není zápis
  poznamkyZajisti(zak);
  const p = {
    id: poznamkyId('pz'),
    kdy: o.kdy || poznamkyTed(),
    kdo: o.kdo || '',
    druh: poznamkyDruhPlatny(o.druh),
    text: t,
    varianta: o.varianta || null,
  };
  zak.poznamky.push(p);
  return p;
}

/* Úprava mění text, ne historii: `kdy` zůstává časem vzniku a úprava se
 * zapíše zvlášť. Jinak by šlo poznámku přepsat a tvářit se, že tak zněla
 * od začátku. Smazanou poznámku upravovat nejde – nejdřív se obnoví. */
function poznamkyUprav(zak, id, text, opts) {
  const p = poznamkyNajdi(zak, id);
  if (!p || p.smazano) return null;
  const t = (text == null) ? '' : String(text).trim();
  if (!t) return null;
  const o = opts || {};
  p.text = t;
  p.upraveno = { kdy: o.kdy || poznamkyTed(), kdo: o.kdo || '' };
  return p;
}

function poznamkySmaz(zak, id, opts) {
  const p = poznamkyNajdi(zak, id);
  if (!p || p.smazano) return null;
  const o = opts || {};
  p.smazano = { kdy: o.kdy || poznamkyTed(), kdo: o.kdo || '' };
  return p;
}

function poznamkyObnov(zak, id) {
  const p = poznamkyNajdi(zak, id);
  if (!p || !p.smazano) return null;
  delete p.smazano;
  return p;
}

/* Seznam od nejnovější: zápisník se čte odshora, poslední zpráva je ta,
 * která platí. Filtry jsou volitelné; `smazane:true` přidá i tombstony. */
function poznamkySeznam(zak, opts) {
  if (!zak || !Array.isArray(zak.poznamky)) return [];
  const o = opts || {};
  let l = zak.poznamky.filter(p => o.smazane ? true : !p.smazano);
  if (o.druh) l = l.filter(p => p.druh === o.druh);
  if (o.varianta) l = l.filter(p => p.varianta === o.varianta);
  return l.slice().sort((a, b) => (a.kdy < b.kdy ? 1 : a.kdy > b.kdy ? -1 : 0));
}

function poznamkyShrnuti(zak) {
  const prazdne = { pocet: 0, smazanych: 0, prilohy: 0, bajtu: 0, posledni: null };
  if (!zak || !Array.isArray(zak.poznamky)) return prazdne;
  const zive = poznamkySeznam(zak);
  return {
    pocet: zive.length,
    smazanych: zak.poznamky.filter(p => !!p.smazano).length,
    prilohy: prilohySeznam(zak).length,
    bajtu: prilohyVelikost(zak),
    posledni: zive.length ? zive[0] : null,
  };
}

function poznamkyDruhNazev(kod) {
  const d = POZN_DRUHY.find(x => x.kod === kod);
  return d ? d.nazev : kod || '';
}

function poznamkyDatum(kdy) {
  if (!kdy) return '';
  const d = new Date(kdy);
  if (isNaN(d.getTime())) return String(kdy);
  return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
}

/* Textová podoba zápisníku – pro protokol o kalkulaci (#41) a pro schránku,
 * když se zakázka předává kolegovi. Smazané se nevypisují. */
function poznamkyText(zak) {
  const l = poznamkySeznam(zak);
  if (!l.length) return '';
  return l.map(p => {
    const kdo = p.kdo ? ', ' + p.kdo : '';
    const upr = p.upraveno ? ' (upraveno ' + poznamkyDatum(p.upraveno.kdy) + ')' : '';
    return poznamkyDatum(p.kdy) + kdo + ' – ' + poznamkyDruhNazev(p.druh) + upr + ':\n' + p.text;
  }).join('\n\n');
}

function poznamkyVelikostText(bajtu) {
  const b = Number(bajtu) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' kB';
  return (Math.round(b / (1024 * 1024) * 10) / 10) + ' MB';
}

/* ---------- přílohy ---------- */

function prilohySeznam(zak) {
  if (!zak || !Array.isArray(zak.prilohy)) return [];
  return zak.prilohy.slice().sort((a, b) => (a.kdy < b.kdy ? 1 : a.kdy > b.kdy ? -1 : 0));
}

function prilohyVelikost(zak) {
  if (!zak || !Array.isArray(zak.prilohy)) return 0;
  return zak.prilohy.reduce((s, p) => s + (Number(p.velikost) || 0), 0);
}

/* Vrací {ok, priloha} nebo {ok:false, duvod}. Důvod je věta pro člověka,
 * ne kód – jde rovnou do červené hlášky pod tlačítkem. */
function prilohyPridej(zak, soubor, opts) {
  if (!zak) return { ok: false, duvod: 'Není otevřená zakázka.' };
  const s = soubor || {};
  const nazev = (s.nazev == null) ? '' : String(s.nazev).trim();
  if (!nazev) return { ok: false, duvod: 'Soubor nemá název.' };
  if (!s.data) return { ok: false, duvod: 'Soubor je prázdný nebo se nepodařilo načíst jeho obsah.' };
  const velikost = Number(s.velikost) || String(s.data).length;
  if (velikost > POZN_MAX_PRILOHA)
    return { ok: false, duvod: 'Soubor je příliš velký (' + poznamkyVelikostText(velikost)
      + '). Nejvýš ' + poznamkyVelikostText(POZN_MAX_PRILOHA) + ' na jeden soubor.' };
  poznamkyZajisti(zak);
  if (prilohyVelikost(zak) + velikost > POZN_MAX_CELKEM)
    return { ok: false, duvod: 'Přílohy zakázky by dohromady přesáhly '
      + poznamkyVelikostText(POZN_MAX_CELKEM) + '. Něco nejdřív odeberte.' };
  const o = opts || {};
  const p = {
    id: poznamkyId('pr'),
    nazev: nazev,
    typ: s.typ || '',
    velikost: velikost,
    data: s.data,
    kdy: o.kdy || poznamkyTed(),
    kdo: o.kdo || '',
    popis: (s.popis || o.popis || ''),
  };
  zak.prilohy.push(p);
  return { ok: true, priloha: p };
}

/* Tvrdé smazání, ale se stopou bez dat: v zakázce má zůstat vidět, že tu
 * příloha byla a kdo ji odebral, jen se nenese její obsah. */
function prilohySmaz(zak, id, opts) {
  if (!zak || !Array.isArray(zak.prilohy) || !id) return null;
  const i = zak.prilohy.findIndex(p => p.id === id);
  if (i < 0) return null;
  poznamkyZajisti(zak);
  const p = zak.prilohy.splice(i, 1)[0];
  const o = opts || {};
  zak.prilohySmazane.push({
    id: p.id, nazev: p.nazev, typ: p.typ, velikost: p.velikost,
    kdy: p.kdy, kdo: p.kdo,
    smazano: { kdy: o.kdy || poznamkyTed(), kdo: o.kdo || '' },
  });
  return p;
}

if (typeof module !== 'undefined')
  module.exports = { POZN_DRUHY, POZN_DRUH_VYCHOZI, POZN_MAX_PRILOHA, POZN_MAX_CELKEM,
                     poznamkyZajisti, poznamkyPridej, poznamkyUprav, poznamkySmaz, poznamkyObnov,
                     poznamkySeznam, poznamkyNajdi, poznamkyShrnuti, poznamkyText,
                     poznamkyDruhNazev, poznamkyDatum, poznamkyVelikostText,
                     prilohyPridej, prilohySmaz, prilohySeznam, prilohyVelikost };
