/* ============================================================
 * SEZNAM ZÁKAZNÍKŮ (#162, 20. 8. 2026, zadání J. V.)
 *
 * PROČ TENHLE SOUBOR JE
 * Zákazník do 20. 8. 2026 nebyl v aplikaci nikde jako samostatný záznam —
 * žil jen jako pár textových polí uvnitř každé jednotlivé zakázky. U druhé
 * zakázky pro totéž SVJ se proto všechno psalo znovu, a protože se psalo
 * ručně, pokaždé trochu jinak („SVJ Verdunská 983" × „Společenství vlastníků
 * jednotek Verdunská 983, Praha 6"). Ve smlouvě to bylo vidět.
 *
 * ZÁSADY (neporušovat)
 *  1. ZAKÁZKA JE PÁN. Karta zákazníka jen PŘEDVYPLŇUJE. Co obchodník
 *     v zakázce přepíše, se do karty samo NEVRACÍ — jinak by jedna
 *     překlepnutá zakázka rozbila údaje všem ostatním.
 *  2. NIC POTICHU. Rozdíly mezi kartou a zakázkou se ukážou jako seznam
 *     „takhle to je / takhle to bude" a teprve na potvrzení se zapíšou
 *     (stejné pravidlo jako u dotažení z ARES, viz ares.js).
 *  3. KLÍČ JE IČO. Osm číslic, jednoznačné, dohledatelné v rejstříku.
 *     Zákazník bez IČO dostane náhradní klíč z názvu — a při zakládání se
 *     hlásí podobné názvy, aby nevznikly dvě karty pro jednu firmu.
 *  4. TENHLE SOUBOR JE ČISTÁ LOGIKA. Žádný DOM, žádné fetch — běží
 *     v prohlížeči, v Node testech i na serveru (jadro_moduly.cjs).
 *     Obrazovku dělá ui/zakaznici_ui.js, server functions/zakaznici.mjs.
 * ============================================================ */

const ZAKAZNIK_SCHEMA = 1;

/* Pole karty. `zak` = cesta do hlavičky zakázky, `zast` = do ZAK.zastupci.
 * Odsud se generuje formulář, kopírování do zakázky i porovnání — jeden
 * seznam, aby se ty tři věci nemohly rozejít. */
const ZAKAZNIK_POLE = [
  { id: 'nazev', label: 'Název (smluvní partner)', zak: 'objednatel', povinne: true },
  { id: 'sidlo', label: 'Adresa (sídlo)', zak: 'adresaObjednatele' },
  { id: 'ico', label: 'IČO', zak: 'ico' },
  { id: 'dic', label: 'DIČ', zak: 'dic' },
  { id: 'kontaktOsoba', label: 'Kontaktní osoba', zak: 'kontakt' },
  { id: 'zapis', label: 'Zápis v rejstříku', zast: 'zapis' },
  { id: 'banka', label: 'Bankovní spojení', zast: 'banka' },
  { id: 'ucet', label: 'Číslo účtu / směrový kód', zast: 'ucet' },
  { id: 'smluvniJmeno', label: 'Ve věcech smluvních — jméno', zast: 'smluvniJmeno' },
  { id: 'smluvniPozice', label: '— pozice (podepisuje smlouvu)', zast: 'smluvniPozice' },
  { id: 'smluvniTel', label: '— telefon', zast: 'smluvniTel' },
  { id: 'smluvniEmail', label: '— e-mail', zast: 'smluvniEmail' },
  { id: 'obchodniJmeno', label: 'Ve věcech obchodních — jméno', zast: 'obchodniJmeno' },
  { id: 'obchodniTel', label: '— telefon', zast: 'obchodniTel' },
  { id: 'obchodniEmail', label: '— e-mail', zast: 'obchodniEmail' },
  { id: 'technickyJmeno', label: 'Ve věcech technických — jméno', zast: 'technickyJmeno' },
  { id: 'technickyTel', label: '— telefon', zast: 'technickyTel' },
  { id: 'technickyEmail', label: '— e-mail', zast: 'technickyEmail' },
  { id: 'fakturyEmail', label: 'Fakturace — e-mail', zast: 'fakturyEmail' },
  { id: 'fakturyTel', label: 'Fakturace — telefon', zast: 'fakturyTel' },
];

