/* ============================================================
 * ZKUŠEBNÍ CENÍK – jen pro testy, do sestavení se NEZAPÉKÁ
 *
 * Do 30. 7. 2026 nesl `engine.js` ukázkový ceník s kulatými čísly, aby se
 * aplikace dala spustit a předvést i bez připojené složky `_DB`. Zadání
 * z 30. 7. 2026 to ruší:
 *
 *   „Ukázkový ceník z aplikace prostě vymaž. S tím nabídka ven jít nesmí
 *    za žádnou cenu. Buď se z databáze natáhne ostrý ceník, anebo svítí
 *    všude nuly a není z čeho počítat."
 *
 * Důvod je obchodní, ne technický: dokud v sestavení leželo něco, co se
 * tvářilo jako ceník, existovala cesta, jak poslat zákazníkovi nabídku
 * spočítanou z vymyšlených čísel. Červený pruh na to upozorňoval, ale
 * upozornění se dá přehlédnout, nula se přehlédnout nedá.
 *
 * Testy ale nějaká čísla potřebují – ověřují, že se sečte, co se sečíst
 * má, a se samými nulami by prošly i tehdy, kdyby se nesečetlo nic.
 * Proto ta kulatá čísla nezmizela, jen se přestěhovala sem. Tenhle soubor
 * není v seznamu CORE v `build.py`, takže do `dist/*.html` nevede žádná
 * cesta – ověřuje to `test_ukazkove.js`.
 *
 * Hodnoty jsou schválně kulaté a schválně nesmyslné. Nejsou to naše ceny
 * ani jejich zaokrouhlení; jsou to čísla, u kterých se dá v hlavě spočítat,
 * kolik má vyjít. Kdyby se sem někdy dostala skutečná sazba, `zkontroluj_pred_gitem.py`
 * to nahlásí stejně jako kdekoli jinde ve stromu.
 * ============================================================ */

const ZKUSEBNI_CENIK = {
  zkusebni: true,
  marze: 0.20, dph: 0.12,
  profilasKgKc: 100,
  powertechExt: 200, powertechInt: 200,
  montazniNosnik: 1000, lemovaniKgKc: 100,
  oplechPracKc: 500, nytKc: 10, spodniRamKc: 5000, cilkoKc: 100,
  zamecnikAtypKc: 800,            /* #7 – sazba atypické zámečnické práce */
  montazHodKc: 500, vetraciMrizkaKc: 5000, transportKc: 5000,
  zastreseniM2Kc: 5000, oplechFasadaBmKc: 500,
  skloBokyKc: 2000,  skloBokyNazev: 'dvojsklo čiré (zkušební)',
  skloCelniKc: 1000, skloCelniNazev: 'bezpečnostní sklo čiré (zkušební)',
  /* praceOplasteniKc, hakyKc a lakovnaListaBm mají schválně NEkulatou
   hodnotu: kulatá se náhodou shodovala se skutečnou cenou a strážce
   (zkontroluj_pred_gitem.py, kontrola 7) to po právu hlásil. */
  praceOplasteniKc: 530, plastKotvyKc: 5000, tmeleniKc: 500,
  striskaDvurKc: 10000, cestovniKc: 10000, cisteniKc: 10000,
  prechodoveKgKc: 500, leseniVnitrniKc: 1000, leseniFix: 10000,
  leseniVnejsiKc: 500, hakyKc: 530, zabradliKc: 5000, soklBmKc: 5000,
  sken3dKc: 5000, vystupZamereniKc: 10000, engineeringKc: 10000,
  projekceHodKc: 1000, statikaKc: 1000, statikaHod: 10, rezieKancelareKc: 50000,
  stavbyvedouciHod: 40, stavbyvedouciKc: 1000,
  atypPrirazka: 0.20,
  spojovaci: { riplockM10: 5, riplockM8: 5, nordlock: 10, nytM10: 5, nytM8: 5,
               nytM6: 5, tSrouby: 100, sroubM10: 5, sroubM8: 5, sroubM6: 5,
               zavitTyc: 200, chemKotva: 200 },
  lak: { rezim: 'tomas',
         lakovnaProfilBm: 100, lakovnaListaBm: 120, lakovnaM2: 500,
         tomasProfilM2: 500, tomasListaBm: 50, tomasPlechKs: 50, tomasOplechM2: 500, tomasTercKs: 20 },
  priplatky: { vsgFolieM2: 500, sknM2: 500, zabranyPadKc: 0, medStrechaM2: 5000,
               ventilatorKc: 20000, zabranyDvereKc: 2000, madlaBmKc: 2000,
               leseniHlavaKc: 1000, montazDveriKc: 2000, prechMontKc: 1000 },
};

const ZKUSEBNI_CENIK_PROJ = {
  zkusebni: true,
  dph: 0.21,
  marze: 0.20,
  sazby: { projektant: 1000, statik: 1000, zamereni: 1000 },
  dopravaKmKc: 10,
  dopravaPausalKc: 1000,
  fixy: {
    pamatkari: 0,
    uzemniRozvoj: 0,
    pbr: 10000,
    studieOsvitu: 0,
    elektroDpz: 10000,
    ic: 20000,
    elektroDps: 10000,
    ezc: 20000,
    kolaudace: 10000,
    geodet: 0,
  },
};

/* Čerstvá kopie – testy si ceník běžně upravují a nesmí si tím rozbít
 * ostatní sady, které běží ve stejném procesu. */
const zkusebniCenik = () => JSON.parse(JSON.stringify(ZKUSEBNI_CENIK));
const zkusebniCenikProj = () => JSON.parse(JSON.stringify(ZKUSEBNI_CENIK_PROJ));

if (typeof module !== 'undefined')
  module.exports = { ZKUSEBNI_CENIK, ZKUSEBNI_CENIK_PROJ, zkusebniCenik, zkusebniCenikProj };
