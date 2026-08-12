/* Sdílený rejstřík žádostí o slevu napříč zakázkami (#102, 10. 8. 2026).
 *
 * PROČ TAHLE SADA VZNIKLA
 *
 * Záložka Schvalování slev do 10. 8. 2026 ukazovala jen žádosti z právě
 * otevřené zakázky. Schvalovatel se tedy musel nejdřív jinou cestou dozvědět,
 * že nějaká žádost vznikla. Nový přehled je čte ze serveru napříč všemi
 * zakázkami — a přesně tím vzniká riziko, kvůli kterému je tahle sada
 * podrobnější, než by se u „jen přehledu" čekalo:
 *
 * ve sdíleném rejstříku NESMÍ být žádná částka. Ani cena, ani sleva v Kč,
 * ani marže. Kdyby tam byly, obešel by přehled maticí zobrazení jedním
 * požadavkem — vedoucí, kterému administrátor marži nepřidělil, by ji uviděl
 * v seznamu. Je to ten druh díry, kterou nikdo nehledá, protože „je to jen
 * přehled".
 *
 * Sada proto hlídá tvar dat, ne jen chování: co smí v rejstříku být, je
 * vyjmenované, a cokoli navíc se pozná.
 */
const s = require('./schvalovani.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); }
};

/* Tvar, jaký posílá serverová funkce netlify/functions/schvalovani.mjs. */
const polozka = (zmeny) => Object.assign({
  klic: '2026-OPR-CN-0500.json',
  cislo: '2026 - OPR - CN - 0500',
  nazevAkce: 'Zkušební vestavba',
  variantaId: 'v1',
  variantaNazev: 'Základní',
  ridici: true,
  zamceno: false,
  upraveno: '2026-08-10T08:00:00.000Z',
  sleva: {
    procenta: 12, role: 'Obchodník', schema: '', poznamka: '',
    stav: 'čeká na schválení', schvalil: '', schvalilKdy: '', schvalenoProc: null,
    zamitl: '', zamitlKdy: '', zamitnutoProc: null, zamitnutoDuvod: '',
  },
}, zmeny || {});

/* ============================================================
 * 1) Převod na záznam pro obrazovku
 * ============================================================ */

const z = s.schvalovaniZaznamRejstrik(polozka());
test('žádost si nese číslo zakázky a název akce',
  z.cislo === '2026 - OPR - CN - 0500' && z.nazevAkce === 'Zkušební vestavba');
test('procento slevy se přenese', z.procenta === 12, z.procenta);
test('stav se přeloží na kategorii', z.kategorie === 'ceka', z.kategorie);
test('záznam je označený jako cizí (z jiné zakázky)', z.cizi === true);
test('klíč zakázky se přenese, aby šla otevřít', z.klic === '2026-OPR-CN-0500.json');

/* `spocteno: false` říká rozhraní, že čísla nechybí omylem, ale že se
 * v tomhle pohledu nepočítala. Bez toho by seznam vypadal jako rozbitý. */
test('záznam přiznává, že se nepočítalo', z.spocteno === false);
test('v záznamu není sleva v korunách', z.slevaKc === null);
test('v záznamu není cena', z.cenaPoSleve === null && z.cenaPredSlevou === null);
test('v záznamu není marže', z.marzePoSleve === null);
test('v záznamu není minimální marže ani strop', z.minMarze === null && z.strop === null);

/* Kategorie musí sedět i u rozhodnutých žádostí — jinak by se schvalovateli
 * v přehledu „čeká" objevilo i to, co už odklepl. */
const kat = (zmena) => s.schvalovaniZaznamRejstrik(
  polozka({ sleva: Object.assign(polozka().sleva, zmena) })).kategorie;
test('schválená žádost má kategorii schvaleno',
  kat({ stav: 'schváleno', schvalenoProc: 12 }) === 'schvaleno');
test('automaticky schválená se pozná zvlášť',
  kat({ stav: 'schváleno automaticky' }) === 'auto');
test('zamítnutá člověkem se pozná podle zamitnutoProc',
  kat({ stav: 'zamítnuto', zamitnutoProc: 12 }) === 'zamitnuto');
test('zamítnutá výpočtem (pod marží) se pozná taky',
  kat({ stav: 'zamítnuto', zamitnutoProc: null }) === 'podMarzi');

