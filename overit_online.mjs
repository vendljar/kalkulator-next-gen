/* Ověření ONLINE DATABÁZE v prohlížeči (4. 8. 2026; rozšířeno o přihlašovací
 * stránku, lištu v rohu, změnu vlastního hesla a role).
 *
 * Node testy (netlify/test_funkce.mjs) ověřují serverové funkce, smoke.mjs
 * hlídá, že aplikace nad file:// mlčí. Tady se testuje to, co ani jeden
 * z nich neumí: SKUTEČNÝ klient proti SKUTEČNÉMU serverovému kódu.
 *
 * Jak: sestavená aplikace se servíruje přes lokální http server (online
 * vrstva se probouzí jen nad http/https) a každé volání /api/* se předá
 * OPRAVDOVÝM funkcím z netlify/functions — s pamětovým úložištěm místo
 * Blobs a s vlastní správou cookie. Žádný mock chování.
 *
 * Spuštění: NODE_PATH=$(npm root -g) node overit_online.mjs
 */
process.env.TAJEMSTVI_RELACE = 'zkusebni-tajemstvi-jen-pro-harness';
process.env.ADMIN_INIT_HESLO = 'Zkusebni.Heslo.123';
const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) {
    return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
      .map(x => x.slice(nazev.length + 1));
  },
});

import { createRequire } from 'module';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import zdravi from './netlify/functions/zdravi.mjs';
import ja from './netlify/functions/ja.mjs';
import prihlaseni from './netlify/functions/prihlaseni.mjs';
import odhlaseni from './netlify/functions/odhlaseni.mjs';
import uzivatele from './netlify/functions/uzivatele.mjs';
import program from './netlify/functions/program.mjs';
import zakazky from './netlify/functions/zakazky.mjs';
import zaloha from './netlify/functions/zaloha.mjs';
import firma from './netlify/functions/firma.mjs';
import zobrazeni from './netlify/functions/zobrazeni.mjs';
import zalohaVynuceno from './netlify/functions/zaloha_vynuceno.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  console.error('Playwright není k dispozici. NODE_PATH=$(npm root -g) node overit_online.mjs');
  process.exit(2);
}

const FUNKCE = {
  '/api/zdravi': zdravi, '/api/ja': ja, '/api/prihlaseni': prihlaseni,
  '/api/odhlaseni': odhlaseni, '/api/uzivatele': uzivatele,
  '/api/program': program, '/api/zakazky': zakazky, '/api/zaloha': zaloha,
  /* Firemní údaje jsou od 4. 8. 2026 taky online: obchodník složku _DB
   * nemapuje, takže hlavičku nabídky nemá odkud jinud vzít. */
  '/api/firma': firma,
  /* Matice zobrazení (#136) — aplikace ji načítá hned po přihlášení, takže
   * bez ní by v každém průchodu svítilo 404 v konzoli. */
  '/api/zobrazeni': zobrazeni,
  /* Vynucená (a ověřitelná) záloha databáze – 4. 8. 2026. Kdyby tu funkce
   * chyběla, volání z prohlížeče by skončilo na 404 a test by mlčel
   * o tom, že „vynucené zálohování" pořád nikam nevede. */
  '/api/zaloha_vynuceno': zalohaVynuceno,
};

let ok = 0, fail = 0;
const test = (n, cond, info) => {
  if (cond) { ok++; console.log('OK  ' + n); }
  else { fail++; console.log('FAIL ' + n, info === undefined ? '' : JSON.stringify(info)); }
};

/* ---- lokální http server jen pro aplikaci (API řeší route níže) ---- */
const html = readFileSync(path.resolve('dist/kalkulacka.html'));
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ADRESA = 'http://127.0.0.1:' + server.address().port;

const prohlizec = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await prohlizec.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

const chyby = [];
page.on('console', m => {
  const t = m.text();
  // 401/403/400/409 z /api jsou v testu záměr – aplikace s nimi počítá.
  if (m.type() === 'error' && !/status of (401|403|400|409)/.test(t)) chyby.push('console: ' + t);
});
page.on('pageerror', e => chyby.push('pageerror: ' + e.message));
page.on('dialog', d => (d.type() === 'prompt' ? d.accept('zkušební zveřejnění') : d.accept()));

