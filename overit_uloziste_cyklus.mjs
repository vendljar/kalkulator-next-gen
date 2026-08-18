/* Složková databáze je od 18. 8. 2026 VYPNUTÁ (#150) — jediná databáze je
 * online. Tenhle harness dřív projížděl celý složkový cyklus (ulož → seznam
 * → otevři → přepiš → smaž) nad podstrčenou složkou v paměti; teď ověřuje
 * opak: že se složka nedá připojit žádnou cestou, že na ni žádná část UI
 * neposílá a že aplikace bez ní běží čistě. Pojistky modelu (zámky, kolize)
 * dál hlídá overit_uloziste.mjs a test_uloziste.js — model sdílí i online
 * kanál, takže se nemaže.
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
await stranka.goto(soubor);
await stranka.waitForTimeout(400);

console.log('\nSložková databáze je vypnutá (#150)');

// 1. vypínač drží i proti podstrčenému výběru složky
const pripojeni = await stranka.evaluate(async () => {
  let pickerVolan = false;
  window.showDirectoryPicker = () => { pickerVolan = true;
    return Promise.resolve({ kind: 'directory', name: '_DB' }); };
  const podporovano = uloPodporovano();
  uloVyberSlozku();
  const obnova = await uloObnovSlozku();
  return { podporovano, pickerVolan, obnova,
    pripraveno: ULO_STAV.pripraveno, koren: !!ULO_STAV.koren };
});
zkus('uloPodporovano() je false i s dostupným výběrem složky', pripojeni.podporovano === false);
zkus('uloVyberSlozku() dialog vůbec nespustí', pripojeni.pickerVolan === false);
zkus('uloObnovSlozku() složku neobnoví', pripojeni.obnova === false);
zkus('ULO_STAV zůstává bez složky', !pripojeni.pripraveno && !pripojeni.koren);

// 2. UI na složku neposílá
await stranka.evaluate(() => { prepniTab('zakazka'); });
await stranka.waitForTimeout(120);
const zakazka = await stranka.evaluate(() => document.getElementById('page-zakazka').innerText);
zkus('karta „Databáze zakázek (složka)" se nekreslí', !/Databáze zakázek \(složka\)/.test(zakazka));
zkus('žádné tlačítko „Vybrat složku"', !zakazka.includes('Vybrat složku'));

const nastdb = await stranka.evaluate(() =>
  (typeof nastdbBlok === 'function') ? nastdbBlok() : '');
zkus('blok konfigurace ve složce (Nastavení) je prázdný', nastdb === '');

const lista = await stranka.evaluate(() =>
  (typeof ukazkoveLista === 'function') ? ukazkoveLista() : '');
zkus('lišta ukázkových dat neposílá pro složku', !/Připojte složku|Připojit složku/.test(lista));
zkus('lišta ukázkových dat míří na online databázi',
  lista === '' || /online datab/i.test(lista), lista.slice(0, 120));

// 3. kanály a ceník bez složky
const kanaly = await stranka.evaluate(() => ({
  kanal: zakKanal(),
  aktivni: cenikAktivniDb().zdroj,
}));
zkus('kanál uložení není nikdy „slozka"', kanaly.kanal !== 'slozka');
zkus('aktivní ceníková databáze není „slozka"', kanaly.aktivni !== 'slozka');

// 4. aplikace bez složky normálně běží
await stranka.evaluate(() => { prepniTab('kalk'); render(); });
await stranka.waitForTimeout(150);
zkus('kalkulace se vykreslí', await stranka.evaluate(() =>
  document.getElementById('page-kalk').innerText.length > 200));
zkus('konzole je čistá', chyby.length === 0);
if (chyby.length) chyby.slice(0, 5).forEach(c => console.log('     ! ' + c));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
