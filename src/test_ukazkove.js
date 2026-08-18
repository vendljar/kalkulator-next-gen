/* Test značky ukázkových dat (#40).
 *
 * Značka je jediné, co odlišuje sestavení běžící z vymyšleného vzorku od
 * sestavení s načtenou složkou _DB. Když selže, aplikace vypadá stejně
 * v obou případech – a nabídka spočítaná z vymyšlených cen odejde
 * zákazníkovi bez jediného varování. Proto se tu hlídají tři věci:
 *
 *   a) značka se pozná a dá se spolehlivě sundat (i z kopie, aniž by se
 *      poškodil originál) – na tom stojí zápis do _program.json,
 *   b) stav se skládá ze VŠECH oddílů zvlášť, protože „chybí ceny" a
 *      „chybí firemní údaje" znamenají jinou práci,
 *   c) texty varují, ale nic nepřikazují ani neblokují (zadání Ad2), a
 *      krátká podoba do dokumentu vždycky řekne „neposílejte".
 *
 * A navíc: výchozí vzorek ve zdrojácích značku opravdu nese. Kdyby ji
 * někdo při úpravách ceníku smazal, varování by zhaslo a nikdo by si toho
 * nevšiml – tichá ztráta pojistky je horší než rozbitý test.
 */
/* Pozn.: testovací marže je schválně 0.42 – nesmyslné číslo, které v ceníku
 * nikdy nebude. Skutečná ceníková hodnota žije jen v _program.json ve složce
 * _DB; kdyby se objevila i tady, pripravit_github.py to po právu vyhodnotí
 * jako únik ceníku a odmítne repozitář vydat. */
const uk = require('./ukazkove.js');
const { ukazkoveJe, ukazkovePrazdny, ukazkoveOcisti, ukazkoveBez, ukazkoveStav,
        ukazkoveText, ukazkoveKratce, ukazkoveVyctem, ukazkoveSrovnejZnacku,
        UKAZKOVE_KLIC } = uk;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };

/* ---------- 1) poznání značky ---------- */
test('objekt se značkou se pozná', ukazkoveJe({ ukazkove: true }));
test('objekt bez značky se nepozná', ukazkoveJe({ marze: 0.42 }) === false);
test('vypnutá značka se nepočítá', ukazkoveJe({ ukazkove: false }) === false);
test('null ani text neshodí', ukazkoveJe(null) === false && ukazkoveJe(undefined) === false
  && ukazkoveJe('ukazkove') === false && ukazkoveJe(0) === false);

/* ---------- 2) sundání značky ---------- */
const o = { ukazkove: true, marze: 0.2 };
const vraceno = ukazkoveOcisti(o);
test('ocisti značku odstraní na místě', !(UKAZKOVE_KLIC in o), Object.keys(o).join(','));
test('ocisti nechá ostatní hodnoty být', o.marze === 0.2);
test('ocisti vrací týž objekt (ne kopii)', vraceno === o);
test('ocisti snese null', ukazkoveOcisti(null) === null);

const orig = { ukazkove: true, marze: 0.2, spojovaci: { nordlock: 10 } };
const kopie = ukazkoveBez(orig);
test('bez() vrátí kopii bez značky', !(UKAZKOVE_KLIC in kopie) && kopie.marze === 0.2);
test('bez() originál nepoškodí', orig.ukazkove === true, JSON.stringify(orig));
test('bez() je hluboká kopie', kopie.spojovaci !== orig.spojovaci
  && kopie.spojovaci.nordlock === 10);
test('bez() snese null i text', ukazkoveBez(null) === null && ukazkoveBez('x') === 'x');

/* ---------- 3) stav se skládá po oddílech ----------
 * Chybějící oddíl se nesmí počítat ani za čistý, ani za vymyšlený – jinak
 * by prázdný kontext buď falešně varoval, nebo falešně uklidňoval. */
const cisty = ukazkoveStav({ cenik: {}, cenikProj: {}, firma: {}, slevy: {} });
test('všechno skutečné → nic se nerozsvítí', cisty.jsou === false && cisty.kde.length === 0);
test('prázdný kontext nevaruje', ukazkoveStav({}).jsou === false && ukazkoveStav().jsou === false);

