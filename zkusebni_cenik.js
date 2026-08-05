/* ============================================================
 * OBCHODNÍ ZAOKROUHLENÍ KONCOVÉ CENY (#38)
 *
 * Proč vůbec: engine už základní cenu OCK zaokrouhluje nahoru na tisíce,
 * takže nabídka bez slevy vychází hezky. Jakmile se ale přidá sleva, vyleze
 * číslo jako 1 159 710 Kč – a u PROJ, kde je celek prostým součtem sekcí,
 * vypadá koncová cena takhle vždycky. Obchodník to dnes „narovnává" ručně
 * úpravou procent slevy, což rozbíjí to, co je v nabídce napsané.
 *
 * Co tenhle modul dělá navíc: sjednocuje výpočet koncové ceny. Dosud si
 * „základ mínus sleva" počítalo každé místo samo (nabídka, krycí list,
 * porovnání variant, hlavička kalkulace, hlídání marže). Pět kopií jednoho
 * vzorce je pět příležitostí, jak se rozejít – a u zaokrouhlení by se to
 * projevilo hned: jeden dokument by ukázal 1 159 000 a druhý 1 159 710.
 * Proto cenaNabidkyOck() / cenaNabidkyProj() a všichni ostatní jen volají.
 *
 * Tři pravidla, která stojí za to znát:
 *
 * 1) NOVÁ VARIANTA ZAOKROUHLUJE NAHORU NA STOKORUNY, STARÁ ZAKÁZKA NE.
 *    Od 30. 7. 2026 dostává každá nová varianta rovnou krok 100 Kč nahoru
 *    (zaokrDefault) – nabídka tím ztratí vzhled „výstup z tabulky" a rozdíl
 *    je nejvýš 99 Kč ve prospěch firmy. Zakázka uložená ještě před #38 ale
 *    pole zaokr vůbec nemá, a její cena už mohla odejít zákazníkovi; té se
 *    proto v syncVarianta() dosazuje výslovně VYPNUTO (zaokrVypnuto), ne
 *    výchozí nastavení. Otevřením v novější verzi se stará cena nezmění.
 *    Nastavení žije u varianty (v.data.zaokr pro OCK, v.data.zaokrProj pro
 *    PROJ – viz zaokrZajisti níž) a putuje s archivem.
 *
 * 2) ROZDÍL JE VIDĚT JAKO VLASTNÍ ÚDAJ, ne schovaný ve slevě. Kdyby se
 *    rozpustil do slevy, nesedělo by uvedené procento; kdyby se neuvedl
 *    nikde, nabídka by nedávala součet. Proto ZAOKROUHLENI_KC a vlastní
 *    řádek v tisku (a v roadmapě to tak je zadané).
 *
 * 3) ZAOKROUHLENÍM DOLŮ SE NIKDY NENABÍDNE NULA. U drobné zakázky by velký
 *    krok srazil cenu na nulu a aplikace by tiše nabídla práci zadarmo;
 *    v takovém případě zůstává cena spočtená. Nulová a záporná cena se
 *    nezaokrouhluje vůbec.
 *
 * Nic se neblokuje – zaokrouhlení je vědomé rozhodnutí obchodníka, ne chyba.
 * Případný dopad na marži hlídá marze.js (#36), který si sem chodí pro cenu,
 * kterou zákazník opravdu zaplatí.
 * ============================================================ */

/* Kroky záměrně z krátkého seznamu, ne volné pole: obchodní zaokrouhlení má
 * pár zvyklostí (stovky, půltisíce, tisíce) a volné číslo by jen zvalo
 * k překlepu o řád přímo v ceně nabídky. */
const ZAOKR_KROKY = [
  { krok: 0,     popis: 'bez zaokrouhlení' },
  { krok: 100,   popis: 'na stokoruny' },
  { krok: 500,   popis: 'na pětistovky' },
  { krok: 1000,  popis: 'na tisíce' },
  { krok: 5000,  popis: 'na pět tisíc' },
  { krok: 10000, popis: 'na desetitisíce' }
];

/* Pořadí od nejopatrnějšího: „dolů" cenu zákazníkovi nikdy nezvýší, „nahoru"
 * nikdy neukrojí z marže. Výchozí je nahoru (viz zaokrDefault), protože při
 * kroku 100 Kč je rozdíl pro zákazníka neviditelný; „dolů" zůstává na místě
 * pro velké kroky, kde se cena narovnává vědomě směrem k zákazníkovi. */
const ZAOKR_SMERY = [
  { smer: 'dolu',    popis: 'dolů' },
  { smer: 'nejbliz', popis: 'na nejbližší' },
  { smer: 'nahoru',  popis: 'nahoru' }
];

