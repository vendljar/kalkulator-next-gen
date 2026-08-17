/* Test #36 – hlídání marže a minimálního krytí.
 *
 * Hlídání stojí na dvou věcech, které se snadno rozejdou:
 *  1) minimum je JEDNO číslo (NAST.slevy.minMarze) sdílené se slevami – kdyby
 *     si #36 zavedlo vlastní hranici, aplikace by tvrdila dvě různé pravdy;
 *  2) čísla o nákladech a marži nesmí vidět běžný uživatel, ale VAROVÁNÍ vidět
 *     musí. Proto se text skládá ve dvou podobách a testuje se, že v té
 *     nepodrobné opravdu žádná částka ani procento nezůstane.
 * A přes všechno: nic se neblokuje, jen se rozsvítí. */
/* Pozn.: testovací marže je schválně 0.42 – nesmyslné číslo, které v ceníku
 * nikdy nebude. Skutečná ceníková hodnota žije jen v _program.json ve složce
 * _DB; kdyby se objevila i tady, pripravit_github.py to po právu vyhodnotí
 * jako únik ceníku a odmítne repozitář vydat. */
const fs = require('fs');
const eng = require('./engine.js');
const ep = require('./engine_proj.js');
/* marze.js si podíl schválené slevy bere ze sleva.js přes globální jméno –
 * v Node je potřeba ho podstrčit stejně, jako to udělá sestavení. */
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil;
const mz = require('./marze.js');
const ZC = require('./zkusebni_cenik.js');
const { MARZE_MIN_VYCHOZI, marzeMin, marzePodil, marzeStavOck, marzeStavProj,
        marzePrehled, marzeText, marzeStupen } = mz;

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));

/* ---------- 1) minimum má jediný zdroj ---------- */
test('minimum se bere z nastavení slev', marzeMin({ slevy: { minMarze: 0.11 } }) === 0.11);
test('bez nastavení platí výchozí hranice', marzeMin({}) === MARZE_MIN_VYCHOZI
  && marzeMin(null) === MARZE_MIN_VYCHOZI);
test('nesmyslná hranice se ignoruje', marzeMin({ slevy: { minMarze: 'nic' } }) === MARZE_MIN_VYCHOZI
  && marzeMin({ slevy: { minMarze: -1 } }) === MARZE_MIN_VYCHOZI);
/* Minimum musí být JEDNO číslo. marze.js má vlastní záložní konstantu pro
 * chvíli, než se načte nastavení; ui/common.js má výchozí NAST.slevy.minMarze.
 * Kdyby se rozešly, aplikace by tvrdila dvě různá minima podle toho, kdo se
 * zeptá dřív – a přesně to se při očištění zdrojáků od skutečných čísel
 * jednou stalo. ui/common.js není modul pro Node, takže se čte jako text. */
const COMMON = fs.readFileSync(__dirname + '/ui/common.js', 'utf8');
const mMin = COMMON.match(/minMarze:\s*([0-9.]+)/);
test('ui/common.js má výchozí minMarze', !!mMin, mMin);
test('záložní minimum v marze.js se shoduje s výchozím v ui/common.js',
  !!mMin && Math.abs(MARZE_MIN_VYCHOZI - parseFloat(mMin[1])) < 1e-9,
  MARZE_MIN_VYCHOZI + ' vs ' + (mMin && mMin[1]));

/* ---------- 2) samotný podíl ---------- */
test('marže z ceny a nákladu', Math.abs(marzePodil(100, 80) - 0.2) < 1e-9);
test('nulová cena marži nemá', marzePodil(0, 80) === null && marzePodil(-5, 1) === null);
test('práce pod cenou dá zápornou marži', marzePodil(100, 130) < 0);

/* ---------- 3) OCK ---------- */
const zadani = JSON.parse(JSON.stringify(eng.DEFAULT_ZADANI));
const cenik = ZC.zkusebniCenik();
const r = eng.vypocet(zadani, cenik, JEKLY, true);
/* Hranice pro tyhle testy: bere se výchozí (ukázková), ne opsané číslo –
 * skutečné minimum leží v _DB a do repozitáře nepatří ani jako testovací vzorek. */
const nast = { slevy: { minMarze: MARZE_MIN_VYCHOZI } };

/* Přirážka a marže nejsou totéž: přirážka se počítá z nákladu, marže z ceny.
 * Přirážka p tedy dává marži p/(1+p). Očekávání se odvozuje z ceníku, protože
 * v repozitáři jsou ukázkové ceny – opsané číslo by se rozešlo, jakmile se
 * vzorek vymění, a hlídalo by vzorek místo vzorce. */
