/* Profil obchodního technika: titul, funkce, telefon a podpis s razítkem
 * (5. 8. 2026, #145).
 *
 * Zadání: „V cenové nabídce se musí zobrazovat jméno a kontaktní údaje
 * obchodníka = Obchodního technika, která nabídku tvořil. jedná se
 * o uživatele. Tedy v rámci registrace uživatele musíme doplnit i titul před
 * jménem a telefonní číslo a tyto informace aktualizovat v šabloně. Zároveň
 * tam přidej možnost uživateli nahrát snímek s podpisem a rozítkem."
 *
 * Do teď měl účet jen e-mail, jméno a roli. V šabloně nabídky přitom stojí
 * natvrdo vepsaný blok „Vypracoval: Ing. Jiří Lauda / Obchodní technik /
 * Tel: … / Email: …" a pod ním zapečený obrázek podpisu a razítka. Ať nabídku
 * dělal kdokoli, odcházela pod jménem jednoho kolegy — a když ji poslal někdo
 * jiný, musel to po vygenerování ručně přepsat ve Wordu, včetně obrázku.
 *
 * Tahle sada hlídá vrstvu ukládání: co všechno účet nese, kdo to smí měnit
 * a co se s podpisem nesmí stát. Propsání do dokumentu řeší samostatná
 * položka (#146) — bez uložených údajů by ale nebylo co propisovat.
 *
 * Dvě věci, na kterých tu nejvíc záleží:
 *
 * 1. PODPIS JE OBRÁZEK, KTERÝ PŮJDE DO DOKUMENTU. Proto se přijímá jen PNG
 *    nebo JPEG. SVG vypadá jako obrázek, ale je to XML, které umí nést skript
 *    — a my ho chystáme zobrazovat v aplikaci i vkládat do .docx. Formát,
 *    který může něco spustit, do téhle cesty nepatří.
 *
 * 2. SVŮJ PROFIL SI SPRAVUJE KAŽDÝ SÁM, CIZÍ JEN ADMINISTRÁTOR. Telefon
 *    a podpis jsou osobní údaje; kdyby si je mohl přepsat kdokoli, šlo by
 *    poslat nabídku s cizím podpisem. Roli a e-mail přes profil měnit nejde
 *    vůbec — od toho jsou samostatné akce, které umí jen administrátor.
 */
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
import { ADMIN_EMAIL, PODPIS_MAX } from './lib/sdilene.mjs';

let ok = 0, fail = 0;
const test = (n, cond, info) => { if (cond) { ok++; console.log('OK  ' + n); } else { fail++; console.log('FAIL ' + n, info === undefined ? '' : info); } };
const post = (fn, url, telo, cookie) => fn(new Request(url, { method: 'POST',
  headers: cookie ? { cookie } : {}, body: JSON.stringify(telo) }));
const get = (fn, url, cookie) => fn(new Request(url, { headers: cookie ? { cookie } : {} }));
const tel = (fn, url, telo, cookie) => post(fn, url, telo, cookie).then(r => r.json());

async function prihlas(email, heslo) {
  const r = await post(prihlaseni, 'http://x/api/prihlaseni', { email, heslo });
  const t = await r.clone().json();
  if (!t.ok) throw new Error('Přihlášení selhalo pro ' + email + ': ' + JSON.stringify(t));
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

/* Nejmenší platný PNG (1×1 průhledný bod). Skutečný podpis je sken o pár
 * set kilobajtech; pro testy jde jen o to, že soubor je PNG. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

const cAdmin = await prihlas(ADMIN_EMAIL, 'Docasne.Heslo.123');

/* ============================================================
 * 1) ZALOŽENÍ ÚČTU — nová políčka rovnou při registraci
 *
 * „…v rámci registrace uživatele musíme doplnit i titul před jménem
 * a telefonní číslo." Administrátor je vyplní hned, ať nový kolega nemusí
 * po prvním přihlášení nic dohledávat. Nepovinná ale zůstat musí: účet
 * pro brigádníka nebo účet, ke kterému telefon zatím není, se musí dát
 * založit taky.
 * ============================================================ */

const zal = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'lauda.jiri@example.com', jmeno: 'Jiří Lauda', titul: 'Ing.',
    funkce: 'Obchodní technik', telefon: '+420 602 590 945',
    role: 'Obchodník', heslo: 'LaudaHeslo1' }, cAdmin);
