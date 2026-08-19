/* Nastavení ve složce (_nastaveni.json) nad sestavením dist/kalkulacka.html.
 *
 * Model se testuje v Node (src/test_nastaveni_db.js). Tady jde o to, co se
 * v Node ověřit nedá: že se soubor opravdu založí až při první změně, že
 * se po restartu aplikace nastavení vrátí, že se nezapisuje zbytečně, že
 * peníze (slevy, katalog) do souboru neprosáknou ani oklikou, jak se řeší
 * dva zapisovatelé a poškozený soubor, a že odpojení složky nastavení
 * nesebere.
 */
import { chromium } from 'playwright';
import path from 'path';

const soubor = 'file://' + path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail ? '  → ' + detail : '')); }
};

const prohlizec = await chromium.launch();
const stranka = await prohlizec.newPage();
const chyby = [];
stranka.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });
stranka.on('pageerror', e => chyby.push(String(e)));
stranka.on('dialog', d => d.accept());
await stranka.goto(soubor);
await stranka.waitForTimeout(400);

/* Paměťová složka + počítadlo zápisů: bez něj by nešlo poznat, jestli
 * aplikace nezapisuje na Disk pokaždé, co se něco překreslí. */
const pripojSlozku = `
  window.ZAPISY = window.ZAPISY || 0;
  window.SLOZKA = window.SLOZKA || new Map();
  const zapis = (jm) => ({
    write: t => { window.ZAPISY++; window.SLOZKA.set(jm, String(t)); return Promise.resolve(); },
    close: () => Promise.resolve(),
  });
  const fileHandle = jm => ({
    kind: 'file', name: jm,
    getFile: () => Promise.resolve({ text: () => Promise.resolve(window.SLOZKA.get(jm)), size: window.SLOZKA.get(jm).length }),
    createWritable: () => Promise.resolve(zapis(jm)),
  });
  window.KOREN = {
    kind: 'directory', name: '_DB',
    getFileHandle: (jm, opt) => {
      if (!window.SLOZKA.has(jm)) {
        if (!(opt && opt.create)) return Promise.reject(new Error('NotFoundError'));
        window.SLOZKA.set(jm, '');
      }
      return Promise.resolve(fileHandle(jm));
    },
    removeEntry: jm => { window.SLOZKA.delete(jm); return Promise.resolve(); },
    entries: () => {
      const k = [...window.SLOZKA.keys()]; let i = 0;
      return { next: () => Promise.resolve(i < k.length ? { done: false, value: [k[i], fileHandle(k[i++])] } : { done: true }) };
    },
  };
  ULO_STAV.koren = window.KOREN; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = true;
  NAST.jeAdmin = true;
`;
await stranka.evaluate(pripojSlozku);

console.log('\nNastavení ve složce – _nastaveni.json');

// 1. prázdná složka: nic se nezakládá naprázdno
const start = await stranka.evaluate(async () => {
  const v = await nastdbNactiZeSlozky();
  return { v, souboru: window.SLOZKA.size, zapisy: window.ZAPISY,
           hlaska: NASTDB_STAV.hlaska, typ: NASTDB_STAV.hlaskaTyp };
});
zkus('prázdná složka nastavení nenese', start.v === false);
zkus('a nezaloží se, dokud se nic nezmění', start.souboru === 0 && start.zapisy === 0);
zkus('obsluha se to dozví bez varování', /při první změně/i.test(start.hlaska) && start.typ === '', start.hlaska);

// 2. první změna soubor založí
const prvni = await stranka.evaluate(async () => {
  NAST.firma.nazev = 'ZKOUŠKA s.r.o.';
  const v = await nastdbUlozHned();
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR) || 'null');
  return { v, jmena: [...window.SLOZKA.keys()], nazev: d && d.nastaveni.firma.nazev,
           aplikace: d && d.aplikace, schema: d && d.schema, razitko: !!(d && d.razitko),
           popis: !!(d && d._popis) };
});
zkus('první změna soubor založí', prvni.v === true && prvni.jmena.includes('_nastaveni.json'), prvni.jmena.join(', '));
zkus('firemní údaj je v souboru', prvni.nazev === 'ZKOUŠKA s.r.o.', String(prvni.nazev));
zkus('soubor se hlásí k aplikaci a schématu', prvni.aplikace === 'Kalkulátor OCK' && prvni.schema === 1);
zkus('nese razítko i vysvětlení, k čemu je', prvni.razitko === true && prvni.popis === true);

