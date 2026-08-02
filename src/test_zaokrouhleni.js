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
v.data.zaokr = { krok: 1000, smer: 'dolu' };
const ocekavana = zo.cenaNabidkyOck(r, v.data.sleva, v.data.zaokr).cena;

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
  Math.abs(m('projCelkem').hodnoty[0] - zo.cenaNabidkyProj(rp, v.data.zaokr).cena) < 0.01);
test('porovnání variant: celkem = OCK + PROJ po zaokrouhlení',
  Math.abs(m('celkemBezDph').hodnoty[0] - (ocekavana + zo.cenaNabidkyProj(rp, v.data.zaokr).cena)) < 0.01);
test('porovnání variant zvlášť ukáže zaokrouhlení', !!m('zaokrKc') && m('zaokrKc').hodnoty[0] < 0,
  m('zaokrKc') && m('zaokrKc').hodnoty[0]);
/* Bez zaokrouhlení nemá řádek v tabulce co dělat – prázdný řádek s nulou je
 * jen šum ve srovnání, které má být rychle přehlédnutelné. */
const varBez = zk.novaZakazka();
varBez.varianty[0].data.ock.fixes = true;
varBez.varianty[0].data.zaokr = zo.zaokrVypnuto();
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

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
