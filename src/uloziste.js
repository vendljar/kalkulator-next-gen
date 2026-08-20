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
 * pod správným jménem a starý soubor se nabídne ke smazání.
 *
 * Od 4. 8. 2026 se sahá i po čísle nabídky PROJ: zakázka vedená jen jako
 * projekce (hlavička OCK zůstala prázdná) by jinak skončila jako
 * „bez-cisla-…" a v rejstříku by ji nikdo nenašel. Hlavičky zůstávají dvě
 * nezávislé sady – tohle je jen pořadí, ve kterém se hledá jméno souboru. */
function uloJmenoSouboru(zak) {
  const p = (zak && zak.projHlavicka) || {};
  let zaklad = uloCisloVyplneno(zak && zak.cislo) ? uloKlicSouboru(zak.cislo)
    : (uloCisloVyplneno(p.cislo) ? uloKlicSouboru(p.cislo) : '');
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

/* ---------- kdy zakázka smí do databáze ------------------------------ */

/* Zadání 4. 8. 2026: „Každá nová zakázka by se měla automaticky ukládat do
 * databáze. Pro potřeby tohoto kroku budeme vždy zakázku ukládat po vyplnění
 * hlavičky. Systém musí uživatele informovat, že je třeba hlavičku vyplnit
 * a zakázku uložit."
 *
 * Do 4. 8. rozhodovaly o samočinném ukládání dvě podmínky roztroušené v UI
 * (ONLINE_STAV.soubor / ULO_STAV.soubor). Obě znamenaly „už jsme jednou
 * uložili ručně", takže nová zakázka se sama neuložila nikdy – a uživatel
 * si toho neměl jak všimnout. Rozhodnutí proto bydlí tady, v modelu:
 * jedno místo, testovatelné bez prohlížeče, společné pro online i složku.
 *
 * Minimum je číslo nabídky a název akce. Objednatel ani adresa v seznamu
 * chybět můžou (rozdělaná poptávka je taky práce), ale bez čísla by soubor
 * neměl jméno a bez názvu akce by se v rejstříku nedal poznat. */
const ULO_HLAVICKA_POLE = [
  { klic: 'cislo', popis: 'Číslo nabídky (CN)' },
  { klic: 'nazevAkce', popis: 'Název akce' },
];

/* kde: 'ock' (výchozí) | 'proj' – hlavičky jsou dvě nezávislé sady. */
function uloHlavickaChybi(zak, kde) {
  const h = (kde === 'proj') ? ((zak && zak.projHlavicka) || {}) : (zak || {});
  return ULO_HLAVICKA_POLE.filter(p => !uloCisloVyplneno(h[p.klic])).map(p => p.popis);
}

/* Do databáze stačí jedna vyplněná hlavička: obchodník začíná jednou
 * z kalkulací a druhou třeba nikdy neotevře. */
function uloHlavickaVyplnena(zak) {
  return uloHlavickaChybi(zak, 'ock').length === 0 || uloHlavickaChybi(zak, 'proj').length === 0;
}

/* Čas posledního uložení jako „HH:MM". Nečitelný nebo chybějící čas vrací
 * prázdno — v liště je lepší čas neuvést než uvést vymyšlený; obchodník se
 * podle něj rozhoduje, jestli může zavřít notebook. */
function uloCasHhMm(kdy) {
  if (kdy == null || kdy === '') return '';
  const d = (kdy instanceof Date) ? kdy : new Date(kdy);
  if (isNaN(d.getTime())) return '';
  const dv = n => (n < 10 ? '0' : '') + n;
  return dv(d.getHours()) + ':' + dv(d.getMinutes());
}

/* Vstup: { zakazka, ulozeno (jméno souboru v databázi, '' = ještě nikdy),
 *          zmeneno (čeká neuložená změna), prihlasen, dostupne,
 *          kdy (čas posledního úspěšného uložení; smí chybět) }
 * Výstup: { stav, text, muzeSam, chybi, cas }
 *
 * `muzeSam` je jediné svolení k samočinnému zápisu. `blokuje` se úmyslně
 * nevrací – KONTROLY_UROVEN = 2 znamená informovat, ne zavírat cestu
 * (jediná zábrana v aplikaci je ukázkový ceník v dokumentech). */
function uloUlozeniStav(vstup) {
  const v = vstup || {};
  const zak = v.zakazka || null;
  const ulozeno = String(v.ulozeno || '');
  const chybi = uloHlavickaChybi(zak, 'ock');
  const chybiProj = uloHlavickaChybi(zak, 'proj');
  const vyplneno = chybi.length === 0 || chybiProj.length === 0;
  const nejmensi = chybi.length <= chybiProj.length ? chybi : chybiProj;
  const cas = uloCasHhMm(v.kdy);

  if (!v.dostupne)
    return { stav: 'nedostupne', muzeSam: false, chybi: nejmensi, cas,
      text: 'Zakázka není v databázi – aplikace neběží proti serveru. '
        + 'Uložte ji do souboru, ať o práci nepřijdete.' };
  if (!v.prihlasen)
    return { stav: 'neprihlasen', muzeSam: false, chybi: nejmensi, cas,
      text: 'Zakázka se do databáze neukládá – nejste přihlášeni. Přihlaste se na záložce Zakázka.' };
  if (ulozeno && !v.zmeneno)
    return { stav: 'ulozeno', muzeSam: true, chybi: nejmensi, cas,
      text: 'Uloženo v databázi jako ' + ulozeno + (cas ? ' v ' + cas : '') + '.' };
  if (ulozeno)
    return { stav: 'ceka', muzeSam: true, chybi: nejmensi, cas,
      text: 'Změny se za chvíli uloží samy do databáze (' + ulozeno + ')'
        + (cas ? '; naposledy uloženo v ' + cas : '') + '.' };
  if (!vyplneno)
    return { stav: 'vyplnit', muzeSam: false, chybi: nejmensi, cas,
      text: 'Zakázka ještě není v databázi. Vyplňte v hlavičce: ' + nejmensi.join(', ')
        + ' – pak zakázku uložte (dál už se ukládá sama).' };
  return { stav: 'ulozit', muzeSam: true, chybi: nejmensi, cas,
    text: 'Zakázka ještě není v databázi – uložte ji. Dál se bude ukládat sama po každé změně.' };
}

/* ---------- záloha rozpracované práce v prohlížeči -------------------- */

/* Prohlížeč si po každé změně odkládá stav zakázky do svého úložiště (třetí
 * pojistka vedle databáze a souboru – viz ui/historie.js). Při startu se pak
 * ukazovala lišta „V prohlížeči je rozpracovaná kalkulace… Chcete ji obnovit?".
 *
 * Problém, který uživatel nahlásil 4. 8. 2026: ta lišta se hlásila POKAŽDÉ.
 * Stačilo, aby v úložišti něco leželo – klidně týden stará zkušební zakázka,
 * kterou si nikdo nepamatuje – a aplikace při každém spuštění chtěla
 * rozhodnout „obnovit / zahodit / teď ne". Pojistka proti ztrátě práce se tím
 * změnila v otravný rituál, který se překlikává bez čtení; a přesně takový
 * rituál pak jednou přepíše skutečnou práci.
 *
 * Ptát se má smysl jen tehdy, když je co obnovovat a člověk se k tomu ještě
 * nevyjádřil. Rozhodnutí je tady v modelu (ne v UI), aby se dalo otestovat
 * bez prohlížeče a aby platilo stejně pro OCK i PROJ.
 *
 * Vstup:  zaznam = { kdy, cislo, nazevAkce, zakazka } z úložiště prohlížeče
 *         ctx    = { ted, otevrena (JSON právě otevřené zakázky), odlozeno
 *                    (razítko zálohy, kterou už uživatel odložil) }
 * Výstup: { nabidnout, smazat, duvod }
 *
 * `smazat` je úklid, ne mazání práce: týká se jen záloh, které se stejně
 * nedají nabídnout (prázdná, bez hlavičky, starší než týden). Zálohu, o které
 * má smysl se ptát, nesmaže nikdy nic než uživatel – nebo úspěšný zápis do
 * databáze, po kterém je táž práce na serveru. */
const ULO_ZALOHA_STARI_DNI = 7;

/* Vrací stáří ve dnech, nebo null, když se čas nedá přečíst. Nečitelný čas
 * není důvod zálohu zahodit – radši se zeptáme, než abychom mazali. */
function uloZalohaStariDni(kdy, ted) {
  const t = Date.parse(kdy || '');
  if (!kdy || Number.isNaN(t)) return null;
  const ted2 = Date.parse(ted || '') || Date.now();
  return (ted2 - t) / 86400000;
}

function uloZalohaRozhodni(zaznam, ctx) {
  const c = ctx || {};
  const z = zaznam || null;
  if (!z || !z.zakazka)
    return { nabidnout: false, smazat: !!z, duvod: 'prázdná záloha' };

  /* Bez čísla nabídky i bez názvu akce se v liště nedá napsat, CO se má
   * obnovit („bez názvu“) – a od zadání ze 4. 8. 2026 se každá zakázka
   * zakládá vyplněnou hlavičkou. Takový záznam je zbytek starého provozu. */
  if (!uloCisloVyplneno(z.cislo) && !uloCisloVyplneno(z.nazevAkce))
    return { nabidnout: false, smazat: true, duvod: 'záloha bez čísla i názvu akce' };

  const stari = uloZalohaStariDni(z.kdy, c.ted);
  if (stari !== null && stari > ULO_ZALOHA_STARI_DNI)
    return { nabidnout: false, smazat: true,
             duvod: 'záloha je starší než ' + ULO_ZALOHA_STARI_DNI + ' dní' };

  /* Totéž, co je právě na obrazovce – obnovovat by nebylo co. */
  if (c.otevrena && c.otevrena === z.zakazka)
    return { nabidnout: false, smazat: false, duvod: 'shodná s otevřenou zakázkou' };

  /* „Teď ne" platí, dokud se záloha nezmění. Jakmile v ní přibude nová práce,
   * změní se razítko a aplikace se zeptá znovu – to už je jiná nabídka. */
  if (c.odlozeno && c.odlozeno === String(z.kdy || ''))
    return { nabidnout: false, smazat: false, duvod: 'uživatel ji už odložil' };

  return { nabidnout: true, smazat: false, duvod: 'rozpracovaná práce k obnovení' };
}

/* Zadání 19. 8. 2026: po obnovení stránky se online přihlášení a načtení
 * ceníku tiše dotknou čerstvě založené PRÁZDNÉ zakázky – autosave by tou
 * prázdnou zakázkou přepsal zálohu s rozpracovanou prací dřív, než uživatel
 * stihne v liště kliknout „Obnovit rozpracovanou kalkulaci". Pravidlo:
 * zakázka bez čísla nabídky i bez názvu akce nesmí přepsat zálohu, která
 * obsah má. Jakmile uživatel cokoli z toho vyplní, píše se normálně –
 * to už je vědomá nová práce, ne cizí start aplikace. */
function uloZalohaSmiPrepsat(stavajici, ctx) {
  const c = ctx || {};
  const novaPrazdna = !uloCisloVyplneno(c.cislo) && !uloCisloVyplneno(c.nazevAkce);
  if (!novaPrazdna) return true;
  const s = stavajici || null;
  const stavajiciMaObsah = !!(s && s.zakazka
    && (uloCisloVyplneno(s.cislo) || uloCisloVyplneno(s.nazevAkce)));
  return !stavajiciMaObsah;
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
    /* Autor (11. 8. 2026) — v rejstříku proto, aby šlo vypsat „zakázky po
     * kolegovi" bez čtení všech souborů zvlášť. Prázdno u starších zakázek
     * je v pořádku: znamená to jen „vzniklo dřív, než se autor zapisoval". */
    autor: String((zak && zak.autor) || ''),
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
      autor: String(z.autor || ''),
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
                     ULO_HLAVICKA_POLE, uloHlavickaChybi, uloHlavickaVyplnena, uloUlozeniStav,
                     uloCasHhMm,
                     ULO_ZALOHA_STARI_DNI, uloZalohaStariDni, uloZalohaRozhodni,
                     uloZalohaSmiPrepsat,
                     uloRazitkoNove, uloRazitko, uloKolize,
                     uloRejstrikZaznam, uloRejstrikNormalizuj, uloRejstrikSloucit,
                     uloRejstrikOdeber, uloRejstrikSerad, uloHledej,
                     uloZamekKlic, uloPocetOdemceni, uloKontrolaZamku, uloProblemPopis };