const bezSlevy = marzeStavOck(r, null, nast);
const marzeZPrirazky = cenik.marze / (1 + cenik.marze);
test('bez slevy odpovídá marže přirážce z ceníku (p/(1+p))',
  Math.abs(bezSlevy.marze - marzeZPrirazky) < 0.02,
  bezSlevy.marze + ' vs ' + marzeZPrirazky);
test('bez slevy se nic nerozsvítí', bezSlevy.podMin === false);
test('stav nese cenu i náklad', bezSlevy.cena > 0 && bezSlevy.naklad > 0
  && bezSlevy.cena > bezSlevy.naklad);

const sSlevou = marzeStavOck(r, { procenta: 20, stav: 'schváleno' }, nast);
test('schválená sleva marži sníží', sSlevou.marze < bezSlevy.marze);
test('cena po slevě je nižší než základ', sSlevou.cena < bezSlevy.cena);
const velka = marzeStavOck(r, { procenta: 25, stav: 'schváleno' }, nast);
test('velká sleva srazí marži pod minimum', velka.podMin === true, velka.marze);
test('u podkročení se ví, kolik chybí', velka.chybiKc > 0
  && Math.abs(marzePodil(velka.cena + velka.chybiKc, velka.naklad) - velka.min) < 1e-6,
  velka.chybiKc);

const neschvalena = marzeStavOck(r, { procenta: 25, stav: 'čeká na schválení' }, nast);
test('neschválená sleva se do marže nepromítá', Math.abs(neschvalena.marze - bezSlevy.marze) < 1e-9);

/* nízká přirážka v ceníku varianty – druhá cesta, jak se dostat pod minimum,
 * a ta, kterou dnes nic nehlídá (sleva je nula, a přesto se vydělává málo) */
const cenikNizky = ZC.zkusebniCenik();
cenikNizky.marze = 0.03;
const rNizky = eng.vypocet(zadani, cenikNizky, JEKLY, true);
const nizky = marzeStavOck(rNizky, null, nast);
test('nízká přirážka v ceníku se pozná i bez slevy', nizky.podMin === true, nizky.marze);

/* ---------- 4) PROJ – sekce se sledují zvlášť ---------- */
const zadaniP = JSON.parse(JSON.stringify(ep.DEFAULT_ZADANI_PROJ));
const cenikP = ZC.zkusebniCenikProj();
const rp = ep.vypocetProj(zadaniP, cenikP);
const pOk = marzeStavProj(rp, nast);
test('PROJ vrací celek i jednotlivé sekce', pOk.celek && Array.isArray(pOk.sekce) && pOk.sekce.length > 0);
test('sekce nesou název', pOk.sekce.every(s => !!s.nazev));
test('u výchozího ceníku je PROJ nad minimem', pOk.celek.podMin === false && pOk.pod.length === 0);

/* jedné sekci se dá sleva, která ji utopí – celek přitom může zůstat v pořádku */
const zadaniP2 = JSON.parse(JSON.stringify(zadaniP));
/* od 17. 8. má výchozí rozsah vyplněnou STUDII (zaměření prázdné) — sleva
 * se dává první sekci, která má co slevit (nenulové hodiny/fix) */
const prvni = zadaniP2.sekce.find(s => (s.polozky || []).some(p => !p.vyrazeno && ((+p.hodiny || 0) > 0 || (+p.cena || 0) > 0)))
  || zadaniP2.sekce[0];
prvni.prirazkaPct = -40;
const rp2 = ep.vypocetProj(zadaniP2, cenikP);
const pPod = marzeStavProj(rp2, nast);
test('sleva na jedné sekci PROJ se pozná', pPod.pod.length >= 1, JSON.stringify(pPod.pod.map(x => x.nazev)));
test('u problémové sekce se ví, která to je', pPod.pod[0].nazev === prvni.nazev,
  pPod.pod[0] && pPod.pod[0].nazev);

/* ---------- 5) přehled za celou nabídku ---------- */
const prehledOk = marzePrehled(r, rp, null, nast);
test('u zdravé nabídky je přehled tichý', prehledOk.varovat === false && marzeText(prehledOk) === '');
const prehledPod = marzePrehled(r, rp2, { procenta: 25, stav: 'schváleno' }, nast);
test('přehled sebere problémy z OCK i PROJ', prehledPod.varovat === true && prehledPod.pod.length >= 2,
  prehledPod.pod.length);
test('přehled zná i marži celé nabídky', prehledPod.celek && prehledPod.celek.cena > 0);
test('chybí-li výpočet, přehled nehádá', marzePrehled(null, null, null, nast).varovat === false);

