/* ============================================================
 * DATA ZE SESTAVENÍ – poznávací značka a text varování (#40)
 *
 * Od chvíle, kdy ze zdrojového kódu zmizely skutečné ceny a firemní
 * údaje (kvůli zálohování na GitHub), nese sestavení aplikace jen
 * náhradu za ně. Nebezpečné by bylo jediné – kdyby si někdo takového
 * výpočtu nevšiml a poslal ho zákazníkovi.
 *
 * Proto značka. Každý objekt, který není ostrý, má klíč `ukazkove: true`.
 * Nikdo ji nemusí mazat: skutečná data ze složky se nahrávají přes
 * konfigNahradVMiste(), který nejdřív zahodí celý obsah cílového objektu –
 * a protože skutečný `_program.json` ani `_nastaveni.json` klíč `ukazkove`
 * nemá, značka zmizí sama.
 *
 * ZMĚNA 30. 7. 2026 – ceníky v sestavení jsou PRÁZDNÉ, ne ukázkové.
 * Do té doby nesl `engine.js` vzorek s kulatými čísly, aby se dala
 * aplikace předvést i bez připojené složky. Zadání to ruší:
 *
 *   „Ukázkový ceník z aplikace prostě vymaž. S tím nabídka ven jít nesmí
 *    za žádnou cenu. Buď se z databáze natáhne ostrý ceník, anebo svítí
 *    všude nuly a není z čeho počítat."
 *
 * Takový ceník nese navíc klíč `prazdny: true` a chová se jinak než
 * ostatní vymyšlená data: firemní údaje ze sestavení jsou pořád jen
 * varování (nabídka s cizí adresou v hlavičce je opravitelná chyba),
 * ale ceník bez cen dokument BLOKUJE. Je to jediná výjimka z pravidla
 * „nic se neblokuje natvrdo" (KONTROLY_UROVEN = 2) a je udělená
 * výslovně – nulová cena není nabídka, je to omyl, který se nedá poslat
 * ani omylem.
 *
 * Čte se ze VŠECH ceníků, které jsou zrovna v ruce – tedy i z ceníku
 * varianty, ne jen z DEFAULT_CENIK. Ceník varianty je zmrazená kopie
 * (zakazka.js), takže varianta spočítaná bez ceníku si značku nese
 * s sebou. To je záměr: špatná je ta varianta, ne stav aplikace.
 *
 * OPRAVA 31. 7. 2026 – značka jde s čísly. Dokud se přepočet varianty staral
 * jen o ceny a značku nechával být, zůstala varianta označená i potom, co do ní
 * přišly ostré ceny ze složky: na obrazovce skutečné částky, a přes ně červená
 * lišta „není z čeho počítat" a zablokovaný dokument. Značku proto srovnává
 * ukazkoveSrovnejZnacku() vždy tam, kde se ceny přepisují (cenik_stari.js).
 *
 * Modul je čistá logika bez DOM – lišta je v ui/ukazkove_ui.js.
 * ============================================================ */

const UKAZKOVE_KLIC = 'ukazkove';
const PRAZDNY_KLIC = 'prazdny';

/* Nese objekt značku dat, která nejsou ostrá? */
function ukazkoveJe(o) {
  return !!(o && typeof o === 'object' && o[UKAZKOVE_KLIC]);
}

/* Je to prázdný ceník ze sestavení – samé nuly, není z čeho počítat? */
function ukazkovePrazdny(o) {
  return !!(o && typeof o === 'object' && o[PRAZDNY_KLIC]);
}

/* Odstraní značku na místě. Používá se před zápisem do složky: uložit
 * ceník do `_program.json` je vědomé prohlášení, že ceny jsou skutečné. */
function ukazkoveOcisti(o) {
  if (o && typeof o === 'object') { delete o[UKAZKOVE_KLIC]; delete o[PRAZDNY_KLIC]; }
  return o;
}