const jenCeny = ukazkoveStav({ cenik: { ukazkove: true }, firma: {} });
test('ukázkový ceník OCK → ceny ano, údaje ne', jenCeny.ceny === true && jenCeny.udaje === false);
test('ukázkový ceník OCK se jmenuje', jenCeny.kde.join('|') === 'ceník OCK', jenCeny.kde.join('|'));

test('ukázkový ceník projekce se počítá mezi ceny',
  ukazkoveStav({ cenikProj: { ukazkove: true } }).ceny === true);
test('ukázková slevová politika se počítá mezi ceny',
  ukazkoveStav({ slevy: { ukazkove: true } }).ceny === true);

const jenFirma = ukazkoveStav({ cenik: {}, firma: { ukazkove: true } });
test('ukázková firma → údaje ano, ceny ne', jenFirma.udaje === true && jenFirma.ceny === false);

const vse = ukazkoveStav({ cenik: { ukazkove: true }, cenikProj: { ukazkove: true },
                           slevy: { ukazkove: true }, firma: { ukazkove: true } });
test('všechny čtyři oddíly se vyjmenují', vse.kde.length === 4, vse.kde.join('|'));
test('pořadí oddílů je stálé',
  vse.kde.join('|') === 'ceník OCK|ceník projekce|slevová politika|firemní údaje', vse.kde.join('|'));

/* ---------- 4) texty ---------- */
test('čistý stav mlčí', ukazkoveText(cisty) === '' && ukazkoveKratce(cisty) === ''
  && ukazkoveVyctem(cisty) === '');
test('bez stavu se nehádá', ukazkoveText(null) === '' && ukazkoveKratce(null) === ''
  && ukazkoveVyctem(null) === '');

const tCeny = ukazkoveText(jenCeny);
test('text u cen mluví o cenách', /[Cc]eny jsou ukázkové/.test(tCeny), tCeny);
test('text u cen nemluví o firemních údajích', !/[Ff]iremní údaje/.test(tCeny), tCeny);
const tFirma = ukazkoveText(jenFirma);
test('text u firmy mluví o údajích', /[Ff]iremní údaje jsou ukázkové/.test(tFirma), tFirma);
test('text u firmy nemluví o cenách', !/^Ceny jsou/.test(tFirma), tFirma);
const tVse = ukazkoveText(vse);
test('text u obojího zmíní obojí', /Ceny i firemní údaje/.test(tVse), tVse);

test('text poradí, co s tím', [tCeny, tFirma, tVse].every(t => /_DB/.test(t) && /složk/i.test(t)));
test('text nic neblokuje ani nepřikazuje',
  !/nesmí|zakázán|blokov|nelze pokračovat/i.test(tCeny + tFirma + tVse));

/* Krátká podoba jde do dokumentu, který za chvíli odejde ven – tam musí
 * padnout výslovné „neposílejte", ne obecné konstatování. */
const kCeny = ukazkoveKratce(jenCeny), kFirma = ukazkoveKratce(jenFirma);
test('krátká podoba varuje před odesláním',
  /[Nn]eposílejte/.test(kCeny) && /[Nn]eposílejte/.test(kFirma), kCeny + ' / ' + kFirma);
test('krátká podoba u cen mluví o cenách', /UKÁZKOVÝCH cen/.test(kCeny), kCeny);
test('krátká podoba u firmy mluví o hlavičce', /firemní údaje/i.test(kFirma), kFirma);
test('krátká podoba je kratší než dlouhá', kCeny.length < tCeny.length);

/* ---------- 5) výčet do věty ---------- */
test('jeden oddíl bez spojky', ukazkoveVyctem(jenCeny) === 'ceník OCK', ukazkoveVyctem(jenCeny));
test('dva oddíly spojkou „a"',
  ukazkoveVyctem(ukazkoveStav({ cenik: { ukazkove: true }, firma: { ukazkove: true } }))
    === 'ceník OCK a firemní údaje');
