/* Kontrola databáze ve složce nad sestavením dist/kalkulacka.html.
 *
 * Skutečný výběr složky se tady prověřit nedá – nativní dialog žádný skript
 * neotevře a v kontejneru není Disk Google. Ověřuje se proto to, co selhat
 * může i bez složky: že se karta vůbec vykreslí, že modál jde otevřít a
 * zavřít, že hledání filtruje rejstřík, že se do konzole nic nesype a že
 * pojistka proti přepsání odeslané nabídky drží.
 */
import { chromium } from 'playwright';
import path from 'path';

const soubor = 'file://' + path.resolve('dist/kalkulacka.html');
let ok = 0, fail = 0;
const zkus = (popis, podminka) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis); }
};

const prohlizec = await chromium.launch();
const stranka = await prohlizec.newPage();
const chyby = [];
stranka.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });
stranka.on('pageerror', e => chyby.push(String(e)));
await stranka.goto(soubor);
await stranka.waitForTimeout(400);

console.log('\nDatabáze ve složce');

// 1. karta na stránce Zakázka
await stranka.evaluate(() => prepniTab('zakazka'));
await stranka.waitForTimeout(120);
const textZakazky = await stranka.evaluate(() => document.getElementById('page-zakazka').innerText);
zkus('karta databáze je na stránce Zakázka', /Databáze zakázek/i.test(textZakazky));
zkus('karta říká, že složka není vybraná', /nen[íi] vybran/i.test(textZakazky));
zkus('karta nabízí výběr složky', textZakazky.includes('Vybrat složku'));

// 2. modál
await stranka.evaluate(() => otevriUloziste());
await stranka.waitForTimeout(120);
zkus('panel se otevřel', await stranka.evaluate(() =>
  document.getElementById('uloziste-overlay').style.display !== 'none'));
zkus('panel má hledání', await stranka.evaluate(() => !!document.getElementById('ulozisteHledat')));
await stranka.evaluate(() => zavriUloziste());
await stranka.waitForTimeout(80);
zkus('panel se zavřel', await stranka.evaluate(() =>
  document.getElementById('uloziste-overlay').style.display === 'none'));

// 3. hledání nad rejstříkem (bez složky – rejstřík nasypeme rovnou do stavu)
const nalezeno = await stranka.evaluate(() => {
  ULO_STAV.rejstrik = [
    { soubor: 'a.json', cislo: '2026 - OPR - CN - 0500', nazevAkce: 'Výtah Nádraží', objednatel: 'Skanska', datum: '2026-07-01', variant: 2 },
    { soubor: 'b.json', cislo: '2026 - OPR - CN - 0501', nazevAkce: 'Šachta Anděl', objednatel: 'Metrostav', datum: '2026-07-02', variant: 1 },
  ];
  return [uloHledej(ULO_STAV.rejstrik, 'skanska').length,
          uloHledej(ULO_STAV.rejstrik, 'sachta').length,
          uloHledej(ULO_STAV.rejstrik, '0501 metrostav').length,
          uloHledej(ULO_STAV.rejstrik, 'nic takového').length];
});
zkus('hledání podle objednatele', nalezeno[0] === 1);
zkus('hledání ignoruje diakritiku', nalezeno[1] === 1);
zkus('hledání spojuje slova (AND)', nalezeno[2] === 1);
zkus('co tam není, se nenajde', nalezeno[3] === 0);

// 4. pojistka: uzamčenou variantu nesmí zápis potichu přepsat
const zamek = await stranka.evaluate(() => {
  const zamcena = () => ({
    id: 'v1', nazev: 'V1',
    zamek: { zamceno: true, kdy: '2026-07-20T10:00:00.000Z', typ: 'nabidka', cislo: '2026 - OPR - CN - 0500', otisk: { celkem: 123 } },
  });
  const naDisku = { varianty: [zamcena()] };
  const stejne = { varianty: [zamcena()] };
  const bezNi = { varianty: [] };
  const odemcena = { varianty: [{ id: 'v1', nazev: 'V1', zamek: null }] };
  const admin = { varianty: [{ id: 'v1', nazev: 'V1', zamek: null, odemceni: [{ kdy: 'x', kdo: 'admin', duvod: 'oprava' }] }] };
  return {
    stejne: uloKontrolaZamku(naDisku, stejne).ok,
    bezNi: uloKontrolaZamku(naDisku, bezNi).ok,
    odemcena: uloKontrolaZamku(naDisku, odemcena).ok,
    admin: uloKontrolaZamku(naDisku, admin).ok,
  };
});
zkus('beze změny zámku se uloží', zamek.stejne === true);
zkus('chybějící uzamčená varianta zápis zastaví', zamek.bezNi === false);
zkus('svévolné odemčení zápis zastaví', zamek.odemcena === false);
zkus('doložené odemčení správcem projde', zamek.admin === true);

// 5. jméno souboru a filtr cizích souborů
const jmena = await stranka.evaluate(() => ({
  jmeno: uloJmenoSouboru({ cislo: '2026 - OPR - CN - 0500', varianty: [{ id: 'v1' }] }),
  nase: uloJeZakazkovySoubor('2026-OPR-CN-0500.json'),
  rejstrik: uloJeZakazkovySoubor('_rejstrik.json'),
  konflikt: uloJeZakazkovySoubor('2026-OPR-CN-0500 (konfliktní kopie počítače notebook 2026-07-30).json'),
  kopie: uloJeZakazkovySoubor('2026-OPR-CN-0500 (1).json'),
}));
zkus('jméno souboru vychází z čísla zakázky', jmena.jmeno === '2026-OPR-CN-0500.json');
zkus('vlastní soubor se pozná', jmena.nase === true);
zkus('rejstřík se nepočítá mezi zakázky', jmena.rejstrik === false);
zkus('konfliktní kopie z Disku se přeskočí', jmena.konflikt === false);
zkus('duplicitní „(1)" kopie se přeskočí', jmena.kopie === false);

// 6. ostatní části aplikace zůstaly nedotčené
await stranka.evaluate(() => { prepniTab('kalk'); render(); });
await stranka.waitForTimeout(150);
zkus('kalkulace se pořád vykreslí', await stranka.evaluate(() =>
  document.getElementById('page-kalk').innerText.length > 200));
zkus('konzole je čistá', chyby.length === 0);
if (chyby.length) chyby.slice(0, 5).forEach(c => console.log('     ! ' + c));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
