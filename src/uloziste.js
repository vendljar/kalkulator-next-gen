/* ============================================================
 * ÚLOŽIŠTĚ ZAKÁZEK VE SLOŽCE – model (mezikrok před online databází)
 *
 * Dnes se zakázka ukládá ručně: stáhne se JSON a uživatel si ho někam
 * odloží. Tenhle modul je první polovina náhrady – čistý model složkové
 * databáze, kde jedna zakázka = jeden soubor a vedle nich leží malý
 * rejstřík (_rejstrik.json) se stručnými údaji o všech zakázkách.
 *
 * Proč rejstřík: měření na skutečném Disku Google ukázalo 270–390 ms na
 * jeden soubor. Tabulka zakázek, která by kvůli výpisu otevřela pět set
 * souborů, by se načítala minuty. Rejstřík má pro pět set zakázek 57 kB
 * a přečte se za milisekundu.
 *
 * Do rejstříku se ZÁMĚRNĚ neukládají žádné částky. Cena je výsledek
 * výpočtu nad aktuálním ceníkem; opsaná do rejstříku by se rozešla s
 * kalkulací v okamžiku, kdy se ceník přepočítá, a nikdo by nepoznal,
 * které z těch dvou čísel platí.
 *
 * Tenhle soubor je čistý model: žádné DOM, žádné souborové API, žádné
 * globální stavy aplikace. Práci se skutečnou složkou (výběr složky,
 * zápis, oprávnění) dělá ui/uloziste_ui.js, protože File System Access
 * API existuje jen v prohlížeči a v Node se testovat nedá.
 * ============================================================ */

const ULO_PRIPONA = '.json';
const ULO_REJSTRIK_SOUBOR = '_rejstrik.json';
const ULO_SCHEMA = 1;

/* ---------- drobné pomůcky ------------------------------------------- */

/* Normalizace pro hledání. Sdílí se se seznamem variant (seznam.js), aby
 * „Novák" a „novak" znamenaly totéž; v Node testech bez seznam.js se
 * použije shodná záložní implementace. */
