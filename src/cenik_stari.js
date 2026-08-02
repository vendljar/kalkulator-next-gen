/* ============================================================
 * STÁŘÍ CENÍKU A NABÍDKA PŘEPOČTU (#35)
 *
 * Ceník je součástí varianty, ne aplikace: v okamžiku, kdy varianta vznikne,
 * se do ní zkopíruje tehdejší ceník a od té chvíle v ní zamrzne. To je správně
 * – nabídka, která odešla loni, musí i za rok ukázat cenu, za kterou odešla.
 * Nepříjemné to začne být ve chvíli, kdy se stará zakázka otevře znovu a
 * pokračuje se v ní: uživatel vidí čísla, počítá s nimi a nemá jak poznat, že
 * plechy mezitím podražily o pětinu.
 *
 * Modul proto umí dvě různé věci, které se pletou dohromady:
 *
 *   1) STÁŘÍ CENÍKU SAMOTNÉHO – z poznámek „aktualizováno D.M.RRRR" u položek
 *      v CENIK_DEF. Odpovídá na otázku „kdy jsme ty ceny naposledy ověřovali",
 *      a to i u úplně nové zakázky. Položka bez data se nepočítá za starou ani
 *      za čerstvou, jen se spočítá, kolik jich je – tvrdit u nich cokoli by
 *      znamenalo vymýšlet si.
 *
 *   2) ROZDÍL PROTI DNEŠNÍMU CENÍKU – porovnání ceníku zamrzlého ve variantě
 *      s ceníkem, který nese dnešní sestavení aplikace. Tohle je ten praktický
 *      signál u načtené zakázky.
 *
 * PŘEPOČET (zadání 31. 7. 2026, mění původní pravidlo #35)
 * Rozpracovaná nabídka se po zveřejnění nové verze ceníku přepočítá sama.
 * Ještě nikam neodešla, takže staré ceny v ní nejsou doklad, ale past: kdo ji
 * za týden otevře a odešle, počítal by z ceníku, který už neplatí.
 *
 * Zamčená varianta (#34) se nepřepočítává nikdy a nehlídá se vůbec: ta už
 * odešla zákazníkovi a musí zůstat uložená ve stavu vytištění – její ceny
 * jsou historie, ne chyba.
 *
 * Ceník bývá u konkrétní zakázky upravený záměrně (dohodnutá cena skla, sleva
 * od dodavatele) a tiché přepsání by z dohodnuté ceny udělalo ceníkovou. Kdo
 * ceny drží schválně, proto potvrdí „ceny jsou dohodnuté" – takovou variantu
 * automatika vynechá a jen na rozdíly upozorní. Kvitance si pamatuje otisk
 * ceníku, ke kterému se vztahuje, takže po další změně se ozve znovu.
 * ============================================================ */

/* Položky, které v CENIK_DEF nejsou, ale s cenou hýbou nejvíc. */
const CENIK_STARI_EXTRA = [
  { cesta: 'C.marze',  popis: 'Globální přirážka OCK', jed: 'podíl' },
  { cesta: 'C.dph',    popis: 'Sazba DPH',             jed: 'podíl' },
  { cesta: 'PC.marze', popis: 'Globální přirážka PROJ', jed: 'podíl' },
  /* PC.dph doplněno po auditu 1. 8. 2026 (N8): bez něj změna sazby DPH
   * projekce nezměnila otisk, programBezeZmeny hlásil „beze změny" a ceník
   * lišící se jen touhle sazbou nešel zveřejnit. POZOR na dopad: přidáním
   * položky se změnil výpočet otisku, takže první porovnání s dřív uloženou
   * platnou verzí ohlásí rozdíl i beze změny cen – jedno nové zveřejnění
   * otisk srovná. */
  { cesta: 'PC.dph',   popis: 'Sazba DPH projekce',    jed: 'podíl' },
];