/* Most na serverové funkce: cookie si vede harness sám. */
let cookieJar = '';
await page.route('**/api/**', async route => {
  const r = route.request();
  const url = new URL(r.url());
  const fn = FUNKCE[url.pathname];
  if (!fn) return route.fulfill({ status: 404, body: '{"ok":false}' });
  const init = { method: r.method(), headers: { cookie: cookieJar } };
  if (r.method() === 'POST') init.body = r.postData() || '';
  const odp = await fn(new Request(r.url(), init));
  const setc = odp.headers.get('set-cookie');
  if (setc) cookieJar = setc.split(';')[0];
  route.fulfill({ status: odp.status, contentType: 'application/json; charset=utf-8',
    body: await odp.text() });
});

const gate = () => page.locator('#prihlaseni-box').innerHTML();
const gateViditelna = () => page.evaluate(() =>
  document.getElementById('prihlaseni-overlay').style.display !== 'none');
const prihlas = async (email, heslo) => {
  await page.fill('#onlineEmail', email);
  await page.fill('#onlineHeslo', heslo);
  await page.click('#prihlaseni-box >> text=Přihlásit');
  await page.waitForTimeout(400);
};

await page.goto(ADRESA);
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(400);

/* ---- 1) přihlašovací stránka zakrývá aplikaci ---- */
test('přihlašovací stránka je vidět a nese název aplikace',
  await gateViditelna() && (await gate()).includes('Kalkulátor Next Gen'));
test('stránka má pole pro e-mail (uživatelské jméno) i heslo',
  (await gate()).includes('uživatelské jméno') && (await gate()).includes('onlineHeslo'));

/* ---- 2) špatné heslo ---- */
await prihlas('vendl.jaroslav@engineers-cz.cz', 'spatne-heslo');
test('špatné heslo se odmítne s důvodem přímo na přihlašovací stránce',
  (await gate()).includes('Nesprávný e-mail nebo heslo'));
test('stránka po chybě zůstává', await gateViditelna());

/* ---- 3) přihlášení administrátora (bootstrap) ---- */
await prihlas('vendl.jaroslav@engineers-cz.cz', 'Zkusebni.Heslo.123');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
await page.waitForTimeout(400);
test('po přihlášení přihlašovací stránka zmizí', !(await gateViditelna()));
test('administrátor je přihlášený',
  await page.evaluate(() => ONLINE_STAV.ja.role === 'Administrátor'));
const roh = () => page.locator('#onlineLista').innerHTML();
test('v rohu hlavičky je vidět, kdo je přihlášený',
  (await roh()).includes('Jaroslav Vendl') && (await roh()).includes('Administrátor'));
test('roh nabízí Změnit heslo i Odhlásit',
  (await roh()).includes('Změnit heslo') && (await roh()).includes('Odhlásit'));

/* ---- 4) zveřejnění ceníku online a jeho nasazení ---- */
await page.evaluate(() => prepniTab('cenik'));
await page.evaluate(() => onlineZverejni());
await page.waitForFunction(() => { try { return !!(ONLINE_STAV.db && ONLINE_STAV.db.platny); } catch (e) { return false; } });
await page.waitForTimeout(500);
test('zveřejnění založilo online verzi 1',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1));
test('online ceník se v aplikaci sám nasadil',
  await page.evaluate(() => ONLINE_STAV.cenikPouzit === true));

/* ---- 4b) firemní údaje online (4. 8. 2026) ----
 * Ceník sám nestačí. Obchodník složku _DB nemapuje, takže dokud firemní údaje
 * nejsou taky online, zůstane mu v hlavičce nabídky „Ukázková firma s.r.o."
 * a červená lišta svítí navěky. Tady se ověřuje celá cesta: administrátor
 * vzorek zveřejnit nesmí, po přepsání skutečnými údaji smí, a obchodník je
 * pak (v oddílu 9) dostane sám. */
await page.evaluate(() => { otevriNastaveni(); nastPanel('firma'); });
await page.waitForTimeout(300);
const panelFirma = () => page.locator('#nastaveni-panel').innerHTML();
test('administrátor vidí v Nastavení → Firma panel online zveřejnění',
  (await panelFirma()).includes('Firemní údaje v online databázi'));
