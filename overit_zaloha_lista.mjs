/* Kontrola lišty „V prohlížeči je rozpracovaná kalkulace…" nad sestavením
 * dist/kalkulacka.html.
 *
 * PROČ TENHLE HARNESS VZNIKL (4. 8. 2026)
 * Uživatel hlásil: „odstraň nějakou historickou nabídku, která vždy při
 * spuštění vyžaduje potvrzení o rozpracovanosti nebo zahození". Šlo o zálohu
 * v úložišti prohlížeče (klíč kng_rozpracovano_v1), kterou nikdy nikdo nemazal:
 * jednou zapsaná se hlásila při každém dalším otevření aplikace, klidně půl
 * roku po tom, co byla zakázka hotová. Pravidla, kdy se ptát, teď rozhoduje
 * uloZalohaRozhodni() v uloziste.js (má vlastní jednotkové testy) – tady se
 * ověřuje to, co jednotkový test nedosáhne: že se model do obrazovky opravdu
 * propsal a že lišta v prohlížeči mlčí i vyskočí přesně tam, kde má.
 *
 * Záloha se do úložiště nasype před načtením stránky (addInitScript), takže
 * aplikace ji při startu najde stejně, jako by ji tam nechal minulý týden. */
import { chromium } from 'playwright';
import path from 'path';

const soubor = 'file://' + path.resolve('dist/kalkulacka.html');
const KLIC = 'kng_rozpracovano_v1';
const KLIC_ODLOZENO = 'kng_rozpracovano_odlozeno_v1';

let ok = 0, fail = 0;
const zkus = (popis, podminka) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis); }
};

const prohlizec = await chromium.launch();
const kontext = await prohlizec.newContext();

/* Připraví novou stránku s předem vloženou zálohou (nebo bez ní) a vrátí,
 * co je po startu vidět. `stariDni` říká, jak starou zálohu předstírat. */
async function spust({ zaloha = null, odlozeno = null } = {}) {
  const stranka = await kontext.newPage();
  const chyby = [];
  stranka.on('console', m => { if (m.type() === 'error') chyby.push(m.text()); });
  stranka.on('pageerror', e => chyby.push(String(e)));
  await stranka.addInitScript(([klic, klicOdlozeno, zal, odl]) => {
    try {
      localStorage.removeItem(klic);
      localStorage.removeItem(klicOdlozeno);
      if (zal) localStorage.setItem(klic, zal);
      if (odl) localStorage.setItem(klicOdlozeno, odl);
    } catch (e) { /* zakázané úložiště – pozná se níž */ }
  }, [KLIC, KLIC_ODLOZENO, zaloha ? JSON.stringify(zaloha) : null, odlozeno]);
  await stranka.goto(soubor);
  await stranka.waitForTimeout(400);
  const stav = await stranka.evaluate(([klic, klicOdlozeno]) => {
    const el = document.getElementById('obnovaLista');
    let zbylo = null, odl = null;
    try { zbylo = localStorage.getItem(klic); odl = localStorage.getItem(klicOdlozeno); } catch (e) {}
    return {
      vidno: !!el && el.classList.contains('zobraz'),
      text: el ? el.innerText : '',
      zbylo, odl,
      uloziste: (() => { try { localStorage.setItem('__t__', '1'); localStorage.removeItem('__t__'); return true; }
                         catch (e) { return false; } })(),
    };
  }, [KLIC, KLIC_ODLOZENO]);
  stav.chyby = chyby;
  stav.stranka = stranka;
  return stav;
}

const pred = (dni) => new Date(Date.now() - dni * 86400000).toISOString();
const zaloha = (uprav) => Object.assign({
  verze: 1,
  kdy: pred(0.2),
  cislo: '2026 - OPR - CN - 0777',
  nazevAkce: 'Výtah Nádraží',
  zakazka: JSON.stringify({ cislo: '2026 - OPR - CN - 0777', nazevAkce: 'Výtah Nádraží', varianty: [] }),
}, uprav || {});

console.log('\nLišta rozpracované kalkulace');

/* 0) Úložiště v tomhle prohlížeči vůbec funguje – jinak by všechny další
 *    kontroly „nic se nenabídlo" prošly z nesprávného důvodu. */
const zaklad = await spust();
zkus('úložiště prohlížeče je v testu k dispozici', zaklad.uloziste);
zkus('bez zálohy se lišta neukáže', !zaklad.vidno);
await zaklad.stranka.close();

/* 1) Čerstvá záloha s číslem – jediný případ, kdy se ptát MÁ. */
const cerstva = await spust({ zaloha: zaloha() });
zkus('čerstvá záloha obnovu nabídne', cerstva.vidno);
zkus('lišta pojmenuje, co se našlo', /0777|Nádraží/.test(cerstva.text));
zkus('čerstvá záloha zůstává v úložišti', !!cerstva.zbylo);
zkus('lišta nabízí obnovu i zahození', /Obnovit/.test(cerstva.text) && /Zahodit/.test(cerstva.text));
zkus('při startu se nic nesype do konzole', cerstva.chyby.length === 0);