// 3. peníze do souboru nepatří
const penize = await stranka.evaluate(() => {
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { slevy: 'slevy' in d, katalog: 'katalog' in d, sablony: 'sablony' in d,
           slevyVNast: !!(d.nastaveni && d.nastaveni.slevy),
           admin: !!(d.nastaveni && 'jeAdmin' in d.nastaveni),
           panel: !!(d.nastaveni && 'panel' in d.nastaveni),
           firma: !!d.nastaveni.firma, spec: !!d.specifikace, slovnik: !!d.slovnik };
});
zkus('slevové stropy v souboru nejsou', penize.slevy === false && penize.slevyVNast === false);
zkus('katalog ani šablony tam nejsou', penize.katalog === false && penize.sablony === false);
zkus('role relace se neukládá', penize.admin === false && penize.panel === false);
zkus('firma, číselníky i slovník tam naopak jsou', penize.firma && penize.spec && penize.slovnik);

// 4. beze změny se nezapisuje
const zbytecne = await stranka.evaluate(async () => {
  const pred = window.ZAPISY;
  const v = await nastdbUlozHned();
  render();
  return { v, pred, po: window.ZAPISY };
});
zkus('shodné nastavení se znovu nezapíše', zbytecne.v === false && zbytecne.po === zbytecne.pred,
  zbytecne.pred + ' → ' + zbytecne.po);

// 5. změna přes běžný setter se uloží sama (jen se zpožděním)
const setter = await stranka.evaluate(async () => {
  const pred = window.ZAPISY;
  nastToggleTab('proj', false);
  const hnedPo = window.ZAPISY;
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { pred, hnedPo, po: window.ZAPISY, ulozeno: d.nastaveni.tabViditelnost.proj };
});
zkus('změna se nezapisuje okamžitě', setter.hnedPo === setter.pred);
zkus('ale po chvíli klidu ano', setter.po === setter.pred + 1, setter.pred + ' → ' + setter.po);
zkus('a v souboru je nová hodnota', setter.ulozeno === false);

// 6. rychlé psaní za sebou = jeden zápis
const psani = await stranka.evaluate(async () => {
  const pred = window.ZAPISY;
  for (const t of ['A', 'AB', 'ABC', 'ABCD']) { firmaSet('nazev', t); await new Promise(r => setTimeout(r, 120)); }
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { pocet: window.ZAPISY - pred, nazev: d.nastaveni.firma.nazev };
});
zkus('čtyři úhozy za sebou = jeden zápis', psani.pocet === 1, String(psani.pocet));
zkus('uloží se poslední stav', psani.nazev === 'ABCD', String(psani.nazev));

// 7. číselníky specifikace jdou do složky taky
const ciselnik = await stranka.evaluate(async () => {
  const klic = Object.keys(TS_C)[0];
  sdItemAdd(klic);
  await nastdbUlozHned();
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { klic, delka: d.specifikace.ciselniky[klic].length, vPameti: TS_C[klic].length };
});
zkus('přidaná položka číselníku je v souboru', ciselnik.delka === ciselnik.vPameti, ciselnik.klic);

// 8. restart aplikace: nastavení se vrátí ze složky
const restart = await stranka.evaluate(async () => {
  const zaloha = window.SLOZKA.get(NASTDB_SOUBOR);
  // simulace nového spuštění: paměť zpátky na výchozí, složka zůstane
  NAST.firma.nazev = 'něco úplně jiného';
  NAST.tabViditelnost.proj = true;
  NASTDB_STAV.razitko = ''; NASTDB_STAV.otisk = ''; NASTDB_STAV.nacteno = false;
  const puvodniFirma = NAST.firma, puvodniTs = TS_C[Object.keys(TS_C)[0]];
  const v = await nastdbNactiZeSlozky();
  return { v, zaloha, nazev: NAST.firma.nazev, proj: NAST.tabViditelnost.proj,
           stejnaReference: NAST.firma === puvodniFirma && TS_C[Object.keys(TS_C)[0]] === puvodniTs,
           hlaska: NASTDB_STAV.hlaska };
});
zkus('po spuštění se nastavení načte ze složky', restart.v === true);
zkus('firemní údaje jsou zpátky', restart.nazev === 'ABCD', String(restart.nazev));
zkus('i viditelnost záložek', restart.proj === false);
zkus('objekty se mění na místě, otevřené formuláře drží', restart.stejnaReference === true);
zkus('obsluha vidí, co se načetlo', /ABCD/.test(restart.hlaska), restart.hlaska);

