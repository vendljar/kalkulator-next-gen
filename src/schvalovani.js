/* ============================================================
 * SCHVALOVÁNÍ SLEV (zadání 5. 8. 2026: „Vytvoř novou záložku
 * ‚schvalování slev'.")
 *
 * CO SE TÍM ŘEŠÍ
 * Sleva se dosud schvalovala přímo v kartě „Sleva na nabídku" pod výpočtem:
 * kdo měl kartu na obrazovce, ten viděl tlačítko „Schválit slevu", vybral si
 * v rozbalovacím seznamu roli nadřízeného a odklepl si vlastní žádost sám.
 * Rozhraní tedy schvalování jen předstíralo — nebyl v něm ani pracovní seznam
 * žádostí, ani žádná zábrana. Tenhle modul je věcná část nové záložky:
 * z variant zakázky složí seznam žádostí a řekne, kdo o které smí rozhodnout.
 *
 * PROČ ODDĚLENĚ OD sleva.js
 * sleva.js počítá DOPAD slevy (kolik Kč, jaká marže, jaký strop role). To je
 * čistá matematika a nesmí ji zajímat, kdo sedí u počítače. Schvalování je
 * naproti tomu rozhodovací proces nad hotovým číslem: kdo smí odklepnout,
 * co se s rozhodnutím stane, když obchodník potom procento změní, a co se
 * ukáže v pracovním seznamu. Kdyby to bylo v jednom souboru, každá změna
 * pravidel schvalování by nutila znovu prověřovat výpočet ceny.
 *
 * KDO SMÍ ROZHODNOUT
 * Rozhoduje ten, jehož vlastní strop požadovanou slevu pokrývá. Obchodník má
 * strop 5 %, vedoucí 15 % — vedoucí tedy odklepne žádost na 8 %, ale žádost
 * na 20 % musí jít dál k administrátorovi. Je to stejné pravidlo, podle
 * kterého se sleva do stropu schvaluje sama; jen se místo zadavatele ptá na
 * posuzovatele. Administrátor rozhoduje vždy, i kdyby mu někdo strop
 * v _program.json snížil — jinak by šlo konfigurací dostat zakázku do stavu,
 * kdy o slevě nesmí rozhodnout vůbec nikdo a není odkud to spravit.
 *
 * PROČ ROZHODNUTÍ PLATÍ JEN PRO SVÉ PROCENTO
 * Razítko se váže na číslo, které se schvalovalo (`schvalenoProc`), a stejně
 * tak zamítnutí (`zamitnutoProc`). Kdyby razítko drželo i po změně procenta,
 * stačilo by nechat si schválit 6 % a pak přepsat pole na 20 % — a nabídka by
 * odešla se slevou, kterou nikdo neviděl. Po každé změně procenta proto
 * žádost padá zpět do stavu „čeká na schválení".
 *   Zamítnutí musí držet ze stejného důvodu obráceně: bez `zamitnutoProc` by
 * přepočet odmítnutou žádost vrátil do „čeká na schválení" a vedoucí by tutéž
 * slevu odmítal donekonečna.
 *
 * ZAMÍTNUTÍ VÝPOČTEM vs. ZAMÍTNUTÍ ČLOVĚKEM
 * Stav „zamítnuto" má dvě příčiny, které vypadají stejně, ale znamenají něco
 * jiného: sleva pod minimální marží (to říká výpočet a nikdo to nepřebije)
 * a sleva odmítnutá nadřízeným (rozhodnutí, které jde vzít zpět). Rozlišuje
 * je právě `zamitnutoProc` — a záložka podle toho píše jiné vysvětlení.
 * ============================================================ */

/* Jména stavů jsou textová a ukládají se do zakázky — nikdy je nepřejmenovávat,
 * starší uložené nabídky by přestaly dávat smysl. */
const SCHV_BEZ = '';
const SCHV_AUTO = 'schváleno automaticky';
const SCHV_CEKA = 'čeká na schválení';
const SCHV_SCHVALENO = 'schváleno';
const SCHV_ZAMITNUTO = 'zamítnuto';

/* Pořadí kategorií v pracovním seznamu: nahoru patří to, co čeká na člověka,
 * dolů hotové věci. Záložka je pracovní seznam, ne archiv. */
const SCHV_PORADI = { ceka: 0, zamitnuto: 1, podMarzi: 2, schvaleno: 3, auto: 4, bez: 5 };