/* Výchozí nastavení NOVÉ varianty (rozhodnuto 30. 7. 2026): nahoru na
 * stokoruny. Nejmenší krok, který nabídku zbaví vzhledu „výstup z tabulky",
 * a směr nahoru, protože zaokrouhlení nemá ukrajovat z marže – rozdíl je
 * nejvýš 99 Kč, což je pro zákazníka neviditelné a pro firmu bezpečné.
 * Základní cena OCK je už z výpočtu násobkem tisíce, takže dokud se nedá
 * sleva, tohle nastavení nic nemění; projeví se u slev a u PROJ. */
function zaokrDefault() { return { krok: 100, smer: 'nahoru' }; }

/* Nastavení pro varianty založené PŘED #38. Jejich cena už mohla odejít
 * zákazníkovi, takže otevřením v novější verzi se změnit NESMÍ – proto se
 * jim nedosazuje výchozí nastavení, ale výslovně vypnuto. */
function zaokrVypnuto() { return { krok: 0, smer: 'dolu' }; }

/* ---------- dvě nastavení, jedno pro každou část nabídky (4. 8. 2026) ----
 * Do 4. 8. 2026 měla varianta JEDNO pole `zaokr` a platilo pro obě části.
 * Bylo to v rozporu se vším ostatním, co je v aplikaci po částech: sleva OCK
 * a sleva PROJ jsou oddělené, sazba DPH taky, hlavičky nabídek jsou dvě
 * nezávislé sady. Zadání ze 4. 8. 2026 („do kalkulace ock patří pouze část
 * týkající se výtahové šachty, část týkající se projekčních prací pak patří
 * do sekce kalkulace proj") to srovnalo i tady: každá karta nastavuje jen
 * svou vlastní cenu.
 *
 * Zpětná slučitelnost je tu důležitější než čistota. Varianta uložená dřív
 * pole `zaokrProj` nemá – a její cena PROJ už mohla odejít zákazníkovi.
 * Proto se PRO ČTENÍ spadne na společné `zaokr`: dokud nikdo nesáhne na
 * přepínač, spočítá se přesně totéž číslo jako předtím. Teprve zaokrZajisti()
 * (import, syncVarianta) obě pole rozdělí – opět dosazením dosavadní hodnoty,
 * takže ani ten okamžik cenu nemění. */
function zaokrOckZ(d) { return d ? (d.zaokr || null) : null; }
function zaokrProjZ(d) { return d ? (d.zaokrProj || d.zaokr || null) : null; }

/* Dorovná variantu na dvě pole. Volá se z importu i při přepnutí varianty;
 * je idempotentní a nikdy nemění už nastavenou hodnotu. */
function zaokrZajisti(d) {
  if (!d) return d;
  if (!d.zaokr) d.zaokr = zaokrVypnuto();
  if (!d.zaokrProj) d.zaokrProj = { krok: zaokrKrok(d.zaokr), smer: zaokrSmer(d.zaokr) };
  return d;
}

/* Čtení nastavení odolné vůči nesmyslům (text, záporné číslo, chybějící
 * objekt): raději nezaokrouhlit než zaokrouhlit nečekaně. */
function zaokrKrok(z) {
  const k = z ? +z.krok : 0;
  return (typeof k === 'number' && isFinite(k) && k > 0) ? k : 0;
}
function zaokrSmer(z) {
  const s = z ? z.smer : '';
  return ZAOKR_SMERY.some(x => x.smer === s) ? s : 'dolu';
}
function zaokrZapnuto(z) { return zaokrKrok(z) > 0; }

/* Vlastní zaokrouhlení. Násobení/dělení krokem dělá drobné zbytky v plovoucí
 * čárce, proto výsledek dorovnáváme na haléře. */
function zaokrouhli(cena, z) {
  const krok = zaokrKrok(z);
  if (!krok) return cena;
  if (!(cena > 0)) return cena;          // nula ani záporná cena se neupravuje
  const smer = zaokrSmer(z);
  const podil = cena / krok;
  const n = smer === 'nahoru' ? Math.ceil(podil)
          : smer === 'nejbliz' ? Math.round(podil)
          : Math.floor(podil);
  const v = Math.round(n * krok * 100) / 100;
  return v > 0 ? v : cena;               // nikdy nenabídnout nulu
}

/* Stav pro zobrazení: co bylo spočteno, co se nabídne a jaký je rozdíl.
 * aktivni = zaokrouhlení je zapnuté (i když zrovna nic nezměnilo – uživatel
 * má vidět, že je zapnuté, ne se domnívat, že mu nefunguje). */
function zaokrStav(cena, z) {
  const krok = zaokrKrok(z), smer = zaokrSmer(z);
  const nova = zaokrouhli(cena, z);
  const k = ZAOKR_KROKY.find(x => x.krok === krok);
  const s = ZAOKR_SMERY.find(x => x.smer === smer);
  return {
    pred: cena, cena: nova,
    rozdil: Math.round((nova - cena) * 100) / 100,
    aktivni: krok > 0, krok, smer,
    popis: krok > 0 ? ((k ? k.popis : 'na ' + krok) + ' ' + (s ? s.popis : '')).trim() : ''
  };
}