// 9. načtení nesmí samo vyvolat zápis
const poNacteni = await stranka.evaluate(async () => {
  const pred = window.ZAPISY;
  await nastdbNactiZeSlozky();
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  return { pred, po: window.ZAPISY };
});
zkus('načtení ze složky nezpůsobí zápis', poNacteni.po === poNacteni.pred,
  poNacteni.pred + ' → ' + poNacteni.po);

// 10. slevy zůstávají věcí databáze programu
const slevy = await stranka.evaluate(async () => {
  NAST.slevy.minMarze = 0.42;
  slStrop('Jednatel', 55);
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { vSouboru: JSON.stringify(d).indexOf('0.42') >= 0, vPameti: NAST.slevy.minMarze };
});
zkus('změna slevového stropu nastavení neposkvrní', slevy.vSouboru === false);
zkus('v paměti přitom platí dál', slevy.vPameti === 0.42);

// 11. podvrh: celá konfigurace zkopírovaná do složky
const podvrh = await stranka.evaluate(async () => {
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  d.katalog = { polozky: [{ nazev: 'propašovaná položka' }] };
  d.slevy = { minMarze: 0.99 };
  d.nastaveni.slevy = { minMarze: 0.99 };
  d.nastaveni.jeAdmin = false;
  d.razitko = '2026-07-30T23:00:00.000Z';
  window.SLOZKA.set(NASTDB_SOUBOR, JSON.stringify(d));
  const v = await nastdbNactiZeSlozky();
  return { v, minMarze: NAST.slevy.minMarze, admin: NAST.jeAdmin,
           katalog: JSON.stringify(KATALOG).indexOf('propašovaná') >= 0 };
});
zkus('soubor se použije', podvrh.v === true);
zkus('ale slevy z něj ne', podvrh.minMarze === 0.42, String(podvrh.minMarze));
zkus('ani katalog', podvrh.katalog === false);
zkus('a správce se nevypne sám', podvrh.admin === true);

// 12. cizí zápis mezitím: nepřepisuje se poslepu
const kolize = await stranka.evaluate(async () => {
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  d.nastaveni.firma.nazev = 'ZAPSAL KOLEGA';
  d.razitko = '2026-07-31T09:00:00.000Z';
  window.SLOZKA.set(NASTDB_SOUBOR, JSON.stringify(d));
  firmaSet('nazev', 'MOJE VERZE');
  const v = await nastdbUlozHned();
  const naDisku = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { v, kolize: NASTDB_STAV.kolize, typ: NASTDB_STAV.hlaskaTyp,
           naDisku: naDisku.nastaveni.firma.nazev, vPameti: NAST.firma.nazev };
});
zkus('cizí verze se nepřepíše potichu', kolize.v === false && kolize.naDisku === 'ZAPSAL KOLEGA');
zkus('rozpozná se to jako kolize s varováním', kolize.kolize === true && kolize.typ === 'varovani');
zkus('moje změna se z paměti neztratí', kolize.vPameti === 'MOJE VERZE');

// 13. za kolize se nepíše ani po dalších změnách
const zamrzlo = await stranka.evaluate(async () => {
  const pred = window.ZAPISY;
  firmaSet('nazev', 'MOJE VERZE 2');
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  return { pred, po: window.ZAPISY };
});
zkus('dokud se kolize nevyřeší, nezapisuje se', zamrzlo.po === zamrzlo.pred);

// 14. vyřešení kolize: přepsat svojí
const vyreseno = await stranka.evaluate(async () => {
  const v = await nastdbPrepis();                       // confirm se potvrdí
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { v, kolize: NASTDB_STAV.kolize, naDisku: d.nastaveni.firma.nazev };
});
zkus('po potvrzení se přepíše mojí verzí', vyreseno.v === true && vyreseno.naDisku === 'MOJE VERZE 2');
zkus('a kolize je pryč', vyreseno.kolize === false);

// 15. poškozený soubor se nepoužije ani nepřepíše
const rozbity = await stranka.evaluate(async () => {
  const zaloha = window.SLOZKA.get(NASTDB_SOUBOR);
  window.SLOZKA.set(NASTDB_SOUBOR, '{tohle není JSON');
  const v = await nastdbNactiZeSlozky();
  const pred = window.ZAPISY;
  firmaSet('nazev', 'POKUS O ZÁPIS');
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  return { v, zaloha, chyba: !!NASTDB_STAV.chyba, typ: NASTDB_STAV.hlaskaTyp,
           naDisku: window.SLOZKA.get(NASTDB_SOUBOR) === '{tohle není JSON',
           zapisy: window.ZAPISY - pred, vPameti: NAST.firma.nazev };
});
zkus('poškozený soubor se nenačte', rozbity.v === false && rozbity.chyba === true);
zkus('a nepřepíše se sám od sebe', rozbity.naDisku === true && rozbity.zapisy === 0);
zkus('obsluha dostane varování', rozbity.typ === 'varovani');
zkus('nastavení v paměti mezitím platí dál', rozbity.vPameti === 'POKUS O ZÁPIS');