test('založení účtu s titulem, funkcí a telefonem projde', zal.ok === true, zal);

const cLauda = await prihlas('lauda.jiri@example.com', 'LaudaHeslo1');
let mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('titul se uložil', mujProfil.titul === 'Ing.', mujProfil.titul);
test('funkce se uložila', mujProfil.funkce === 'Obchodní technik', mujProfil.funkce);
test('telefon se uložil tak, jak byl zadán (mezery ani + se nepřepisují)',
  mujProfil.telefon === '+420 602 590 945', mujProfil.telefon);
test('jméno a role zůstávají', mujProfil.jmeno === 'Jiří Lauda' && mujProfil.role === 'Obchodník', mujProfil);

const bezUdaju = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'zaloz', email: 'bez.udaju@example.com', jmeno: 'Bez Údajů',
    role: 'Obchodník', heslo: 'BezHeslo123' }, cAdmin);
test('účet bez titulu a telefonu se založí (údaje jsou nepovinné)', bezUdaju.ok === true, bezUdaju);
const cBez = await prihlas('bez.udaju@example.com', 'BezHeslo123');
const profilBez = await (await get(ja, 'http://x/api/ja', cBez)).json();
test('nevyplněné údaje se vrací jako prázdný text, ne undefined',
  profilBez.titul === '' && profilBez.telefon === '' && profilBez.funkce === '', profilBez);

test('okolní mezery v titulu i telefonu se ořežou', await (async () => {
  const r = await tel(uzivatele, 'http://x/api/uzivatele',
    { akce: 'zaloz', email: 'mezery@example.com', jmeno: '  Mezerný Michal  ', titul: '  Bc.  ',
      telefon: '  +420 111 222 333  ', role: 'Obchodník', heslo: 'MezeryHeslo1' }, cAdmin);
  if (!r.ok) return false;
  const c = await prihlas('mezery@example.com', 'MezeryHeslo1');
  const p = await (await get(ja, 'http://x/api/ja', c)).json();
  return p.titul === 'Bc.' && p.telefon === '+420 111 222 333' && p.jmeno === 'Mezerný Michal';
})());

/* ============================================================
 * 2) VLASTNÍ PROFIL — každý si spravuje své údaje sám
 *
 * Kdyby se telefon dal měnit jen přes administrátora, skončilo by to tak,
 * že se nezmění vůbec: nikdo nebude kvůli novému číslu psát správci.
 * ============================================================ */

const uprav = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', titul: 'Ing.', funkce: 'Vedoucí obchodu', telefon: '+420 777 111 222' }, cLauda);
test('obchodník si smí upravit vlastní profil', uprav.ok === true, uprav);
mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('změna telefonu se projeví hned', mujProfil.telefon === '+420 777 111 222', mujProfil.telefon);
test('změna funkce se projeví hned', mujProfil.funkce === 'Vedoucí obchodu', mujProfil.funkce);

const bezPrihlaseni = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', telefon: '+420 000 000 000' });
test('nepřihlášený profil měnit nesmí', bezPrihlaseni.ok === false, bezPrihlaseni);

/* Role a e-mail přes profil nejdou. Tohle je hlavní past celé akce: kdyby
 * se do účtu kopírovalo celé přijaté tělo, stačilo by k povýšení na
 * administrátora poslat vlastní profil s jiným polem `role`. */