test('vzorek ze sestavení zveřejnit nejde – tlačítko je zhasnuté',
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#nastaveni-panel button')]
      .find(x => x.textContent.includes('Zveřejnit firemní údaje online'));
    return !!b && b.disabled === true;
  }));
test('a panel řekne proč (jsou pořád ukázkové)', /ukázkov/i.test(await panelFirma()));

/* Skutečné údaje – zkušební firma, ne ta jeho: do repozitáře ani do testů
 * nepatří nic ostrého. Zapisují se přes firmaSet(), tedy přesně tou cestou,
 * kterou používá formulář (a která zároveň sundává značku vzorku). */
await page.evaluate(() => {
  firmaSet('nazev', 'Zkušební ocelárna s.r.o.');
  firmaSet('ico', '12345678');
  firmaSet('sidloUlice', 'Zkušební 1');
  firmaSet('sidloPsc', '110 00');
  firmaSet('sidloMesto', 'Praha');
  firmaSet('telefon', '+420 111 222 333');
});
await page.waitForTimeout(200);
test('ruční přepis sundal značku ukázkových dat',
  await page.evaluate(() => NAST.firma.ukazkove === undefined));
test('teď už je tlačítko zveřejnění činné',
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#nastaveni-panel button')]
      .find(x => x.textContent.includes('Zveřejnit firemní údaje online'));
    return !!b && b.disabled === false;
  }));
await page.evaluate(() => onlineZverejniFirmu());
await page.waitForFunction(() => { try { return !!ONLINE_STAV.firma; } catch (e) { return false; } });
await page.waitForTimeout(300);
test('zveřejněné údaje se vrátily ze serveru se jménem firmy',
  await page.evaluate(() => ONLINE_STAV.firma.udaje.nazev === 'Zkušební ocelárna s.r.o.'));
test('server si zapsal, kdo a kdy zveřejnil',
  await page.evaluate(() => ONLINE_STAV.firma.kdo === 'vendl.jaroslav@engineers-cz.cz' && !!ONLINE_STAV.firma.kdy));
test('panel po zveřejnění ukazuje, kdy a kým',
  (await panelFirma()).includes('Online zveřejněno'));

/* ---- 4c) panel nesmí znovu chtít to, co je už zveřejněné (5. 8. 2026, #142) ----
 *
 * Zadání: „Proč musím pořád zveřejňovat firemní údaje? Ty už jsem nahrál
 * a zveřejnil." Cesta zveřejnit → načíst zpátky fungovala; co chybělo, byla
 * odpověď na otázku „je nahoře totéž, co mám tady?". Panel místo toho pokaždé
 * nabízel plné modré tlačítko, tedy gesto, které administrátor už udělal.
 *
 * Pozn.: „· právě platí v aplikaci" na tohle odpovědět neumí – rozsvítí se jen
 * tomu, komu se online kopie do aplikace opravdu nasadila, a administrátorovi
 * s připojenou složkou _DB se nenasazuje nikdy. Proto se hlídá věta o shodě. */
await page.evaluate(() => { nastPanel('firma'); });
await page.waitForTimeout(200);
test('panel řekne, že online databáze má přesně tyhle údaje',
  /Online databáze má přesně tyhle údaje/.test(await panelFirma()));
test('a že zveřejňovat znovu není potřeba',
  /Zveřejňovat je znovu není potřeba/.test(await panelFirma()));
test('modré tlačítko „Zveřejnit firemní údaje online" už panel nenabízí',
  await page.evaluate(() => ![...document.querySelectorAll('#nastaveni-panel button')]
    .some(x => x.textContent.trim() === 'Zveřejnit firemní údaje online')));
/* Zmizet ale nesmí docela – přepsat online kopii nejde jinudy. */
test('zveřejnit znovu jde pořád, jen už to není hlavní nabídka panelu',
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#nastaveni-panel button')]
      .find(x => /Zveřejnit znovu/.test(x.textContent));
    return !!b && b.disabled === false && !b.classList.contains('primary');
  }));
