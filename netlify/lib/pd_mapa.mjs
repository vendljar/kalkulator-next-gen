/* ============================================================
 * MAPA POLÍ PIPEDRIVE → POLE KALKULAČKY (9. 8. 2026, #16)
 *
 * Vlastní pole se v Pipedrive neadresují názvem, ale čtyřicetiznakovým
 * hashem (`dcf558aac1ae…`). Hash je pro každý účet jiný a v kódu nemá co
 * dělat — kdo by si zdrojáky naklonoval, dostal by aplikaci, která píše
 * do cizích polí. Mapa se proto skládá až na serveru z definic polí
 * (`GET /api/v2/dealFields`) podle NÁZVU pole.
 *
 * Párování podle názvu je záměrně volné (vzory níž), protože názvy v CRM
 * nikdo nedrží v šachu — „Splatnost", „Splatnost faktur", „splatnost (dny)"
 * mají znamenat totéž. Co se nespáruje, se nezahodí: vrací se v seznamu
 * `nezarazeno`, aby administrátor viděl, co zbylo, a mohl mapu doplnit ručně.
 *
 * Ověřeno na skutečném účtu 9. 8. 2026 (308 dealů, 1 820 organizací):
 *  · trojice splatnost 14 dní / záloha 50 % / dílčí faktura 40 % je vyplněná
 *    u 306 z 308 dealů a odpovídá výchozím hodnotám krycího listu
 *    (zbylých 10 % konečné faktury se dopočítává, pole pro ně v CRM není),
 *  · IČO je vlastní pole ORGANIZACE, ne dealu, a všech 100 nalezených hodnot
 *    prošlo kontrolním součtem mod 11,
 *  · DIČ ani fakturační adresa v CRM nejsou vůbec,
 *  · dvě číselná pole dealu, která na první pohled vypadala jako čísla týdnů,
 *    jsou ve skutečnosti odkazy na organizaci a osobu (objednatel = výtahová
 *    firma a kontakt u ní), protože deal.org_id nese investora.
 * ============================================================ */

/* Pole dealu, o která stojíme. `vzor` se zkouší na název pole v CRM. */
export const POLE_DEALU = [
  { klic: 'splatnostDni', popis: 'Splatnost faktur (dní)', vzor: /splatnost/i, typ: 'cislo' },
  { klic: 'zaloha1Proc', popis: 'Záloha / dílčí faktura č. 1 (%)', vzor: /z[áa]loh/i, typ: 'cislo' },
  { klic: 'faktura2Proc', popis: 'Dílčí faktura č. 2 (%)',
    vzor: /(d[íi]l[čc][íi].*(2|dv)|2\.?\s*(d[íi]l[čc][íi]|faktur)|druh[áa].*faktur)/i, typ: 'cislo' },
  { klic: 'zarukaMesicu', popis: 'Doba záruky (měsíců)', vzor: /z[áa]ruk/i, typ: 'cislo' },
  { klic: 'pokutaProcDen', popis: 'Smluvní pokuta (% / den)', vzor: /pokut/i, typ: 'cislo' },
  { klic: 'zadrzneProc', popis: 'Zádržné', vzor: /z[áa]dr[žz]n/i, typ: 'text' },
  { klic: 'typZakazky', popis: 'Typ zakázky', vzor: /typ\s*(zak[áa]zky|projektu|obchodu)/i, typ: 'vyber' },
  { klic: 'adresaStavby', popis: 'Adresa stavby', vzor: /(adresa|m[íi]sto)\s*(stavby|realizace|pln[ěe]n[íi])?/i, typ: 'text' },
  { klic: 'terminPlneni', popis: 'Termín plnění', vzor: /term[íi]n|pln[ěe]n[íi]|realizac/i,
    typ: 'datum', pdTyp: ['date'] },
  /* U těchhle dvou nestačí název: „Objednatel (výtahová firma)" i „Kontakt
   * objednatele" obsahují slovo objednatel, takže by si je vzory přebraly
   * navzájem. Rozhoduje proto TYP pole v Pipedrive — jedno je odkaz na
   * organizaci, druhé na osobu, a to zaměnit nejde. */
  { klic: 'objednatelFirma', popis: 'Objednatel (výtahová firma)', vzor: /(objednatel|v[ýy]tahov|firma)/i,
    typ: 'organizace', pdTyp: ['org'] },
  { klic: 'objednatelOsoba', popis: 'Kontakt u objednatele', vzor: /(kontakt|osoba)/i,
    typ: 'osoba', pdTyp: ['people', 'person'] },
];