const povyseni = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', titul: 'Ing.', role: 'Administrátor' }, cLauda);
mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('profil nesmí změnit vlastní roli', mujProfil.role === 'Obchodník', [povyseni, mujProfil.role]);

const prepisEmailu = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', email: 'bez.udaju@example.com', telefon: '+420 999 888 777' }, cLauda);
const cizi = await (await get(ja, 'http://x/api/ja', cBez)).json();
test('obchodník nesmí přes profil sáhnout na cizí účet',
  prepisEmailu.ok === false && cizi.telefon === '', [prepisEmailu, cizi.telefon]);
mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('odmítnutý pokus o cizí účet nezměnil ani vlastní údaje',
  mujProfil.telefon === '+420 777 111 222', mujProfil.telefon);

const adminCizi = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', email: 'bez.udaju@example.com', titul: 'Mgr.', telefon: '+420 555 444 333' }, cAdmin);
const poAdminovi = await (await get(ja, 'http://x/api/ja', cBez)).json();
test('administrátor smí doplnit údaje kolegovi',
  adminCizi.ok === true && poAdminovi.titul === 'Mgr.' && poAdminovi.telefon === '+420 555 444 333',
  [adminCizi, poAdminovi]);

/* ============================================================
 * 3) PODPIS S RAZÍTKEM
 *
 * Sken podpisu a razítka je obrázek, který poputuje do .docx. Přijímá se
 * proto jen to, co je opravdu obrázek a co Word umí vložit.
 * ============================================================ */

const podpisOk = await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: PNG }, cLauda);
test('PNG podpis se uloží', podpisOk.ok === true, podpisOk);
mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('podpis se vrací zpět celý a beze změny', mujProfil.podpis === PNG,
  (mujProfil.podpis || '').slice(0, 40));

const podpisJpeg = await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: JPEG }, cBez);
test('JPEG podpis se uloží taky (sken bývá JPEG)', podpisJpeg.ok === true, podpisJpeg);

const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>').toString('base64');
const podpisSvg = await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: svg }, cLauda);
test('SVG se odmítne (umí nést skript a Word ho stejně nevloží)', podpisSvg.ok === false, podpisSvg);

const podpisOdkaz = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'podpis', obrazek: 'https://priklad.cz/podpis.png' }, cLauda);
test('odkaz místo obrázku se odmítne (dokument musí být soběstačný)',
  podpisOdkaz.ok === false, podpisOdkaz);

const podpisNesmysl = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'podpis', obrazek: 'data:image/png;base64,tohle NENÍ base64 !!!' }, cLauda);
test('poškozený obsah se odmítne', podpisNesmysl.ok === false, podpisNesmysl);

const velky = 'data:image/png;base64,' + 'A'.repeat(PODPIS_MAX);
const podpisVelky = await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: velky }, cLauda);
test('příliš velký obrázek se odmítne s vysvětlením, ne mlčky',
  podpisVelky.ok === false && /zmenš|men|velk|MB|kB/i.test(podpisVelky.chyba || ''), podpisVelky);

mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('odmítnuté nahrání nepřepsalo dřívější platný podpis', mujProfil.podpis === PNG,
  (mujProfil.podpis || '').slice(0, 40));

const podpisCizi = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'podpis', email: 'bez.udaju@example.com', obrazek: PNG }, cLauda);
test('cizí podpis nahrát nelze (jinak by šla poslat nabídka s cizím podpisem)',
  podpisCizi.ok === false, podpisCizi);

const smaz = await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: '' }, cLauda);
mujProfil = await (await get(ja, 'http://x/api/ja', cLauda)).json();
test('prázdné nahrání podpis odstraní', smaz.ok === true && !mujProfil.podpis,
  [smaz, mujProfil.podpis]);

await tel(uzivatele, 'http://x/api/uzivatele', { akce: 'podpis', obrazek: PNG }, cLauda);