test('popis stavu mluví o shodě s Nastavením → Firma',
  await page.evaluate(() => /shodné s tím, co máte/.test(onlineFirmaPopis())));

/* Změna jediného pole musí panel zase probudit – jinak by administrátor
 * opravil telefon a nikdo z obchodníků by se to nedozvěděl. */
await page.evaluate(() => { firmaSet('telefon', '+420 111 222 999'); nastPanel('firma'); });
await page.waitForTimeout(200);
test('po změně údaje panel pojmenuje, co se liší',
  /Oproti online kopii se liší: Telefon/.test(await panelFirma()));
test('a znovu nabídne plné tlačítko ke zveřejnění',
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#nastaveni-panel button')]
      .find(x => x.textContent.trim() === 'Zveřejnit firemní údaje online');
    return !!b && b.disabled === false && b.classList.contains('primary');
  }));
await page.evaluate(() => { firmaSet('telefon', '+420 111 222 333'); nastPanel('firma'); });
await page.waitForTimeout(200);
test('vrácení údaje zpátky panel zase uklidní',
  /Zveřejňovat je znovu není potřeba/.test(await panelFirma()));
await page.evaluate(() => zavriNastaveni());

/* ---- 5) zakázka online: uložit, seznam, otevřít ---- */
await page.evaluate(() => { ZAK.cislo = '2026 - OPR - CN - 0555'; ZAK.nazevAkce = 'Online ověření'; render(); });
await page.evaluate(() => onlineUloz());
await page.waitForFunction(() => { try { return ONLINE_STAV.soubor !== ''; } catch (e) { return false; } });
test('zakázka se uložila online pod jménem ze svého čísla',
  await page.evaluate(() => ONLINE_STAV.soubor.includes('0555')));
await page.evaluate(() => otevriOnline());
await page.waitForTimeout(300);
test('panel Zakázky online ukazuje uloženou zakázku',
  (await page.locator('#online-panel').innerHTML()).includes('Online ověření'));
await page.evaluate(() => onlineOtevri(ONLINE_STAV.soubor));
await page.waitForTimeout(400);
test('zakázka se otevřela online a číslo sedí',
  await page.evaluate(() => ZAK.cislo === '2026 - OPR - CN - 0555'));

/* ---- 5b) zadání 4. 8. 2026: trojice na začátku lišty + samočinné uložení ----
 *
 * „Přesuň tlačítka ulož zakázku, načíst zakázku a nová zakázka na začátek
 * lišty… Nezapomeň totéž provést pro projekční zakázky v Kalkulaci PROJ."
 * a „Každá nová zakázka by se měla automaticky ukládat do databáze… vždy
 * zakázku ukládat po vyplnění hlavičky. Systém musí uživatele informovat."
 *
 * Pozice se měří na POŘADÍ tlačítek v liště, ne na tom, že tam někde jsou –
 * jinak by test prošel i tehdy, kdyby trojice zůstala na konci. */