/* Jednotný seznam sledovaných položek: OCK, PROJ a tři globální hodnoty. */
function cenikSledovane() {
  const out = [];
  const pridej = (def, sekce) => (def || []).forEach(([grp, items]) =>
    items.forEach(([cesta, popis, jed, pozn]) =>
      out.push({ cesta, popis, jed: jed || '', pozn: pozn || '', skupina: grp, sekce })));
  if (typeof CENIK_DEF !== 'undefined') pridej(CENIK_DEF, 'OCK');
  if (typeof CENIK_DEF_PROJ !== 'undefined') pridej(CENIK_DEF_PROJ, 'PROJ');
  CENIK_STARI_EXTRA.forEach(e => out.push({
    cesta: e.cesta, popis: e.popis, jed: e.jed, pozn: '',
    skupina: 'GLOBÁLNÍ', sekce: e.cesta.indexOf('PC.') === 0 ? 'PROJ' : 'OCK' }));
  return out;
}

/* „aktualizováno 26.1.2026" → '2026-01-26'. Cokoli jiného → '' (nevíme). */
function cenikAktualizovano(pozn) {
  const m = /aktualizov[aá]no\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i.exec(String(pozn || ''));
  if (!m) return '';
  const d = ('0' + m[1]).slice(-2), me = ('0' + m[2]).slice(-2);
  return m[3] + '-' + me + '-' + d;
}