/* ============================================================
 * 4) SEZNAM ÚČTŮ — co v něm smí být a co ne
 *
 * Seznam vidí administrátor a načítá se při každém otevření správy účtů.
 * Podpisy jsou stovky kilobajtů na účet; kdyby jezdily se seznamem, byla by
 * z jednoduché tabulky několikamegabajtová odpověď. Do seznamu patří to,
 * podle čeho se účty spravují — jméno, titul, telefon, role, stav.
 * ============================================================ */

const seznam = await (await get(uzivatele, 'http://x/api/uzivatele', cAdmin)).json();
const radek = (seznam.uzivatele || []).find(u => u.email === 'lauda.jiri@example.com');
test('seznam účtů nese titul', radek && radek.titul === 'Ing.', radek);
test('seznam účtů nese telefon', radek && radek.telefon === '+420 777 111 222', radek);
test('seznam účtů nese funkci', radek && radek.funkce === 'Vedoucí obchodu', radek);
test('seznam účtů podpisy NEnese (nafoukl by odpověď)',
  (seznam.uzivatele || []).every(u => !('podpis' in u)), seznam.uzivatele);
test('seznam účtů nikdy nenese otisk hesla',
  (seznam.uzivatele || []).every(u => !('heslo' in u)), seznam.uzivatele);
test('seznam účtů smí číst jen administrátor',
  (await (await get(uzivatele, 'http://x/api/uzivatele', cLauda)).json()).ok === false);

/* ============================================================
 * 5) PŘIHLÁŠENÍ VRACÍ PROFIL ROVNOU
 *
 * Aplikace potřebuje údaje hned při přihlášení — razítkuje jimi dokumenty.
 * Kdyby si je musela dotahovat zvlášť, první vygenerovaná nabídka po
 * přihlášení by odešla bez podpisu.
 * ============================================================ */

const odpovedPrihlaseni = await (await post(prihlaseni, 'http://x/api/prihlaseni',
  { email: 'lauda.jiri@example.com', heslo: 'LaudaHeslo1' })).json();
test('přihlášení vrací titul, funkci i telefon',
  odpovedPrihlaseni.titul === 'Ing.' && odpovedPrihlaseni.funkce === 'Vedoucí obchodu'
  && odpovedPrihlaseni.telefon === '+420 777 111 222', odpovedPrihlaseni);
test('přihlášení vrací i podpis', odpovedPrihlaseni.podpis === PNG,
  (odpovedPrihlaseni.podpis || '').slice(0, 40));
test('odpověď přihlášení nikdy nenese otisk hesla',
  !('heslo' in odpovedPrihlaseni), Object.keys(odpovedPrihlaseni));

/* ============================================================
 * 6) STARÉ ÚČTY
 *
 * V databázi jsou účty založené dřív, než tahle políčka existovala. Nesmí
 * po aktualizaci přestat fungovat ani hlásit „undefined" v dokumentu.
 * ============================================================ */

pamet.set('uzivatele/stary@example.com', JSON.stringify({
  email: 'stary@example.com', jmeno: 'Starý Účet', role: 'Obchodník',
  heslo: JSON.parse(pamet.get('uzivatele/lauda.jiri@example.com')).heslo, aktivni: true }));
const cStary = await prihlas('stary@example.com', 'LaudaHeslo1');
const profilStary = await (await get(ja, 'http://x/api/ja', cStary)).json();
test('účet bez nových políček se přihlásí a vrátí prázdné hodnoty',
  profilStary.ok === true && profilStary.titul === '' && profilStary.telefon === ''
  && profilStary.funkce === '' && !profilStary.podpis, profilStary);
const doplnStary = await tel(uzivatele, 'http://x/api/uzivatele',
  { akce: 'profil', titul: 'Ing.', telefon: '+420 123 456 789' }, cStary);
test('starý účet si údaje doplní bez zásahu administrátora', doplnStary.ok === true, doplnStary);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
