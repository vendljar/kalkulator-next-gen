/* Test #38 – obchodní zaokrouhlení koncové ceny.
 *
 * Zaokrouhlení mění číslo, které jde ven k zákazníkovi, a to na několika
 * místech najednou (nabídka OCK, nabídka PROJ, krycí listy, porovnání
 * variant, hlavička kalkulace). Nejnebezpečnější chyba tu není špatná
 * matematika, ale ROZEJITÍ: dokument A ukáže 1 159 000 a dokument B
 * 1 159 710. Proto se tady netestuje jen zaokrouhlovací funkce, ale hlavně
 * to, že všechna místa dávají stejné číslo a že rozdíl proti spočtené ceně
 * je vidět, ne schovaný.
 *
 * Druhá věc, kterou test hlídá, je rozdíl mezi NOVOU a STAROU variantou.
 * Nová varianta zaokrouhluje nahoru na stokoruny (rozhodnuto 30. 7. 2026),
 * zatímco varianta uložená ještě před #38 pole zaokr nemá a musí zůstat
 * vypnutá – jinak by se otevřením v novější verzi změnila cena, která už
 * mohla odejít zákazníkovi. */
const fs = require('fs');
const eng = require('./engine.js');
const ZC = require('./zkusebni_cenik.js');
global.vypocet = eng.vypocet; global.DEFAULT_ZADANI = eng.DEFAULT_ZADANI; global.DEFAULT_CENIK = ZC.zkusebniCenik();
const ep = require('./engine_proj.js');
global.vypocetProj = ep.vypocetProj;
global.DEFAULT_ZADANI_PROJ = ep.DEFAULT_ZADANI_PROJ; global.DEFAULT_CENIK_PROJ = ZC.zkusebniCenikProj();
const tsm = require('./techspec.js');
global.TECHSPEC_DEF = tsm.TECHSPEC_DEF; global.tsHodnota = tsm.tsHodnota; global.DEFAULT_TECHSPEC = tsm.DEFAULT_TECHSPEC;
const sl = require('./sleva.js');
global.slevaPodil = sl.slevaPodil; global.slevaPlati = sl.slevaPlati; global.slevaDefault = sl.slevaDefault;
const zo = require('./zaokrouhleni.js');
Object.keys(zo).forEach(k => { global[k] = zo[k]; });
const zk = require('./zakazka.js');
const fm = require('./firma.js');
Object.keys(fm).forEach(k => { global[k] = fm[k]; });
const { nabidkaData } = require('./nabidka.js');
const kr = require('./kryci.js');
const mz = require('./marze.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const JEKLY = JSON.parse(fs.readFileSync(__dirname + '/jekly.json', 'utf8'));
/* částka z formátovaného řetězce („1 159 000,00 Kč" → 1159000) */
const parse = s => +String(s).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.');

/* ---------- 1) výchozí stav nové varianty vs. vypnuto ---------- */
const vych = zo.zaokrDefault();
test('výchozí zaokrouhlení je nahoru na stokoruny',
  vych.krok === 100 && vych.smer === 'nahoru', JSON.stringify(vych));
test('výchozí zaokrouhlení cenu nesnižuje', zo.zaokrouhli(1159710, vych) === 1159800);
test('výchozí zaokrouhlení je aktivní', zo.zaokrStav(1159710, vych).aktivni === true);
/* Krok 100 nahoru přidá nejvýš 99 Kč – kdyby přidal víc, byl by někde překlep
 * o řád přímo v ceně nabídky. */
test('výchozí zaokrouhlení přidá nejvýš 99 Kč',
  zo.zaokrStav(1159710, vych).rozdil > 0 && zo.zaokrStav(1159710, vych).rozdil < 100,
  zo.zaokrStav(1159710, vych).rozdil);
/* Základní cena OCK je z engine.js už násobkem tisíce, takže nabídka bez slevy
 * vyjde stejně jako dosud – výchozí nastavení se projeví až u slev a u PROJ. */
test('cena už zaokrouhlená na tisíce se výchozím nastavením nemění',
  zo.zaokrouhli(1159000, vych) === 1159000);

const vyp = zo.zaokrVypnuto();
test('vypnuté nastavení má krok nula', vyp.krok === 0, JSON.stringify(vyp));
test('vypnuté zaokrouhlení cenu nemění', zo.zaokrouhli(1159710, vyp) === 1159710);
test('vypnuté zaokrouhlení není aktivní', zo.zaokrStav(1159710, vyp).aktivni === false);
test('chybějící nastavení se chová jako vypnuté',
  zo.zaokrouhli(1159710, null) === 1159710 && zo.zaokrouhli(1159710, {}) === 1159710);
test('nesmyslný krok se ignoruje',
  zo.zaokrouhli(1159710, { krok: 'tisíc' }) === 1159710
  && zo.zaokrouhli(1159710, { krok: -1000 }) === 1159710);

/* ---------- 2) samotné zaokrouhlení ---------- */
test('dolů na tisíce', zo.zaokrouhli(1159710, { krok: 1000, smer: 'dolu' }) === 1159000);
test('nahoru na tisíce', zo.zaokrouhli(1159710, { krok: 1000, smer: 'nahoru' }) === 1160000);
test('na nejbližší tisíc nahoru', zo.zaokrouhli(1159710, { krok: 1000, smer: 'nejbliz' }) === 1160000);
test('na nejbližší tisíc dolů', zo.zaokrouhli(1159210, { krok: 1000, smer: 'nejbliz' }) === 1159000);
test('na stokoruny', zo.zaokrouhli(1159710, { krok: 100, smer: 'dolu' }) === 1159700);
test('na pětistovky', zo.zaokrouhli(1159710, { krok: 500, smer: 'dolu' }) === 1159500);
test('na desetitisíce', zo.zaokrouhli(1159710, { krok: 10000, smer: 'dolu' }) === 1150000);
test('už zaokrouhlená cena se nemění', zo.zaokrouhli(1159000, { krok: 1000, smer: 'dolu' }) === 1159000
  && zo.zaokrouhli(1159000, { krok: 1000, smer: 'nahoru' }) === 1159000);
test('neznámý směr se chová jako dolů', zo.zaokrouhli(1159710, { krok: 1000, smer: 'jinak' }) === 1159000);
/* Zaokrouhlením dolů se nesmí nabídnout nula – u malé zakázky by velký krok
 * cenu srazil na nulu a aplikace by tiše nabídla práci zadarmo. */
test('malá cena se dolů nepropadne na nulu', zo.zaokrouhli(700, { krok: 1000, smer: 'dolu' }) === 700);
test('nulová a záporná cena se nezaokrouhluje',
  zo.zaokrouhli(0, { krok: 1000, smer: 'nahoru' }) === 0 && zo.zaokrouhli(-500, { krok: 1000, smer: 'dolu' }) === -500);

/* ---------- 3) stav: rozdíl proti spočtené ceně ---------- */
const st = zo.zaokrStav(1159710, { krok: 1000, smer: 'dolu' });
test('stav nese spočtenou i nabízenou cenu', st.pred === 1159710 && st.cena === 1159000);
test('rozdíl je záporný a přesný', st.rozdil === -710, st.rozdil);
test('stav je aktivní', st.aktivni === true);
const stNahoru = zo.zaokrStav(1159710, { krok: 1000, smer: 'nahoru' });
test('zaokrouhlení nahoru dá kladný rozdíl', stNahoru.rozdil === 290, stNahoru.rozdil);
const stBez = zo.zaokrStav(1159000, { krok: 1000, smer: 'dolu' });
test('bez skutečné změny je rozdíl nula', stBez.rozdil === 0 && stBez.aktivni === true);
test('text uvede obě čísla i rozdíl',
  /1\s?159\s?710/.test(zo.zaokrText(st)) && /1\s?159\s?000/.test(zo.zaokrText(st)) && /710/.test(zo.zaokrText(st)),
  zo.zaokrText(st));
test('text vypnutého zaokrouhlení je prázdný', zo.zaokrText(zo.zaokrStav(1159710, vyp)) === '');
test('text nic nezakazuje',
  !/nesmí|zakázán|blokov|nelze pokračovat/i.test(zo.zaokrText(st) + zo.zaokrText(stNahoru)));

/* ---------- 4) koncová cena OCK: sleva a zaokrouhlení dohromady ---------- */
const zak = zk.novaZakazka();
zak.cislo = '2026-OPR-CN-9001'; zak.objednatel = 'Vzorový odběratel s.r.o.';
zak.nazevAkce = 'Zkouška zaokrouhlení'; zak.adresa = 'Vzorová 163/17, Praha 10';
const v = zak.varianty[0];
v.data.ock.fixes = true;
const r = eng.vypocet(v.data.ock.zadani, v.data.cenik, JEKLY, true);
const rp = ep.vypocetProj(v.data.proj.zadani, v.data.proj.cenik);

const c0 = zo.cenaNabidkyOck(r, null, null);
test('bez slevy a bez zaokrouhlení je koncová cena základní cena',
  c0.cena === r.souhrn.zakladCena && c0.zaokrKc === 0);

/* ---------- 4b) jádro zaokrouhluje ZÁKLADNÍ cenu NAHORU na tisíce ----------
 * Obchodní zaokrouhlení výše je až druhý krok; první dělá engine.js sám, když
 * ze součtu sekcí udělá základní cenu. Dělá ho NAHORU, ne matematicky – jinak
 * by u každé zakázky, které vyjde zbytek pod polovinou tisícovky, šla nabídka
 * ven pod spočtenou cenou a nikdo by si toho nevšiml.
 *
 * Jediné zadání na to nestačí: u toho výchozího vychází zbytek zrovna nad
 * polovinou kroku, takže matematické zaokrouhlení by dalo tentýž výsledek.
 * Cena se proto posouvá vlastní položkou po stokorunách – tím se projde celý
 * kruh zbytků a mezi nimi i ty pod polovinou. Tvrdí se vztah (zaokrouhlená
 * cena je vždy ≥ spočtené a liší se míň než o krok), ne konkrétní částka. */
{
  const KROK = 1000;
  let zbytkyPodPulkou = 0, chyby = [];
  for (let i = 0; i < 10; i++) {
    const z = JSON.parse(JSON.stringify(v.data.ock.zadani));
    z.vlastniPolozky = Object.assign({ hrubaOck: [], atyp: [], oplasteni: [],
                                       volitelne: [], rezie: [] }, z.vlastniPolozky);
    z.vlastniPolozky.hrubaOck = (z.vlastniPolozky.hrubaOck || [])
      .concat([{ nazev: 'Posun ceny pro test zaokrouhlení', mnozstvi: 1, cena: 100 * i }]);
    const ri = eng.vypocet(z, v.data.cenik, JEKLY, true);
    /* spočtená (nezaokrouhlená) cena = náklad + marže; souhrn ji nese rozložený */
    const spoctena = ri.souhrn.zakladNaklad + ri.souhrn.zakladMarze;
    const zaokr = ri.souhrn.zakladCena;
    const rozdil = zaokr - spoctena;
    if (zaokr % KROK !== 0) chyby.push('krok ' + zaokr);
    if (rozdil < -1e-6) chyby.push('sníženo o ' + (-rozdil).toFixed(2));
    if (rozdil >= KROK) chyby.push('přidáno ' + rozdil.toFixed(2));
    if (rozdil > KROK / 2) zbytkyPodPulkou++;
  }
  test('základní cena je vždy násobek tisíce, nikdy nižší než spočtená a vyšší nejvýš o krok',
    chyby.length === 0, chyby.join('; '));
  /* Pojistka na samotný test: kdyby žádný z pokusů neměl zbytek pod polovinou
   * kroku, prošel by tenhle test i matematickému zaokrouhlení a nehlídal by nic. */
  test('mezi pokusy je i cena, u které se matematické zaokrouhlení liší od zaokrouhlení nahoru',
    zbytkyPodPulkou > 0, zbytkyPodPulkou);
}

const slevaSchv = { procenta: 7, stav: 'schváleno' };
const cS = zo.cenaNabidkyOck(r, slevaSchv, null);
test('schválená sleva se propíše', Math.abs(cS.cena - r.souhrn.zakladCena * 0.93) < 1e-6, cS.cena);
const cSZ = zo.cenaNabidkyOck(r, slevaSchv, { krok: 1000, smer: 'dolu' });
test('zaokrouhlení sedí na tisíce', cSZ.cena % 1000 === 0, cSZ.cena);
test('zaokrouhlení ubere méně než celý krok', cSZ.zaokrKc <= 0 && cSZ.zaokrKc > -1000, cSZ.zaokrKc);
test('spočtená cena zůstává k dispozici', Math.abs(cSZ.pred - cS.cena) < 1e-6, [cSZ.pred, cS.cena]);
/* Rozpad musí sedět na haléř, jinak nabídka nedává součet. */
test('základ − sleva + zaokrouhlení = koncová cena',
  Math.abs(cSZ.zaklad - cSZ.slevaKc + cSZ.zaokrKc - cSZ.cena) < 1e-6,
  [cSZ.zaklad, cSZ.slevaKc, cSZ.zaokrKc, cSZ.cena]);
const cNeschv = zo.cenaNabidkyOck(r, { procenta: 7, stav: 'čeká na schválení' }, { krok: 1000, smer: 'dolu' });
test('neschválená sleva se nepropíše ani při zaokrouhlení',
  Math.abs(cNeschv.zaklad - r.souhrn.zakladCena) < 1e-6 && cNeschv.slevaKc === 0);
test('chybí-li výpočet, koncová cena se nehádá', zo.cenaNabidkyOck(null, null, null) === null);

/* ---------- 5) koncová cena PROJ ---------- */
const cp0 = zo.cenaNabidkyProj(rp, null);
test('PROJ bez zaokrouhlení = součet sekcí', cp0.cena === rp.souhrn.celkem && cp0.zaokrKc === 0);
const cpZ = zo.cenaNabidkyProj(rp, { krok: 1000, smer: 'dolu' });
test('PROJ se zaokrouhlí na tisíce', cpZ.cena % 1000 === 0, cpZ.cena);
test('PROJ zná rozdíl proti součtu sekcí',
  Math.abs(cpZ.pred + cpZ.zaokrKc - cpZ.cena) < 1e-6, [cpZ.pred, cpZ.zaokrKc, cpZ.cena]);
test('chybí-li výpočet PROJ, nic se nehádá', zo.cenaNabidkyProj(null, null) === null);

/* ---------- 6) všechna místa ukazují stejné číslo ---------- */
/* Tohle je jádro testu: kdyby některý dokument zaokrouhlení minul, rozejdou
 * se čísla v nabídce, krycím listu a porovnání variant. */
v.data.sleva = { procenta: 7, stav: 'schváleno', role: 'Jednatel' };
/* Od 4. 8. 2026 má každá část vlastní nastavení. Schválně jsou tu RŮZNÁ:
 * kdyby některé místo četlo cizí pole, čísla se hned rozejdou a je to vidět. */
v.data.zaokr     = { krok: 1000, smer: 'dolu' };
v.data.zaokrProj = { krok: 500,  smer: 'nahoru' };
const ocekavana = zo.cenaNabidkyOck(r, v.data.sleva, v.data.zaokr).cena;
const ocekavanaProj = zo.cenaNabidkyProj(rp, v.data.zaokrProj).cena;

const nd = nabidkaData(zak, v, JEKLY);
test('nabídka OCK ukazuje zaokrouhlenou cenu',
  Math.abs(parse(nd.placeholders.CENA_BEZ_DPH) - ocekavana) < 0.01,
  [nd.placeholders.CENA_BEZ_DPH, ocekavana]);
test('nabídka OCK má DPH ze zaokrouhlené ceny',
  Math.abs(parse(nd.placeholders.DPH_KC) - ocekavana * v.data.cenik.dph) < 0.01, nd.placeholders.DPH_KC);
test('nabídka OCK má celkem s DPH ze zaokrouhlené ceny',
  Math.abs(parse(nd.placeholders.CENA_S_DPH) - ocekavana * (1 + v.data.cenik.dph)) < 0.01, nd.placeholders.CENA_S_DPH);
/* Rozdíl musí být v dokumentu vidět jako vlastní řádek, ne rozpuštěný ve slevě:
 * jinak by cena před slevou minus sleva nedávala koncovou cenu. */
test('nabídka OCK uvádí zaokrouhlení jako vlastní údaj',
  !!nd.placeholders.ZAOKROUHLENI_KC && /\d/.test(nd.placeholders.ZAOKROUHLENI_KC),
  nd.placeholders.ZAOKROUHLENI_KC);
test('rozpad v nabídce sedí: cena před slevou − sleva + zaokrouhlení = cena bez DPH',
  Math.abs(parse(nd.placeholders.CENA_PRED_SLEVOU) - parse(nd.placeholders.SLEVA_KC)
           - parse(nd.placeholders.ZAOKROUHLENI_KC.replace('−', '')) - parse(nd.placeholders.CENA_BEZ_DPH)) < 0.02,
  [nd.placeholders.CENA_PRED_SLEVOU, nd.placeholders.SLEVA_KC, nd.placeholders.ZAOKROUHLENI_KC, nd.placeholders.CENA_BEZ_DPH]);

const ctx = kr.kryciCtx(zak, v, JEKLY);
test('krycí list OCK ukazuje stejnou cenu jako nabídka',
  Math.abs(parse(ctx.hodnota) - ocekavana) < 1, [ctx.hodnota, ocekavana]);

const por = zk.porovnaniVariant(zak, [{ id: v.id, ock: r, proj: rp }]);
const m = k => por.metriky.find(x => x.klic === k);
test('porovnání variant ukazuje stejnou cenu OCK',
  Math.abs(m('ockPoSleve').hodnoty[0] - ocekavana) < 0.01, m('ockPoSleve').hodnoty[0]);
test('porovnání variant ukazuje zaokrouhlenou cenu PROJ',
  Math.abs(m('projCelkem').hodnoty[0] - ocekavanaProj) < 0.01,
  [m('projCelkem').hodnoty[0], ocekavanaProj]);
test('porovnání variant: celkem = OCK + PROJ po zaokrouhlení',
  Math.abs(m('celkemBezDph').hodnoty[0] - (ocekavana + ocekavanaProj)) < 0.01);
test('porovnání variant zvlášť ukáže zaokrouhlení', !!m('zaokrKc') && m('zaokrKc').hodnoty[0] < 0,
  m('zaokrKc') && m('zaokrKc').hodnoty[0]);
/* Bez zaokrouhlení nemá řádek v tabulce co dělat – prázdný řádek s nulou je
 * jen šum ve srovnání, které má být rychle přehlédnutelné. */
const varBez = zk.novaZakazka();
varBez.varianty[0].data.ock.fixes = true;
varBez.varianty[0].data.zaokr = zo.zaokrVypnuto();
/* Vypnout se musí OBĚ zaokrouhlení, OCK i PROJ. Do 11. 8. 2026 stačilo jedno,
 * protože cena projekce vycházela náhodou celá; jakmile sekce dostaly globální
 * přirážku, přestalo to platit a řádek se objevil kvůli projekci. Test má
 * ověřovat, že se prázdný řádek neukazuje — ne to, jaká čísla zrovna vyjdou. */
varBez.varianty[0].data.zaokrProj = zo.zaokrVypnuto();
const porBez = zk.porovnaniVariant(varBez, [{ id: varBez.varianty[0].id, ock: r, proj: rp }]);
test('bez zaokrouhlení se řádek v porovnání neukazuje',
  !porBez.metriky.find(x => x.klic === 'zaokrKc'));

/* ---------- 7) marže počítá z ceny, kterou zákazník zaplatí ---------- */
const nast = { slevy: { minMarze: 0.08 } };
const mBez = mz.marzeStavOck(r, v.data.sleva, nast, null);
const mSe = mz.marzeStavOck(r, v.data.sleva, nast, { krok: 100000, smer: 'dolu' });
test('marže bere cenu po zaokrouhlení', mSe.cena < mBez.cena && mSe.marze < mBez.marze,
  [mBez.cena, mSe.cena]);
test('marže bez zaokrouhlení zůstává beze změny',
  Math.abs(mz.marzeStavOck(r, v.data.sleva, nast).cena - mBez.cena) < 1e-9);
const mp = mz.marzeStavProj(rp, nast, { krok: 100000, smer: 'dolu' });
test('marže PROJ bere celek po zaokrouhlení', mp.celek.cena === zo.cenaNabidkyProj(rp, { krok: 100000, smer: 'dolu' }).cena);
test('sekce PROJ se zaokrouhlením nemění', mp.sekce.length === mz.marzeStavProj(rp, nast).sekce.length);

/* ---------- 8) zapnutí nic neblokuje a nic nemaže ---------- */
const otisk = JSON.stringify(zak);
zo.cenaNabidkyOck(r, v.data.sleva, v.data.zaokr);
zo.zaokrStav(1159710, v.data.zaokr);
test('výpočet koncové ceny nemění zakázku', JSON.stringify(zak) === otisk);

/* ---------- 9) nová varianta vs. zakázka uložená před #38 ---------- */
/* Nová varianta si nastavení nese už ze zakazka.js – ne až z líného doplnění
 * při otevření. Díky tomu je CHYBĚJÍCÍ pole spolehlivá známka toho, že zakázka
 * vznikla ještě před #38, a syncVarianta() jí smí dosadit vypnuto. Kdyby se
 * pole doplňovalo líně jako sleva, nešly by od sebe oba případy rozeznat
 * a stará nabídka by po otevření tiše změnila cenu. */
const nova = zk.novaZakazka().varianty[0];
test('nová varianta má zaokrouhlení rovnou v datech', !!nova.data.zaokr, JSON.stringify(nova.data.zaokr));
test('nová varianta zaokrouhluje nahoru na stokoruny',
  nova.data.zaokr.krok === 100 && nova.data.zaokr.smer === 'nahoru', JSON.stringify(nova.data.zaokr));
/* Archiv zakázky z doby před #38: pole prostě není. */
const stara = JSON.parse(JSON.stringify(nova));
delete stara.data.zaokr;
test('varianta bez pole se pozná od nové', !stara.data.zaokr && !!nova.data.zaokr);
test('cena staré varianty zůstává nezaokrouhlená',
  zo.cenaNabidkyOck(r, null, stara.data.zaokr).cena === r.souhrn.zakladCena);
test('vypnuto není totéž co výchozí', zo.zaokrVypnuto().krok !== zo.zaokrDefault().krok);

/* ---------- krok 1 konsolidace (#14, schváleno 3. 8. 2026) ----------
 * DPH a „celkem s DPH" počítá JEDNA funkce. Dřív si násobení psala každá
 * obrazovka sama — čtyři místa, a přesně z takové dvojkolejnosti vznikl
 * nález N3 (jedna sazba na součet OCK+PROJ). */
test('cenaSDph: základní výpočet', (() => {
  const v = cenaSDph(100000, 0.21);
  return Math.abs(v.dphKc - 21000) < 1e-9 && Math.abs(v.sDph - 121000) < 1e-9;
})());
test('cenaSDph: snížená sazba', (() => {
  const v = cenaSDph(200000, 0.12);
  return Math.abs(v.dphKc - 24000) < 1e-9 && Math.abs(v.sDph - 224000) < 1e-9;
})());
test('cenaSDph: bez sazby se nepřičítá nic', (() => {
  const v = cenaSDph(100000, null);
  return v.dphKc === 0 && v.sDph === 100000;
})());
test('cenaSDph: nečíselná cena je nula', cenaSDph(undefined, 0.21).sDph === 0);

/* Obrazovky a dokumenty musí funkci opravdu POUŽÍVAT — jinak by konsolidace
 * byla jen další (páté) místo. Hlídá se zdrojově. */
{
  const fs2 = require('fs');
  const ock = fs2.readFileSync(__dirname + '/ui/kalk_ock.js', 'utf8');
  const prj = fs2.readFileSync(__dirname + '/ui/kalk_proj.js', 'utf8');
  const nab = fs2.readFileSync(__dirname + '/nabidka.js', 'utf8');
  const nap = fs2.readFileSync(__dirname + '/nabidka_proj.js', 'utf8');
  const zak2 = fs2.readFileSync(__dirname + '/zakazka.js', 'utf8');
  test('hlavička OCK počítá DPH přes cenaSDph',
    ock.includes('cenaSDph(') && !ock.includes('* (1 + C.dph)'));
  test('hlavička PROJ počítá DPH přes cenaSDph',
    prj.includes('cenaSDph(') && !prj.includes('* (1 + PC.dph)'));
  test('nabídka OCK počítá DPH přes cenaSDph', nab.includes('cenaSDph('));
  test('nabídka PROJ počítá DPH přes cenaSDph', nap.includes('cenaSDph('));
  test('porovnání variant počítá DPH přes cenaSDph', zak2.includes('cenaSDph'));
}

/* ---------- 10) rozdělení na OCK a PROJ (zadání 4. 8. 2026) ----------
 * „do kalkulace ock patří pouze část týkající se výtahové šachty. část
 * týkající se projekčních prací pak patří do sekce kalkulace proj."
 *
 * Rozdělení se dělá nad daty, která už mohla odejít zákazníkovi, takže
 * nejdůležitější test tady není „jde to nastavit zvlášť", ale „variantě
 * uložené před rozdělením se nezměnila cena ani o korunu". Proto se testuje
 * ve dvou rovinách: čtení (zaokrProjZ spadne na dosavadní společné pole)
 * a dorovnání (zaokrZajisti dosadí tutéž hodnotu, ne výchozí). */
{
  const spolecne = { krok: 1000, smer: 'nahoru' };
  const vlastni  = { krok: 100, smer: 'dolu' };

  test('zaokrProjZ: bez vlastního pole čte společné',
    zo.zaokrProjZ({ zaokr: spolecne }) === spolecne);
  test('zaokrProjZ: vlastní pole má přednost',
    zo.zaokrProjZ({ zaokr: spolecne, zaokrProj: vlastni }) === vlastni);
  test('zaokrOckZ: čte jen svoje pole, PROJ ho neovlivní',
    zo.zaokrOckZ({ zaokr: spolecne, zaokrProj: vlastni }) === spolecne);
  test('zaokrProjZ: prázdná data nespadnou', zo.zaokrProjZ(null) === null && zo.zaokrOckZ(null) === null);

  /* Dorovnání nesmí být „nastav výchozí" – to by staré nabídce změnilo cenu. */
  const d1 = { zaokr: { krok: 1000, smer: 'nahoru' } };
  const cenaPred = zo.cenaNabidkyProj(rp, zo.zaokrProjZ(d1)).cena;
  zo.zaokrZajisti(d1);
  test('zaokrZajisti dosadí PROJ dosavadní hodnotu, ne výchozí',
    d1.zaokrProj.krok === 1000 && d1.zaokrProj.smer === 'nahoru', JSON.stringify(d1.zaokrProj));
  test('zaokrZajisti nezmění cenu PROJ ani o korunu',
    zo.cenaNabidkyProj(rp, zo.zaokrProjZ(d1)).cena === cenaPred);
  test('zaokrZajisti je idempotentní', (() => {
    const otiskD = JSON.stringify(d1); zo.zaokrZajisti(d1); zo.zaokrZajisti(d1);
    return JSON.stringify(d1) === otiskD;
  })());
  test('zaokrZajisti nepřepíše už nastavené vlastní pole', (() => {
    const d = { zaokr: { krok: 1000, smer: 'nahoru' }, zaokrProj: { krok: 100, smer: 'dolu' } };
    zo.zaokrZajisti(d);
    return d.zaokrProj.krok === 100 && d.zaokrProj.smer === 'dolu';
  })());
  /* Varianta z doby před #38 nemá ani společné pole: musí zůstat vypnutá
   * v OBOU částech, jinak by se otevřením v nové verzi zaokrouhlila. */
  test('varianta před #38: dorovnáním se zapne zaokrouhlení nikde', (() => {
    const d = {};
    zo.zaokrZajisti(d);
    return !zo.zaokrZapnuto(zo.zaokrOckZ(d)) && !zo.zaokrZapnuto(zo.zaokrProjZ(d));
  })());

  /* Nová varianta má obě pole rovnou v datech – ze stejného důvodu jako u #38:
   * chybějící pole je pak spolehlivá známka staré zakázky. */
  const nv = zk.novaVariantaData();
  test('nová varianta má vlastní zaokrouhlení pro PROJ', !!nv.zaokrProj, JSON.stringify(nv.zaokrProj));
  test('nová varianta začíná v obou částech stejně',
    nv.zaokr.krok === nv.zaokrProj.krok && nv.zaokr.smer === nv.zaokrProj.smer);

  /* Import staré zakázky: pole se dorovná a cena PROJ zůstane. */
  const stara2 = JSON.parse(JSON.stringify(zk.novaZakazka()));
  stara2.varianty.forEach(x => { delete x.data.zaokrProj; x.data.zaokr = { krok: 1000, smer: 'nahoru' }; });
  const cenaStare = zo.cenaNabidkyProj(rp, stara2.varianty[0].data.zaokr).cena;
  const naimportovana = zk.importZakazka(JSON.parse(JSON.stringify(stara2)));
  const dImp = naimportovana.varianty[0].data;
  test('import staré zakázky dorovná pole PROJ', !!dImp.zaokrProj, JSON.stringify(dImp.zaokrProj));
  test('import staré zakázky nezmění cenu PROJ',
    zo.cenaNabidkyProj(rp, zo.zaokrProjZ(dImp)).cena === cenaStare);

  /* Teprve tady se ověřuje vlastní zadání: dvě nastavení, dvě různé ceny,
   * a přepnutí PROJ se nesmí dotknout ceny šachty (a naopak). */
  const zak2 = zk.novaZakazka();
  const v2 = zak2.varianty[0];
  v2.data.ock.fixes = true;
  v2.data.zaokr     = { krok: 1000, smer: 'nahoru' };
  v2.data.zaokrProj = { krok: 100,  smer: 'dolu' };
  const cOck  = zo.cenaNabidkyOck(r, v2.data.sleva, zo.zaokrOckZ(v2.data));
  const cProj = zo.cenaNabidkyProj(rp, zo.zaokrProjZ(v2.data));
  test('OCK se zaokrouhlí podle svého nastavení', cOck.cena % 1000 === 0, cOck.cena);
  test('PROJ se zaokrouhlí podle svého nastavení', cProj.cena % 100 === 0 && cProj.zaokrKc <= 0,
    [cProj.cena, cProj.zaokrKc]);
  test('změna PROJ nezmění cenu OCK', (() => {
    const pred = zo.cenaNabidkyOck(r, v2.data.sleva, zo.zaokrOckZ(v2.data)).cena;
    v2.data.zaokrProj = { krok: 10000, smer: 'dolu' };
    return zo.cenaNabidkyOck(r, v2.data.sleva, zo.zaokrOckZ(v2.data)).cena === pred;
  })());
  test('změna OCK nezmění cenu PROJ', (() => {
    const pred = zo.cenaNabidkyProj(rp, zo.zaokrProjZ(v2.data)).cena;
    v2.data.zaokr = { krok: 100000, smer: 'dolu' };
    return zo.cenaNabidkyProj(rp, zo.zaokrProjZ(v2.data)).cena === pred;
  })());

  /* Porovnání variant čte obě části zvlášť – jinak by tabulka ukázala jinou
   * cenu PROJ než nabídka PROJ, a to je přesně ta „rozejitá" chyba, kterou
   * celý tenhle soubor hlídá. */
  const v3 = zk.novaZakazka();
  v3.varianty[0].data.ock.fixes = true;
  v3.varianty[0].data.zaokr     = { krok: 100000, smer: 'dolu' };
  v3.varianty[0].data.zaokrProj = { krok: 1000,   smer: 'nahoru' };
  const por3 = zk.porovnaniVariant(v3, [{ id: v3.varianty[0].id, ock: r, proj: rp }]);
  const m3 = k => por3.metriky.find(x => x.klic === k);
  test('porovnání variant čte PROJ z vlastního nastavení',
    Math.abs(m3('projCelkem').hodnoty[0]
             - zo.cenaNabidkyProj(rp, v3.varianty[0].data.zaokrProj).cena) < 0.01,
    m3('projCelkem').hodnoty[0]);
  test('porovnání variant čte OCK z vlastního nastavení',
    Math.abs(m3('ockPoSleve').hodnoty[0]
             - zo.cenaNabidkyOck(r, v3.varianty[0].data.sleva, v3.varianty[0].data.zaokr).cena) < 0.01,
    m3('ockPoSleve').hodnoty[0]);

  /* Marže: šestý parametr je nepovinný, aby starší volání dopadlo jako dřív. */
  const nastM = { slevy: { minMarze: 0.08 } };
  const pDve = mz.marzePrehled(r, rp, v3.varianty[0].data.sleva, nastM,
                               { krok: 100000, smer: 'dolu' }, { krok: 100, smer: 'nahoru' });
  const pJedno = mz.marzePrehled(r, rp, v3.varianty[0].data.sleva, nastM, { krok: 100000, smer: 'dolu' });
  test('marzePrehled: PROJ se řídí šestým parametrem',
    pDve.proj.celek.cena === zo.cenaNabidkyProj(rp, { krok: 100, smer: 'nahoru' }).cena);
  test('marzePrehled bez šestého parametru se chová jako dřív',
    pJedno.proj.celek.cena === zo.cenaNabidkyProj(rp, { krok: 100000, smer: 'dolu' }).cena);
  test('marzePrehled: OCK zůstává na svém nastavení', pDve.ock.cena === pJedno.ock.cena);
}

/* Rozdělení musí být vidět i na obrazovkách, ne jen v jádře. Zdrojová
 * kontrola je tu proto, že opomenuté ZO v Kalkulaci PROJ by se v číslech
 * projevilo až u zákazníka – testem jádra ho nechytneme. */
{
  const fs3 = require('fs');
  const prj = fs3.readFileSync(__dirname + '/ui/kalk_proj.js', 'utf8');
  const zam = fs3.readFileSync(__dirname + '/ui/zamek_ui.js', 'utf8');
  const zui = fs3.readFileSync(__dirname + '/ui/zaokrouhleni_ui.js', 'utf8');
  const com = fs3.readFileSync(__dirname + '/ui/common.js', 'utf8');
  const kui = fs3.readFileSync(__dirname + '/ui/kontroly_ui.js', 'utf8');
  const mui = fs3.readFileSync(__dirname + '/ui/marze_ui.js', 'utf8');
  test('Kalkulace PROJ počítá cenu z vlastního nastavení', prj.includes('cenaNabidkyProj(r, ZOP)'));
  test('Kalkulace PROJ nikde nesahá na zaokrouhlení OCK',
    !/zaokrStav\([^)]*,\s*ZO\)/.test(prj) && !/cenaNabidkyProj\(r,\s*ZO\)/.test(prj));
  test('zámek chrání i přepínače PROJ',
    zam.includes("'zaokrProjSetKrok'") && zam.includes("'zaokrProjSetSmer'"));
  test('karta PROJ má vlastní obsluhy',
    zui.includes('function zaokrProjSetKrok') && zui.includes('function zaokrProjSetSmer'));
  test('karta se jmenuje podle části', zui.includes('koncové ceny OCK') && zui.includes('koncové ceny PROJ'));
  test('obrazovky mají stav ZOP', com.includes('ZOP') && com.includes('zaokrZajisti(v.data)'));
  test('kontroly dostávají zaokrouhlení PROJ', kui.includes('zaokrProj:'));
  test('lišta marže dostává zaokrouhlení PROJ', mui.includes('ZOP'));
}

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