function cenikDniOd(iso, dnes) {
  if (!iso) return null;
  const a = Date.parse(iso + 'T00:00:00Z'), b = Date.parse(String(dnes) + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* Stáří ceníku podle poznámek „aktualizováno". Vrací nejstarší datovanou
 * položku, kolik položek datum má a kolik ne. */
function cenikStariCeniku(dnes) {
  const polozky = cenikSledovane();
  let nejstarsi = null, sDatem = 0, bezData = 0;
  polozky.forEach(p => {
    const datum = cenikAktualizovano(p.pozn);
    if (!datum) { bezData++; return; }
    sDatem++;
    if (!nejstarsi || datum < nejstarsi.datum)
      nejstarsi = { cesta: p.cesta, popis: p.popis, datum, dni: cenikDniOd(datum, dnes) };
  });
  if (nejstarsi) nejstarsi.dni = cenikDniOd(nejstarsi.datum, dnes);
  return { nejstarsi, sDatem, bezData, celkem: polozky.length };
}

/* Hodnota položky v datech varianty. data = { cenik, proj:{cenik} }. */
function cenikHodnota(data, cesta) {
  if (!data) return undefined;
  if (cesta.indexOf('PC.') === 0)
    return cenikGet((data.proj && data.proj.cenik) || {}, cesta);
  return cenikGet(data.cenik || {}, cesta);
}

/* Zapsání hodnoty na stejné adrese (používá přepočet po položkách). */
function cenikNastavHodnotu(data, cesta, val) {
  if (!data) return;
  if (cesta.indexOf('PC.') === 0) {
    if (!data.proj) data.proj = {};
    if (!data.proj.cenik) data.proj.cenik = {};
    cenikSet(data.proj.cenik, cesta, val);
  } else {
    if (!data.cenik) data.cenik = {};
    cenikSet(data.cenik, cesta, val);
  }
}

/* Rozdíly mezi dvěma ceníky, seřazené podle velikosti změny.
 * `zmena` je podíl (0.2 = o pětinu dráž), u textů a u nuly na začátku null –
 * procento z nuly nedává smysl a číslo „+∞ %" v tabulce jen mate. */
function cenikRozdily(stara, nova) {
  const out = [];
  cenikSledovane().forEach(p => {
    const a = cenikHodnota(stara, p.cesta), b = cenikHodnota(nova, p.cesta);
    if (a === undefined && b === undefined) return;
    const cislo = typeof a === 'number' && typeof b === 'number';
    if (cislo ? a === b : String(a == null ? '' : a) === String(b == null ? '' : b)) return;
    out.push({
      cesta: p.cesta, popis: p.popis, jed: p.jed, skupina: p.skupina, sekce: p.sekce,
      stara: a, nova: b,
      cislo,
      zmena: (cislo && a !== 0) ? (b - a) / a : null,
    });
  });
  out.sort((x, y) => Math.abs(y.zmena || 0) - Math.abs(x.zmena || 0));
  return out;
}

/* Krátký otisk ceníku. Nejde o bezpečnost, jen o odpověď na otázku „je to
 * pořád ten ceník, ke kterému se uživatel vyjádřil". FNV-1a stačí a nepotřebuje
 * nic, co by v prohlížeči nebylo. */
function cenikOtisk(data) {
  let h = 0x811c9dc5;
  cenikSledovane().forEach(p => {
    const s = p.cesta + '=' + String(cenikHodnota(data, p.cesta)) + ';';
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
  });
  return ('0000000' + h.toString(16)).slice(-8);
}

function cenikSouhrn(rozdily) {
  const r = rozdily || [];
  let zdrazeni = 0, zlevneni = 0, textove = 0;
  r.forEach(x => {
    if (!x.cislo) { textove++; return; }
    if (x.nova > x.stara) zdrazeni++; else if (x.nova < x.stara) zlevneni++;
  });
  return { pocet: r.length, zdrazeni, zlevneni, textove, nejvetsi: r.length ? r[0] : null };
}

/* ---- kvitance: „ceny jsou dohodnuté, nehlídej mi je" ---- */
function cenikKvitovat(v, otisk, kdo, kdy) {
  if (!v) return null;
  v.cenikKvitance = { otisk, kdo: kdo || '', kdy: kdy || new Date().toISOString() };
  return v.cenikKvitance;
}
function cenikZrusKvitanci(v) { if (v) delete v.cenikKvitance; }
function cenikJeKvitovano(v, otisk) {
  const k = v && v.cenikKvitance;
  return !!(k && k.otisk === otisk);
}

/* ---- verze ceníku, ze které varianta počítala (#39) ----
 *
 * Databáze programu (#41) čísluje zveřejněné ceníky a ke každému drží datum
 * „platné od". Razítko varianty k tomu doplňuje druhou polovinu: ze KTERÉ
 * verze ta konkrétní kalkulace počítala. Bez toho se u půlroční nabídky dá
 * dohledat, co tehdy v ceníku bylo, ale ne to, jestli z toho nabídka opravdu
 * počítala – a přesně na tuhle otázku se ptá zákazník i fakturace.
 *
 * Verze je pořadové číslo zveřejnění, začíná jedničkou. Nula, prázdno a
 * nesmysl znamenají „nevíme"; to se má říct, ne zaokrouhlit na verzi 0. */
function cenikVerzeCislo(x) {
  if (x === null || x === undefined || x === '') return null;
  const n = Math.floor(+x);
  return (isFinite(n) && n > 0) ? n : null;
}

/* Jedno místo, kde razítko vzniká – jinak by se dvě kopie tvaru rozešly a
 * jedna cesta by verzi zapisovala a druhá tiše zahazovala. */
function cenikRazitkoNovy(data, opts) {
  opts = opts || {};
  return {
    datum: opts.dnes || new Date().toISOString().slice(0, 10),
    build: opts.build || '',
    verze: cenikVerzeCislo(opts.verze),
    platnoOd: opts.platnoOd || '',
    otisk: cenikOtisk(data),
  };
}

/* „verze 2 ceníku (platná od 1. 3. 2026)". Prázdno = verzi neznáme. */
function cenikVerzeText(r) {
  const c = cenikVerzeCislo(r && r.verze);
  if (!c) return '';
  return 'verze ' + c + ' ceníku'
    + ((r && r.platnoOd) ? ' (platná od ' + cenikDatumCz(r.platnoOd) + ')' : '');
}

/* Věta o rozdílu verzí. Shodná verze se nekomentuje – opakovat „počítá
 * z verze 3, platí verze 3" by z upozornění udělalo šum, kterého si nikdo
 * nevšimne, až o něco půjde. */
function cenikVerzeVeta(p) {
  if (!p || !p.verze || !p.verzeDnes || p.verze === p.verzeDnes) return '';
  return 'Kalkulace počítá z verze ' + p.verze + ' ceníku, teď platí verze ' + p.verzeDnes + '.';
}

/* Odpověď na otázku „co to znamená pro rozpracované zakázky". Není to
 * fráze do UI navíc: je to jediné pravidlo, které o změně ceníku platí, a
 * dokud ho aplikace neřekne nahlas, každý si ho domýšlí po svém. */
function cenikDopadText() {
  return 'Rozpracované nabídky se změnou ceníku přepočítají samy – počítá se z cen, '
    + 'které platí dnes. Uzamčená (vytištěná, tedy odeslaná) nabídka se nepřepočítává '
    + 'nikdy a zůstává uložená ve stavu, ve kterém odešla. Variantu s dohodnutými '
    + 'cenami automatika vynechá, dokud potvrzení nezrušíte.';
}

/* Přehled pro jednu variantu.
 *   v      – varianta zakázky
 *   dnesni – data s dnešním ceníkem, tj. { cenik, proj:{cenik} }
 *   opts   – { dnes: 'YYYY-MM-DD', datum: 'YYYY-MM-DD' (datum zakázky),
 *              verze, platnoOd – verze ceníku, která platí teď (#39) }  */
function cenikPrehled(v, dnesni, opts) {
  opts = opts || {};
  const dnes = opts.dnes || new Date().toISOString().slice(0, 10);
  const data = (v && v.data) || null;
  const rozdily = data ? cenikRozdily(data, dnesni) : [];
  const otisk = data ? cenikOtisk(data) : '';
  const zamceno = !!(typeof variantaUzamcena === 'function' ? variantaUzamcena(v) : (v && v.zamek));
  const kvitovano = cenikJeKvitovano(v, otisk);
  /* Datum, ke kterému se ceny vztahují: razítko varianty, jinak datum
   * zakázky. Razítko je přesnější, datum zakázky je aspoň poctivý odhad. */
  const razitko = (data && data.cenikRazitko) || null;
  const datum = (razitko && razitko.datum) || opts.datum || '';
  /* Verze varianty proti verzi, která platí teď (#39). Razítko je zdroj
   * pravdy; když chybí (starší zakázky), verze se nedomýšlí – s jedinou
   * výjimkou: ceník varianty se do puntíku shoduje s dnešním, a pak z té
   * verze počítá, i když jí to nikdo nenapsal. To není domýšlení, to plyne
   * z obsahu; že jde o odvození, říká `verzeOdvozena`. */
  const verzeDnes = cenikVerzeCislo(opts.verze);
  let verze = cenikVerzeCislo(razitko && razitko.verze);
  let verzeOdvozena = false;
  if (!verze && verzeDnes && data && rozdily.length === 0) { verze = verzeDnes; verzeOdvozena = true; }
  return {
    rozdily, souhrn: cenikSouhrn(rozdily), otisk, zamceno, kvitovano,
    datum, dni: cenikDniOd(datum, dnes),
    stariCeniku: cenikStariCeniku(dnes),
    verze, verzeOdvozena, verzeDnes,
    verzeText: cenikVerzeText(razitko),
    verzeDnesText: cenikVerzeText({ verze: verzeDnes, platnoOd: opts.platnoOd || '' }),
    verzeZaostava: !!(verze && verzeDnes && verze < verzeDnes),
    varovat: rozdily.length > 0 && !kvitovano && !zamceno,
  };
}

function cenikProcento(z) {
  if (z == null) return '';
  const p = Math.round(z * 1000) / 10;
  return (p > 0 ? '+' : '') + String(p).replace('.', ',') + ' %';
}

/* Jedna věta do lišty. Prázdný řetězec = není o čem mluvit. */
function cenikVarovaniText(p) {
  if (!p || !p.varovat) return '';
  const s = p.souhrn;
  const kolik = s.pocet === 1 ? '1 položka' : (s.pocet < 5 ? s.pocet + ' položky' : s.pocet + ' položek');
  let t = 'Ceník v této kalkulaci se liší od dnešního ceníku aplikace – ' + kolik;
  if (s.nejvetsi && s.nejvetsi.zmena != null)
    t += ', nejvíc „' + s.nejvetsi.popis + '" ' + cenikProcento(s.nejvetsi.zmena);
  t += '.';
  if (p.datum) t += ' Ceny jsou z ' + cenikDatumCz(p.datum)
    + (p.dni != null && p.dni > 0 ? ' (před ' + p.dni + ' dny)' : '') + '.';
  /* Čísla verzí až na konec: „o pětinu dráž" je to, co člověk potřebuje
   * hned, verze je to, čím se to pak doloží. */
  const vv = cenikVerzeVeta(p);
  if (vv) t += ' ' + vv;
  return t;
}

function cenikDatumCz(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return (d && m && y) ? (+d) + '. ' + (+m) + '. ' + y : String(iso || '');
}

/* Srovná značku „tohle nejsou ostrá data" u obou ceníků varianty podle ceníku,
 * ze kterého se do ní počítá. Bez tohohle kroku varianta počítá ze skutečných
 * cen a přitom pořád tvrdí, že žádné nemá – lišta svítí a dokument je
 * zablokovaný (hlášeno 31. 7. 2026). Vrací počet ceníků, u kterých se značka
 * opravdu změnila, aby volající poznal, že má překreslit. */
function cenikSrovnejZnacky(data, dnesni) {
  if (!data || typeof ukazkoveSrovnejZnacku !== 'function') return 0;
  let zmen = 0;
  const srovnej = (cil, zdroj) => {
    if (!cil) return;
    const pred = '' + !!cil.ukazkove + !!cil.prazdny;
    ukazkoveSrovnejZnacku(cil, zdroj);
    if (pred !== '' + !!cil.ukazkove + !!cil.prazdny) zmen++;
  };
  srovnej(data.cenik, dnesni && dnesni.cenik);
  srovnej(data.proj && data.proj.cenik, dnesni && dnesni.proj && dnesni.proj.cenik);
  return zmen;
}

/* Přepočet: do varianty se zapíšou dnešní ceny. Zadání se nedotýká – to je
 * to, co uživatel spočítal, a měnit ho by nikdo nečekal. Volitelně jen vybrané
 * položky (opts.cesty), aby šlo dohodnutou cenu skla nechat být.
 * Zamčenou variantu odmítne – zápis do odeslané nabídky patří jen zámku. */
function cenikPrepocti(v, dnesni, opts) {
  opts = opts || {};
  if (!v || !v.data) return { zmen: 0, duvod: 'varianta nemá data' };
  if (typeof variantaUzamcena === 'function' && variantaUzamcena(v))
    return { zmen: 0, duvod: 'varianta je uzamčená' };
  const vyber = opts.cesty ? new Set(opts.cesty) : null;
  const rozdily = cenikRozdily(v.data, dnesni).filter(r => !vyber || vyber.has(r.cesta));
  rozdily.forEach(r => cenikNastavHodnotu(v.data, r.cesta, r.nova));
  /* Přepočet po vybraných položkách (dohodnutá cena skla zůstává) nechává
   * ceník jako směs: část z nové verze, část z původní dohody. Takový ceník
   * NENÍ žádná zveřejněná verze a razítko to nesmí tvrdit – jinak by se
   * u nabídky doložilo číslo verze, ze které se ve skutečnosti nepočítalo.
   * Verze se proto zapíše, jen když po přepočtu nezůstal žádný rozdíl. */
  const zbyva = cenikRozdily(v.data, dnesni).length;
  v.data.cenikRazitko = cenikRazitkoNovy(v.data,
    zbyva ? Object.assign({}, opts, { verze: null, platnoOd: '' }) : opts);
  /* Značka se srovnává jen tehdy, když po přepočtu nezůstal rozdíl – tedy když
   * ceny varianty JSOU ten ceník, ze kterého se počítalo. U přepočtu vybraných
   * položek zůstane ceník směsí a tvrdit o ní cokoli by bylo zavádějící;
   * platí to stejně jako u čísla verze o pár řádků výš. */
  const znacky = zbyva ? 0 : cenikSrovnejZnacky(v.data, dnesni);
  cenikZrusKvitanci(v);
  v.upraveno = opts.kdy || new Date().toISOString();
  return { zmen: rozdily.length, rozdily, znacky, razitko: v.data.cenikRazitko };
}

/* Přepočet celé zakázky po zveřejnění nové verze ceníku (zadání 31. 7. 2026).
 *
 * Rozpracovaná nabídka ještě nikam neodešla – staré ceny v ní nejsou doklad,
 * ale past: kdo ji za týden otevře a odešle, počítal by z ceníku, který už
 * neplatí. Proto se rozpracované varianty srovnají s platným ceníkem samy.
 *
 * Tři výjimky, a každá má svůj důvod:
 *   – ZAMČENÁ (vytištěná = odeslaná) varianta se nedotkne vůbec, ani razítkem.
 *     Je to doklad o tom, co zákazník dostal na papíře.
 *   – KVITOVANÁ („ceny jsou dohodnuté") varianta se nepřepisuje. To je vědomé
 *     prohlášení uživatele, ne opomenutí; přepočítá se, až kvitanci zruší.
 *   – Varianta BEZ ROZDÍLU dostane jen razítko s číslem verze, a to pouze
 *     když se verze liší. Jinak by každé otevření zakázky vypadalo jako
 *     změna a autosave by ukládal pořád dokola.
 */
function cenikPrepoctiRozpracovane(zak, dnesni, opts) {
  opts = opts || {};
  const vysledek = { prepocteno: 0, zmen: 0, zamcene: 0, dohodnute: 0,
                     orazitkovano: 0, znacky: 0, varianty: [] };
  if (!zak || !Array.isArray(zak.varianty)) return vysledek;

  zak.varianty.forEach(v => {
    if (!v || !v.data) return;

    if (typeof variantaUzamcena === 'function' && variantaUzamcena(v)) {
      vysledek.zamcene++;
      vysledek.varianty.push({ id: v.id, stav: 'zamcena', zmen: 0 });
      return;
    }
    if (cenikJeKvitovano(v, cenikOtisk(v.data))) {
      vysledek.dohodnute++;
      vysledek.varianty.push({ id: v.id, stav: 'dohodnuta', zmen: 0 });
      return;
    }

    const rozdily = cenikRozdily(v.data, dnesni);
    if (!rozdily.length) {
      /* Ceny už sedí, ale značka sedět nemusí: přesně tak vypadá varianta
       * spočítaná bez připojené složky, do které se pak ostrý ceník dostal
       * jinudy. Bez tohohle řádku by ta varianta zůstala označená napořád –
       * rozdíl žádný, takže by se sem už nikdy nedostala oprava. */
      const zn = cenikSrovnejZnacky(v.data, dnesni);
      vysledek.znacky += zn;
      const r = v.data.cenikRazitko;
      const verzeTed = cenikVerzeCislo(r && r.verze);
      const verzeNova = cenikVerzeCislo(opts.verze);
      if (verzeTed !== verzeNova || !r) {
        cenikOznacJakoDnesni(v.data, opts);
        vysledek.orazitkovano++;
        vysledek.varianty.push({ id: v.id, stav: 'orazitkovana', zmen: 0, znacky: zn });
      } else if (zn) {
        vysledek.varianty.push({ id: v.id, stav: 'odznacena', zmen: 0, znacky: zn });
      }
      return;
    }

    const r = cenikPrepocti(v, dnesni, opts);
    vysledek.prepocteno++;
    vysledek.zmen += r.zmen;
    vysledek.znacky += (r.znacky || 0);
    vysledek.varianty.push({ id: v.id, stav: 'prepoctena', zmen: r.zmen,
                             znacky: r.znacky || 0, rozdily: r.rozdily });
  });

  return vysledek;
}

/* Razítko pro nově vzniklou variantu: ceny jsou dnešní, ať to jde poznat. */
function cenikOznacJakoDnesni(data, opts) {
  if (!data) return null;
  data.cenikRazitko = cenikRazitkoNovy(data, opts);
  return data.cenikRazitko;
}

if (typeof module !== 'undefined')
  module.exports = { CENIK_STARI_EXTRA, cenikSledovane, cenikAktualizovano, cenikDniOd,
                     cenikStariCeniku, cenikHodnota, cenikNastavHodnotu, cenikRozdily,
                     cenikSrovnejZnacky,
                     cenikOtisk, cenikSouhrn, cenikKvitovat, cenikZrusKvitanci,
                     cenikJeKvitovano, cenikPrehled, cenikProcento, cenikVarovaniText,
                     cenikDatumCz, cenikPrepocti, cenikPrepoctiRozpracovane,
                     cenikOznacJakoDnesni,
                     cenikVerzeCislo, cenikRazitkoNovy, cenikVerzeText, cenikVerzeVeta,
                     cenikDopadText };