const SCHV_POPIS = {
  ceka: 'čeká na rozhodnutí',
  schvaleno: 'schváleno nadřízeným',
  auto: 'schváleno automaticky (do stropu role)',
  zamitnuto: 'zamítnuto nadřízeným',
  podMarzi: 'nelze schválit – pod minimální marží',
  bez: 'bez slevy',
};

/* Do jaké kategorie žádost patří. Bere se výhradně z uloženého stavu slevy,
 * takže funguje i tam, kde není po ruce výpočet (rozbité zadání OCK). */
function schvalovaniKategorie(sleva) {
  if (!sleva || !(+sleva.procenta > 0)) return 'bez';
  switch (sleva.stav) {
    case SCHV_CEKA: return 'ceka';
    case SCHV_SCHVALENO: return 'schvaleno';
    case SCHV_AUTO: return 'auto';
    case SCHV_ZAMITNUTO:
      return sleva.zamitnutoProc === +sleva.procenta ? 'zamitnuto' : 'podMarzi';
    default: return 'bez';
  }
}

/* Strop role jako podíl (0..1). Chybějící role = nulový strop; mlčky ji
 * dosadit na cokoli jiného by znamenalo přidělit oprávnění překlepem. */
function schvalovaniStrop(role, nast) {
  const st = (nast && nast.stropy) || {};
  return st[role] != null ? Math.max(0, +st[role] || 0) : 0;
}

/* Smí `role` rozhodnout o slevě `procenta` (v %)? */
function schvalovaniSmiRozhodnout(role, procenta, nast) {
  if (!role) return false;
  if (role === 'Administrátor') return true;
  const p = Math.max(0, +procenta || 0) / 100;
  return p <= schvalovaniStrop(role, nast) + 1e-9;
}

/* Které role žádost odklepnou. Seznam rolí se předává, aby modul nezávisel
 * na NAST (v testech i na serveru je jiné). */
function schvalovaniKdoMuze(procenta, nast, role) {
  return (Array.isArray(role) ? role : [])
    .filter(r => schvalovaniSmiRozhodnout(r, procenta, nast));
}

/* Odstraní stopu ručního zamítnutí. Používá se všude, kde zamítnutí přestává
 * platit — po schválení i po změně procenta. */
function schvalovaniSmazZamitnuti(sleva) {
  delete sleva.zamitnutoProc;
  sleva.zamitl = ''; sleva.zamitlKdy = ''; sleva.zamitnutoDuvod = '';
}
function schvalovaniSmazSchvaleni(sleva) {
  delete sleva.schvalenoProc;
  sleva.schvalil = ''; sleva.schvalilKdy = '';
}

/* Přepočet stavu slevy po jakékoli změně. Sem se přestěhovala logika, která
 * dřív žila v slevaRefreshStav() v ui/common.js — tam nešla otestovat bez
 * prohlížeče a přitom rozhoduje o tom, jestli sleva odejde v nabídce.
 *   `v` je výsledek slevaVyhodnot(); může být null, když výpočet OCK selhal —
 * pak se stav NEMĚNÍ (raději starý stav než přepis na základě ničeho). */
function schvalovaniPrepocti(sleva, v) {
  if (!sleva) return sleva;
  const p = +sleva.procenta || 0;
  if (!(p > 0)) {
    sleva.stav = SCHV_BEZ;
    schvalovaniSmazSchvaleni(sleva); schvalovaniSmazZamitnuti(sleva);
    return sleva;
  }
  if (!v) return sleva;
  if (v.podMarzi) {
    /* Pod minimální marží nemá co držet ani schválení, ani zamítnutí člověkem:
     * důvod je jinde a záložka ho musí pojmenovat správně. */
    sleva.stav = SCHV_ZAMITNUTO;
    schvalovaniSmazSchvaleni(sleva); schvalovaniSmazZamitnuti(sleva);
    return sleva;
  }
  if (sleva.stav === SCHV_SCHVALENO && sleva.schvalenoProc === p) return sleva;   // drž schválení
  if (sleva.stav === SCHV_ZAMITNUTO && sleva.zamitnutoProc === p) return sleva;   // drž zamítnutí
  /* Sem se dojde jen tehdy, když rozhodnutí k současnému procentu nesedí —
   * typicky když obchodník po schválení slevu zvedl. Stopa po starém
   * rozhodnutí se maže celá: jméno schvalovatele u žádosti, o které se teprve
   * rozhoduje, by v seznamu i v zakázce tvrdilo něco, co nikdo neodklepl. */
  sleva.stav = v.stav;
  schvalovaniSmazSchvaleni(sleva);
  schvalovaniSmazZamitnuti(sleva);
  return sleva;
}

