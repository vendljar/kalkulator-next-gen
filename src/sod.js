/* ============================================================
 * SOD – smlouvy o dílo a plná moc (#143, 14. 8. 2026)
 *
 * Buildery smluv jsou OBÁLKY nad daty cenových nabídek:
 *   sodData      = nabidkaData      (SoD realizace nese cenu nabídky OCK)
 *   sodProjData  = nabidkaProjData  (SoD projekce nese cenu nabídky PROJ)
 * Smlouva tedy NIKDY nemůže nést jinou cenu než nabídka, ze které vzešla —
 * není tu žádný druhý výpočet, jen jiná šablona a jiné jméno souboru.
 *
 * Symboly, které aplikace zná (hlavička zakázky, FIRMA_*, ZPRAC_*, PODM_*,
 * CENA_BEZ_DPH / PROJ_CELKEM_BEZ_DPH), se v šabloně vyplní samy. Symboly,
 * které aplikace NEZNÁ (termíny, splátky, zástupci objednatele, číslo
 * smlouvy — SOD_* / SODP_* / PM_* / OBJEDNATEL_*), buildery záměrně NEPLNÍ:
 * docxgen neznámý symbol nechává v dokumentu viditelný jako {{…}}, takže
 * obchodník ve Wordu na první pohled vidí, co má doplnit. Kdyby se plnily
 * prázdnem, beze stopy by zmizely a chybějící termín by si nikdo nevšiml.
 *
 * Plná moc není smlouva o ceně — je to administrativa k OBJEKTU. Nese jen
 * firemní údaje zmocněnce ({{FIRMA_*}}) a adresu stavby; údaje zmocnitele
 * ({{PM_*}}) se doplňují ručně. Proto plná moc variantu NEZAMYKÁ
 * (viz ZAMEK_DOKUMENTY v zamek.js), zatímco obě SoD ano — podepsaná
 * smlouva se stejně jako odeslaná nabídka zpětně needituje.
 * ============================================================ */

/* Údaje objednatele pro smlouvy (19. 8. 2026). Šablony SoD používají symboly
 * OBJEDNATEL_SIDLO / OBJEDNATEL_ICO / OBJEDNATEL_DIC, které nabídky neplní —
 * smlouva pak zela {{…}} i tam, kde zakázka údaje má. Plní se JEN neprázdné
 * hodnoty: prázdný symbol musí v dokumentu zůstat viditelný k ručnímu
 * doplnění, nikdy se nesmí beze stopy nahradit prázdnem (viz hlavička
 * souboru). Ostatní symboly objednatele (zástupci, banka, účet, zápis
 * v rejstříku) aplikace nezná a dál je záměrně NEplní. */
function sodObjednatelDoplna(placeholders, zak) {
  const z = zak || {};
  const dvojice = [['OBJEDNATEL_SIDLO', z.adresaObjednatele],
                   ['OBJEDNATEL_ICO', z.ico],
                   ['OBJEDNATEL_DIC', z.dic]];
  for (const [symbol, hodnota] of dvojice) {
    const s = String(hodnota == null ? '' : hodnota).trim();
    if (s) placeholders[symbol] = s;
  }
  return placeholders;
}

/* SoD realizace (OCK) — stejná data jako nabídka OCK, jiné jméno souboru. */
function sodData(zak, varianta, jekly, lang) {
  const d = nabidkaData(zak, varianta, jekly, lang);
  const L = d.jazyk || 'cz';
  const nazev = ('SOD_' + (d.placeholders.CISLO_NABIDKY || 'CN')
    + (varianta && varianta.zakaznik ? '_' + varianta.zakaznik : '')
    + (L !== 'cz' ? '_' + L.toUpperCase() : ''));
  sodObjednatelDoplna(d.placeholders, zak);
  return Object.assign({}, d,
    { nazevSouboru: nazev.replace(/[\\/:*?"<>|]+/g, '-') });
}

/* SoD projekčních prací — stejná data jako nabídka PROJ (hlavička PROJ,
 * číslo OVP), jiné jméno souboru. */
function sodProjData(zak, varianta, lang) {
  const d = nabidkaProjData(zak, varianta, lang);
  const L = d.jazyk || 'cz';
  const nazev = ('SOD_PROJ_' + (d.placeholders.CISLO_NABIDKY || 'OVP-CN')
    + (varianta && varianta.zakaznik ? '_' + varianta.zakaznik : '')
    + (L !== 'cz' ? '_' + L.toUpperCase() : ''));
  sodObjednatelDoplna(d.placeholders, zak);
  return Object.assign({}, d,
    { nazevSouboru: nazev.replace(/[\\/:*?"<>|]+/g, '-') });
}

/* Plná moc — vyřizuje se pro OBJEKT (povolení, jednání s úřady), ne pro
 * konkrétní kalkulaci. Adresa stavby jde z hlavičky PROJ; když ji projekce
 * nemá, spadne na adresu z hlavičky OCK — objekt je jeden. */
function plnaMocData(zak, varianta) {
  const h = (typeof projHlavicka === 'function' ? projHlavicka(zak) : (zak.projHlavicka || {})) || {};
  const placeholders = Object.assign({},
    typeof firmaPlaceholders === 'function'
      ? firmaPlaceholders(typeof firmaAktualni === 'function' ? firmaAktualni() : null)
      : {});
  placeholders.ADRESA = h.adresa || zak.adresa || '';
  placeholders.NAZEV_AKCE = h.nazevAkce || zak.nazevAkce || '';
  placeholders.DATUM = (typeof datumCz === 'function') ? datumCz(zak.datum) : (zak.datum || '');
  const cislo = ((h.cislo || zak.cislo || '') + '').replace(/\s+/g, '');
  return { placeholders, jazyk: 'cz', obrazky: {},
    nazevSouboru: ('PLNA_MOC' + (cislo ? '_' + cislo : ''))
      .replace(/[\\/:*?"<>|]+/g, '-') };
}

/* registrace do jednotného registru dokumentů (dokumenty.js) */
if (typeof dokumentRegistruj === 'function') {
  dokumentRegistruj('sod', {
    nazev: 'Smlouva o dílo — realizace (OCK)', sablona: 'Sablona_SOD_REALIZACE.docx',
    builder: (zak, varianta, jekly, lang) => sodData(zak, varianta, jekly, lang),
  });
  dokumentRegistruj('sodProj', {
    nazev: 'Smlouva o dílo — projekční práce', sablona: 'Sablona_SOD_PROJEKCE.docx',
    builder: (zak, varianta, jekly, lang) => sodProjData(zak, varianta, lang),
  });
  dokumentRegistruj('plnaMoc', {
    nazev: 'Plná moc', sablona: 'Sablona_PLNA_MOC.docx',
    builder: (zak, varianta) => plnaMocData(zak, varianta),
  });
}

if (typeof module !== 'undefined')
  module.exports = { sodData, sodProjData, plnaMocData };