test('čtyři oddíly: čárky a poslední spojkou',
  ukazkoveVyctem(vse) === 'ceník OCK, ceník projekce, slevová politika a firemní údaje',
  ukazkoveVyctem(vse));

/* ---------- 6) vzorek ve zdrojácích značku opravdu nese ----------
 * Tohle je ta část, která by při tiché ztrátě značky spadla. Bez ní by
 * všechno výš mohlo být zelené a varování by v aplikaci přesto nesvítilo. */
const eng = require('./engine.js');
const ep = require('./engine_proj.js');
const fm = require('./firma.js');
test('DEFAULT_CENIK je označený jako ukázkový', ukazkoveJe(eng.DEFAULT_CENIK));
test('DEFAULT_CENIK_PROJ je označený jako ukázkový', ukazkoveJe(ep.DEFAULT_CENIK_PROJ));
test('DEFAULT_FIRMA je označená jako ukázková', ukazkoveJe(fm.DEFAULT_FIRMA));

/* NAST není modul pro Node (žije v ui/common.js), takže se čte jako text. */
const fs = require('fs');
const COMMON = fs.readFileSync(__dirname + '/ui/common.js', 'utf8');
const blokSlevy = COMMON.slice(COMMON.indexOf('slevy: {'), COMMON.indexOf('schemata:'));
test('výchozí slevová politika je označená jako ukázková',
  /ukazkove:\s*true/.test(blokSlevy), blokSlevy.slice(0, 120));

/* A naopak: skutečná data ze složky značku nemají – kdyby ji měla, varování
 * by po připojení složky nikdy nezhaslo. */
test('kopie ceníku určená k zápisu do složky je bez značky',
  !(UKAZKOVE_KLIC in ukazkoveBez(eng.DEFAULT_CENIK)));

/* ---------- 7) ceníky ve zdrojácích jsou PRÁZDNÉ, ne ukázkové ----------
 * Zadání z 30. 7. 2026: „Ukázkový ceník z aplikace prostě vymaž. S tím
 * nabídka ven jít nesmí za žádnou cenu." Kdyby se sem někdo pokusil vrátit
 * kulaté vzorové číslo (nejspíš v dobré víře, aby šlo aplikaci předvést),
 * spadne tenhle oddíl. To je jeho jediný účel. */
test('DEFAULT_CENIK nese značku prázdného ceníku', ukazkovePrazdny(eng.DEFAULT_CENIK));
test('DEFAULT_CENIK_PROJ nese značku prázdného ceníku', ukazkovePrazdny(ep.DEFAULT_CENIK_PROJ));
test('firemní údaje prázdné NEJSOU – jsou jen ukázkové',
  ukazkovePrazdny(fm.DEFAULT_FIRMA) === false);

/* Tři výjimky jsou vědomé a zdůvodněné v engine.js: dph je zákonná sazba
 * (nula by tiše vyrobila špatně zdaněný dokument místo zjevně prázdného),
 * lak.rezim je přepínač režimu a *Nazev jsou názvy zboží, ne částky. */
const VYJIMKY = new Set(['dph', 'rezim', 'skloBokyNazev', 'skloCelniNazev',
                         'ukazkove', 'prazdny']);
function nenulove(o, cesta) {
  const nalez = [];
  Object.keys(o || {}).forEach(k => {
    const v = o[k];
    if (VYJIMKY.has(k)) return;
    if (v && typeof v === 'object') { nalez.push(...nenulove(v, cesta + k + '.')); return; }
    if (typeof v === 'number' && v !== 0) nalez.push(cesta + k + '=' + v);
    if (typeof v === 'string' && v !== '') nalez.push(cesta + k + '="' + v + '"');
  });
  return nalez;
}
const zbylyOck = nenulove(eng.DEFAULT_CENIK, '');
const zbylyProj = nenulove(ep.DEFAULT_CENIK_PROJ, '');
test('v ceníku OCK ze sestavení nezůstala jediná částka', zbylyOck.length === 0, zbylyOck.join(', '));
test('v ceníku projekce ze sestavení nezůstala jediná částka', zbylyProj.length === 0, zbylyProj.join(', '));
test('sazby DPH zůstávají – jsou zákonné, ne naše',
  eng.DEFAULT_CENIK.dph === 0.12 && ep.DEFAULT_CENIK_PROJ.dph === 0.21,
  eng.DEFAULT_CENIK.dph + ' / ' + ep.DEFAULT_CENIK_PROJ.dph);