function uloNorm(s) {
  if (typeof seznamNorm === 'function') return seznamNorm(s);
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

function uloSlova(dotaz) {
  if (typeof seznamSlova === 'function') return seznamSlova(dotaz);
  return uloNorm(dotaz).split(/\s+/).filter(Boolean);
}

/* Číslo zakázky je „vyplněné" jen tehdy, když k předloze někdo doplnil
 * pořadové číslo – jinak by všechny nové zakázky mířily na jeden soubor. */
function uloCisloVyplneno(cislo) {
  if (typeof hlavickaVyplneno === 'function') return hlavickaVyplneno(cislo);
  const s = String(cislo == null ? '' : cislo).trim();
  const predloha = (typeof ZAK_CISLO_PREDLOHA === 'string') ? ZAK_CISLO_PREDLOHA.trim() : '';
  return s !== '' && s !== predloha;
}

/* Jméno souboru musí projít Windows, Diskem Google i URL, takže se drží
 * jen písmen bez diakritiky, číslic, tečky, pomlčky a podtržítka.
 * Tečka zůstává schválně: číslo klonované varianty má tvar …-0500.1. */
function uloKlicSouboru(text) {
  return String(text == null ? '' : text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '').replace(/[-.]+$/, '');
}

/* Zakázka bez čísla se ukládat musí (rozdělaná práce je taky práce), ale
 * nesmí přebít cizí soubor – proto do jména jde datum a id první varianty,
 * které je v rámci aplikace jedinečné. Po doplnění čísla se zakázka uloží
 * pod správným jménem a starý soubor se nabídne ke smazání. */
function uloJmenoSouboru(zak) {
  let zaklad = uloCisloVyplneno(zak && zak.cislo) ? uloKlicSouboru(zak.cislo) : '';
  if (!zaklad) {
    const v = ((zak && zak.varianty) || [])[0];
    const datum = uloKlicSouboru((zak && zak.datum) || '') || 'bez-data';
    zaklad = 'bez-cisla-' + datum + (v && v.id ? '-' + uloKlicSouboru(v.id) : '');
  }
  return zaklad + ULO_PRIPONA;
}

/* Do složky přibývají i soubory, které aplikace nezaložila. Disk Google
 * při souběžné úpravě ze dvou počítačů uloží druhou verzi vedle jako
 * „… (konfliktní kopie …).json" a synchronizace umí nechat dočasné
 * soubory. Nic z toho není zakázka a rejstřík to nesmí spolknout.
 * Filtr je proto přísný: jen znaky, které sama aplikace do jména dává. */
function uloJeZakazkovySoubor(jmeno) {
  const j = String(jmeno == null ? '' : jmeno);
  if (!/\.json$/i.test(j)) return false;
  const zaklad = j.slice(0, -ULO_PRIPONA.length);
  if (!zaklad) return false;
  if (zaklad.charAt(0) === '_' || zaklad.charAt(0) === '.') return false;   // _rejstrik.json a skryté
  return /^[A-Za-z0-9._-]+$/.test(zaklad);
}

/* ---------- razítko posledního zápisu -------------------------------- */

/* Každý zápis do složky si do zakázky poznamená čas. Podle něj se pozná,
 * že soubor mezitím přepsal někdo jiný (nebo jiné okno téhle aplikace). */
function uloRazitkoNove(kdy) {
  return String(kdy || new Date().toISOString());
}

function uloRazitko(zak) {
  const r = zak && zak.uloRazitko;
  return (typeof r === 'string') ? r : '';
}

/* Kolize = na disku leží něco jiného, než z čeho jsme vyšli.
 * Prázdné očekávané razítko znamená „tuhle zakázku jsme odsud nenačetli",
 * což je taky důvod se zeptat – pod stejným jménem může být cizí práce. */
function uloKolize(naDisku, ocekavaneRazitko) {
  if (!naDisku) return { kolize: false, naDisku: '' };
  const disk = uloRazitko(naDisku);
  const ock = (typeof ocekavaneRazitko === 'string') ? ocekavaneRazitko : '';
  return { kolize: !ock || disk !== ock, naDisku: disk };
}

/* ---------- rejstřík -------------------------------------------------- */

function uloRejstrikZaznam(zak, opts) {
  opts = opts || {};
  const varianty = (zak && zak.varianty) || [];
  const zamcena = v => (typeof variantaUzamcena === 'function')
    ? variantaUzamcena(v) : !!(v && v.zamek && v.zamek.zamceno);
  let upraveno = String(opts.razitko || uloRazitko(zak) || '');
  if (!upraveno)
    varianty.forEach(v => {
      if (v && typeof v.upraveno === 'string' && v.upraveno > upraveno) upraveno = v.upraveno;
    });
  return {
    soubor: String(opts.soubor || uloJmenoSouboru(zak)),
    cislo: uloCisloVyplneno(zak && zak.cislo) ? String(zak.cislo).trim() : '',
    nazevAkce: String((zak && zak.nazevAkce) || ''),
    objednatel: String((zak && zak.objednatel) || ''),
    datum: String((zak && zak.datum) || ''),
    variant: varianty.length,
    odeslane: varianty.filter(zamcena).length,
    upraveno,
  };
}

/* Rejstřík je soubor na sdíleném disku – může být poškozený, prázdný,
 * ručně upravený nebo v tvaru z jiné verze. Nikde jinde se proto nesmí
 * předpokládat, že má správný tvar; všechno prochází tudy. */
function uloRejstrikNormalizuj(x) {
  let pole = x;
  if (pole && !Array.isArray(pole) && Array.isArray(pole.zakazky)) pole = pole.zakazky;
  if (!Array.isArray(pole)) return [];
  const cislo = (h) => (typeof h === 'number' && isFinite(h)) ? Math.max(0, Math.floor(h)) : 0;
  return pole
    .filter(z => z && typeof z === 'object' && typeof z.soubor === 'string' && z.soubor)
    .map(z => ({
      soubor: z.soubor,
      cislo: String(z.cislo || ''),
      nazevAkce: String(z.nazevAkce || ''),
      objednatel: String(z.objednatel || ''),
      datum: String(z.datum || ''),
      variant: cislo(z.variant),
      odeslane: cislo(z.odeslane),
      upraveno: String(z.upraveno || ''),
    }));
}

function uloRejstrikSloucit(rejstrik, zaznam) {
  const pole = uloRejstrikNormalizuj(rejstrik);
  const norm = uloRejstrikNormalizuj([zaznam])[0];
  if (!norm) return pole;
  const i = pole.findIndex(z => z.soubor === norm.soubor);
  if (i >= 0) pole[i] = norm; else pole.push(norm);
  return pole;
}

function uloRejstrikOdeber(rejstrik, soubor) {
  return uloRejstrikNormalizuj(rejstrik).filter(z => z.soubor !== String(soubor));
}

/* Nejnovější nahoře – po otevření složky chce člověk nejčastěji to,
 * na čem dělal naposledy. */
function uloRejstrikSerad(rejstrik) {
  return uloRejstrikNormalizuj(rejstrik).sort((a, b) => {
    const ka = a.upraveno || a.datum, kb = b.upraveno || b.datum;
    if (ka !== kb) return ka < kb ? 1 : -1;
    return uloNorm(a.cislo) < uloNorm(b.cislo) ? 1 : -1;
  });
}

function uloHledej(rejstrik, dotaz) {
  const pole = uloRejstrikNormalizuj(rejstrik);
  const slova = uloSlova(dotaz);
  if (!slova.length) return pole;
  return pole.filter(z => {
    const text = uloNorm([z.cislo, z.nazevAkce, z.objednatel, z.datum, z.soubor].join(' '));
    return slova.every(s => text.includes(s));
  });
}

/* ---------- pojistka na uzamčené varianty (#34) ----------------------- */

/* Vytištěná nabídka je odeslaná a nesmí se změnit. Automatické ukládání
 * do složky je ale zápis bez zeptání, takže potřebuje pojistku: než se
 * soubor přepíše, porovná se to, co v něm je, s tím, co se chystá ven.
 * Uzamčená varianta, která by přišla o zámek, zmizela nebo se jí změnil
 * otisk odeslaných částek, zápis zastaví a rozsvítí varování (Ad2 –
 * nikde se nic tvrdě neblokuje, ale tenhle zápis se neprovede sám). */
const ULO_PROBLEMY = {
  chybi:    'uzamčená varianta v ukládané zakázce chybí',
  odemcena: 'varianta byla uzamčená, teď zamčená není',
  zmenena:  'zámek uzamčené varianty se liší (jiné datum, číslo nebo částky)',
};

function uloZamekKlic(v) {
  const z = v && v.zamek;
  if (!z || !z.zamceno) return '';
  return JSON.stringify({ kdy: z.kdy || '', typ: z.typ || '', cislo: z.cislo || '',
                          otisk: z.otisk || null });
}

function uloPocetOdemceni(v) {
  return (v && Array.isArray(v.odemceni)) ? v.odemceni.length : 0;
}

function uloKontrolaZamku(naDisku, kUlozeni) {
  const problemy = [];
  const nove = (kUlozeni && kUlozeni.varianty) || [];
  ((naDisku && naDisku.varianty) || []).forEach(sv => {
    const klicDisk = uloZamekKlic(sv);
    if (!klicDisk) return;                       // nezamčená varianta se přepsat smí
    const cislo = (typeof variantaCislo === 'function')
      ? variantaCislo(naDisku, sv) : String((naDisku && naDisku.cislo) || '');
    const nv = nove.find(v => v && v.id === sv.id);
    if (!nv) { problemy.push({ id: sv.id, cislo, duvod: 'chybi' }); return; }
    const klicNovy = uloZamekKlic(nv);
    if (!klicNovy) {
      // Řádné odemčení správcem se zapisuje do odemceni[] – to není ztráta
      // zámku, ale doložený krok, a přepsat soubor se v tom případě smí.
      if (uloPocetOdemceni(nv) > uloPocetOdemceni(sv)) return;
      problemy.push({ id: sv.id, cislo, duvod: 'odemcena' }); return;
    }
    if (klicNovy !== klicDisk) problemy.push({ id: sv.id, cislo, duvod: 'zmenena' });
  });
  return { ok: problemy.length === 0, problemy };
}

function uloProblemPopis(p) {
  const t = ULO_PROBLEMY[p && p.duvod] || 'neznámý rozdíl';
  return (p && p.cislo) ? t + ' (' + p.cislo + ')' : t;
}

if (typeof module !== 'undefined')
  module.exports = { ULO_PRIPONA, ULO_REJSTRIK_SOUBOR, ULO_SCHEMA, ULO_PROBLEMY,
                     uloNorm, uloSlova, uloCisloVyplneno, uloKlicSouboru,
                     uloJmenoSouboru, uloJeZakazkovySoubor,
                     uloRazitkoNove, uloRazitko, uloKolize,
                     uloRejstrikZaznam, uloRejstrikNormalizuj, uloRejstrikSloucit,
                     uloRejstrikOdeber, uloRejstrikSerad, uloHledej,
                     uloZamekKlic, uloPocetOdemceni, uloKontrolaZamku, uloProblemPopis };