/* Srovná značku cíle podle zdroje, ze kterého do něj přišla čísla.
 *
 * Značka patří k CENÁM, ne k objektu, ve kterém zrovna leží. Ceník varianty je
 * zmrazená kopie (zakazka.js), takže varianta spočítaná bez připojené složky si
 * nese prázdný ceník i se značkou. Jakmile do ní přepočet zapíše ceny ze
 * skutečného ceníku, musí značka zmizet – jinak aplikace počítá z ostrých čísel
 * a přitom pořád tvrdí „není z čeho počítat": svítí červená lišta a dokument
 * zůstane zablokovaný nad správnou nabídkou. (Hlášeno 31. 7. 2026.)
 *
 * Platí to i opačně: když se varianta vrátí k prázdnému ceníku ze sestavení,
 * značku zase dostane. Souměrnost je tu schválně – jediné pravidlo „značka jde
 * s čísly" se pamatuje líp než dvě výjimky. */
function ukazkoveSrovnejZnacku(cil, zdroj) {
  if (!cil || typeof cil !== 'object') return cil;
  if (ukazkoveJe(zdroj)) cil[UKAZKOVE_KLIC] = true; else delete cil[UKAZKOVE_KLIC];
  if (ukazkovePrazdny(zdroj)) cil[PRAZDNY_KLIC] = true; else delete cil[PRAZDNY_KLIC];
  return cil;
}

/* Kopie bez značky – tam, kde se originál přepsat nesmí. */
function ukazkoveBez(o) {
  if (!o || typeof o !== 'object') return o;
  const k = JSON.parse(JSON.stringify(o));
  delete k[UKAZKOVE_KLIC];
  delete k[PRAZDNY_KLIC];
  return k;
}

/* Stav pro celou aplikaci.
 * ctx = { cenik, cenikProj, firma, slevy } – co je k dispozici, to se
 * podívá; chybějící oddíl se nepočítá za čistý ani za vymyšlený. */
function ukazkoveStav(ctx) {
  ctx = ctx || {};
  const kde = [];
  if (ukazkoveJe(ctx.cenik)) kde.push('ceník OCK');
  if (ukazkoveJe(ctx.cenikProj)) kde.push('ceník projekce');
  if (ukazkoveJe(ctx.slevy)) kde.push('slevová politika');
  if (ukazkoveJe(ctx.firma)) kde.push('firemní údaje');
  const ceny = ukazkoveJe(ctx.cenik) || ukazkoveJe(ctx.cenikProj) || ukazkoveJe(ctx.slevy);
  const udaje = ukazkoveJe(ctx.firma);
  /* Prázdný ceník je horší případ než vymyšlený: nulami se nedá počítat.
   * Sleduje se zvlášť, protože jen on blokuje dokumenty. */
  const prazdneKde = [];
  if (ukazkovePrazdny(ctx.cenik)) prazdneKde.push('ceník OCK');
  if (ukazkovePrazdny(ctx.cenikProj)) prazdneKde.push('ceník projekce');
  return { jsou: kde.length > 0, ceny, udaje, kde,
           prazdne: prazdneKde.length > 0, prazdneKde };
}

/* Věta do lišty. Rozlišuje případy, protože každý znamená jinou práci:
 * chybí ceník úplně, jsou vymyšlené ceny, chybí firemní údaje. */
function ukazkoveText(stav, pripojeni, jmeno, bezSlozky) {
  if (!stav || !stav.jsou) return '';
  const co = stav.prazdne
    ? (stav.udaje
        ? 'Ceník není nahraný a firemní údaje nejsou skutečné.'
        : 'Ceník není nahraný – všude svítí nuly a není z čeho počítat.')
    : (stav.ceny && stav.udaje
        ? 'Ceny i firemní údaje jsou ukázkové, ne skutečné.'
        : (stav.ceny ? 'Ceny jsou ukázkové, ne skutečné.'
                     : 'Firemní údaje jsou ukázkové, ne skutečné.'));
  return co + ' ' + ukazkoveKudy(pripojeni, jmeno, bezSlozky);
}

/* Druhá věta lišty: kudy ven. Liší se podle toho, co je opravdu potřeba
 * udělat – „připojte složku" je zbytečně velký úkol pro někoho, komu
 * prohlížeč jen po restartu zapomněl právo k zápisu do složky, kterou už
 * jednou vybral. */