/* ============================================================
 * 2) Řazení — nahoru patří to, co čeká na člověka
 * ============================================================ */

const seznam = s.schvalovaniSeznamRejstrik([
  polozka({ variantaId: 'a', sleva: Object.assign(polozka().sleva, { stav: 'schváleno', procenta: 5 }) }),
  polozka({ variantaId: 'b', sleva: Object.assign(polozka().sleva, { procenta: 8 }) }),
  polozka({ variantaId: 'c', sleva: Object.assign(polozka().sleva, { procenta: 20 }) }),
]);
test('čekající žádosti jsou nahoře', seznam[0].kategorie === 'ceka' && seznam[1].kategorie === 'ceka',
  seznam.map(x => x.kategorie).join(','));
test('uvnitř kategorie je vyšší sleva první', seznam[0].procenta === 20 && seznam[1].procenta === 8,
  seznam.map(x => x.procenta).join(','));
test('rozhodnuté klesnou dolů', seznam[2].kategorie === 'schvaleno');
test('prázdný vstup nespadne', s.schvalovaniSeznamRejstrik(null).length === 0);

/* ============================================================
 * 3) Pojistka proti propašované částce
 * ============================================================ */

test('čistý rejstřík neobsahuje nic neznámého',
  s.schvalovaniRejstrikNeznameKlice([polozka()]).length === 0,
  s.schvalovaniRejstrikNeznameKlice([polozka()]).join(','));

/* Tohle je jádro celé sady. Kdyby někdo v budoucnu do serverové odpovědi
 * přidal cenu — třeba v dobré víře, „ať je vidět, o kolik jde" — musí to
 * spadnout tady a ne až u zákazníka. */
test('cena navíc v položce se pozná',
  s.schvalovaniRejstrikNeznameKlice([polozka({ cenaPoSleve: 123456 })]).includes('cenaPoSleve'));
test('částka schovaná ve slevě se pozná',
  s.schvalovaniRejstrikNeznameKlice([
    polozka({ sleva: Object.assign(polozka().sleva, { slevaKc: 50000 }) }),
  ]).includes('sleva.slevaKc'));
/* Hodnota je schválně mimo obvyklý rozsah marže: kdyby tu stálo číslo blízké
 * naší ceníkové přirážce, označil by tenhle soubor strážce úniku ceníku
 * (test_proj_vzhled.js) a repozitář by nešlo vydat. */
test('marže navíc se pozná',
  s.schvalovaniRejstrikNeznameKlice([polozka({ marzePoSleve: 0.99 })]).includes('marzePoSleve'));
test('nákladová položka se pozná',
  s.schvalovaniRejstrikNeznameKlice([polozka({ zakladNaklad: 900000 })]).includes('zakladNaklad'));

/* Seznam povolených klíčů je zároveň dokumentace toho, co rejstřík nese.
 * Kdyby se rozrostl, má to být vědomé rozhodnutí, ne vedlejší účinek. */
test('povolené klíče položky jsou právě ty známé',
  s.SCHV_REJSTRIK_POVOLENO.length === 10, s.SCHV_REJSTRIK_POVOLENO.join(','));
/* `cast` přibyla 12. 8. 2026 (#134): jedna varianta může poslat do fronty
 * slevu na výtahovou šachtu i slevu na projekci a v cizí zakázce musí být
 * poznat, o kterou jde. Částku to nenese – je to jen 'ock' nebo 'proj'. */
test('rejstřík rozlišuje část, ke které sleva patří',
  s.SCHV_REJSTRIK_POVOLENO.includes('cast'));
/* Vzor je schválně úzký: „nazevAkce" obsahuje shluk „kce" a volnější
 * hledání by ho označilo za peníze. Kontrola, která křičí na nevinné pole,
 * se dřív nebo později vypne — a pak nechytí ani to pravé. */
test('mezi povolenými není nic, co zní jako peníze',
  !s.SCHV_REJSTRIK_POVOLENO.concat(s.SCHV_REJSTRIK_SLEVA_POVOLENO)
    .some(k => /cena|naklad|marze|castka/i.test(k) || /Kc$/.test(k)),
  s.SCHV_REJSTRIK_POVOLENO.concat(s.SCHV_REJSTRIK_SLEVA_POVOLENO).join(','));

console.log('\n' + ok + ' prošlo, ' + fail + ' selhalo');
process.exit(fail ? 1 : 0);