// 16. cizí soubor stejného jména se odmítne
const cizi = await stranka.evaluate(async () => {
  window.SLOZKA.set(NASTDB_SOUBOR, JSON.stringify({ aplikace: 'Něco jiného', nastaveni: {} }));
  const v = await nastdbNactiZeSlozky();
  return { v, chyba: NASTDB_STAV.chyba };
});
zkus('soubor z jiné aplikace se nepoužije', cizi.v === false && /aplikac/i.test(cizi.chyba), cizi.chyba);

// 17. soubor nastavení se neplete mezi zakázky
const mimo = await stranka.evaluate(async () => {
  return { zakazkovy: uloJeZakazkovySoubor(NASTDB_SOUBOR), seznam: await uloSeznamSouboru() };
});
zkus('_nastaveni.json není zakázka', mimo.zakazkovy === false);
zkus('a v seznamu zakázek se neukáže', mimo.seznam.length === 0, mimo.seznam.join(', '));

// 18. založení souboru znovu po havárii
const znovu = await stranka.evaluate(async (zaloha) => {
  window.SLOZKA.set(NASTDB_SOUBOR, '{rozbité');
  await nastdbNactiZeSlozky();
  const v = await nastdbPrepis();                       // confirm se potvrdí
  const d = JSON.parse(window.SLOZKA.get(NASTDB_SOUBOR));
  return { v, chyba: NASTDB_STAV.chyba, nazev: d.nastaveni.firma.nazev, zaloha };
}, rozbity.zaloha);
zkus('rozbitý soubor jde na výslovný pokyn založit znovu', znovu.v === true && znovu.chyba === '');
zkus('zapíše se, co je v aplikaci', znovu.nazev === 'POKUS O ZÁPIS', String(znovu.nazev));

// 19. odpojení složky nastavení nesebere
const odpoj = await stranka.evaluate(async () => {
  const pred = NAST.firma.nazev;
  uloOdpojSlozku();                                     // confirm se potvrdí
  await new Promise(r => setTimeout(r, 100));
  const predZapisy = window.ZAPISY;
  firmaSet('nazev', 'PO ODPOJENÍ');
  await new Promise(r => setTimeout(r, NASTDB_PRODLEVA + 400));
  return { pred, poOdpojeni: pred === NAST.firma.nazev || true,
           nazevTed: NAST.firma.nazev, souboru: window.SLOZKA.size,
           zapisy: window.ZAPISY - predZapisy, razitko: NASTDB_STAV.razitko };
});
zkus('po odpojení zůstane nastavení v paměti', odpoj.nazevTed === 'PO ODPOJENÍ');
zkus('do odpojené složky se nezapisuje', odpoj.zapisy === 0);
zkus('odpojení ve složce nic nesmaže', odpoj.souboru > 0);
zkus('stav se vyčistí', odpoj.razitko === '');

// 20. karta v Nastavení se od 18. 8. 2026 (#150) NEkreslí — složka skončila
const ui = await stranka.evaluate(async (pripoj) => {
  const bezSlozky = nastdbBlok();
  eval(pripoj);
  await nastdbNactiZeSlozky();
  const seSlozkou = nastdbBlok();
  otevriNastaveni();
  const html = document.getElementById('nastaveni-panel').innerHTML;
  zavriNastaveni();
  return { bezSlozky, seSlozkou,
           jeVPanelu: html.indexOf('Nastavení ve složce') >= 0,
           radiPripojit: html.indexOf('Připojit ji jde') >= 0 };
}, pripojSlozku);
zkus('blok konfigurace ve složce je bez složky prázdný', ui.bezSlozky === '');
zkus('blok je prázdný i s podstrčenou složkou', ui.seSlozkou === '');
zkus('karta „Nastavení ve složce" v panelu není', ui.jeVPanelu === false);
zkus('panel neradí složku připojovat', ui.radiPripojit === false);

zkus('konzole je čistá', chyby.length === 0, chyby.slice(0, 3).join(' | '));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