/* Pole organizace. Zajímá nás jediné — IČO; adresa a DIČ v CRM nejsou. */
export const POLE_ORGANIZACE = [
  { klic: 'ico', popis: 'IČO', vzor: /^\s*(i[čc]o?|ic)\b/i, typ: 'cislo' },
  { klic: 'typOrganizace', popis: 'Role organizace', vzor: /(typ|role|kategorie)/i, typ: 'vyber' },
];

/* Z odpovědi `dealFields` / `organizationFields` udělá mapu klíč → hash.
 * Bere JEN vlastní pole (u standardních je `edit_flag` false a jejich klíč
 * není hash) a první shodu vzoru — kdyby účet měl „Splatnost" i „Splatnost
 * dodatku", vyhraje kratší název, protože se řadí podle délky. */
export function pdMapaZPoli(pole, definice = POLE_DEALU) {
  const vlastni = (pole || [])
    .filter((p) => p && (p.edit_flag === true || p.edit_flag === undefined))
    .filter((p) => /^[0-9a-f]{40}$/.test(String(p.key || p.field_code || '')))
    .map((p) => ({
      hash: String(p.key || p.field_code),
      nazev: String(p.name || p.field_name || ''),
      typ: String(p.field_type || ''),
      volby: Array.isArray(p.options) ? p.options : null,
    }))
    .sort((a, b) => a.nazev.length - b.nazev.length);

  const mapa = {}, popisy = {}, pouzite = new Set();
  for (const d of definice) {
    const nalez = vlastni.find((p) => !pouzite.has(p.hash)
      && (!d.pdTyp || d.pdTyp.includes(p.typ))
      && d.vzor.test(p.nazev));
    if (!nalez) continue;
    mapa[d.klic] = nalez.hash;
    popisy[d.klic] = { nazev: nalez.nazev, typ: nalez.typ, volby: nalez.volby };
    pouzite.add(nalez.hash);
  }
  return {
    mapa,
    popisy,
    chybi: definice.filter((d) => !mapa[d.klic]).map((d) => ({ klic: d.klic, popis: d.popis })),
    nezarazeno: vlastni.filter((p) => !pouzite.has(p.hash))
      .map((p) => ({ hash: p.hash, nazev: p.nazev, typ: p.typ })),
  };
}

/* Vlastní pole mají ve v2 různý tvar podle typu: číslo, text, ale
 * u výběru objekt {id,label}, u peněz {value,currency}, u adresy objekt
 * s podklíči a u vícevýběru pole. Tohle je jediné místo, kde se to rozplétá. */
export function pdHodnota(surova) {
  if (surova === null || surova === undefined) return '';
  if (Array.isArray(surova)) return surova.map(pdHodnota).filter(Boolean).join(', ');
  if (typeof surova === 'object') {
    if (surova.label !== undefined) return String(surova.label);
    if (surova.formatted_address) return String(surova.formatted_address);
    if (surova.value !== undefined) return pdHodnota(surova.value);
    return '';
  }
  return String(surova);
}

/* Číslo nabídky z názvu dealu. Na skutečném účtu tenhle tvar splňuje
 * 92,9 % dealů (`CN-84 …`), dalších 4,5 % má tvar `OPR12-2025`.
 * Když se netrefíme, vrátíme prázdno a číslo si obchodník doplní sám —
 * hádat číslo nabídky by bylo horší než ho nechat prázdné. */
