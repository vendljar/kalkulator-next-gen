/* Lokální test online databáze (mimo Netlify): náhradní úložiště v paměti,
 * TAJEMSTVI_RELACE a ADMIN_INIT_HESLO jen pro tenhle běh testu. */
process.env.TAJEMSTVI_RELACE = 'testovaci-tajemstvi-jen-pro-lokalni-beh';
process.env.ADMIN_INIT_HESLO = 'Docasne.Heslo.123';
const pamet = new Map();
globalThis.__TEST_ULOZISTE = (nazev) => ({
  async cti(k) { return pamet.has(nazev + '/' + k) ? JSON.parse(pamet.get(nazev + '/' + k)) : null; },
  async zapis(k, v) { pamet.set(nazev + '/' + k, JSON.stringify(v)); },
  async seznam(prefix) { return [...pamet.keys()].filter(x => x.startsWith(nazev + '/' + (prefix || '')))
    .map(x => x.slice(nazev.length + 1)); },
});

import prihlaseni from './functions/prihlaseni.mjs';
import ja from './functions/ja.mjs';
import uzivatele from './functions/uzivatele.mjs';
import program from './functions/program.mjs';
import zakazky from './functions/zakazky.mjs';
import zaloha from './functions/zaloha.mjs';
import zalohaNocni from './functions/zaloha_nocni.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const zk = require('../src/zakazka.js');
const ZC = require('../src/zkusebni_cenik.js');

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info || ''); } };
const post = (fn, url, telo, cookie) => fn(new Request(url, { method: 'POST',
  headers: cookie ? { cookie } : {}, body: JSON.stringify(telo) }));
const get = (fn, url, cookie) => fn(new Request(url, { headers: cookie ? { cookie } : {} }));

/* 1) bez přihlášení nikam */
test('program bez přihlášení odmítnut', (await get(program, 'http://x/api/program')).status === 401);
test('zakázky bez přihlášení odmítnuty', (await get(zakazky, 'http://x/api/zakazky')).status === 401);

/* 2) první přihlášení administrátora (bootstrap z prostředí) */
const spatne = await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'vendl.jaroslav@engineers-cz.cz', heslo: 'jine' });
test('špatné heslo odmítnuto', spatne.status === 401);
const r1 = await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'vendl.jaroslav@engineers-cz.cz', heslo: 'Docasne.Heslo.123' });
const o1 = await r1.json();
test('bootstrap administrátora funguje', o1.ok && o1.role === 'Administrátor', JSON.stringify(o1));
const cookie = (r1.headers.get('set-cookie') || '').split(';')[0];
test('relace se vydala v cookie', cookie.startsWith('relace='));
test('/api/ja zná přihlášeného', (await (await get(ja, 'http://x/api/ja', cookie)).json()).email === 'vendl.jaroslav@engineers-cz.cz');

/* 3) uživatelé: založení obchodníka + jeho omezená práva */
const z1 = await (await post(uzivatele, 'http://x/api/uzivatele', { akce: 'zaloz', email: 'obchodnik@engineers-cz.cz', jmeno: 'Test Obchodník', role: 'Obchodník', heslo: 'ObchodHeslo1' }, cookie)).json();
test('administrátor založí účet', z1.ok === true, JSON.stringify(z1));
const r2 = await post(prihlaseni, 'http://x/api/prihlaseni', { email: 'obchodnik@engineers-cz.cz', heslo: 'ObchodHeslo1' });
const cookieObch = (r2.headers.get('set-cookie') || '').split(';')[0];
test('obchodník se přihlásí', (await r2.json()).role === 'Obchodník');
test('obchodník NEspravuje uživatele', (await get(uzivatele, 'http://x/api/uzivatele', cookieObch)).status === 403);

/* 4) program: zveřejnění (admin) a čtení (obchodník) */
const pub = await (await post(program, 'http://x/api/program', { cenik: ZC.zkusebniCenik(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1, maxGlobalni: 0.3, stropy: { 'Obchodník': 0.05 } }, poznamka: 'první online verze' }, cookie)).json();
test('administrátor zveřejní ceník (verze 1)', pub.ok && pub.verze === 1, JSON.stringify(pub));
test('obchodník ceník zveřejnit NEsmí', (await post(program, 'http://x/api/program', { cenik: {} }, cookieObch)).status === 403);
const cteni = await (await get(program, 'http://x/api/program', cookieObch)).json();
test('obchodník platný ceník přečte', cteni.ok && cteni.db.platny.verze === 1);
const pub2 = await (await post(program, 'http://x/api/program', { cenik: ZC.zkusebniCenik(), cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1, maxGlobalni: 0.3, stropy: { 'Obchodník': 0.05 } } }, cookie)).json();
test('beze změny se nezveřejňuje', pub2.ok === false, JSON.stringify(pub2));
const cen2 = ZC.zkusebniCenik(); cen2.profilKgKc = (cen2.profilKgKc || 0) + 1;
const pub3 = await (await post(program, 'http://x/api/program', { cenik: cen2, cenikProj: ZC.zkusebniCenikProj(), slevy: { minMarze: 0.1 } }, cookie)).json();
test('změna ceny → verze 2 a stará verze do historie', pub3.ok && pub3.verze === 2, JSON.stringify(pub3));