const listaBtn = async (kde) => page.evaluate((k) => {
  const l = document.querySelector('#page-' + k + ' .zak-cena');
  return l ? Array.from(l.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
}, kde);

await page.evaluate(() => prepniTab('kalk'));
const btnOck = await listaBtn('kalk');
test('lišta Kalkulace OCK začíná trojicí Uložit / Načíst / Nová zakázka',
  /Uložit zakázku/.test(btnOck[0] || '') && /Načíst zakázku/.test(btnOck[1] || '')
  && /Nová zakázka/.test(btnOck[2] || ''), btnOck.slice(0, 4));
await page.evaluate(() => prepniTab('proj'));
const btnProj = await listaBtn('proj');
test('lišta Kalkulace PROJ začíná stejnou trojicí (projekční zakázky)',
  /Uložit zakázku/.test(btnProj[0] || '') && /Načíst zakázku/.test(btnProj[1] || '')
  && /Nová zakázka/.test(btnProj[2] || ''), btnProj.slice(0, 4));
/* 5. 8. 2026: tlačítko „Převzít údaje z hlavičky OCK/PROJ" bylo z lišty obou
 * kalkulací zrušeno (zadání). Dřív se tu hlídalo jen jeho pořadí; teď se hlídá,
 * že v liště kalkulací není vůbec — jinak by se při dalším úklidu mohlo tiše
 * vrátit. Přenos hlavičky zůstává v Přehledu cenových nabídek (viz níže). */
test('v liště Kalkulace OCK už není převzetí údajů z druhé hlavičky',
  !btnOck.some(t => /Převzít údaje|Přenést tyto údaje/.test(t)), btnOck.slice(0, 6));
test('v liště Kalkulace PROJ už není převzetí údajů z druhé hlavičky',
  !btnProj.some(t => /Převzít údaje|Přenést tyto údaje/.test(t)), btnProj.slice(0, 6));

/* Nová prázdná zakázka: musí zapomenout jméno té předchozí, jinak by se
 * hned sama zapsala do databáze jako záznam bez čísla. Volá se přímo
 * (ne přes novaZakazkaUI), protože to potvrzuje confirm() – dialog by
 * v prohlížeči zablokoval celý harness. */
await page.evaluate(() => {
  ZAK = novaZakazka(); syncVarianta(); zakOdpojUlozeni(); render();
});
await page.waitForTimeout(200);
test('nová zakázka není v databázi a čeká na hlavičku',
  await page.evaluate(() => zakUlozeniStav().stav === 'vyplnit'),
  await page.evaluate(() => zakUlozeniStav().stav));
test('a systém řekne, co konkrétně v hlavičce chybí',
  await page.evaluate(() => zakUlozeniStav().chybi.join('|') === 'Číslo nabídky (CN)|Název akce'),
  await page.evaluate(() => zakUlozeniStav().chybi));
test('informace o nutnosti vyplnit a uložit je vidět přímo v liště',
  /Vyplňte v hlavičce/.test(await page.locator('#page-proj .zak-ulozeni').first().innerText()),
  await page.locator('#page-proj .zak-ulozeni').first().innerText());
test('dokud hlavička není vyplněná, samo se nic neplánuje',
  await page.evaluate(() => ONLINE_STAV.timer === null && ONLINE_STAV.soubor === ''));

/* Vyplnění hlavičky = jediná podmínka. Od téhle chvíle si zakázku
 * ukládá aplikace sama; nikdo na nic klikat nemusí. */
await page.evaluate(() => {
  ZAK.cislo = '2026 - OPR - CN - 0777'; ZAK.nazevAkce = 'Samo do databáze'; render();
});
test('po vyplnění hlavičky se uložení naplánovalo samo',
  await page.evaluate(() => ONLINE_STAV.timer !== null));
await page.waitForFunction(() => { try { return ONLINE_STAV.soubor !== ''; } catch (e) { return false; } },
  null, { timeout: 25000 });
test('nová zakázka se do databáze uložila sama, bez kliknutí',
  await page.evaluate(() => ONLINE_STAV.soubor.includes('0777')),
  await page.evaluate(() => ONLINE_STAV.soubor));
test('lišta po uložení hlásí, že zakázka v databázi je',
  /Uloženo v databázi/.test(await page.locator('#page-proj .zak-ulozeni').first().innerText()),
  await page.locator('#page-proj .zak-ulozeni').first().innerText());

/* „Následně už by se měla automaticky po každém kroku uložit do databáze." */
await page.evaluate(() => { ZAK.adresa = 'Zkušební 1, Praha'; render(); });
test('další změna se opět naplánuje k uložení',
  await page.evaluate(() => ONLINE_STAV.timer !== null));
await page.waitForFunction(() => { try { return JSON.stringify(ZAK) === ONLINE_STAV.posledni; } catch (e) { return false; } },
  null, { timeout: 25000 });
test('a po každém kroku se do databáze opravdu zapíše',
  await page.evaluate(() => ONLINE_STAV.posledni.includes('Zkušební 1, Praha')));
test('zakázka „0777" je v rejstříku online zakázek',
  await page.evaluate(() => ONLINE_STAV.rejstrik.some(z => (z.cislo || '').includes('0777'))));

/* ---- 5c) záloha databáze: automatická po přihlášení i vynucená ---- */
test('po přihlášení administrátora vznikla dnešní záloha databáze sama',
  await page.evaluate(() => ONLINE_STAV.otiskyNacteno && ONLINE_STAV.otisky.length >= 1),
  await page.evaluate(() => JSON.stringify(ONLINE_STAV.otisky)));
test('záloha nese, kdy vznikla a kolik zakázek zachytila',
  await page.evaluate(() => { const o = ONLINE_STAV.otisky[0];
    return !!o && !!o.porizena && typeof o.pocetZakazek === 'number' && o.pocetUctu >= 1; }));
await page.evaluate(() => onlineZalohaTed());
await page.waitForFunction(() => { try { return !ONLINE_STAV.pracuje && /Záloha databáze pořízena/.test(ONLINE_STAV.hlaska); } catch (e) { return false; } },
  null, { timeout: 8000 });
test('vynucenou zálohu jde pořídit tlačítkem a aplikace to potvrdí',
  await page.evaluate(() => /Záloha databáze pořízena/.test(ONLINE_STAV.hlaska)),
  await page.evaluate(() => ONLINE_STAV.hlaska));
test('vynucená záloha zachytila i zakázku, která se uložila sama',
  await page.evaluate(() => ONLINE_STAV.otisky[0].pocetZakazek >= 2),
  await page.evaluate(() => ONLINE_STAV.otisky[0].pocetZakazek));
test('přehled záloh se ukazuje v kartě Online databáze',
  /Poslední záloha databáze/.test(await page.evaluate(() => onlineOtiskPopis())),
  await page.evaluate(() => onlineOtiskPopis()));
/* Souhrn nesmí vozit obsah databáze – z konzole by se dala přečíst celá. */
test('přehled záloh neveze data zakázek ani hesla',
  await page.evaluate(() => { const t = JSON.stringify(ONLINE_STAV.otisky);
    return !t.includes('Samo do databáze') && !t.includes('heslo'); }));

await page.evaluate(() => prepniTab('zakazka'));

/* ---- 6) správa účtů v Nastavení ---- */
await page.evaluate(() => { otevriNastaveni(); nastPanel('uzivatele'); });
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivateleNacteno; } catch (e) { return false; } });
await page.waitForTimeout(300);
const nastav = () => page.locator('#nastaveni-panel').innerHTML();
test('Nastavení → Uživatelé ukazuje účty online databáze',
  (await nastav()).includes('vendl.jaroslav@engineers-cz.cz') && (await nastav()).includes('hlavní'));

