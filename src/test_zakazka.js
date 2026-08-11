/* ============================================================
 * Test zakazka.js – datový model zakázky, hlavičky, IČO, migrace
 *
 * PROČ TAHLE SADA
 *
 * `zakazka.js` je jediné místo, kterým prochází KAŽDÁ uložená nabídka:
 * zakládá ji, přijímá zpátky ze souboru a cestou dopisuje pole, která
 * v době uložení ještě neexistovala. Chyba tady se neprojeví jako pád —
 * projeví se jako nabídka, ve které něco chybí nebo je něco navíc, a to
 * až u zákazníka.
 *
 * Sada se drží čtyř věcí, které se v tomhle modulu rozbíjejí opakovaně:
 *
 *  1) VÝCHOZÍ TVAR. Nová zakázka musí mít všechna pole, se kterými zbytek
 *     aplikace počítá, a musí být vlastní kopií výchozích dat — dvě
 *     varianty téže zakázky si nesmějí sahat do stejného objektu.
 *  2) DVĚ NEZÁVISLÉ HLAVIČKY. OCK sedí přímo na zakázce, PROJ v
 *     `projHlavicka`. Nic se mezi nimi nepropisuje samo; přenos je jen na
 *     výslovné vyžádání. Pro VÝSTUPY přitom platí opak: prázdné pole PROJ
 *     se čte z OCK, aby na krycím listu nechyběl název akce.
 *  3) IČO. Osmimístné číslo s překlepem vypadá jako IČO a projde přes
 *     každou kontrolu, která počítá jen znaky. Kontrolní součet mod 11 je
 *     jediné, co ho odhalí. Prázdné IČO ale chyba není — nabídka odchází
 *     často dřív, než je objednatel jistý.
 *  4) MIGRACE. Zakázka uložená před měsícem nezná pole přidaná od té doby.
 *     Migrace je smí DOPLNIT, nikdy PŘEPSAT — a hlavně nesmí nic
 *     odhadovat: dosazená hodnota, kterou nikdo nezadal, skončí ve
 *     smlouvě.
 *
 * Vedle téhle sady stojí test_hlavicka.js (ruční přenos hlaviček) a
 * test_ico.js (IČO napříč hlavičkami, protokolem a kontrolami). Tady jde
 * o samotný modul: jeho výchozí tvar, varianty a průchod export → import.
 * ============================================================ */

/* V prohlížeči jsou všechny moduly v jednom scope, v Node ne — co
 * zakazka.js čeká jako globál, se sem doplní ručně. Kdyby některý guard
 * `typeof … === 'function'` nenašel svou funkci, migrace by tichounce
 * přeskočila a sada by ověřovala jiný kód, než jaký běží v aplikaci. */