/* 5) zakázky: uložení, rejstřík, načtení, ochrana zámku */
Object.assign(globalThis, require('../src/format.js'), require('../src/engine.js'), require('../src/engine_proj.js'), require('../src/techspec.js'), require('../src/sleva.js'), require('../src/zaokrouhleni.js'), require('../src/zamek.js'));
const zm = require('../src/zamek.js');
const zak = zk.novaZakazka(); zak.cislo = '2026 - OPR - CN - 0777'; zak.nazevAkce = 'Online test';
const ul1 = await (await post(zakazky, 'http://x/api/zakazky', { zakazka: zak }, cookieObch)).json();
test('zakázka se uloží online', ul1.ok === true && !!ul1.soubor, JSON.stringify(ul1));
const rej = await (await get(zakazky, 'http://x/api/zakazky', cookieObch)).json();
test('rejstřík zakázku eviduje', rej.ok && rej.rejstrik.zakazky.length === 1 && rej.rejstrik.zakazky[0].soubor === ul1.soubor);
const nact = await (await get(zakazky, 'http://x/api/zakazky?soubor=' + encodeURIComponent(ul1.soubor), cookieObch)).json();
test('zakázka se načte zpět beze změny čísla', nact.ok && nact.zakazka.cislo === zak.cislo);
zm.zamkniVariantu(zak.varianty[0], { typ: 'nabidka', kdy: new Date().toISOString(), kdo: 'Test' });
await post(zakazky, 'http://x/api/zakazky', { zakazka: zak }, cookieObch);   // uložit se zámkem
const zakUtok = JSON.parse(JSON.stringify(zak));
zakUtok.varianty[0].data.ock.zadani.sirka = 9.99;                            // pokus změnit odeslanou nabídku
const utok = await post(zakazky, 'http://x/api/zakazky', { zakazka: zakUtok }, cookieObch);
test('uzamčená (odeslaná) nabídka se nepřepíše', utok.status === 409);

/* 6) záloha: jen admin, obsahuje program i zakázky, bez otisků hesel */
test('záloha jen pro administrátora', (await get(zaloha, 'http://x/api/zaloha', cookieObch)).status === 403);
const zal = await (await get(zaloha, 'http://x/api/zaloha', cookie)).json();
test('záloha nese program, rejstřík i zakázky', zal.ok && zal.zaloha.program.platny.verze === 2
  && Object.keys(zal.zaloha.zakazky).length === 1 && zal.zaloha.rejstrik.zakazky.length === 1);
test('záloha neobsahuje otisky hesel', !JSON.stringify(zal.zaloha.uzivatele).includes(':')
  || zal.zaloha.uzivatele.every(u => !u.heslo));

/* 7) noční otisk: pořizuje se sám a pod dnešním datem nese úplnou databázi
 * (na rozdíl od zálohy pro Disk VČETNĚ otisků hesel — zůstává v Blobs,
 * aby obnova nevyžadovala reset všech hesel) */
const noc = await (await zalohaNocni()).json();
test('noční otisk proběhne a vrátí dnešní den', noc.ok && noc.den === new Date().toISOString().slice(0, 10));
const otisk = await (await globalThis.__TEST_ULOZISTE('zalohy')).cti(noc.den);
test('otisk nese program, zakázky i rejstřík', !!otisk && otisk.program.platny.verze === 2
  && Object.keys(otisk.zakazky).length === 1 && otisk.rejstrik.zakazky.length === 1);
test('otisk nese celé účty (obnova bez resetu hesel)', Array.isArray(otisk.uzivatele)
  && otisk.uzivatele.length === 2 && otisk.uzivatele.every(u => typeof u.heslo === 'string' && u.heslo.includes(':')));

console.log(`\n${ok} prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