test('struktura klíčů zůstala – engine nesmí narazit na undefined',
  typeof eng.DEFAULT_CENIK.spojovaci === 'object'
  && typeof eng.DEFAULT_CENIK.lak === 'object'
  && typeof eng.DEFAULT_CENIK.priplatky === 'object'
  && typeof ep.DEFAULT_CENIK_PROJ.sazby === 'object'
  && typeof ep.DEFAULT_CENIK_PROJ.fixy === 'object');

/* Prázdný ceník je jediná věc v aplikaci, která dokument zastaví. */
const prazdnyStav = ukazkoveStav({ cenik: eng.DEFAULT_CENIK, cenikProj: ep.DEFAULT_CENIK_PROJ });
test('prázdný ceník se pozná ve stavu', prazdnyStav.prazdne === true
  && prazdnyStav.prazdneKde.length === 2, prazdnyStav.prazdneKde.join('|'));
test('prázdný ceník brání vzniku dokumentu', uk.ukazkoveBraniDokumentu(prazdnyStav) === true);
test('pouhé ukázkové ceny dokumentu nebrání',
  uk.ukazkoveBraniDokumentu(jenCeny) === false);
test('čistý stav dokumentu nebrání', uk.ukazkoveBraniDokumentu(cisty) === false);
const kPrazdny = ukazkoveKratce(prazdnyStav);
test('text u prázdného ceníku říká, že se dokument nedá vytvořit',
  /nedá vytvořit/i.test(kPrazdny), kPrazdny);
test('text u prázdného ceníku pošle uživatele pro složku _DB', /_DB/.test(kPrazdny), kPrazdny);
test('dlouhý text u prázdného ceníku mluví o nulách',
  /nul/i.test(ukazkoveText(prazdnyStav)), ukazkoveText(prazdnyStav));

/* ---------- 7b) cesta ven přímo z lišty ----------
 * Lišta dosud jen popisovala, kudy jít („Nastavení → Úložiště"). Jenže
 * prohlížeč právo k zápisu do složky po restartu zapomene a vrátit ho smí
 * jen kliknutí – takže uživatel, který otevře nové sestavení, vidí nuly
 * a musí je jít odklikat jinam. Tlačítko rovnou v liště tu obrazovku
 * vynechá. Rozhoduje o něm tahle funkce, aby se to dalo otestovat bez
 * prohlížeče. */
const { ukazkovePripojeni } = uk;
test('bez podpory složek se tlačítko nenabízí',
  ukazkovePripojeni({ koren: null, pripraveno: false }, false) === '');
test('připojená složka tlačítko nepotřebuje',
  ukazkovePripojeni({ koren: {}, pripraveno: true }, true) === '');
test('zapamatovaná složka bez práva nabídne „připojit znovu"',
  ukazkovePripojeni({ koren: {}, pripraveno: false }, true) === 'znovu');
test('žádná složka nabídne výběr',
  ukazkovePripojeni({ koren: null, pripraveno: false }, true) === 'vybrat');
test('chybějící stav úložiště nabídne výběr',
  ukazkovePripojeni(null, true) === 'vybrat');

const tZnovu = ukazkoveText(prazdnyStav, 'znovu', '_DB');
test('text u zapamatované složky mluví o obnovení přístupu, ne o Nastavení',
  /tlačítkem/.test(tZnovu) && !/Nastavení/.test(tZnovu), tZnovu);
test('text u zapamatované složky jmenuje složku', /_DB/.test(tZnovu), tZnovu);
test('text bez tlačítka zůstal, jak byl',
  /Nastavení → Úložiště/.test(ukazkoveText(prazdnyStav)), ukazkoveText(prazdnyStav));