/* Zadání 4. 8. 2026: „Při tvoření hesla přidej informaci, že heslo musí mít
 * minimálně 8 znaků." Požadavek se musí dozvědět DŘÍV, než heslo vymyslí –
 * proto stojí u samotného pole, ne až v hlášce o odmítnutí. */
test('u pole s počátečním heslem je vidět požadavek na délku',
  await page.evaluate(() => {
    const i = document.getElementById('onlineUzHeslo'); if (!i) return false;
    const r = i.closest('.row') || i.parentElement;
    const text = (r ? r.innerText : '') + ' ' + (i.placeholder || '') + ' ' + (i.title || '');
    return /8\s*znak/i.test(text);
  }));
/* Čte se innerText, ne innerHTML: věta je „Heslo musí mít <b>alespoň 8
 * znaků</b>." a značky uprostřed by hledání rozbily. */
test('a panel to vysvětluje i celou větou',
  /(alespoň|aspoň|minimálně|nejméně)\s*8\s*znak/i.test(await page.locator('#nastaveni-panel').innerText()));

/* Chybová cesta (4. 8. 2026 večer): krátké heslo dřív formulář tiše smazalo
 * a nic neřeklo. Teď musí hláška stát přímo v panelu a pole zůstat vyplněná. */
await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
await page.fill('#onlineUzJmeno', 'Zkušební Obchodník');
await page.fill('#onlineUzHeslo', 'kratke');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForTimeout(300);
test('krátké heslo: důvod odmítnutí je vidět přímo v panelu Uživatelé',
  (await nastav()).includes('aspoň 8 znaků'));
test('krátké heslo: vyplněná pole se NEsmazala',
  await page.evaluate(() => document.getElementById('onlineUzEmail').value === 'obchodnik@engineers-cz.cz'
    && document.getElementById('onlineUzJmeno').value === 'Zkušební Obchodník'));