function ukazkoveKudy(pripojeni, jmeno, bezSlozky) {
  /* Běžný uživatel (obchodník, vedoucí) složku _DB nemapuje – ceník mu chodí
   * z online databáze a zveřejňuje ho tam administrátor (zadání 4. 8. 2026:
   * „Přihlásil jsem se jako nový uživatel (obchodník) a přesto to po mně chce
   * připojit databázi."). Poslat ho pro složku na disku je slepá ulička:
   * nemá k ní přístup a chyba není u něj. Řekneme mu tedy jedinou větu,
   * se kterou se dá něco dělat – ozvat se administrátorovi. */
  if (bezSlozky)
    return 'Platný ceník zveřejňuje do online databáze administrátor. '
      + 'Požádejte ho o zveřejnění – hodnoty se pak načtou samy.';
  if (pripojeni === 'znovu')
    return 'Skutečná data leží ve složce „' + (jmeno || '_DB') + '", ale prohlížeč '
      + 'k ní po restartu zapomněl přístup. Vraťte ho tlačítkem vpravo '
      + 'a hodnoty se načtou samy.';
  if (pripojeni === 'vybrat')
    return 'Skutečná data leží ve složce _DB. Připojte ji tlačítkem vpravo '
      + '(nebo v Nastavení → Úložiště) a hodnoty se načtou samy.';
  return 'Skutečná data leží ve složce _DB. Připojte složku '
    + '(Nastavení → Úložiště) a hodnoty se načtou samy.';
}

/* Má lišta nabídnout tlačítko, a jaké?
 *   ''       – nemá (prohlížeč složky neumí, nebo složka běží a lišta
 *              svítí kvůli něčemu jinému, třeba zmrazenému ceníku varianty)
 *   'znovu'  – složku už uživatel jednou vybral, chybí jen právo zápisu
 *   'vybrat' – žádná složka není, je potřeba ji najít
 * Je to tady, a ne v UI, aby se dalo otestovat bez prohlížeče. */
function ukazkovePripojeni(uloStav, podporovano) {
  if (!podporovano) return '';
  if (!uloStav) return 'vybrat';
  if (uloStav.pripraveno) return '';
  return uloStav.koren ? 'znovu' : 'vybrat';
}

/* Kratší věta tam, kde je málo místa a dokument za chvíli odejde ven. */
function ukazkoveKratce(stav, bezSlozky) {
  if (!stav || !stav.jsou) return '';
  if (stav.prazdne)
    return bezSlozky
      ? 'Ceník není nahraný – všude jsou nuly. Dokument se nedá vytvořit, '
        + 'dokud administrátor nezveřejní platný ceník do online databáze.'
      : 'Ceník není nahraný – všude jsou nuly. Dokument se nedá vytvořit, '
        + 'dokud se nepřipojí složka _DB se skutečným ceníkem.';
  return stav.ceny
    ? 'Pozor: tento dokument je spočítaný z UKÁZKOVÝCH cen, ne ze skutečného ceníku. Neposílejte ho zákazníkovi.'
    : 'Pozor: v hlavičce jsou UKÁZKOVÉ firemní údaje, ne skutečné. Neposílejte dokument zákazníkovi.';
}

/* Smí z tohohle stavu vzniknout dokument, který jde k zákazníkovi?
 * Jediné tvrdé „ne" v celé aplikaci – zdůvodnění je v hlavičce modulu. */
function ukazkoveBraniDokumentu(stav) {
  return !!(stav && stav.prazdne);
}

/* Výčet oddílů do věty („ceník OCK, ceník projekce a firemní údaje"). */
function ukazkoveVyctem(stav) {
  const k = (stav && stav.kde) || [];
  if (!k.length) return '';
  if (k.length === 1) return k[0];
  return k.slice(0, -1).join(', ') + ' a ' + k[k.length - 1];
}

if (typeof module !== 'undefined')
  module.exports = { UKAZKOVE_KLIC, PRAZDNY_KLIC, ukazkoveJe, ukazkovePrazdny,
                     ukazkoveOcisti, ukazkoveSrovnejZnacku,
                     ukazkoveBez, ukazkoveStav, ukazkoveText,
                     ukazkoveKratce, ukazkoveVyctem, ukazkoveBraniDokumentu,
                     ukazkoveKudy, ukazkovePripojeni };