test('text s výběrem složky nabídne obojí – tlačítko i Nastavení',
  /tlačítkem/.test(ukazkoveText(prazdnyStav, 'vybrat'))
  && /Nastavení/.test(ukazkoveText(prazdnyStav, 'vybrat')),
  ukazkoveText(prazdnyStav, 'vybrat'));

/* ---------- 7c) běžný uživatel žádnou složku nepřipojuje ----------
 * Zadání 4. 8. 2026: „Přihlásil jsem se jako nový uživatel (obchodník)
 * a přesto to po mně chce připojit databázi."
 *
 * Obchodník bere ceník z online databáze; složku _DB mapuje výhradně
 * administrátor. Věta „připojte složku _DB" je pro něj slepá ulička –
 * nemá k té složce na disku přístup, a i kdyby měl, není jeho práce ji
 * hlídat. Správná informace zní: platný ceník zveřejňuje administrátor.
 * Rozhoduje o tom čtvrtý parametr `bezSlozky`, aby se to dalo ověřit
 * bez prohlížeče. */
const tBezSlozky = ukazkoveText(prazdnyStav, 'vybrat', '_DB', true);
test('text pro běžného uživatele nemluví o složce',
  !/složk/i.test(tBezSlozky) && !/_DB/.test(tBezSlozky), tBezSlozky);
test('text pro běžného uživatele pošle za administrátorem',
  /administrátor/i.test(tBezSlozky), tBezSlozky);
test('text pro běžného uživatele nenabízí Nastavení → Úložiště',
  !/Úložiště/.test(tBezSlozky), tBezSlozky);
test('text pro administrátora zůstal beze změny',
  ukazkoveText(prazdnyStav, 'vybrat', '_DB') === ukazkoveText(prazdnyStav, 'vybrat', '_DB', false));
const kBezSlozky = ukazkoveKratce(prazdnyStav, true);
test('krátký text pro běžného uživatele nemluví o složce',
  !/složk/i.test(kBezSlozky) && !/_DB/.test(kBezSlozky), kBezSlozky);
test('krátký text pro běžného uživatele mluví o administrátorovi a zveřejnění',
  /administrátor/i.test(kBezSlozky) && /zveřejn/i.test(kBezSlozky), kBezSlozky);
test('krátký text pro běžného uživatele pořád říká, že dokument nevznikne',
  /nedá vytvořit/i.test(kBezSlozky), kBezSlozky);
test('krátký text pro administrátora zůstal beze změny',
  ukazkoveKratce(prazdnyStav) === ukazkoveKratce(prazdnyStav, false));

/* Od 18. 8. 2026 (#150) jde věta „bez složky" VŠEM — složka _DB skončila.
 * Když jsou ukázkové jen firemní údaje (ceny sedí), nesmí lišta radit
 * „požádejte o zveřejnění ceníku": ceník je v pořádku a zveřejnění by
 * nepomohlo. Správná cesta jsou firemní údaje v Nastavení → Firma. */
const jenUdaje = { jsou: true, prazdne: false, ceny: false, udaje: true, kde: ['firemní údaje'] };
const tJenUdaje = ukazkoveText(jenUdaje, '', '', true);
test('bez složky: při ukázkových firemních údajích se nemluví o ceníku',
  !/cen[íi]k/i.test(tJenUdaje), tJenUdaje);
test('bez složky: při ukázkových firemních údajích se posílá do Nastavení → Firma',
  /administrátor/i.test(tJenUdaje) && /Firma/.test(tJenUdaje), tJenUdaje);
test('bez složky: při ukázkových cenách se dál posílá za zveřejněním ceníku',
  /zveřejn/i.test(ukazkoveText({ jsou: true, prazdne: false, ceny: true, udaje: false, kde: [] }, '', '', true)));
test('u pouhých ukázkových cen se běžnému uživateli text nemění',
  ukazkoveKratce(jenCeny, true) === ukazkoveKratce(jenCeny));

/* ---------- 8) zkušební ceník se nesmí dostat do sestavení ----------
 * Kulatá čísla nezmizela, jen se přestěhovala do zkusebni_cenik.js, ze
 * kterého čtou testy. Jistota, že tudy nevede cesta ven, stojí a padá
 * s tím, že soubor není v seznamu CORE v build.py – a to je jediná věta,
 * kterou by při úpravě buildu šlo snadno přehlédnout. */