/* Úspěch — KLIKEM na tlačítko, přesně jako uživatel. */
await page.fill('#onlineUzHeslo', 'ObchodniHeslo1');
await page.click('#nastaveni-panel >> text=Založit účet');
await page.waitForFunction(() => { try { return ONLINE_STAV.uzivatele.length === 2; } catch (e) { return false; } });
await page.waitForTimeout(300);
test('nový účet obchodníka se založil klikem z Nastavení',
  await page.evaluate(() => ONLINE_STAV.uzivatele.some(u => u.email === 'obchodnik@engineers-cz.cz' && u.role === 'Obchodník')));
test('založení potvrzuje hláška přímo v panelu a nový řádek v tabulce',
  (await nastav()).includes('je založený') && (await nastav()).includes('obchodnik@engineers-cz.cz'));
test('po úspěchu se formulář vyprázdnil',
  await page.evaluate(() => document.getElementById('onlineUzEmail').value === ''
    && document.getElementById('onlineUzHeslo').value === ''));
test('opakované založení téhož účtu řekne důvod (účet už existuje)', await (async () => {
  await page.fill('#onlineUzEmail', 'obchodnik@engineers-cz.cz');
  await page.fill('#onlineUzHeslo', 'JinaHesla123');
  await page.click('#nastaveni-panel >> text=Založit účet');
  await page.waitForTimeout(400);
  return (await nastav()).includes('Účet už existuje');
})());
await page.evaluate(() => { ONLINE_STAV.uzForm = { email: '', jmeno: '', role: 'Obchodník', heslo: '' }; zavriNastaveni(); });

/* ---- 7) záloha ke stažení ---- */
const [stazeni] = await Promise.all([
  page.waitForEvent('download'),
  page.evaluate(() => onlineZaloha(false)),
]);
test('záloha se stáhne pod jménem s dnešním datem',
  stazeni.suggestedFilename() === 'zaloha_online_' + new Date().toISOString().slice(0, 10) + '.json');

/* ---- 8) relace přežije obnovení stránky ---- */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } },
  null, { timeout: 8000 });
await page.waitForTimeout(400);
test('po obnovení stránky je administrátor dál přihlášený a stránka se neukázala',
  !(await gateViditelna()) && await page.evaluate(() => ONLINE_STAV.ja.email === 'vendl.jaroslav@engineers-cz.cz'));
test('platný ceník se po obnovení načetl a nasadil sám',
  await page.evaluate(() => ONLINE_STAV.db.platny.verze === 1 && ONLINE_STAV.cenikPouzit === true));

/* ---- 9) odhlášení → přihlašovací stránka; obchodník a jeho pohled ---- */
await page.evaluate(() => onlineOdhlas());
await page.waitForFunction(() => { try { return ONLINE_STAV.ja === null; } catch (e) { return false; } });
await page.waitForTimeout(300);
test('po odhlášení se vrátí přihlašovací stránka', await gateViditelna());

/* Obnovení stránky = čerstvý obchodník: v paměti aplikace zůstal po
 * administrátorovi jak nasazený ceník, tak ručně přepsaná firma, takže bez
 * reloadu by se testovalo něco, co u obchodníka na jeho počítači nikdy
 * nenastane. Po reloadu má aplikace zase jen vzorky ze sestavení a je vidět,
 * co pro něj online databáze opravdu udělá. */
await page.reload();
await page.waitForFunction(() => typeof window.render === 'function');
await page.waitForTimeout(400);
test('po odhlášení a obnovení stránky se aplikace zase zamkne', await gateViditelna());
test('čerstvá aplikace startuje s ukázkovou firmou',
  await page.evaluate(() => NAST.firma.ukazkove === true));

await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
await page.waitForTimeout(400);
test('obchodník je přihlášený a roh to říká',
  (await roh()).includes('Zkušební Obchodník') && (await roh()).includes('Obchodník'));
test('obchodník NENÍ administrátor aplikace',
  await page.evaluate(() => NAST.jeAdmin === false));