/* ---------- rozhodnutí ---------- */

function schvalovaniSchval(sleva, kdo, kdy) {
  if (!sleva) return sleva;
  schvalovaniSmazZamitnuti(sleva);
  sleva.stav = SCHV_SCHVALENO;
  sleva.schvalenoProc = +sleva.procenta || 0;
  sleva.schvalil = kdo || 'nadřízený';
  sleva.schvalilKdy = kdy || new Date().toISOString();
  return sleva;
}

function schvalovaniZamitni(sleva, kdo, kdy, duvod) {
  if (!sleva) return sleva;
  schvalovaniSmazSchvaleni(sleva);
  sleva.stav = SCHV_ZAMITNUTO;
  sleva.zamitnutoProc = +sleva.procenta || 0;
  sleva.zamitl = kdo || 'nadřízený';
  sleva.zamitlKdy = kdy || new Date().toISOString();
  sleva.zamitnutoDuvod = String(duvod || '');
  return sleva;
}

/* Vzít rozhodnutí zpět (překlep, změněná domluva). Stav se dopočítá při
 * nejbližším přepočtu — sám o sobě tenhle krok nic neschvaluje. */
function schvalovaniVrat(sleva) {
  if (!sleva) return sleva;
  schvalovaniSmazSchvaleni(sleva); schvalovaniSmazZamitnuti(sleva);
  sleva.stav = SCHV_CEKA;
  return sleva;
}

/* ---------- pracovní seznam ---------- */

/* Jedna žádost = jedna varianta se zadanou slevou.
 *   `vypocty` je mapa id varianty → { zakladCena, zakladNaklad }; UI ji dodá
 * ze spocitejVariantu(), testy si ji nastaví ručně. Chybí-li výpočet, žádost
 * ze seznamu NEZMIZÍ — jen u ní nejsou koruny. Ztratit žádost kvůli rozbitému
 * zadání by znamenalo, že o slevě nikdo neví. */
/* `cast` říká, o kterou slevu jde: 'ock' = výtahová šachta, 'proj' = projekce.
 * Od 12. 8. 2026 (#134) má každá kalkulace vlastní slevu nad vlastní cenou,
 * takže jedna varianta může poslat do fronty až dvě žádosti — a u každé musí
 * být vidět, čeho se týká. `vypocet` je vždy základ TÉ ČÁSTI, ne obou. */
function schvalovaniZaznam(varianta, vypocet, nast, role, cast) {
  const proj = cast === 'proj';
  const sl = (varianta && varianta.data
              && (proj ? varianta.data.slevaProj : varianta.data.sleva)) || null;
  const procenta = Math.max(0, +(sl && sl.procenta) || 0);
  const spocteno = !!(vypocet && typeof vypocet.zakladCena === 'number');
  const d = (spocteno && typeof slevaVyhodnot === 'function')
    ? slevaVyhodnot(vypocet.zakladCena, vypocet.zakladNaklad, sl, nast) : null;
  const zamceno = (typeof variantaUzamcena === 'function')
    ? !!variantaUzamcena(varianta)
    : !!(varianta && varianta.zamek && varianta.zamek.zamceno);
  const kat = schvalovaniKategorie(sl);
  return {
    id: varianta.id,
    /* `klic` je adresa žádosti (varianta + část). Samotné `id` zůstává, aby
     * se dalo přepnout na variantu; rozhoduje se ale vždy o jedné části. */
    klic: varianta.id + '|' + (proj ? 'proj' : 'ock'),
    cast: proj ? 'proj' : 'ock',
    castNazev: proj ? 'Projekční práce (PROJ)' : 'Výtahová šachta (OCK)',
    nazev: String(varianta.nazev || ''),
    ridici: !!varianta.ridici,
    zamceno,
    procenta,
    role: String((sl && sl.role) || ''),
    schema: String((sl && sl.schema) || ''),
    poznamka: String((sl && sl.poznamka) || ''),
    stav: String((sl && sl.stav) || ''),
    kategorie: kat,
    popis: SCHV_POPIS[kat] || '',
    spocteno,
    strop: d ? d.strop : null,
    minMarze: d ? d.minMarze : null,
    slevaKc: d ? d.slevaKc : null,
    cenaPredSlevou: d ? d.cenaPoSleve + d.slevaKc : null,
    cenaPoSleve: d ? d.cenaPoSleve : null,
    marzePoSleve: d ? d.marzePoSleve : null,
    podMarzi: d ? d.podMarzi : false,
    nadStrop: d ? d.nadStrop : false,
    schvalil: String((sl && sl.schvalil) || ''),
    schvalilKdy: String((sl && sl.schvalilKdy) || ''),
    zamitl: String((sl && sl.zamitl) || ''),
    zamitlKdy: String((sl && sl.zamitlKdy) || ''),
    zamitnutoDuvod: String((sl && sl.zamitnutoDuvod) || ''),
    kdoMuze: schvalovaniKdoMuze(procenta, nast, role || SCHV_ROLE_VYCHOZI),
  };
}