/* 2) Záloha starší než týden – právě tahle uživatele otravovala. Nejen že se
 *    na ni aplikace neptá, ona ji rovnou uklidí, aby zabírala místo. */
const stara = await spust({ zaloha: zaloha({ kdy: pred(30) }) });
zkus('měsíc stará záloha se nenabízí', !stara.vidno);
zkus('měsíc stará záloha se z úložiště uklidí', !stara.zbylo);
await stara.stranka.close();

/* 3) Záloha bez čísla i bez názvu akce – prázdný začátek kalkulace, o který
 *    se nemá cenu ptát (uživatel jen otevřel aplikaci a zavřel ji). */
const prazdna = await spust({ zaloha: zaloha({ cislo: '', nazevAkce: '' }) });
zkus('záloha bez čísla i názvu se nenabízí', !prazdna.vidno);
zkus('záloha bez čísla i názvu se uklidí', !prazdna.zbylo);
await prazdna.stranka.close();

/* 4) Samotný název akce stačí – zakázka bez přiděleného čísla je běžná. */
const jenNazev = await spust({ zaloha: zaloha({ cislo: '' }) });
zkus('záloha jen s názvem akce se nabídne', jenNazev.vidno);
await jenNazev.stranka.close();

/* 5) „Teď ne" – uživatel jednou odložil, podruhé se už neptáme. Značka nese
 *    razítko odložené zálohy, samotná záloha zůstává na místě. */
await cerstva.stranka.evaluate(() => historieOdlozZalohu());
await cerstva.stranka.waitForTimeout(80);
const poOdlozeni = await cerstva.stranka.evaluate(([k, ko]) => ({
  skryto: !document.getElementById('obnovaLista').classList.contains('zobraz'),
  zbylo: localStorage.getItem(k),
  odl: localStorage.getItem(ko),
}), [KLIC, KLIC_ODLOZENO]);
zkus('„Teď ne" lištu schová', poOdlozeni.skryto);
zkus('„Teď ne" zálohu nemaže', !!poOdlozeni.zbylo);
zkus('„Teď ne" si zapamatuje razítko zálohy', !!poOdlozeni.odl);
await cerstva.stranka.close();

const znovu = await spust({ zaloha: zaloha({ kdy: poOdlozeni.odl }), odlozeno: poOdlozeni.odl });
zkus('odložená záloha se podruhé neptá', !znovu.vidno);
zkus('odložená záloha zůstává k dispozici', !!znovu.zbylo);
await znovu.stranka.close();

/* 6) …ale jakmile uživatel na něčem znovu dělá, vznikne novější záloha –
 *    a ta už je nová informace, ne opakovaná otázka. */
const novejsi = await spust({ zaloha: zaloha({ kdy: pred(0.1) }), odlozeno: poOdlozeni.odl });
zkus('novější záloha se ozve i po dřívějším odložení', novejsi.vidno);
await novejsi.stranka.close();

/* 7) Uložení zakázky (do souboru, do složky i do databáze) zálohu uklidí.
 *    Tohle je jádro nápravy: dokud se záloha nemazala, ptala se aplikace
 *    i na zakázky dávno hotové. */
const poUlozeni = await spust({ zaloha: zaloha() });
zkus('před uložením je záloha v úložišti', !!poUlozeni.zbylo);
const uklizeno = await poUlozeni.stranka.evaluate(([k, ko]) => {
  historieZalohaHotovo();
  return { zaloha: localStorage.getItem(k), odl: localStorage.getItem(ko),
           skryto: !document.getElementById('obnovaLista').classList.contains('zobraz') };
}, [KLIC, KLIC_ODLOZENO]);
zkus('po uložení záloha z úložiště zmizí', !uklizeno.zaloha);
zkus('po uložení zmizí i značka odložení', !uklizeno.odl);
zkus('po uložení je lišta schovaná', uklizeno.skryto);
await poUlozeni.stranka.close();

/* 8) Ukládací cesty tuhle úklidovou funkci opravdu volají – jinak by bod 7
 *    hlídal funkci, kterou nikdo nepoužívá. */
const volani = await spust();
const napojeno = await volani.stranka.evaluate(() => [
  typeof historieZalohaHotovo === 'function',
  typeof ulozZakazku === 'function' && /historieZalohaHotovo/.test(ulozZakazku.toString()),
  typeof onlineUloz === 'function' && /historieZalohaHotovo/.test(onlineUloz.toString()),
]);
zkus('úklidová funkce je v sestavení', napojeno[0]);
zkus('uložení do souboru zálohu uklízí', napojeno[1]);
zkus('uložení do databáze zálohu uklízí', napojeno[2]);
await volani.stranka.close();

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
