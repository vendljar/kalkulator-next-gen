/* Ověření v prohlížeči: dialogy jsou v aplikaci, ne nativní (2. 9. 2026)
 *
 * PROČ TENHLE HARNESS EXISTUJE: nativní `confirm()` zastaví renderer a
 * aplikace přestane reagovat na cokoli zvenčí. Při testu 2. 9. 2026 zamrzla
 * na „✚ Nová zakázka" i na přepínači ceníku ČR/Zahraničí a nešlo pokračovat
 * jinak než naslepo Enterem a reloadem stránky. Od té doby se ptá vlastní
 * modál — a tenhle harness hlídá to podstatné: že se dá NAKLIKAT a že po
 * jeho zavření stránka DÁL FUNGUJE.
 *
 * Sada `src/test_dialogy.js` hlídá zdrojáky (žádné nativní dialogy);
 * tady jde o chování v prohlížeči.
 *
 * Spuštění: node overit_dialogy.mjs
 */
import { chromium } from 'playwright';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
let ok = 0, fail = 0;
const zkus = (popis, podminka, detail) => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { fail++; console.log('  ✕ ' + popis + (detail === undefined ? '' : '  → ' + detail)); }
};

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const konzole = [];
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
/* Kdyby se nativní dialog přece jen objevil, test to pozná — a hlavně
 * nezamrzne (Playwright by na něj jinak čekal). */
let nativni = 0;
p.on('dialog', d => { nativni++; d.dismiss().catch(() => {}); });

await p.goto(KDE);
await p.waitForTimeout(600);
await p.evaluate(() => { NAST.jeAdmin = true; render(); });

const modalVidet = () => p.locator('#dlg').isVisible().catch(() => false);
const modalText = () => p.locator('#dlg .dlg-text').innerText().catch(() => '');
const klik = (co) => p.click(`#dlg [data-dlg="${co}"]`);

/* ---------- 1) „✚ Nová zakázka" — Ne nechá zakázku být ---------- */
await p.evaluate(() => { set('ZAK.nazevAkce', 'Zkouška dialogů'); });
const novaNe = await (async () => {
  const beh = p.evaluate(() => novaZakazkaUI());
  await p.waitForSelector('#dlg', { timeout: 4000 });
  const text = await modalText();
  await klik('ne');
  await beh;
  return { text, nazev: await p.evaluate(() => ZAK.nazevAkce) };
})();
zkus('„Nová zakázka" se zeptá modálem v aplikaci', /prázdnou zakázku/.test(novaNe.text), novaNe.text);
zkus('odpověď Ne zakázku nechá být', novaNe.nazev === 'Zkouška dialogů', novaNe.nazev);
zkus('a modál po odpovědi zmizí', (await modalVidet()) === false);

/* ---------- 2) stránka je po zavření modálu DÁL OVLADATELNÁ ----------
 * Tohle je jádro celého úkolu: přesně tady dřív aplikace zamrzla. */
await p.evaluate(() => { prepniTab('cenik'); render(); });
zkus('po zavření modálu jde přepnout záložku',
  await p.evaluate(() => document.getElementById('page-cenik').offsetParent !== null));
await p.evaluate(() => { prepniTab('kalk'); set('Z.nastupiste', 7); render(); });
zkus('a dál se dá i psát do kalkulace', await p.evaluate(() => Z.nastupiste === 7));

/* ---------- 3) „✚ Nová zakázka" — Ano založí prázdnou ---------- */
const novaAno = await (async () => {
  const beh = p.evaluate(() => novaZakazkaUI());
  await p.waitForSelector('#dlg', { timeout: 4000 });
  await klik('ano');
  await beh;
  return p.evaluate(() => ({ nazev: ZAK.nazevAkce, nastupiste: Z.nastupiste }));
})();
zkus('odpověď Ano založí prázdnou zakázku', !novaAno.nazev, JSON.stringify(novaAno));