/* Typografické minus (−), ne spojovník – u částky v nabídce se to čte. */
function zaokrKc(x) {
  const v = Math.round(x || 0);
  const zn = v < 0 ? '−' : (v > 0 ? '+' : '');
  return zn + Math.abs(v).toLocaleString('cs-CZ') + ' Kč';
}
function zaokrCastka(x) { return Math.abs(Math.round(x || 0)).toLocaleString('cs-CZ') + ' Kč'; }

/* Věta pod přepínač i do hlavičky kalkulace. Uvádí obě čísla, aby bylo
 * poznat, o co se cena posunula – prázdná, když je zaokrouhlení vypnuté. */
function zaokrText(st) {
  if (!st || !st.aktivni) return '';
  const zaokrouhleno = st.popis ? ' (' + st.popis + ')' : '';
  if (!st.rozdil)
    return `Zaokrouhleno${zaokrouhleno}: spočtená cena ${zaokrCastka(st.pred)} už je zaokrouhlená.`;
  return `Spočtená cena ${zaokrCastka(st.pred)}, po zaokrouhlení${zaokrouhleno} `
       + `${zaokrCastka(st.cena)} (rozdíl ${zaokrKc(st.rozdil)}).`;
}

/* ---------- koncová cena OCK ----------
 * Jediné místo, kde se skládá „základní cena → schválená sleva →
 * obchodní zaokrouhlení". Vrací i mezikroky, aby si je nabídka nemusela
 * dopočítávat sama; rozpad sedí na haléř: zaklad − slevaKc + zaokrKc = cena.
 * Bez výpočtu vrací null – cena se nikdy neodhaduje. */
function cenaNabidkyOck(vysl, sleva, zaokr) {
  if (!vysl || !vysl.souhrn) return null;
  const zaklad = vysl.souhrn.zakladCena;
  const podil = (typeof slevaPodil === 'function') ? slevaPodil(sleva || {}) : 0;
  const p = Math.max(0, Math.min(1, +podil || 0));
  const slevaKc = zaklad * p;
  const pred = zaklad - slevaKc;
  const cena = zaokrouhli(pred, zaokr);
  return { zaklad, slevaPct: p, slevaKc, pred, cena,
           zaokrKc: Math.round((cena - pred) * 100) / 100,
           naklad: vysl.souhrn.zakladNaklad };
}

/* ---------- koncová cena PROJ ----------
 * Zaokrouhluje se jen celek, ne jednotlivé sekce: ceny sekcí jsou v nabídce
 * vypsané a musely by se pak dorovnávat, aby dávaly součet. */
function cenaNabidkyProj(vysl, zaokr) {
  if (!vysl || !vysl.souhrn) return null;
  const pred = vysl.souhrn.celkem;
  const cena = zaokrouhli(pred, zaokr);
  return { pred, cena, zaokrKc: Math.round((cena - pred) * 100) / 100,
           /* náklad včetně dopravy – cena ji obsahuje, tak ji musí obsahovat
            * i náklad, se kterým se cena poměřuje (audit 1. 8. 2026, N2) */
           naklad: vysl.souhrn.naklad + (vysl.souhrn.doprava || 0) };
}

/* ---------- DPH (#14, krok 1 — 3. 8. 2026) ----------------------------
 * Jediné místo, kde se z ceny bez DPH dělá DPH v Kč a celkem s DPH.
 * Dřív si tohle násobení psala každá obrazovka i dokument sám (hlavička OCK,
 * hlavička PROJ, porovnání variant, obě nabídky) a přesně z té dvojkolejnosti
 * vznikl nález N3 auditu. Sazba, která není číslo, znamená „DPH nepočítej"
 * — vrací se nula, ne NaN, aby dokument nikdy nenesl rozbité číslo. */
function cenaSDph(cena, sazba) {
  const c = +cena || 0;
  const s = (typeof sazba === 'number' && isFinite(sazba)) ? sazba : 0;
  const dphKc = c * s;
  return { dphKc, sDph: c + dphKc };
}

if (typeof module !== 'undefined')
  module.exports = { ZAOKR_KROKY, ZAOKR_SMERY, zaokrDefault, zaokrVypnuto, zaokrKrok, zaokrSmer,
                     zaokrZapnuto, zaokrouhli, zaokrStav, zaokrKc, zaokrCastka,
                     zaokrText, cenaNabidkyOck, cenaNabidkyProj, cenaSDph,
                     zaokrOckZ, zaokrProjZ, zaokrZajisti };
