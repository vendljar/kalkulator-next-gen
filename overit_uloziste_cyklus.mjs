/* Celý cyklus databáze ve složce nad sestavením dist/kalkulacka.html.
 *
 * Nativní výběr složky nejde zautomatizovat, ale všechno za ním už ano:
 * podstrčíme aplikaci složku, která se navenek chová jako ta od prohlížeče
 * (getFileHandle / entries / removeEntry / createWritable), jenže drží
 * soubory v paměti stránky. Tím se dá projet ulož → seznam → otevři →
 * přepiš → smaž a hlavně ty dvě pojistky, kvůli kterým to celé vzniklo:
 * kolize dvou zapisovatelů a ochrana odeslané nabídky.
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
stranka.on('dialog', d => d.accept());          // confirm() = „ano, přepiš"
await stranka.goto(soubor);
await stranka.waitForTimeout(400);

// složka v paměti
await stranka.evaluate(() => {
  window.SLOZKA = new Map();
  const zapis = (jm) => ({
    write: t => { window.SLOZKA.set(jm, String(t)); return Promise.resolve(); },
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
});

console.log('\nDatabáze ve složce – celý cyklus');

// 1. uložení
const ulozeno = await stranka.evaluate(async () => {
  ZAK.cislo = '2026 - OPR - CN - 0500';
  ZAK.nazevAkce = 'Výtah Nádraží'; ZAK.objednatel = 'Skanska'; ZAK.datum = '2026-07-30';
  const v = await uloUlozDoSlozky({});
  return { v, soubory: [...window.SLOZKA.keys()], razitko: !!ZAK.uloRazitko, vazba: ULO_STAV.soubor };
});
zkus('zakázka se uložila', ulozeno.v === true);
zkus('vznikl soubor podle čísla zakázky', ulozeno.soubory.includes('2026-OPR-CN-0500.json'), ulozeno.soubory.join(', '));
zkus('vznikl i rejstřík', ulozeno.soubory.includes('_rejstrik.json'));
zkus('zakázka dostala razítko uložení', ulozeno.razitko === true);
zkus('aplikace si drží vazbu na soubor', ulozeno.vazba === '2026-OPR-CN-0500.json');

// 2. rejstřík: co v něm je a co v něm být nesmí
const rej = await stranka.evaluate(() => {
  const r = JSON.parse(window.SLOZKA.get('_rejstrik.json'));
  return { pocet: r.zakazky.length, prvni: r.zakazky[0], text: window.SLOZKA.get('_rejstrik.json') };
});
zkus('rejstřík má jeden záznam', rej.pocet === 1);
zkus('rejstřík nese číslo a objednatele',
  rej.prvni.cislo === '2026 - OPR - CN - 0500' && rej.prvni.objednatel === 'Skanska');
zkus('rejstřík nenese žádné ceny', !/cena|castka|celkem|marze|naklad|sleva/i.test(Object.keys(rej.prvni).join(',')),
  Object.keys(rej.prvni).join(','));

// 3. seznam čte jen naše soubory
const seznam = await stranka.evaluate(async () => {
  window.SLOZKA.set('poznamky.txt', 'nic');
  window.SLOZKA.set('2026-OPR-CN-0500 (konfliktní kopie počítače notebook 2026-07-30).json', '{}');
  return uloSeznamSouboru();
});
zkus('seznam vidí jen zakázky, ne cizí soubory', seznam.length === 1 && seznam[0] === '2026-OPR-CN-0500.json',
  seznam.join(', '));

// 4. otevření zpátky
const otevreno = await stranka.evaluate(async () => {
  ZAK.objednatel = 'ROZBITO';                 // rozhodíme paměť, ať je vidět, že se čte z disku
  const v = await uloOtevriZeSlozky('2026-OPR-CN-0500.json');
  return { v, objednatel: ZAK.objednatel, akce: ZAK.nazevAkce };
});
zkus('zakázka se otevřela ze složky', otevreno.v === true);
zkus('načtená data souhlasí', otevreno.objednatel === 'Skanska' && otevreno.akce === 'Výtah Nádraží',
  otevreno.objednatel);

// 5. druhý zápis přepíše týž soubor, nezaloží nový
const druhy = await stranka.evaluate(async () => {
  ZAK.kontakt = 'Ing. Novák';
  const v = await uloUlozDoSlozky({});
  const r = JSON.parse(window.SLOZKA.get('_rejstrik.json'));
  return { v, pocetSouboru: [...window.SLOZKA.keys()].filter(j => uloJeZakazkovySoubor(j)).length,
           pocetZaznamu: r.zakazky.length, kontakt: JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json')).kontakt };
});
zkus('druhé uložení prošlo', druhy.v === true);
zkus('soubor se přepsal, nový nevznikl', druhy.pocetSouboru === 1, String(druhy.pocetSouboru));
zkus('rejstřík se nezdvojil', druhy.pocetZaznamu === 1);
zkus('změna je opravdu v souboru', druhy.kontakt === 'Ing. Novák');

// 6. kolize: soubor se mezitím změnil pod rukama
const kolize = await stranka.evaluate(async () => {
  const cizi = JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json'));
  cizi.uloRazitko = '2026-07-30T23:59:59.000Z';       // zapsal někdo jiný
  cizi.objednatel = 'Kolega';
  window.SLOZKA.set('2026-OPR-CN-0500.json', JSON.stringify(cizi));
  const tiche = await uloUlozDoSlozky({ tiche: true });
  const poTichem = JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json')).objednatel;
  const rucni = await uloUlozDoSlozky({});            // confirm() se potvrdí
  const poRucnim = JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json')).objednatel;
  return { tiche, poTichem, rucni, poRucnim };
});
zkus('automatické uložení při kolizi neuloží', kolize.tiche === false);
zkus('cizí zápis zůstal nedotčený', kolize.poTichem === 'Kolega');
zkus('ruční uložení po potvrzení přepíše', kolize.rucni === true && kolize.poRucnim === 'Skanska',
  kolize.poRucnim);

// 7. pojistka na odeslanou (vytištěnou) nabídku
const zamek = await stranka.evaluate(async () => {
  const naDisku = JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json'));
  naDisku.varianty[0].zamek = { zamceno: true, kdy: '2026-07-25T08:00:00.000Z',
    typ: 'nabidka', cislo: '2026 - OPR - CN - 0500', otisk: { celkem: 123456 } };
  window.SLOZKA.set('2026-OPR-CN-0500.json', JSON.stringify(naDisku));
  ULO_STAV.razitko = naDisku.uloRazitko;
  ZAK.varianty[0].zamek = null;                       // v paměti zámek „zmizel"
  ZAK.objednatel = 'Přepis odeslané nabídky';
  const v = await uloUlozDoSlozky({});
  return { v, objednatel: JSON.parse(window.SLOZKA.get('2026-OPR-CN-0500.json')).objednatel,
           hlaska: ULO_STAV.hlaska, typ: ULO_STAV.hlaskaTyp };
});
zkus('zápis přes odeslanou nabídku neprojde', zamek.v === false);
zkus('soubor na disku zůstal beze změny', zamek.objednatel === 'Skanska', zamek.objednatel);
zkus('uživatel dostane varování', zamek.typ === 'varovani' && /odeslan/i.test(zamek.hlaska), zamek.hlaska);

// 8. přestavba rejstříku ze souborů
const prestavba = await stranka.evaluate(async () => {
  window.SLOZKA.delete('_rejstrik.json');
  ULO_STAV.rejstrik = [];
  await uloPrestavRejstrik();
  return { pocet: ULO_STAV.rejstrik.length, cislo: (ULO_STAV.rejstrik[0] || {}).cislo, hlaska: ULO_STAV.hlaska };
});
zkus('rejstřík se přestaví ze samotných souborů', prestavba.pocet === 1, prestavba.hlaska);
zkus('přestavěný rejstřík zná číslo zakázky', prestavba.cislo === '2026 - OPR - CN - 0500');

// 9. mazání – jen správce a jen po dotazu
const mazani = await stranka.evaluate(async () => {
  NAST.jeAdmin = false;
  uloSmazZeSlozky('2026-OPR-CN-0500.json');
  await new Promise(r => setTimeout(r, 60));
  const beznyUzivatel = window.SLOZKA.has('2026-OPR-CN-0500.json');
  NAST.jeAdmin = true;
  uloSmazZeSlozky('2026-OPR-CN-0500.json');
  await new Promise(r => setTimeout(r, 120));
  return { beznyUzivatel, poSpravci: window.SLOZKA.has('2026-OPR-CN-0500.json'),
           rejstrik: ULO_STAV.rejstrik.length };
});
zkus('běžný uživatel zakázku ze složky nesmaže', mazani.beznyUzivatel === true);
zkus('správce po potvrzení smaže', mazani.poSpravci === false);
zkus('smazaná zakázka zmizí i z rejstříku', mazani.rejstrik === 0);

// 10. odpojení nic nemaže
const odpojeni = await stranka.evaluate(async () => {
  window.SLOZKA.set('2026-OPR-CN-0600.json', '{}');
  uloOdpojSlozku();
  await new Promise(r => setTimeout(r, 60));
  return { pripraveno: ULO_STAV.pripraveno, souboru: window.SLOZKA.size };
});
zkus('odpojení složku odpojí', odpojeni.pripraveno === false);
zkus('odpojení nic ve složce nesmaže', odpojeni.souboru > 0);

// 11. automatické ukládání po chvíli klidu
const auto = await stranka.evaluate(async () => {
  // složku připojíme znovu a vážeme ji na soubor, jako by ji uživatel otevřel
  ULO_STAV.koren = window.KOREN; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = true;
  ULO_STAV.auto = true; ULO_STAV.hlaska = '';
  ZAK.cislo = '2026 - OPR - CN - 0700'; ZAK.objednatel = 'Auto';
  await uloUlozDoSlozky({});
  const vazba = ULO_STAV.soubor;

  // čekání zkrátíme: čas jinak běží 15 s, což by z kontroly udělalo zdržení
  const puvodni = window.setTimeout;
  window.setTimeout = (fn) => puvodni(fn, 0);
  ZAK.kontakt = 'Ing. Automat';
  uloTik();
  const naplanovano = !!ULO_STAV.timer;
  await new Promise(r => puvodni(r, 200));
  window.setTimeout = puvodni;

  const naDisku = JSON.parse(window.SLOZKA.get(vazba) || '{}');

  // beze změny se už neukládá
  ULO_STAV.timer = null;
  uloTik();
  return { vazba, naplanovano, kontakt: naDisku.kontakt, znovu: !!ULO_STAV.timer };
});
zkus('automatické uložení se naplánuje', auto.naplanovano === true);
zkus('automatické uložení zapsalo změnu', auto.kontakt === 'Ing. Automat', String(auto.kontakt));
zkus('beze změny se znovu neukládá', auto.znovu === false);

zkus('konzole je čistá', chyby.length === 0);
if (chyby.length) chyby.slice(0, 5).forEach(c => console.log('     ! ' + c));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