const nacti = (f) => { const m = require(f); Object.keys(m).forEach(k => { if (global[k] === undefined) global[k] = m[k]; }); return m; };
const ZC = require('./zkusebni_cenik.js');
nacti('./engine.js');
global.DEFAULT_CENIK = ZC.zkusebniCenik();
nacti('./engine_proj.js');
global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
nacti('./techspec.js');
nacti('./sleva.js');          // roleMigruj – migrace rolí u slevy
nacti('./zaokrouhleni.js');   // zaokrDefault, zaokrZajisti
nacti('./poznamky.js');       // poznamkyZajisti
nacti('./zamek.js');          // zajistiZamek, variantaUzamcena
nacti('./protokol.js');       // protokolZajisti
nacti('./firma.js');
nacti('./kryci.js');          // kryciMigraceZadrzne, kryciMigraceSazbaDph
nacti('./kryci_proj.js');     // kryciProjMigraceSazbaDph
const zk = nacti('./zakazka.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* Smyšlená data – ve zdrojácích nesmí být skutečný zákazník ani cena. */
const OBJEDNATEL = 'Zkušební ocelárna s.r.o.';
const KONTAKT = 'Jan Zkušební';
const ICO_PLATNE = '12345679';      // kontrolní číslice sedí
const ICO_PREKLEP = '12345678';     // vypadá stejně, mod 11 nesedí

const kopie = (x) => JSON.parse(JSON.stringify(x));

/* ============================================================
 * 1) Nová zakázka a její výchozí tvar
 * ============================================================ */

const z = zk.novaZakazka();

test('nová zakázka nese číslo schématu, podle kterého se pozná při importu',
  z.schema === zk.ZAKAZKA_SCHEMA && z.schema >= 2, z.schema);
test('nová zakázka má předlohu čísla nabídky k dopsání pořadí',
  z.cislo === zk.ZAK_CISLO_PREDLOHA, z.cislo);
/* Předloha není vyplněné číslo. Kdyby se za vyplněné považovala, ukázal by
 * krycí list PROJ místo skutečného čísla holý útržek „2026 - OPR - CN - ". */
test('samotná předloha se za vyplněné číslo nepovažuje',
  zk.hlavickaVyplneno(z.cislo) === false);
test('dopsané pořadové číslo už vyplněné je',
  zk.hlavickaVyplneno(zk.ZAK_CISLO_PREDLOHA + '17') === true);

['nazevAkce', 'adresa', 'objednatel', 'kontakt', 'ico', 'adresaObjednatele', 'popisZameru',
 'uvodniFoto', 'uvodniFotoNazev', 'uvodniFotoPopis'].forEach(k => {
  test('nová zakázka má prázdné pole ' + k + ' (prázdný řetězec, ne undefined)',
    z[k] === '', JSON.stringify(z[k]));
});
test('nová zakázka není označená jako „jen projekce"', z.jenProj === false, z.jenProj);
test('datum zakázky je dnešek ve tvaru RRRR-MM-DD',
  /^\d{4}-\d{2}-\d{2}$/.test(z.datum), z.datum);

test('nová zakázka má právě jednu variantu', z.varianty.length === 1, z.varianty.length);
test('jediná varianta je rovnou řídící', z.varianty[0].ridici === true);
test('aktivní varianta ukazuje na existující variantu',
  z.aktivni === z.varianty[0].id, [z.aktivni, z.varianty[0].id]);

const d = z.varianty[0].data;
['ock', 'cenik', 'proj', 'techspec', 'kryci', 'kryciProj', 'zaokr', 'zaokrProj'].forEach(k => {
  test('varianta nese část ' + k, d[k] != null, Object.keys(d).join(','));
});
test('varianta má úložiště ručních hodnot krycího listu OCK i PROJ',
  !!(d.kryci.hodnoty && d.kryciProj.hodnoty));
test('projekční část má vlastní zadání i vlastní ceník',
  !!(d.proj.zadani && d.proj.cenik));
/* #38: nová varianta dostane obchodní zaokrouhlení rovnou. Podle toho se
 * pozná zakázka založená před #38 – té pole chybí a zůstane vypnuté
 * (viz migrace níže), aby se odeslaná cena nezměnila ani o korunu. */
test('nová varianta má obchodní zaokrouhlení zapnuté pro OCK i PROJ',
  d.zaokr.krok > 0 && d.zaokrProj.krok > 0, JSON.stringify([d.zaokr, d.zaokrProj]));

/* Kdyby varianta držela odkaz na DEFAULT_ZADANI, přepsala by změna v jedné
 * zakázce výchozí zadání pro všechny další v témže sezení. */
const zA = zk.novaZakazka(), zB = zk.novaZakazka();
zA.varianty[0].data.ock.zadani.nastupiste = 99;
test('zadání varianty je vlastní kopie, ne odkaz na výchozí data',
  zB.varianty[0].data.ock.zadani.nastupiste !== 99
  && global.DEFAULT_ZADANI.nastupiste !== 99, zB.varianty[0].data.ock.zadani.nastupiste);
zA.varianty[0].data.cenik.__zkouska = 'X';
test('ceník varianty je vlastní kopie', zB.varianty[0].data.cenik.__zkouska === undefined);
zA.varianty[0].data.techspec.__zkouska = 'X';
test('technická specifikace varianty je vlastní kopie', zB.varianty[0].data.techspec.__zkouska === undefined);
/* Mělká kopie by prošla všemi testy výše a rozbila se až u profilů – ty
 * leží o patro níž a mění se v každé druhé zakázce (jiný jekl sloupku). */
zA.varianty[0].data.ock.zadani.profily.sloupek.tl = 9;
test('kopie zadání sahá i do vnořených profilů',
  zB.varianty[0].data.ock.zadani.profily.sloupek.tl !== 9,
  zB.varianty[0].data.ock.zadani.profily.sloupek.tl);

/* ============================================================
 * 2) Varianty – řídící, přidání, kopie
 * ============================================================ */

const zv = zk.novaZakazka();
const v1 = zv.varianty[0];
const v2 = zk.novaVarianta('Varianta 2');
zv.varianty.push(v2);

test('nová varianta dostane vlastní id', v1.id !== v2.id, [v1.id, v2.id]);
test('přidaná varianta se řídící nestane sama od sebe', v2.ridici === false);
test('nová varianta si nese razítko vzniku i poslední úpravy',
  !!v2.vytvoreno && !!v2.upraveno);
test('varianta bez zadaného názvu se jmenuje Varianta 1',
  zk.novaVarianta().nazev === 'Varianta 1', zk.novaVarianta().nazev);

zk.nastavRidici(zv, v2.id);
test('řídící je vždy právě jedna varianta',
  zv.varianty.filter(v => v.ridici).length === 1, zv.varianty.map(v => v.ridici).join(','));
test('nastavRidici označí zvolenou variantu', zk.ridiciVarianta(zv).id === v2.id);
test('nastavRidici odznačí tu předchozí', v1.ridici === false);

/* Když se řídící varianta ztratí (smazání, ručně upravený soubor), nesmí
 * zůstat aplikace bez zakázky – bere se první. */
zv.varianty.forEach(v => { v.ridici = false; });
test('bez označené řídící se bere první varianta', zk.ridiciVarianta(zv).id === v1.id);
zk.nastavRidici(zv, v2.id);

zv.aktivni = v2.id;
test('aktivní varianta se najde podle id', zk.aktivniVarianta(zv).id === v2.id);
zv.aktivni = 'neexistujici-id';
test('neznámé id aktivní varianty spadne na první, ne na undefined',
  zk.aktivniVarianta(zv).id === v1.id, zk.aktivniVarianta(zv));
zv.aktivni = v1.id;

/* Kopie varianty (tlačítko „Duplikovat"): stejná data, ale vlastní id a
 * vlastní objekt. Kdyby si kopie s předlohou sdílela data, měnila by změna
 * ceny v kopii i cenu v původní variantě – a obchodník porovnává právě je. */
const vKopie = zk.novaVarianta(v1.nazev + ' (kopie)', kopie(v1.data));
zv.varianty.push(vKopie);
test('kopie varianty má vlastní id', vKopie.id !== v1.id, vKopie.id);
test('kopie varianty přebírá data předlohy',
  JSON.stringify(vKopie.data) === JSON.stringify(v1.data));
vKopie.data.ock.zadani.nastupiste = 42;
test('změna v kopii nezmění předlohu',
  v1.data.ock.zadani.nastupiste !== 42, v1.data.ock.zadani.nastupiste);
test('kopie se řídící variantou nestane', vKopie.ridici === false);

/* ============================================================
 * 3) IČO objednatele
 * ============================================================ */

/* Lidé IČO opisují z faktury i s mezerami. Trestat je za to nemá smysl. */
test('mezery uvnitř IČO se zahazují', zk.icoNormalizuj('123 456 79') === '12345679');
test('mezery na krajích se zahazují', zk.icoNormalizuj('  12345679  ') === '12345679');
test('IČO s mezerami je platné', zk.icoPlatne('123 456 79') === true);
test('chybějící hodnota se normalizuje na prázdný řetězec, ne na „null"',
  zk.icoNormalizuj(null) === '' && zk.icoNormalizuj(undefined) === '');
test('číslo na vstupu se převede na text', zk.icoNormalizuj(12345679) === '12345679');

/* „CZ12345679" je DIČ, ne IČO. Tiché uříznutí prefixu by ze špatně
 * vyplněného pole udělalo správně vyplněné a do rejstříku by odešel
 * dotaz na něco jiného, než co člověk napsal. */
test('DIČ se za IČO nevydává (prefix se neuřízne)', zk.icoPlatne('CZ12345679') === false);
test('IČO s pomlčkami neprojde', zk.icoPlatne('1234-5679') === false);
test('sedmimístné číslo neprojde', zk.icoPlatne('1234567') === false);
test('devítimístné číslo neprojde', zk.icoPlatne('123456790') === false);

test('platné IČO projde kontrolním součtem', zk.icoPlatne(ICO_PLATNE) === true);
/* Tohle je celý důvod, proč se nekontroluje jen délka: liší se poslední
 * číslicí a na pohled je od platného IČO k nerozeznání. */
test('překlep v poslední číslici kontrolní součet odhalí', zk.icoPlatne(ICO_PREKLEP) === false);
/* Dvě větve výpočtu kontrolní číslice, na které se snadno zapomene:
 * zbytek 0 → číslice 1, zbytek 1 → číslice 0. */
test('IČO se zbytkem 0 (kontrolní číslice 1) je platné', zk.icoPlatne('00000001') === true);
test('IČO se zbytkem 1 (kontrolní číslice 0) je platné', zk.icoPlatne('00000060') === true);

/* Prázdné IČO NENÍ chyba – jen prázdno. Kdyby se hlásilo jako neplatné,
 * svítilo by varování u každé nabídky, která odchází dřív, než je
 * objednatel potvrzený, a lidé by si na varování zvykli. */
test('prázdné IČO se nepovažuje za vyplněné', zk.icoVyplneno('') === false);
test('samé mezery se za vyplněné IČO nepovažují', zk.icoVyplneno('   ') === false);
test('chybějící IČO se za vyplněné nepovažuje',
  zk.icoVyplneno(null) === false && zk.icoVyplneno(undefined) === false);
test('vyplněné IČO se pozná i s překlepem (vyplněnost ≠ platnost)',
  zk.icoVyplneno(ICO_PREKLEP) === true && zk.icoPlatne(ICO_PREKLEP) === false);
test('nová zakázka má IČO prázdné, ne vymyšlené', z.ico === '');

/* ============================================================
 * 4) Dvě nezávislé hlavičky (OCK a PROJ)
 * ============================================================ */

const zh = zk.novaZakazka();
zh.cislo = '2026 - OPR - CN - 101';
zh.nazevAkce = 'Zkušební vestavba šachty';
zh.adresa = 'Zkušební 1, Zkušebín';
zh.objednatel = OBJEDNATEL;
zh.kontakt = KONTAKT;
zh.ico = ICO_PLATNE;
zh.adresaObjednatele = 'Sídlištní 2, Zkušebín';

test('obě hlavičky mají stejnou sadu polí',
  zk.ZAK_HLAVICKA_POLE.every(k => zh[k] !== undefined && zh.projHlavicka[k] !== undefined),
  zk.ZAK_HLAVICKA_POLE.join(','));
/* Kdyby se jedna hlavička propisovala do druhé, přišel by projektant
 * o vlastního objednatele pokaždé, když obchodník opraví hlavičku OCK. */
test('zápis do hlavičky OCK se do PROJ nepropisuje',
  zh.projHlavicka.objednatel === '' && zh.projHlavicka.ico === '',
  JSON.stringify(zh.projHlavicka));
zh.projHlavicka.objednatel = 'Zkušební projekce s.r.o.';
test('zápis do hlavičky PROJ se do OCK nepropisuje', zh.objednatel === OBJEDNATEL);
test('odlišné hlavičky se hlásí jako odlišné', zk.zakazkaHlavickyShodne(zh) === false);

/* Pro VÝSTUPY (krycí list PROJ, nabídka PROJ) platí opak: prázdné pole se
 * dočte z OCK, aby na dokumentu nechyběl název akce jen proto, že se
 * hlavička ručně nepřevzala. Do dat se přitom nic nezapisuje. */
const ef = zk.projHlavickaEfektivni(zh);
test('prázdné pole hlavičky PROJ se pro výstup dočte z OCK',
  ef.nazevAkce === 'Zkušební vestavba šachty' && ef.adresa === 'Zkušební 1, Zkušebín', JSON.stringify(ef));
test('vyplněné pole hlavičky PROJ má přednost před OCK',
  ef.objednatel === 'Zkušební projekce s.r.o.', ef.objednatel);
test('čtení efektivní hlavičky nic nezapíše do dat',
  zh.projHlavicka.nazevAkce === '', JSON.stringify(zh.projHlavicka.nazevAkce));
test('popisek pozná, že hodnota přišla z hlavičky OCK',
  zk.projHlavickaZOck(zh, 'nazevAkce') === true && zk.projHlavickaZOck(zh, 'objednatel') === false);
/* Nedopsaná předloha čísla se za vyplněnou nepovažuje – jinak by se do
 * dokumentu dostal útržek místo čísla z druhé hlavičky. */
test('nedopsaná předloha čísla v PROJ se nahradí číslem z OCK',
  ef.cislo === '2026 - OPR - CN - 101', ef.cislo);
test('číslo nabídky PROJ se zatím bere z hlavičky OCK',
  zk.projCisloNabidky(zh) === '2026 - OPR - CN - 101', zk.projCisloNabidky(zh));
const zBezCislaOck = zk.novaZakazka();
zBezCislaOck.projHlavicka.cislo = '2026 - OVP - CN - 5';
test('když číslo v OCK chybí, použije se vlastní číslo hlavičky PROJ',
  zk.projCisloNabidky(zBezCislaOck) === '2026 - OVP - CN - 5', zk.projCisloNabidky(zBezCislaOck));

/* Ruční přenos – volá se jen z tlačítka, nikdy sám. */
const kolize = zk.zakazkaHlavickaKolize(zh, 'doProj');
test('kolize hlásí pole, které by se přepsalo jinou neprázdnou hodnotou',
  kolize.includes('objednatel'), kolize.join(','));
test('kolize nehlásí pole, které je v cíli prázdné',
  !kolize.includes('nazevAkce') && !kolize.includes('adresa'), kolize.join(','));
zk.zakazkaKopirujHlavicku(zh, 'doProj');
test('přenos OCK → PROJ přepíše celou hlavičku PROJ',
  zh.projHlavicka.objednatel === OBJEDNATEL && zh.projHlavicka.ico === ICO_PLATNE);
test('přenos OCK → PROJ nechá hlavičku OCK být', zh.objednatel === OBJEDNATEL);
test('po přenosu jsou hlavičky shodné', zk.zakazkaHlavickyShodne(zh) === true);
zh.projHlavicka.objednatel = 'Zkušební projekce s.r.o.';
zk.zakazkaKopirujHlavicku(zh, 'doOck');
test('přenos PROJ → OCK funguje i opačným směrem',
  zh.objednatel === 'Zkušební projekce s.r.o.', zh.objednatel);

/* Čtení hlavičky PROJ ze staré zakázky, která ji ještě nemá, nesmí do dat
 * zapisovat – čte se i u cizích a jen prohlížených souborů. */
const stara = kopie(zk.novaZakazka());
stara.objednatel = OBJEDNATEL;
delete stara.projHlavicka;
const cteni = zk.projHlavicka(stara);
test('hlavička PROJ se u staré zakázky odvodí z OCK', cteni.objednatel === OBJEDNATEL);
test('samotné čtení hlavičku do dat nezaloží', stara.projHlavicka === undefined);
test('čtení hlavičky nespadne ani na chybějící zakázce',
  JSON.stringify(zk.projHlavicka(null)) === '{}');

/* zajistiProjHlavicku naopak zapisuje – ale jen chybějící pole. */
const zajisti = kopie(zk.novaZakazka());
zajisti.nazevAkce = 'Akce OCK';
zajisti.projHlavicka = { nazevAkce: 'Akce PROJ' };
zk.zajistiProjHlavicku(zajisti);
test('doplnění hlavičky PROJ nepřepíše hodnotu, kterou tam někdo napsal',
  zajisti.projHlavicka.nazevAkce === 'Akce PROJ', zajisti.projHlavicka.nazevAkce);
test('doplnění hlavičky PROJ převezme chybějící pole z OCK',
  zk.ZAK_HLAVICKA_POLE.every(k => zajisti.projHlavicka[k] != null),
  JSON.stringify(zajisti.projHlavicka));

/* ============================================================
 * 5) Migrace starších uložených zakázek
 * ============================================================ */

/* Zakázka „uložená dřív": nová zakázka, ze které se odeberou pole přidaná
 * v pozdějších verzích. Přesně tak vypadá soubor na disku obchodníka. */
function starsiZakazka() {
  const s = kopie(zk.novaZakazka());
  delete s.ico; delete s.adresaObjednatele; delete s.jenProj; delete s.popisZameru;
  delete s.uvodniFoto; delete s.uvodniFotoNazev; delete s.uvodniFotoPopis;
  delete s.projHlavicka;
  const dv = s.varianty[0].data;
  delete dv.techspec; delete dv.kryci; delete dv.kryciProj;
  delete dv.zaokr; delete dv.zaokrProj;
  delete dv.proj.cenik.fixy; delete dv.proj.cenik.dph;
  return s;
}

const sm = zk.importZakazka(starsiZakazka());
['ico', 'adresaObjednatele', 'popisZameru', 'uvodniFoto', 'uvodniFotoNazev', 'uvodniFotoPopis'].forEach(k => {
  test('migrace doplní chybějící pole ' + k + ' jako prázdné',
    sm[k] === '', JSON.stringify(sm[k]));
});
test('migrace doplní příznak „jen projekce" jako vypnutý', sm.jenProj === false);
test('migrace doplní hlavičku PROJ', !!sm.projHlavicka && sm.projHlavicka.cislo != null);
test('migrace doplní technickou specifikaci', !!sm.varianty[0].data.techspec);
test('migrace doplní obě úložiště krycích listů',
  !!(sm.varianty[0].data.kryci.hodnoty && sm.varianty[0].data.kryciProj.hodnoty));
test('migrace doplní fixní náklady do ceníku projekce', !!sm.varianty[0].data.proj.cenik.fixy);
test('migrace doplní zápisník a přílohy, aby první zápis nespadl',
  Array.isArray(sm.poznamky) && Array.isArray(sm.prilohy));
test('migrace založí prázdný protokol o kalkulaci', Array.isArray(sm.protokol));

/* Sazba DPH projekční části: dokud ji projekce neměla vlastní, platila
 * sazba z ceníku OCK. Dosadit místo ní dnešní výchozí sazbu by změnilo
 * cenu už odeslané nabídky. */
const sDph = starsiZakazka();
sDph.varianty[0].data.cenik.dph = 0.15;
const mDph = zk.importZakazka(sDph);
test('projekce převezme dosud platnou sazbu DPH z ceníku OCK, ne dnešní výchozí',
  mDph.varianty[0].data.proj.cenik.dph === 0.15, mDph.varianty[0].data.proj.cenik.dph);

/* #38: varianta založená před obchodním zaokrouhlením ho dostane VYPNUTÉ.
 * Kdyby se dosadila dnešní výchozí hodnota, změnila by se cena nabídky,
 * která už mohla odejít zákazníkovi. */
test('starší varianta má obchodní zaokrouhlení vypnuté, ne výchozí',
  sm.varianty[0].data.zaokr.krok === 0 && sm.varianty[0].data.zaokrProj.krok === 0,
  JSON.stringify([sm.varianty[0].data.zaokr, sm.varianty[0].data.zaokrProj]));
/* Rozdělení zaokrouhlení na OCK a PROJ nesmí cenu hnout ani o korunu:
 * varianta s jedním společným nastavením ho dostane do obou částí. */
const sZaokr = starsiZakazka();
sZaokr.varianty[0].data.zaokr = { krok: 500, smer: 'nahoru' };
const mZaokr = zk.importZakazka(sZaokr);
test('společné zaokrouhlení se rozdělí do obou částí beze změny hodnoty',
  mZaokr.varianty[0].data.zaokr.krok === 500 && mZaokr.varianty[0].data.zaokrProj.krok === 500,
  JSON.stringify(mZaokr.varianty[0].data.zaokrProj));

/* Migrace NIKDY nepřepíše, co už v datech je. */
const sVyplnena = starsiZakazka();
sVyplnena.ico = ICO_PLATNE;
sVyplnena.adresaObjednatele = 'Sídlištní 2, Zkušebín';
sVyplnena.jenProj = true;
sVyplnena.popisZameru = 'Zkušební popis záměru.';
const mVyplnena = zk.importZakazka(sVyplnena);
test('migrace nepřepíše vyplněné IČO', mVyplnena.ico === ICO_PLATNE, mVyplnena.ico);
test('migrace nepřepíše vyplněné sídlo objednatele',
  mVyplnena.adresaObjednatele === 'Sídlištní 2, Zkušebín');
test('migrace nepřepíše zapnutý příznak „jen projekce"', mVyplnena.jenProj === true);
test('migrace nepřepíše vyplněný popis záměru', mVyplnena.popisZameru === 'Zkušební popis záměru.');

/* Sídlo objednatele zůstává PRÁZDNÉ, i když adresa stavby vyplněná je.
 * Dosadit sem adresu stavby by jen zopakovalo chybu, kvůli které se pole
 * oddělilo – developer sídlí v Praze a staví v Ostravě. */
const sAdresa = starsiZakazka();
sAdresa.adresa = 'Zkušební 1, Zkušebín';
const mAdresa = zk.importZakazka(sAdresa);
test('sídlo objednatele se z adresy stavby neodhaduje',
  mAdresa.adresaObjednatele === '', mAdresa.adresaObjednatele);
test('adresa stavby zůstane, kde byla', mAdresa.adresa === 'Zkušební 1, Zkušebín');

/* Migrace zádržného (KL-5): volný text „ANO 10 %" se rozpadne na přepínač
 * a procento. Ručně zadané číslo se nesmí ztratit. */
const sZadrzne = starsiZakazka();
sZadrzne.varianty[0].data.kryci = { hodnoty: { zadrzne: 'ANO do odstranění vad a nedodělků 10 %' } };
const mZadrzne = zk.importZakazka(sZadrzne).varianty[0].data.kryci.hodnoty;
test('starý text zádržného se převede na přepínač Ano', mZadrzne.zadrzne === 'Ano', mZadrzne.zadrzne);
test('procento ze starého textu zádržného se uloží do vlastního pole',
  mZadrzne.zadrzneProc === '10', mZadrzne.zadrzneProc);

/* KL-7: ruční sazba DPH se od 5. 8. 2026 nečte. Nechat ji v datech znamená
 * vozit zakázkou hodnotu, která nikde neplatí, a mást toho, kdo se do dat
 * podívá. Uklízí se v obou krycích listech. */
const sSazba = starsiZakazka();
sSazba.varianty[0].data.kryci = { hodnoty: { sazbaDph: '19 %' } };
sSazba.varianty[0].data.kryciProj = { hodnoty: { sazbaDph: '19 %' } };
const mSazba = zk.importZakazka(sSazba).varianty[0].data;
test('ruční sazba DPH se z krycího listu OCK uklidí',
  mSazba.kryci.hodnoty.sazbaDph === undefined, mSazba.kryci.hodnoty.sazbaDph);
test('ruční sazba DPH se uklidí i z krycího listu PROJ',
  mSazba.kryciProj.hodnoty.sazbaDph === undefined, mSazba.kryciProj.hodnoty.sazbaDph);

/* Rozbité ukazatele na varianty: soubor upravený ručně nebo poškozený
 * přenosem. Aplikace se nesmí ocitnout bez řídící ani bez aktivní varianty. */
const sBezRidici = kopie(zk.novaZakazka());
sBezRidici.varianty.push(zk.novaVarianta('Varianta 2'));
sBezRidici.varianty.forEach(v => { v.ridici = false; });
sBezRidici.aktivni = 'zmizelo';
const mBezRidici = zk.importZakazka(sBezRidici);
test('import doplní řídící variantu, když žádná není',
  mBezRidici.varianty.filter(v => v.ridici).length === 1 && mBezRidici.varianty[0].ridici === true);
test('import opraví aktivní variantu, když ukazuje na nic',
  mBezRidici.aktivni === mBezRidici.varianty[0].id, mBezRidici.aktivni);

/* ============================================================
 * 6) Export a import – co projde tam a zpět beze změny
 * ============================================================ */

const zEx = zk.novaZakazka();
zEx.cislo = '2026 - OPR - CN - 202';
zEx.nazevAkce = 'Zkušební vestavba šachty';
zEx.objednatel = OBJEDNATEL;
zEx.kontakt = KONTAKT;
zEx.ico = ICO_PLATNE;
zEx.adresaObjednatele = 'Sídlištní 2, Zkušebín';
zEx.projHlavicka.objednatel = 'Zkušební projekce s.r.o.';
zEx.varianty[0].data.ock.zadani.nastupiste = 4;
zEx.varianty.push(zk.novaVarianta('Varianta 2', kopie(zEx.varianty[0].data)));

const text = zk.StorageAdapter.exportuj(zEx);
test('export je čitelný JSON s odsazením', text.indexOf('\n  "schema"') >= 0);
const zpet = zk.StorageAdapter.importuj(text);

test('číslo nabídky přežije cestu tam a zpět', zpet.cislo === zEx.cislo, zpet.cislo);
test('IČO přežije cestu tam a zpět', zpet.ico === ICO_PLATNE, zpet.ico);
test('hlavička PROJ přežije cestu tam a zpět a nezamění se s OCK',
  zpet.projHlavicka.objednatel === 'Zkušební projekce s.r.o.' && zpet.objednatel === OBJEDNATEL,
  JSON.stringify([zpet.objednatel, zpet.projHlavicka.objednatel]));
test('obě varianty přežijí cestu tam a zpět i se svými id',
  zpet.varianty.length === 2 && zpet.varianty.map(v => v.id).join() === zEx.varianty.map(v => v.id).join());
test('řídící varianta zůstane tatáž', zk.ridiciVarianta(zpet).id === zk.ridiciVarianta(zEx).id);
test('zadání varianty přežije cestu tam a zpět beze změny',
  zpet.varianty[0].data.ock.zadani.nastupiste === 4, zpet.varianty[0].data.ock.zadani.nastupiste);

/* Druhý průchod už nesmí nic měnit. Kdyby migrace při každém otevření
 * něco dopisovala nebo přerovnávala, rostl by soubor s každým uložením
 * a porovnání dvou verzí zakázky by přestalo dávat smysl. */
const prvni = zk.StorageAdapter.exportuj(zpet);
const druhy = zk.StorageAdapter.exportuj(zk.StorageAdapter.importuj(prvni));
test('opakovaný import a export už soubor nemění', prvni === druhy,
  prvni.length + ' vs ' + druhy.length);

/* Starý formát v1 ({zadani, cenik, fixes}) – soubory z doby před variantami. */
const v1soubor = { zadani: Object.assign(kopie(global.DEFAULT_ZADANI),
                     { cisloNabidky: '2026 - OPR - CN - 7', nazevAkce: 'Stará zkušební akce' }),
                   cenik: kopie(global.DEFAULT_CENIK), fixes: true };
const mV1 = zk.importZakazka(v1soubor);
test('starý formát v1 se načte jako zakázka s jednou variantou',
  mV1.varianty.length === 1 && mV1.varianty[0].ridici === true);
test('starý formát v1 si přinese číslo nabídky', mV1.cislo === '2026 - OPR - CN - 7', mV1.cislo);
test('starý formát v1 si přinese název akce', mV1.nazevAkce === 'Stará zkušební akce');
test('starý formát v1 si přinese své zadání i ceník',
  !!mV1.varianty[0].data.ock.zadani && !!mV1.varianty[0].data.cenik);

/* Cizí soubor se musí ohlásit srozumitelně, ne skončit u „undefined". */
const nesmysl = (x) => { try { zk.importZakazka(x); return null; } catch (e) { return e.message; } };
test('cizí soubor skončí srozumitelnou hláškou',
  /Nezn/.test(nesmysl({ neco: 1 }) || ''), nesmysl({ neco: 1 }));
test('prázdný objekt se za zakázku nevydává', nesmysl({}) !== null);
test('null se za zakázku nevydává', nesmysl(null) !== null);
test('zakázka bez variant se za zakázku nevydává', nesmysl({ schema: 2, varianty: [] }) !== null);

/* Název souboru jde do stahování – nesmí v něm zůstat znak, který
 * operační systém nepřijme, ani mezery z předlohy čísla. */
const nazev = zk.StorageAdapter.nazevSouboru(zEx);
test('název souboru začíná „zakazka_" a končí „.json"',
  /^zakazka_.*\.json$/.test(nazev), nazev);
test('název souboru neobsahuje mezery ani lomítka', !/[\s/\\:*?"<>|]/.test(nazev), nazev);
test('zakázka bez čísla dostane náhradní název souboru',
  zk.StorageAdapter.nazevSouboru({}) === 'zakazka_nova.json', zk.StorageAdapter.nazevSouboru({}));
test('úložiště se hlásí jako souborové', zk.StorageAdapter.typ === 'file');

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