/* Když seznam rolí nikdo nedodá, bere se trojice z sleva.js. Kopie tu není —
 * ROLE_VYCHOZI je jediný zdroj pravdy o tom, jaké role aplikace zná. */
const SCHV_ROLE_VYCHOZI = (typeof ROLE_VYCHOZI !== 'undefined')
  ? ROLE_VYCHOZI : ['Obchodník', 'Vedoucí', 'Administrátor'];

/* Základy pro obě části. Přijímá i starší tvar `{zakladCena, zakladNaklad}`,
 * kdy fronta znala jen slevu OCK — bez toho by se po aktualizaci přestaly
 * u rozpracovaných žádostí ukazovat částky. */
function schvalovaniZaklady(zaznam) {
  const z = zaznam || {};
  if (z.ock || z.proj) return { ock: z.ock || null, proj: z.proj || null };
  return { ock: (typeof z.zakladCena === 'number') ? z : null, proj: null };
}

function schvalovaniSeznam(zak, vypocty, nast, role) {
  const varianty = (zak && Array.isArray(zak.varianty)) ? zak.varianty : [];
  const mapa = vypocty || {};
  const zadosti = [];
  varianty.forEach(v => {
    if (!v || !v.data) return;
    const z = schvalovaniZaklady(mapa[v.id]);
    /* Dvě samostatné žádosti, ne jedna se dvěma čísly: vedoucí schvaluje
     * slevu na šachtu a slevu na projekt zvlášť a může jednu povolit
     * a druhou ne. */
    if (v.data.sleva && +v.data.sleva.procenta > 0)
      zadosti.push(schvalovaniZaznam(v, z.ock, nast, role, 'ock'));
    if (v.data.slevaProj && +v.data.slevaProj.procenta > 0)
      zadosti.push(schvalovaniZaznam(v, z.proj, nast, role, 'proj'));
  });
  return zadosti
    .sort((a, b) => {
      const pa = SCHV_PORADI[a.kategorie], pb = SCHV_PORADI[b.kategorie];
      if (pa !== pb) return pa - pb;
      return (b.procenta || 0) - (a.procenta || 0);
    });
}

/* ---------- žádosti z ostatních zakázek (#102, 10. 8. 2026) ----------
 *
 * Sdílený rejstřík ze serveru (/api/schvalovani) záměrně NENESE žádné částky —
 * ani cenu, ani slevu v korunách, ani marži. Tenhle převod z toho udělá záznam
 * ve stejném tvaru, jaký zná záložka, jen s prázdnými čísly. Díky tomu se
 * seznam vykresluje jedním kódem a nemůže se stát, že by se v přehledu napříč
 * zakázkami objevila částka, kterou by v otevřené zakázce daná role neviděla.
 *
 * `spocteno: false` je tu podstatné: říká rozhraní, že čísla nechybí omylem,
 * ale že se v tomhle pohledu nepočítala. Kdo chce vidět peníze, otevře zakázku. */