/* Interní poznámka do karty nepatří do žádné zakázky ani dokumentu.
 * (Pole „Scoring Cribis / Pipedrive" tu 20. 8. 2026 na pokyn J. V. NENÍ —
 * scoring se řeší v Pipedrive, ne tady.) */
function zakaznikNovy() {
  const z = { schema: ZAKAZNIK_SCHEMA, poznamka: '', zalozen: '', upraven: '', autor: '' };
  ZAKAZNIK_POLE.forEach(p => { z[p.id] = ''; });
  return z;
}

function _txt(v) { return String(v == null ? '' : v).trim(); }

/* Klíč záznamu. IČO je osm číslic; mezery a tečky se zahazují, aby
 * „248 348 82" a „24834882" nebyly dvě různé firmy. Bez IČO se klíč skládá
 * z názvu (bez diakritiky, malá písmena) s předponou `n-`, aby se nedal
 * splést s IČO. */
function zakaznikKlic(z) {
  const ico = _txt((z || {}).ico).replace(/[\s.]/g, '');
  if (/^\d{6,10}$/.test(ico)) return ico;
  const n = _txt((z || {}).nazev)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return n ? 'n-' + n.slice(0, 60) : '';
}

/* Porovnávací tvar názvu — pro hlášení podobných firem při zakládání. */
function zakaznikNormNazev(s) {
  /* Diakritika padá PRVNÍ, teprve pak se vyhazují právní formy — jinak by
   * se „společenství" nikdy netrefilo (v tu chvíli je z něj už
   * „spolecenstvi"). Nález z první zkoušky sady, 20. 8. 2026. */
  return _txt(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(s\s?r\s?o|a\s?s|spol|svj|spolecenstvi|vlastniku|jednotek|bytove|druzstvo)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Existuje v seznamu někdo podobný? Vrací pole karet (nikdy neblokuje —
 * jen upozorní; rozhodnutí je vždycky na člověku). */
function zakazniciPodobni(seznam, z) {
  const klic = zakaznikKlic(z);
  const norm = zakaznikNormNazev((z || {}).nazev);
  if (!norm) return [];
  return (seznam || []).filter(x => x && zakaznikKlic(x) !== klic
    && zakaznikNormNazev(x.nazev) === norm);
}

/* Hledání v seznamu: název, IČO i sídlo, bez ohledu na diakritiku
 * a velikost písmen (stejné pravidlo jako hledání v zakázkách). */
function zakazniciHledej(seznam, dotaz) {
  const q = zakaznikNormNazev(dotaz);
  const qIco = _txt(dotaz).replace(/[\s.]/g, '');
  if (!q && !qIco) return (seznam || []).slice();
  return (seznam || []).filter(z => {
    if (!z) return false;
    if (qIco && _txt(z.ico).replace(/[\s.]/g, '').includes(qIco)) return true;
    const kde = zakaznikNormNazev(z.nazev) + ' ' + zakaznikNormNazev(z.sidlo);
    return q ? kde.includes(q) : false;
  });
}

/* ---------- karta ⇄ zakázka ---------- */

function _zeZakazky(zak, p) {
  const z = zak || {};
  if (p.zak) return _txt(z[p.zak]);
  return _txt((z.zastupci || {})[p.zast]);
}

/* Návrh karty z otevřené zakázky (tlačítko „Uložit jako zákazníka"). */
function zakaznikZeZakazky(zak) {
  const z = zakaznikNovy();
  ZAKAZNIK_POLE.forEach(p => { z[p.id] = _zeZakazky(zak, p); });
  return z;
}

/* Vtiskne kartu do zakázky. Přepisuje jen NEPRÁZDNÉ hodnoty karty —
 * prázdné pole karty neznamená „vymaž to v zakázce" (pravidlo „prázdno
 * není nula" platí i tady). Vrací počet změněných polí. */
function zakaznikDoZakazky(z, zak) {
  if (!z || !zak) return 0;
  if (!zak.zastupci || typeof zak.zastupci !== 'object') zak.zastupci = {};
  let n = 0;
  ZAKAZNIK_POLE.forEach(p => {
    const v = _txt(z[p.id]);
    if (!v) return;
    if (p.zak) { if (_txt(zak[p.zak]) !== v) { zak[p.zak] = v; n++; } }
    else if (_txt(zak.zastupci[p.zast]) !== v) { zak.zastupci[p.zast] = v; n++; }
  });
  zak.zakaznikId = zakaznikKlic(z);
  return n;
}

/* Vtiskne kartu do zakázky, ale JEN DO PRÁZDNÝCH POLÍ (22. 8. 2026, zadání
 * J. V.: „po načtení z našeptávače se stále do hlavičky nedotahuje kontaktní
 * osoba a IČO").
 *
 * Proč jinak než `zakaznikDoZakazky`: tlačítko „Vybrat z databáze zákazníků"
 * je vědomé rozhodnutí přenést kartu celou, takže smí přepsat i vyplněné
 * pole. Výběr jména z našeptávače je ale jen dopsání jména — kdo si do
 * hlavičky předtím zapsal vlastní kontaktní osobu (třeba technika na stavbě
 * místo jednatele z karty), o ni přijít nesmí. Co se liší, se proto nepřepíše
 * a vrátí se to v `kolize`, aby o tom šlo říct nahlas.
 *
 * Vrací { vyplneno, kolize: [label] }. Název zákazníka se sem záměrně
 * nepočítá — ten už je v poli napsaný, jinak by se karta nenašla. */
function zakaznikDoZakazkyPrazdne(z, zak) {
  const out = { vyplneno: 0, kolize: [] };
  if (!z || !zak) return out;
  if (!zak.zastupci || typeof zak.zastupci !== 'object') zak.zastupci = {};
  ZAKAZNIK_POLE.forEach(p => {
    const v = _txt(z[p.id]);
    if (!v) return;
    const stav = _zeZakazky(zak, p);
    if (!stav) {
      if (p.zak) zak[p.zak] = v; else zak.zastupci[p.zast] = v;
      out.vyplneno++;
    } else if (stav !== v && p.id !== 'nazev') {
      out.kolize.push(p.label);
    }
  });
  zak.zakaznikId = zakaznikKlic(z);
  return out;
}

/* Karta podle názvu — pro našeptávač, který zná jen napsané jméno.
 * Porovnává se přes `zakaznikNormNazev`, takže nezáleží na diakritice,
 * velikosti písmen ani na „s.r.o." × „s. r. o.". */
function zakaznikPodleNazvu(seznam, nazev) {
  const q = zakaznikNormNazev(nazev);
  if (!q) return null;
  return (seznam || []).find(z => zakaznikNormNazev(z && z.nazev) === q) || null;
}

/* Co se v zakázce liší od karty. Vrací [{ id, label, karta, zakazka }] —
 * jen pole, kde zakázka NĚCO má a karta má něco jiného (nebo nic).
 * Prázdné pole v zakázce se nehlásí: nevyplnění není změna. */
function zakaznikRozdily(z, zak) {
  const out = [];
  ZAKAZNIK_POLE.forEach(p => {
    const vZak = _zeZakazky(zak, p);
    const vKarta = _txt((z || {})[p.id]);
    if (vZak && vZak !== vKarta) out.push({ id: p.id, label: p.label, karta: vKarta, zakazka: vZak });
  });
  return out;
}

/* ---------- kontaktní osoby karty (22. 8. 2026, zadání J. V.) ----------
 * Karta nese až čtyři jména: kontaktní osobu a zástupce ve věcech smluvních,
 * obchodních a technických. Když obchodník v hlavičce vybere firmu
 * našeptávačem, chce rovnou i kontakt — a má-li firma jmen víc, chce si
 * vybrat. Tady se jména posbírají bez duplicit, s popisem role a kontakty
 * (telefon/e-mail jen jako nápověda v seznamu, do hlavičky jde jméno). */
const ZAKAZNIK_KONTAKTY = [
  { jmeno: 'kontaktOsoba', role: 'kontaktní osoba' },
  { jmeno: 'smluvniJmeno', role: 've věcech smluvních', tel: 'smluvniTel', email: 'smluvniEmail' },
  { jmeno: 'obchodniJmeno', role: 've věcech obchodních', tel: 'obchodniTel', email: 'obchodniEmail' },
  { jmeno: 'technickyJmeno', role: 've věcech technických', tel: 'technickyTel', email: 'technickyEmail' },
];
function zakaznikKontakty(z) {
  const out = [];
  if (!z) return out;
  ZAKAZNIK_KONTAKTY.forEach(k => {
    const jmeno = _txt(z[k.jmeno]);
    if (!jmeno) return;
    const dup = out.find(o => o.jmeno.toLowerCase() === jmeno.toLowerCase());
    if (dup) {                                   // totéž jméno v další roli: sloučit, kontakt doplnit
      dup.role += ', ' + k.role;
      if (!dup.tel && k.tel) dup.tel = _txt(z[k.tel]);
      if (!dup.email && k.email) dup.email = _txt(z[k.email]);
      return;
    }
    out.push({ jmeno, role: k.role, tel: _txt(k.tel ? z[k.tel] : ''), email: _txt(k.email ? z[k.email] : '') });
  });
  return out;
}

/* Předvyplnění hlavičky po výběru firmy našeptávačem. Vyplňuje se jen to, co
 * je v hlavičce PRÁZDNÉ (zakázka je pán — přepsané hodnoty se nepřebíjejí),
 * a kontakt jen tehdy, když je jednoznačný; víc jmen vrací k výběru.
 * Vrací { zmeny, kontakty } — `kontakty` má smysl jen při více jménech. */
function zakaznikPredvypln(z, zak) {
  const zmeny = [];
  if (!z || !zak) return { zmeny, kontakty: [] };
  const vypln = (cil, hodnota) => {
    const v = _txt(hodnota);
    if (v && !_txt(zak[cil])) { zak[cil] = v; zmeny.push(cil); }
  };
  vypln('objednatel', z.nazev);
  vypln('ico', z.ico);
  vypln('dic', z.dic);
  vypln('adresaObjednatele', z.sidlo);
  const kontakty = zakaznikKontakty(z);
  if (kontakty.length === 1) vypln('kontakt', kontakty[0].jmeno);
  zak.zakaznikId = zakaznikKlic(z);
  return { zmeny, kontakty: kontakty.length > 1 ? kontakty : [] };
}

/* Přijetí rozdílů do karty (po potvrzení člověkem). */
function zakaznikPrevezmi(z, rozdily) {
  (rozdily || []).forEach(r => { if (r && r.id) z[r.id] = r.zakazka; });
  return z;
}

/* Očista přijatého záznamu — server nesmí uložit, co mu kdo pošle.
 * Neznámé klíče se zahazují, hodnoty se ořezávají na rozumnou délku. */
function zakaznikOciste(vstup, kdo, kdy) {
  const v = vstup || {};
  const z = zakaznikNovy();
  ZAKAZNIK_POLE.forEach(p => { z[p.id] = _txt(v[p.id]).slice(0, 300); });
  /* IČO se ukládá bez mezer a teček — jinak by „248 348 82" a „24834882"
   * byly dvě karty pro jednu firmu (klíč se počítá z očištěné podoby). */
  if (/^[\d\s.]+$/.test(z.ico)) z.ico = z.ico.replace(/[\s.]/g, '');
  z.poznamka = _txt(v.poznamka).slice(0, 2000);
  z.zalozen = _txt(v.zalozen) || _txt(kdy);
  z.upraven = _txt(kdy);
  z.autor = _txt(v.autor) || _txt(kdo);
  z.upravil = _txt(kdo);
  return z;
}

if (typeof module !== 'undefined')
  module.exports = { ZAKAZNIK_KONTAKTY, zakaznikKontakty, zakaznikPredvypln, ZAKAZNIK_SCHEMA, ZAKAZNIK_POLE, zakaznikNovy, zakaznikKlic,
    zakaznikNormNazev, zakazniciPodobni, zakazniciHledej, zakaznikZeZakazky,
    zakaznikDoZakazky, zakaznikRozdily, zakaznikPrevezmi, zakaznikOciste };