export function pdCisloZNazvu(nazev) {
  const m = /^\s*(CN|OVP-CN|OPR)[\s-]*([0-9]+(?:[-/][0-9]+)?)/i.exec(String(nazev || ''));
  return m ? (m[1].toUpperCase() + '-' + m[2]) : '';
}

/* Zbytek názvu za číslem = název akce. */
export function pdNazevAkce(nazev) {
  const t = String(nazev || '').trim();
  const m = /^\s*(?:CN|OVP-CN|OPR)[\s-]*[0-9]+(?:[-/][0-9]+)?\s*[-–—:]?\s*(.*)$/i.exec(t);
  return (m && m[1].trim()) || t;
}

/* Sestaví z dealu (a volitelně z navázané organizace a osoby) hodnoty
 * pro hlavičku kalkulace a krycí list.
 *
 * Zásada: cena se NEPŘEBÍRÁ do výpočtu. `hodnotaCrm` se vrací jen pro
 * porovnání „v CRM je X, spočítali jste Y" — cena je vždycky výsledek
 * kalkulace, nikdy převzaté číslo (pravidlo projektu: ceny se nevymýšlejí). */
export function pdDealNaNase(deal, mapa, dopln = {}) {
  const d = deal || {};
  const cf = d.custom_fields || {};
  const ber = (klic) => (mapa && mapa[klic] ? pdHodnota(cf[mapa[klic]]) : '');
  const org = dopln.organizace || null;
  const osoba = dopln.osoba || null;
  const icoHash = dopln.mapaOrganizace && dopln.mapaOrganizace.ico;

  const kontakty = (o) => {
    const e = ((o && o.emails) || []).map((x) => x && x.value).filter(Boolean);
    const t = ((o && o.phones) || []).map((x) => x && x.value).filter(Boolean);
    return [e[0], t[0]].filter(Boolean).join(', ');
  };

  return {
    id: d.id,
    /* --- hlavička kalkulace --- */
    cislo: pdCisloZNazvu(d.title),
    nazevAkce: pdNazevAkce(d.title),
    adresa: ber('adresaStavby'),
    objednatel: (org && org.name) || '',
    ico: (org && icoHash && pdHodnota((org.custom_fields || {})[icoHash])) || '',
    kontakt: osoba ? [osoba.first_name, osoba.last_name].filter(Boolean).join(' ') : '',
    kontaktObjednatel: kontakty(osoba),
    /* --- krycí list --- */
    splatnostDni: ber('splatnostDni'),
    zaloha1Proc: ber('zaloha1Proc'),
    faktura2Proc: ber('faktura2Proc'),
    zarukaMesicu: ber('zarukaMesicu'),
    pokutaProcDen: ber('pokutaProcDen'),
    zadrzne: ber('zadrzneProc'),
    typZakazky: ber('typZakazky'),
    terminPlneni: ber('terminPlneni'),
    /* --- informativní, do výpočtu nevstupuje --- */
    hodnotaCrm: typeof d.value === 'number' ? d.value : null,
    mena: d.currency || '',
    faze: d.stage_id || null,
    stav: d.status || '',
    aktualizovano: d.update_time || '',
  };
}

/* Konečná faktura v CRM není — dopočítá se do sta procent. Vrací prázdno,
 * když zálohy nedávají smysl, ať se do krycího listu nedostane nesmysl. */
export function pdZbytekDoSta(zaloha, faktura2) {
  /* Prázdno není nula (pravidlo projektu). `Number('')` je nula, takže bez
   * téhle kontroly by z chybějící zálohy vyšla konečná faktura 60 % — číslo,
   * které nikdo nezadal a které by se dostalo do krycího listu. */
  if (String(zaloha).trim() === '' || String(faktura2).trim() === '') return '';
  const a = Number(String(zaloha).replace(',', '.'));
  const b = Number(String(faktura2).replace(',', '.'));
  if (!isFinite(a) || !isFinite(b)) return '';
  const z = 100 - a - b;
  return (z > 0 && z < 100) ? String(Math.round(z * 100) / 100) : '';
}