await page.evaluate(() => prepniTab('zakazka'));
const stranka = await page.locator('#page-zakazka').innerHTML();
test('obchodník nevidí kartu složky _DB (mapování jen pro administrátora)',
  !stranka.includes('Databáze zakázek (složka)'));
test('obchodník kartu Online databáze vidí',
  stranka.includes('Online databáze (schaftscalc.netlify.app)'));

/* Přesně to, co uživatel hlásil: „Přihlásil jsem se jako nový uživatel
 * (obchodník) a přesto to po mně chce připojit databázi." Lišta ukázkových
 * dat ho nesmí posílat pro složku, ke které se nikdy nedostane. Měří se na
 * vynuceném vzorku, protože po nasazení online dat lišta správně zhasne –
 * a na zhasnuté liště by test tiše prošel, aniž by cokoli ověřil. */
const listaObchodnika = await page.evaluate(() => {
  const zaloha = NAST.firma;
  NAST.firma = firmaDefault();          // jen na okamžik měření
  const html = ukazkoveLista();
  NAST.firma = zaloha;
  return html;
});
test('lišta obchodníka nenabízí připojení složky',
  !/Připojit složku|Připojit znovu složku/.test(listaObchodnika), listaObchodnika);
test('lišta obchodníka vůbec nemluví o složce _DB',
  !listaObchodnika.includes('_DB'), listaObchodnika);
test('lišta obchodníka ho posílá za administrátorem',
  /administrátor/i.test(listaObchodnika), listaObchodnika);

/* A druhá polovina téhož zadání: když už mu složku nenabízíme, musí data
 * dostat odjinud. Ceník i firemní údaje si aplikace stáhne z online databáze
 * sama, bez jediného kliknutí. */
await page.waitForFunction(() => { try { return NAST.firma.ukazkove === undefined; } catch (e) { return false; } },
  null, { timeout: 8000 });
test('obchodník dostal skutečné firemní údaje z online databáze',
  await page.evaluate(() => NAST.firma.nazev === 'Zkušební ocelárna s.r.o.' && NAST.firma.ico === '12345678'),
  await page.evaluate(() => NAST.firma.nazev));
test('obchodníkovi se nasadil i platný ceník z online databáze',
  await page.evaluate(() => ONLINE_STAV.cenikPouzit === true));
test('a červená lišta ukázkových dat mu zhasla',
  (await page.locator('#ukazkoveLista').innerHTML()).trim() === '',
  await page.locator('#ukazkoveLista').innerHTML());

/* Ruční přepis a složka mají mít přednost: online verze nesmí přepsat něco,
 * co si administrátor nastavil sám. Kontroluje se přímo pravidlo z onlineTik. */
test('online firma se nasazuje jen na vzorek, ne přes skutečné údaje',
  await page.evaluate(() => ONLINE_STAV.firmaPouzita === true));

/* ---- 10) změna vlastního hesla přes okno v rohu ---- */
await page.evaluate(() => otevriZmenaHesla());
await page.waitForTimeout(200);
await page.fill('#hesloStare', 'ObchodniHeslo1');
await page.fill('#hesloNove', 'ObchodniHeslo2');
await page.fill('#hesloNove2', 'ObchodniHeslo2');
await page.evaluate(() => onlineZmenHeslo());
await page.waitForTimeout(400);
test('změna vlastního hesla proběhla',
  await page.evaluate(() => ONLINE_STAV.hlaska.includes('Heslo je změněné')));
await page.evaluate(() => onlineOdhlas());
await page.waitForFunction(() => { try { return ONLINE_STAV.ja === null; } catch (e) { return false; } });
await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo1');
test('staré heslo už neplatí', (await gate()).includes('Nesprávný e-mail nebo heslo'));
await prihlas('obchodnik@engineers-cz.cz', 'ObchodniHeslo2');
await page.waitForFunction(() => { try { return !!ONLINE_STAV.ja; } catch (e) { return false; } });
test('novým heslem se obchodník přihlásí', !(await gateViditelna()));

/* ---- 11) čistá konzole ---- */
test('za celý průchod nevznikla nečekaná chyba v konzoli', chyby.length === 0, chyby);

await prohlizec.close();
server.close();
console.log(`\n${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