/* ---------- 4) přepínač ceníku ČR ↔ Zahraničí ---------- */
await p.evaluate(() => {
  CENIK_ZAHR.ceny['C.montazHodKc'] = 1234;
  DEFAULT_CENIK.montazHodKc = 750;
  aktivniVarianta(ZAK).data.cenik.montazHodKc = 750;
  render();
});
const rada = await (async () => {
  const beh = p.evaluate(() => cenikRadaPrepniUI('zahr'));
  await p.waitForSelector('#dlg', { timeout: 4000 });
  const text = await modalText();
  await klik('ano');
  await beh;
  return { text, rada: await p.evaluate(() => cenikRadaVarianty(aktivniVarianta(ZAK).data)),
           cena: await p.evaluate(() => aktivniVarianta(ZAK).data.cenik.montazHodKc) };
})();
zkus('přepínač ceníku se ptá modálem a vypíše dopad',
  /Dotkne se to \d+ ceníkových položek/.test(rada.text), rada.text.slice(0, 90));
zkus('potvrzení přepne řadu i cenu', rada.rada === 'zahr' && rada.cena === 1234,
  rada.rada + ' / ' + rada.cena);

/* ---------- 5) Esc = zrušit ---------- */
const esc = await (async () => {
  const beh = p.evaluate(() => cenikRadaPrepniUI('cr'));
  await p.waitForSelector('#dlg', { timeout: 4000 });
  await p.keyboard.press('Escape');
  await beh;
  return p.evaluate(() => cenikRadaVarianty(aktivniVarianta(ZAK).data));
})();
zkus('Esc dialog zruší a nic nepřepne', esc === 'zahr', esc);

/* ---------- 6) zahodit zálohu rozpracované kalkulace ---------- */
const zaloha = await (async () => {
  const beh = p.evaluate(() => historieZahodZalohu());
  await p.waitForSelector('#dlg', { timeout: 4000 });
  const text = await modalText();
  await klik('ano');
  await beh;
  return text;
})();
zkus('„Zahodit zálohu" se ptá modálem', /zahodit zálohu/i.test(zaloha), zaloha);

/* ---------- 7) smazání trvalé položky z kalkulace ---------- */
const trvala = await (async () => {
  await p.evaluate(() => {
    prepniTab('kalk');
    katalogPridejVc(KATALOG, Z, 'rezie', { nazev: 'Zkušební trvalá', mnozstvi: 1, cena: 100 });
    render();
  });
  const i = await p.evaluate(() => Z.vlastniPolozky.rezie.findIndex(x => x.nazev === 'Zkušební trvalá'));
  const beh = p.evaluate((idx) => vlastniDel('rezie', idx), i);
  await p.waitForSelector('#dlg', { timeout: 4000 });
  const text = await modalText();
  await klik('ano');
  await beh;
  return { text, zbylo: await p.evaluate(() => Z.vlastniPolozky.rezie.some(x => x.nazev === 'Zkušební trvalá')) };
})();
zkus('mazání trvalé položky se ptá modálem', /trvalá/i.test(trvala.text), trvala.text.slice(0, 80));
zkus('a po potvrzení položka z kalkulace zmizí', trvala.zbylo === false);

/* ---------- 8) dialogy se řadí, nepřekrývají ---------- */
const fronta = await p.evaluate(async () => {
  const a = potvrd('První otázka?');
  const b = potvrd('Druhá otázka?');
  const kolik = document.querySelectorAll('#dlg').length;
  document.querySelector('#dlg [data-dlg="ano"]').click();
  await a;
  const text2 = document.querySelector('#dlg .dlg-text').textContent;
  document.querySelector('#dlg [data-dlg="ne"]').click();
  const vysledek = [await a, await b];
  return { kolik, text2, vysledek };
});
zkus('naráz je vidět jen jeden modál', fronta.kolik === 1, fronta.kolik);
zkus('druhá otázka přijde na řadu až po první', /Druhá/.test(fronta.text2), fronta.text2);
zkus('každá otázka dostane svou odpověď',
  JSON.stringify(fronta.vysledek) === '[true,false]', JSON.stringify(fronta.vysledek));

/* ---------- 9) žádný nativní dialog se neobjevil ---------- */
zkus('aplikace nepoužila jediný nativní dialog', nativni === 0, String(nativni));
zkus('za celý průchod nevznikla chyba v konzoli', konzole.length === 0, konzole.slice(0, 2).join(' | '));

await b.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