/* ---------- 6) dvě podoby textu ---------- */
const podrobne = marzeText(prehledPod, { cisla: true });
const strucne = marzeText(prehledPod, { cisla: false });
test('podrobný text uvede procenta', /\d+(,\d+)? %/.test(podrobne), podrobne);
test('stručný text neprozradí žádné číslo', !/\d/.test(strucne), strucne);
test('stručný text přesto řekne, že je něco pod minimem',
  /minim/i.test(strucne) && /marž/i.test(strucne), strucne);
test('bez voleb se čísla neprozrazují', marzeText(prehledPod) === strucne);
test('text nic nepřikazuje ani neblokuje',
  !/nesmí|zakázán|blokov|nelze pokračovat/i.test(podrobne + strucne));
test('text jmenuje, kde problém je', /OCK/.test(podrobne) && podrobne.includes(prvni.nazev), podrobne);

/* ---------- 7) stupeň (jen barva, ne zákaz) ---------- */
test('nad minimem je klid', marzeStupen({ podMin: false, marze: 0.42 }) === '');
test('pod minimem je varování', marzeStupen({ podMin: true, marze: 0.05 }) === 'pod');
test('práce se ztrátou je vážnější', marzeStupen({ podMin: true, marze: -0.02 }) === 'ztrata');

/* ---------- 6) doprava patří do nákladu (audit 1. 8. 2026, nález N2) ----------
 * Cena sekce dopravu obsahuje (cenaSDopravou), marže se ale dřív počítala
 * z nákladu BEZ dopravy – doprava se tvářila jako čistý zisk a hlídání mlčelo
 * i na nabídce, kde cena dopravu neuhradí. Hlavička PROJ přitom počítá
 * náklad + doprava; obě čísla se musejí rovnat. */
const zadaniP3 = JSON.parse(JSON.stringify(zadaniP));
{
  /* Od 17. 8. je výchozí ZAMĚŘENÍ prázdné — sekce s dopravou se vybírá tak,
   * aby měla nenulový náklad práce (jinak by km vyšly nulové a nebylo by
   * co hlídat). Ve výchozím zadání to je DPZ. */
  const seDopravou = zadaniP3.sekce.find(s => s.doprava
    && ep.vypocetProj(zadaniP3, cenikP).sekce.find(x => x.key === s.key).naklad > 0);
  /* Sekce schválně BEZ přirážky (nula, ne prázdno). Od 11. 8. 2026 je výchozí
   * hodnotou sekce globální přirážka z ceníku, a ta roste spolu s dopravou —
   * protože se počítá z ceny včetně dopravy. S ní by marže pod minimum
   * nespadla nikdy a test by neměřil nic. Předmětem testu je hlídání marže,
   * ne velikost přirážky. */
  seDopravou.prirazkaPct = 0;
  /* dopravaKc se odvodí z ceníku (km × sazba); km se zvolí tak, aby doprava
   * několikanásobně převýšila náklad práce – přesně ten případ, kde stará
   * marže „bez dopravy" vycházela vysoko a nová musí spadnout pod minimum. */
  const nakladPrace = ep.vypocetProj(zadaniP3, cenikP).sekce
    .find(s => s.key === seDopravou.key).naklad;
  seDopravou.doprava.km = Math.ceil((nakladPrace * 5) / Math.max(1, cenikP.dopravaKmKc));
}
const rp3 = ep.vypocetProj(zadaniP3, cenikP);
const pDop = marzeStavProj(rp3, nast);
test('náklad celku PROJ zahrnuje dopravu (shoda s KPI hlavičky)',
  Math.abs(pDop.celek.naklad - (rp3.souhrn.naklad + rp3.souhrn.doprava)) < 1e-6,
  pDop.celek.naklad + ' vs ' + (rp3.souhrn.naklad + rp3.souhrn.doprava));
test('marže celku PROJ = marzePodil(cena, náklad + doprava)',
  Math.abs(pDop.celek.marze - marzePodil(pDop.celek.cena, rp3.souhrn.naklad + rp3.souhrn.doprava)) < 1e-9);
{
  const sekceDop = rp3.sekce.find(s => s.dopravaKc > 0);
  const hlidana = pDop.sekce.find(s => s.nazev === sekceDop.nazev);
  test('náklad sekce s dopravou zahrnuje dopravu',
    !!hlidana && Math.abs(hlidana.naklad - (sekceDop.naklad + sekceDop.dopravaKc)) < 1e-6,
    hlidana && hlidana.naklad);
  test('drahá doprava stáhne sekci pod minimum a hlídání se ozve',
    !!hlidana && hlidana.podMin === true, JSON.stringify(pDop.pod.map(x => x.nazev)));
}

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