function schvalovaniZaznamRejstrik(polozka) {
  const p = polozka || {};
  const sl = p.sleva || {};
  const kat = schvalovaniKategorie(sl);
  const proj = p.cast === 'proj';
  return {
    id: p.variantaId,
    klic: String(p.variantaId || '') + '|' + (proj ? 'proj' : 'ock'),
    cast: proj ? 'proj' : 'ock',
    castNazev: proj ? 'Projekční práce (PROJ)' : 'Výtahová šachta (OCK)',
    nazev: String(p.variantaNazev || ''),
    ridici: !!p.ridici,
    zamceno: !!p.zamceno,
    procenta: Math.max(0, +sl.procenta || 0),
    role: String(sl.role || ''),
    schema: String(sl.schema || ''),
    poznamka: String(sl.poznamka || ''),
    stav: String(sl.stav || ''),
    kategorie: kat,
    popis: SCHV_POPIS[kat] || '',
    spocteno: false,
    strop: null, minMarze: null, slevaKc: null,
    cenaPredSlevou: null, cenaPoSleve: null, marzePoSleve: null,
    podMarzi: kat === 'podMarzi',
    nadStrop: kat === 'ceka',
    schvalil: String(sl.schvalil || ''),
    schvalilKdy: String(sl.schvalilKdy || ''),
    zamitl: String(sl.zamitl || ''),
    zamitlKdy: String(sl.zamitlKdy || ''),
    zamitnutoDuvod: String(sl.zamitnutoDuvod || ''),
    /* navíc oproti záznamu z otevřené zakázky */
    cizi: true,
    klic: String(p.klic || ''),
    cislo: String(p.cislo || ''),
    nazevAkce: String(p.nazevAkce || ''),
  };
}

/* Seřadí rejstřík stejně jako seznam z otevřené zakázky: nahoru to,
 * co čeká na člověka, uvnitř kategorie vyšší sleva první. */
function schvalovaniSeznamRejstrik(zadosti) {
  return (Array.isArray(zadosti) ? zadosti : [])
    .map(schvalovaniZaznamRejstrik)
    .sort((a, b) => {
      const pa = SCHV_PORADI[a.kategorie], pb = SCHV_PORADI[b.kategorie];
      if (pa !== pb) return pa - pb;
      return (b.procenta || 0) - (a.procenta || 0);
    });
}

/* Pojistka pro rejstřík: v odpovědi serveru nesmí být nic, co vypadá jako
 * částka. Kontroluje se tvar dat, ne jejich obsah — nová položka s cenou by
 * se sem musela doslova propašovat pod jménem, které neznáme. */
const SCHV_REJSTRIK_POVOLENO = ['klic', 'cast', 'cislo', 'nazevAkce', 'variantaId', 'variantaNazev',
  'ridici', 'zamceno', 'upraveno', 'sleva'];
const SCHV_REJSTRIK_SLEVA_POVOLENO = ['procenta', 'role', 'schema', 'poznamka', 'stav',
  'schvalil', 'schvalilKdy', 'schvalenoProc', 'zamitl', 'zamitlKdy', 'zamitnutoProc',
  'zamitnutoDuvod'];

function schvalovaniRejstrikNeznameKlice(zadosti) {
  const spatne = [];
  (Array.isArray(zadosti) ? zadosti : []).forEach((z) => {
    Object.keys(z || {}).forEach(k => { if (!SCHV_REJSTRIK_POVOLENO.includes(k)) spatne.push(k); });
    Object.keys((z && z.sleva) || {}).forEach(k => {
      if (!SCHV_REJSTRIK_SLEVA_POVOLENO.includes(k)) spatne.push('sleva.' + k);
    });
  });
  return [...new Set(spatne)];
}

function schvalovaniSouhrn(seznam) {
  const out = { celkem: 0, ceka: 0, schvaleno: 0, auto: 0, zamitnuto: 0, podMarzi: 0 };
  (Array.isArray(seznam) ? seznam : []).forEach(z => {
    out.celkem++;
    if (out[z.kategorie] != null) out[z.kategorie]++;
  });
  return out;
}

if (typeof module !== 'undefined')
  module.exports = { SCHV_BEZ, SCHV_AUTO, SCHV_CEKA, SCHV_SCHVALENO, SCHV_ZAMITNUTO,
                     SCHV_PORADI, SCHV_POPIS, SCHV_ROLE_VYCHOZI,
                     schvalovaniKategorie, schvalovaniStrop, schvalovaniSmiRozhodnout,
                     schvalovaniKdoMuze, schvalovaniPrepocti,
                     schvalovaniSchval, schvalovaniZamitni, schvalovaniVrat,
                     schvalovaniZaznam, schvalovaniSeznam, schvalovaniSouhrn,
                     schvalovaniZaznamRejstrik, schvalovaniSeznamRejstrik,
                     schvalovaniRejstrikNeznameKlice,
                     SCHV_REJSTRIK_POVOLENO, SCHV_REJSTRIK_SLEVA_POVOLENO };