const BUILD = fs.readFileSync(__dirname + '/../build.py', 'utf8');
test('zkusebni_cenik.js není v seznamu souborů, ze kterých se skládá aplikace',
  !/zkusebni_cenik\.js/.test(BUILD));
test('do sestavení nejdou ani testy', !/["']test_/.test(BUILD) && !/["']test\.js["']/.test(BUILD));
const dist = __dirname + '/../dist/kalkulacka.html';
if (fs.existsSync(dist)) {
  const H = fs.readFileSync(dist, 'utf8');
  test('v posledním sestavení není zkušební ceník',
    !/ZKUSEBNI_CENIK/.test(H) && !/zkušební\)/.test(H));
} else {
  console.log('  (dist/kalkulacka.html zatím není – kontrola sestavení se přeskočila)');
}

/* ---------- 9) značka patří k číslům, ne k objektu ----------
 * Ceník varianty je zmrazená kopie. Když do ní přepočet zapíše ceny z jiného
 * ceníku, musí s nimi jít i značka – jinak varianta počítá ze skutečného
 * ceníku a přitom pořád tvrdí „není z čeho počítat", takže svítí červená lišta
 * a dokument zůstane zablokovaný nad správnými čísly. Přesně tenhle stav
 * uživatel nahlásil 31. 7. 2026 („připojení jsem potvrdil, ale ceník se stále
 * nestahuje" – a na obrazovce přitom byly skutečné částky). */
test('značka se sundá, když zdroj je ostrý ceník', (() => {
  const cil = { ukazkove: true, prazdny: true, marze: 0.42 };
  ukazkoveSrovnejZnacku(cil, { marze: 0.42 });
  return ukazkoveJe(cil) === false && ukazkovePrazdny(cil) === false && cil.marze === 0.42;
})());
test('značka se nasadí, když zdroj je prázdné sestavení', (() => {
  const cil = { marze: 0.42 };
  ukazkoveSrovnejZnacku(cil, { ukazkove: true, prazdny: true, marze: 0 });
  return ukazkoveJe(cil) && ukazkovePrazdny(cil);
})());
test('ukázkový, ale ne prázdný zdroj nechá jen značku ukázkovosti', (() => {
  const cil = { prazdny: true };
  ukazkoveSrovnejZnacku(cil, { ukazkove: true });
  return ukazkoveJe(cil) && ukazkovePrazdny(cil) === false;
})());
test('srovnání se zdrojem beze značky nechá cíl čistý', (() => {
  const cil = { marze: 0.42 };
  ukazkoveSrovnejZnacku(cil, {});
  return Object.keys(cil).join(',') === 'marze';
})());
test('zdroj se srovnáním nepoškodí', (() => {
  const zdroj = { ukazkove: true, prazdny: true };
  ukazkoveSrovnejZnacku({ marze: 1 }, zdroj);
  return ukazkoveJe(zdroj) && ukazkovePrazdny(zdroj);
})());
test('chybějící cíl ani zdroj nespadnou',
  ukazkoveSrovnejZnacku(null, { ukazkove: true }) === null
  && (() => { const c = { ukazkove: true }; ukazkoveSrovnejZnacku(c, null); return !ukazkoveJe(c); })());
test('po srovnání s ostrým ceníkem lišta zhasne a dokument se odblokuje', (() => {
  const cenik = { ukazkove: true, prazdny: true, marze: 0 };
  const cenikProj = { ukazkove: true, prazdny: true, marze: 0 };
  const pred = ukazkoveStav({ cenik, cenikProj });
  ukazkoveSrovnejZnacku(cenik, { marze: 0.42 });
  ukazkoveSrovnejZnacku(cenikProj, { marze: 0.42 });
  const po = ukazkoveStav({ cenik, cenikProj });
  return uk.ukazkoveBraniDokumentu(pred) === true && po.jsou === false
    && uk.ukazkoveBraniDokumentu(po) === false;
})());

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
