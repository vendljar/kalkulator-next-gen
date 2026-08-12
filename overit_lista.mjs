/* Ověření v prohlížeči: přejmenovaná záložka, karty obou nabídek v přehledu,
 * klouzající lišta (Zpět/Znovu + kotvy) v Kalkulaci OCK i PROJ, synchronizace
 * historie mezi vrchní lištou a duplikáty. Spouští se nad sestaveným buildem. */
import { chromium } from 'playwright';
import fs from 'fs';

const KDE = 'file:///home/claude/work/kng/dist/kalkulacka.html';
const chyby = [];
const konzole = [];

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
p.on('console', m => { if (m.type() === 'error') konzole.push('error: ' + m.text()); });
p.on('pageerror', e => konzole.push('pageerror: ' + e.message));

await p.goto(KDE);
await p.waitForTimeout(700);

const ok = (co, podm) => { console.log((podm ? '  ✓ ' : '  ✗ ') + co); chyby.push(podm); };

/* ---------- zkušební ceník do běžícího sestavení ----------
 * Od 30. 7. 2026 nese sestavení PRÁZDNÝ ceník (samé nuly) – tak to zadání
 * chce a odděleně se to i ověřuje (viz oddíl „zábrana" úplně dole). Jenže
 * skoro každá kontrola v tomhle souboru se ptá na něco, co z nul spočítat
 * nejde: nízká přirážka, rozdíl po zaokrouhlení, ztrátová sekce. Proto se
 * hned po načtení podstrčí zkušební ceník ze `src/zkusebni_cenik.js` –
 * tentýž, ze kterého počítají jednotkové testy. Do sestavení nevede: čte
 * se tady v Node a do stránky se předává jako obyčejná data.
 *
 * Značka `ukazkove` zůstává (ceník opravdu ostrý není), `prazdny` mizí –
 * a s ním i zábrana. Chování aplikace tak odpovídá stavu „ceník je nahraný,
 * ale ještě není ostrý", což je přesně to, co zbytek souboru předpokládá. */
const { createRequire } = await import('module');
const ZC = createRequire(import.meta.url)('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  /* DEFAULT_CENIK je `const` – přepsat vazbu nejde, ale obsah objektu ano,
   * a odkaz na něj drží celá aplikace. */
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta(); render();
  /* Podstrčení ceníku je zásah zvenčí, ne uživatelova změna – historie po něm
   * musí vypadat stejně jako po čerstvém startu, jinak by „Zpět" umělo vrátit
   * něco, co uživatel nikdy neudělal. */
  HIST.zpet.length = 0; HIST.znovu.length = 0;
  HIST.posledni = JSON.stringify(ZAK); HIST.ulozenoJako = HIST.posledni;
  historieTlacitka();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(200);

// --- přejmenovaná záložka --------------------------------------------------
const tabText = (await p.locator('#tab-zakazka').innerText()).trim();
ok(`záložka se jmenuje „${tabText}"`, tabText === 'Přehled cenových nabídek');
ok('starý název „Zakázka a varianty" v navigaci není',
   !(await p.locator('nav.tabs').innerText()).includes('Zakázka a varianty'));

// --- lišta v Kalkulaci OCK -------------------------------------------------
const lista = p.locator('#page-kalk .kalk-lista');
ok('Kalkulace OCK má klouzající lištu', await lista.count() === 1);
ok('lišta má duplikáty Zpět a Znovu',
   await lista.locator('.jsHistZpet').count() === 1 && await lista.locator('.jsHistZnovu').count() === 1);
const kotvy = await lista.locator('a.dv-kotva').count();
ok(`lišta OCK má ${kotvy} kotev (čekám 11)`, kotvy === 11);

// každá kotva musí mířit na existující cíl
const bezCile = await p.evaluate(() =>
  [...document.querySelectorAll('#page-kalk .kalk-lista a.dv-kotva')]
    .map(a => a.getAttribute('href'))
    .filter(h => !document.querySelector(h)));
ok('všechny kotvy OCK míří na existující cíl' + (bezCile.length ? ' – chybí: ' + bezCile.join(', ') : ''),
   bezCile.length === 0);

/* Modrá lišta s tlačítky uzavírá hlavičku. Dřív pod ní stál vysvětlující
 * odstavec a kontrola hlídala, že tlačítka jsou nad ním; od 31. 7. 2026 tam
 * ten text nemá být vůbec. Od 4. 8. 2026 smí za lištou stát jediná věc –
 * řádek(y) o stavu uložení zakázky (.zak-ulozeni), protože uživatel musí
 * hned vedle tlačítka vidět, jestli zakázka v databázi je, nebo čeká na
 * vyplnění hlavičky. Nic jiného za lištu nepatří. */
const poradi = await p.evaluate(() => {
  const telo = document.querySelector('#kalk-hlavicka .zak-bar .body');
  const btns = telo.querySelector('.zak-cena');
  if (!btns) return { lista: false };
  const za = [];
  for (let e = btns.nextElementSibling; e; e = e.nextElementSibling)
    za.push(e.className || e.tagName);
  return { lista: true, za, jenStav: za.every(t => /zak-ulozeni/.test(t)) };
});
ok('lišta s tlačítky uzavírá hlavičku – za ní stojí jen stav uložení'
   + (poradi.za && poradi.za.length ? ' (' + poradi.za.join(' | ') + ')' : ''),
   poradi.lista && poradi.jenStav);
ok('odkaz v hlavičce vede na „Přehled cenových nabídek →"',
   (await p.locator('#kalk-hlavicka .zak-cena').innerText()).includes('Přehled cenových nabídek'));

// --- modrá barva shodná s lištami názvů sekcí ------------------------------
// porovnává se spočtená barva, ne text v CSS – tak se pozná i to, že hodnotu
// nepřebilo jiné pravidlo dál v souboru
const barvy = await p.evaluate(() => {
  const l = getComputedStyle(document.querySelector('#page-kalk .kalk-lista'));
  const h = getComputedStyle(document.querySelector('.zak-bar-h'));
  const kotva = getComputedStyle(document.querySelector('#page-kalk .kalk-lista a.dv-kotva'));
  return { listaBg: l.backgroundColor, hlavickaBg: h.backgroundColor,
           listaBarva: l.color, hlavickaBarva: h.color, kotvaBarva: kotva.color };
});
ok(`lišta má stejný modrý podklad jako lišty názvů sekcí (${barvy.listaBg})`,
   barvy.listaBg === barvy.hlavickaBg);
ok(`písmo v liště je akcentově modré (${barvy.listaBarva})`,
   barvy.listaBarva === barvy.hlavickaBarva && barvy.kotvaBarva === barvy.hlavickaBarva);
ok('podklad lišty není průhledný (obsah pod ní neprosvítá)',
   !/transparent|rgba\(0, 0, 0, 0\)/.test(barvy.listaBg));

// --- tlumený rámeček a stín (29. 7. 2026) ----------------------------------
// rámeček nesmí být plná akcentová modř a stín nesmí být modrá „luminiscence“
const ram = await p.evaluate(() => {
  const l = getComputedStyle(document.querySelector('#page-kalk .kalk-lista'));
  return { border: l.borderTopColor, stin: l.boxShadow };
});
ok(`rámeček lišty je tlumená modř, ne akcentová (${ram.border})`,
   ram.border !== 'rgb(31, 94, 255)' && /^rgb/.test(ram.border));
ok(`stín lišty není modrý ani rozlitý (${ram.stin})`,
   !/31, 94, 255/.test(ram.stin) && !/1[0-9]px|2[0-9]px/.test(ram.stin));

// --- sticky chování --------------------------------------------------------
await p.evaluate(() => window.scrollTo(0, 2000));
await p.waitForTimeout(700);
const [top, scrollY] = await p.evaluate(() =>
  [document.querySelector('#page-kalk .kalk-lista').getBoundingClientRect().top, window.scrollY]);
ok(`po odrolování (${Math.round(scrollY)} px) lišta drží u horního okraje (top ${Math.round(top)} px)`,
   scrollY > 1000 && top >= -1 && top <= 2);

// kliknutí na kotvu sroluje k cíli, cíl nezajede pod lištu
await p.locator('#page-kalk .kalk-lista a[href="#ock-nabidka"]').click();
await p.waitForTimeout(900);
// cíl je poslední karta stránky – níž než na doraz dokumentu se srolovat nedá,
// proto se kontroluje „cíl je vidět a nezajel pod lištu", ne přesná pozice
const cil = await p.evaluate(() => {
  const r = document.getElementById('ock-nabidka').getBoundingClientRect();
  return { top: r.top, dole: r.top < window.innerHeight };
});
ok(`kotva Cenová nabídka sroluje k cíli (top ${Math.round(cil.top)} px, ve viewportu)`,
   cil.top >= 0 && cil.dole);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(500);

// --- synchronizace Zpět/Znovu ---------------------------------------------
ok('před změnou jsou všechna Zpět vypnutá', await p.evaluate(() =>
  [...document.querySelectorAll('.jsHistZpet')].every(b => b.disabled)));
// změna hodnoty v Zadání šachty (Horní přejezd 2,7 → 3,1)
const pole = p.locator('#ock-zadani input[type=number]').first();
await pole.fill('3.1');
await pole.press('Tab');
await p.waitForTimeout(500);
const poZmene = await p.evaluate(() => ({
  pocet: document.querySelectorAll('.jsHistZpet').length,
  zapnute: [...document.querySelectorAll('.jsHistZpet')].filter(b => !b.disabled).length,
}));
ok(`po změně jsou zapnuté všechny kopie Zpět (${poZmene.zapnute} z ${poZmene.pocet}, čekám 3)`,
   poZmene.pocet === 3 && poZmene.zapnute === 3);
// vrátit změnu tlačítkem v LIŠTĚ (ne ve vrchní liště)
await p.locator('#page-kalk .kalk-lista .jsHistZpet').click();
await p.waitForTimeout(500);
const hodnota = await p.locator('#ock-zadani input[type=number]').first().inputValue();
ok(`Zpět v liště vrátilo hodnotu (${hodnota}, čekám 2.7)`, hodnota === '2.7');
ok('po vrácení jsou zapnutá všechna Znovu', await p.evaluate(() =>
  [...document.querySelectorAll('.jsHistZnovu')].every(b => !b.disabled)));

// --- lišta v Kalkulaci PROJ ------------------------------------------------
await p.locator('#tab-proj').click();
await p.waitForTimeout(500);
const listaP = p.locator('#page-proj .kalk-lista');
ok('Kalkulace PROJ má klouzající lištu', await listaP.count() === 1);
const kotvyP = await listaP.locator('a.dv-kotva').count();
ok(`lišta PROJ má ${kotvyP} kotev (sekce + Souhrn + Nabídka)`, kotvyP >= 3);
// zadané krátké názvy kotev PROJ (29. 7. 2026) – v liště, ne v názvech karet
const CEKANE_PROJ = ['Zaměření', 'Studie', 'Projednání studie', 'DPZ', 'IČ', 'DPS',
                     'EZC', 'Kolaudace', 'Geodetické zaměření', 'Sleva', 'Souhrn', 'Cenová Nabídka'];
const nazvyP = await p.evaluate(() =>
  [...document.querySelectorAll('#page-proj .kalk-lista a.dv-kotva')].map(a => a.textContent.trim()));
ok(`názvy kotev PROJ odpovídají zadání (${nazvyP.join(' · ')})`,
   JSON.stringify(nazvyP) === JSON.stringify(CEKANE_PROJ));
const bezCileP = await p.evaluate(() =>
  [...document.querySelectorAll('#page-proj .kalk-lista a.dv-kotva')]
    .map(a => a.getAttribute('href'))
    .filter(h => !document.querySelector(h)));
ok('všechny kotvy PROJ míří na existující cíl' + (bezCileP.length ? ' – chybí: ' + bezCileP.join(', ') : ''),
   bezCileP.length === 0);

// --- lišta v Detailu výpočtu vypadá stejně jako klouzající lišta ------------
await p.locator('#tab-detail').click();
await p.waitForTimeout(600);
const dv = await p.evaluate(() => {
  const d = getComputedStyle(document.querySelector('#page-detail .dv-lista'));
  const l = getComputedStyle(document.querySelector('#page-kalk .kalk-lista'));
  const dk = document.querySelector('#page-detail .dv-lista a.dv-kotva');
  return { dBg: d.backgroundColor, lBg: l.backgroundColor,
           dBorder: d.borderTopColor, lBorder: l.borderTopColor,
           dStin: d.boxShadow, dBarva: d.color, lBarva: l.color,
           kotvaBg: dk ? getComputedStyle(dk).backgroundColor : null };
});
ok(`lišta detailu má stejný podklad jako klouzající lišta (${dv.dBg})`, dv.dBg === dv.lBg);
ok(`lišta detailu má stejný rámeček (${dv.dBorder})`, dv.dBorder === dv.lBorder);
ok('lišta detailu má akcentové písmo jako klouzající lišta', dv.dBarva === dv.lBarva);
ok(`stín lišty detailu není modrý ani rozlitý (${dv.dStin})`,
   !/31, 94, 255/.test(dv.dStin) && !/1[0-9]px|2[0-9]px/.test(dv.dStin));
ok(`kotvy v liště detailu jsou bílé pilulky (${dv.kotvaBg})`, dv.kotvaBg === 'rgb(255, 255, 255)');
await p.screenshot({ path: 'snimek_lista_detail.png' });

/* ---------- lišta detailu se posouvá s obsahem (30. 7. 2026) ----------
 * Zadání: „I lišta v detailu výpočtu by měla být posuvná jako v kalkulacích."
 * Detail je dlouhá stránka o dvanácti krocích – bez přilepené lišty se
 * uživatel po odrolování nemá jak přepnout na jiný krok ani vypnout vzorce,
 * aniž by nejdřív vyjel nahoru. Kontroluje se totéž co u kalkulací:
 * lepí se, drží u okraje, neprosvítá skrz ni obsah a cíl kotvy pod ni nezajede. */
const dvLep = await p.evaluate(() => {
  const d = getComputedStyle(document.querySelector('#page-detail .dv-lista'));
  return { poz: d.position, top: d.top, z: d.zIndex, bg: d.backgroundColor };
});
ok(`lišta detailu je přilepená (position: ${dvLep.poz}, top: ${dvLep.top})`,
   dvLep.poz === 'sticky' && dvLep.top === '0px');
ok(`lišta detailu leží nad obsahem (z-index ${dvLep.z})`, +dvLep.z >= 10);
ok(`podklad lišty detailu není průhledný (${dvLep.bg})`,
   !/transparent|rgba\(0, 0, 0, 0\)/.test(dvLep.bg));

await p.evaluate(() => window.scrollTo(0, 2000));
await p.waitForTimeout(700);
const dvPoRolovani = await p.evaluate(() => ({
  top: document.querySelector('#page-detail .dv-lista').getBoundingClientRect().top,
  y: window.scrollY,
}));
ok(`po odrolování (${Math.round(dvPoRolovani.y)} px) lišta detailu drží u horního okraje (top ${Math.round(dvPoRolovani.top)} px)`,
   dvPoRolovani.y > 1000 && dvPoRolovani.top >= -1 && dvPoRolovani.top <= 2);

/* Kotva na krok 5 vede doprostřed stránky, takže se dá srolovat přesně –
 * na rozdíl od poslední karty se tu opravdu pozná, jestli cíl nezajel pod lištu. */
await p.locator('#page-detail .dv-lista a[href="#dv-5"]').click();
await p.waitForTimeout(900);
const dvCil = await p.evaluate(() => {
  const l = document.querySelector('#page-detail .dv-lista').getBoundingClientRect();
  const c = document.getElementById('dv-5').getBoundingClientRect();
  return { listaDole: l.bottom, cilNahore: c.top };
});
ok(`kotva 5. Profily nezajede pod lištu (lišta končí na ${Math.round(dvCil.listaDole)} px, krok začíná na ${Math.round(dvCil.cilNahore)} px)`,
   dvCil.cilNahore >= dvCil.listaDole - 2);
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(400);

// --- Přehled cenových nabídek ----------------------------------------------
await p.locator('#tab-zakazka').click();
await p.waitForTimeout(500);
// nadpisy karet mají CSS text-transform:uppercase, proto porovnání bez ohledu na velikost písmen
const prehledText = await p.locator('#page-zakazka').innerText();
ok('přehled obsahuje kartu Cenová nabídka OCK (CN)', /cenová nabídka ock \(cn\)/i.test(prehledText));
ok('přehled obsahuje kartu Cenová nabídka PROJ (OVP-CN)', /cenová nabídka proj \(ovp-cn\)/i.test(prehledText));
ok('karta OCK v přehledu má tlačítko generování',
   await p.locator('#page-zakazka button:has-text("Kompletní náhled a tisk nabídky")').count() >= 2);
ok('stavový řádek nabídky je v aplikaci 2× (třída, ne id)',
   await p.locator('.nabidkaStav').count() === 2 && await p.locator('#nabidkaStav').count() === 0);
ok('poznámka vysvětluje, že se nabídky neukládají', prehledText.includes('generují se vždy živě'));

/* --- #34 zámek odeslané nabídky -------------------------------------------
 * Seznam ZAMEK_CHRANENE je ruční; přejmenovaná nebo nová zapisující funkce,
 * která v něm chybí, by zámek tiše obešla. Kontrolujeme proto, že každý název
 * ze seznamu v běžící aplikaci existuje A JE OBALENÝ (příznak _zamek). */
const zam = await p.evaluate(() => ({
  seznam: typeof ZAMEK_CHRANENE !== 'undefined' ? ZAMEK_CHRANENE.length : -1,
  chybi: (typeof ZAMEK_CHRANENE !== 'undefined' ? ZAMEK_CHRANENE : [])
    .filter(n => typeof window[n] !== 'function'),
  neobalene: (typeof ZAMEK_CHRANENE !== 'undefined' ? ZAMEK_CHRANENE : [])
    .filter(n => typeof window[n] === 'function' && !window[n]._zamek),
  lista: !!document.getElementById('zamekLista'),
}));
ok(`seznam chráněných funkcí je v aplikaci (${zam.seznam} názvů)`, zam.seznam > 0);
ok('všechny chráněné funkce existují' + (zam.chybi.length ? ' – chybí: ' + zam.chybi.join(', ') : ''),
   zam.chybi.length === 0);
ok('všechny chráněné funkce jsou obalené zámkem'
   + (zam.neobalene.length ? ' – neobalené: ' + zam.neobalene.join(', ') : ''),
   zam.neobalene.length === 0);
ok('místo pro lištu zámku je v šabloně', zam.lista);

// sloupce Číslo nabídky a Stav v přehledu variant
const hlavicky = await p.evaluate(() =>
  [...document.querySelectorAll('#page-zakazka table.vartbl th')].map(t => t.textContent.trim()));
ok(`přehled variant má sloupec Číslo nabídky (${hlavicky.join(' · ')})`, hlavicky.includes('Číslo nabídky'));
ok('přehled variant má sloupec Stav', hlavicky.includes('Stav'));

// zámek v praxi: uzamknout otevřenou variantu a ověřit, že zápis neprojde
const chovani = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  const puvodni = Z.zdvih;
  zamekPoTisku('nabidkaTisk', v.id);
  const zamceno = variantaUzamcena(aktivniVarianta(ZAK));
  const cislo = variantaCislo(ZAK, aktivniVarianta(ZAK));
  const listaText = (document.getElementById('zamekLista').textContent || '').trim();
  // zápis se musí odmítnout; dialog nabízející klon v testu odmítáme
  const puvodniConfirm = window.confirm; window.confirm = () => false;
  set('Z.zdvih', puvodni + 3);
  const poZapisu = Z.zdvih;
  // klon musí být editovatelný a mít další číslo
  const klon = klonujVariantu(ZAK, v.id); syncVarianta(); render();
  const klonCislo = variantaCislo(ZAK, klon);
  const klonEdit = variantaEditovatelna(klon);
  set('Z.zdvih', puvodni + 3);
  const klonZapis = Z.zdvih;
  window.confirm = puvodniConfirm;
  return { zamceno, cislo, poZapisu, puvodni, klonCislo, klonEdit, klonZapis, listaText };
});
ok(`tisk nabídky uzamkl variantu (číslo ${chovani.cislo})`, chovani.zamceno);
ok('do zamčené varianty se nezapsalo', chovani.poZapisu === chovani.puvodni);
ok(`klon dostal další číslo (${chovani.klonCislo})`, /\.1$/.test(chovani.klonCislo));
ok('klon je editovatelný', chovani.klonEdit);
ok('do klonu se zapsat dá', chovani.klonZapis === chovani.puvodni + 3);
ok('lišta zámku se u zamčené varianty zobrazila', chovani.listaText.length > 0);

// --- #18: seznam kalkulací – hledání, filtr, řazení, kopie -----------------
// Testuje se přes DOM, ne přes model: model má vlastní sadu (test_seznam.js),
// tady jde o to, že ovládací prvky opravdu překreslují tělo seznamu a že se
// přitom neztrácí kurzor v hledání.
await p.evaluate(() => {
  const zdroj = aktivniVarianta(ZAK);
  klonujVariantu(ZAK, zdroj.id, { nazev: 'x' });
  klonujVariantu(ZAK, zdroj.id, { nazev: 'x' });
  const jmena = ['Žlutá hala', 'Alfa hala', 'Úvoz Hejtmánská', 'Beta most'];
  ZAK.varianty.forEach((v, i) => { v.nazev = jmena[i] || v.nazev; });
  ZAK.aktivni = ZAK.varianty[1].id;   // otevřená je rozpracovaná varianta
  seznamReset(); syncVarianta(); render();
});
const nazvy = () => p.evaluate(() =>
  [...document.querySelectorAll('#seznamTelo table.vartbl tr')].slice(1)
    .map(tr => tr.querySelectorAll('td')[1].querySelector('input').value));
const thNazev = p.locator('#seznamTelo th.sort', { hasText: 'Název varianty' });

ok('seznam vykreslil všechny varianty (4)', (await nazvy()).length === 4);

// hledání: bez diakritiky, po každém stisku klávesy, a kurzor zůstává v poli
await p.locator('#seznamHledat').fill('hejtmanska');
await p.waitForTimeout(200);
const poHledani = await nazvy();
ok(`hledání „hejtmanska" zúžilo seznam na 1 (${poHledani.join(' · ')})`,
   poHledani.length === 1 && poHledani[0] === 'Úvoz Hejtmánská');
ok('po překreslení zůstal kurzor v poli hledání',
   await p.evaluate(() => document.activeElement && document.activeElement.id === 'seznamHledat'));
ok('počitadlo hlásí zúžení',
   (await p.locator('#seznamPocet').innerText()).includes('Zobrazeno 1 z 4'));

// nenalezeno není totéž co prázdná zakázka
await p.locator('#seznamHledat').fill('nexistuje');
await p.waitForTimeout(200);
ok('marné hledání vysvětlí, že zakázka prázdná není',
   await p.locator('#seznamTelo .seznam-prazdno').count() === 1);

await p.locator('#seznamTelo .seznam-prazdno button').click();
await p.waitForTimeout(200);
ok('„Zobrazit všechny" vrátilo celý seznam', (await nazvy()).length === 4);

// filtr podle stavu + upozornění, že otevřená varianta není vidět
await p.selectOption('#seznamFiltr', 'odeslane');
await p.waitForTimeout(200);
const poFiltru = await nazvy();
ok(`filtr „Odeslané" nechal jen zamčenou variantu (${poFiltru.join(' · ')})`,
   poFiltru.length === 1 && poFiltru[0] === 'Žlutá hala');
ok('seznam upozorní, že otevřená varianta není ve výběru vidět',
   (await p.locator('#seznamTelo .seznam-varovani').innerText()).includes('Alfa hala'));
await p.locator('#seznamTelo .seznam-varovani button').click();
await p.waitForTimeout(200);
ok('zrušení zúžení upozornění schovalo',
   await p.locator('#seznamTelo .seznam-varovani').count() === 0 && (await nazvy()).length === 4);

// řazení: vzestupně → sestupně → zpět na pořadí vzniku
await thNazev.click(); await p.waitForTimeout(150);
const vzestupne = await nazvy();
ok(`řazení podle názvu je české (${vzestupne.join(' · ')})`,
   vzestupne.join('|') === 'Alfa hala|Beta most|Úvoz Hejtmánská|Žlutá hala');
await thNazev.click(); await p.waitForTimeout(150);
ok('druhé kliknutí obrátilo směr',
   (await nazvy()).join('|') === 'Žlutá hala|Úvoz Hejtmánská|Beta most|Alfa hala');
await thNazev.click(); await p.waitForTimeout(150);
ok('třetí kliknutí vrátilo pořadí, v jakém varianty vznikaly',
   (await nazvy()).join('|') === 'Žlutá hala|Alfa hala|Úvoz Hejtmánská|Beta most');

// kopie řádku: další číslo nabídky a název odvozený od zdroje
const kopie = await p.evaluate(() => {
  const zdroj = ZAK.varianty[1];
  varKopie(zdroj.id);
  const nova = ZAK.varianty[ZAK.varianty.length - 1];
  return { nazev: nova.nazev, cislo: variantaCislo(ZAK, nova), pocet: ZAK.varianty.length,
           zdrojCislo: variantaCislo(ZAK, zdroj) };
});
ok(`kopie se jmenuje podle zdroje („${kopie.nazev}")`, kopie.nazev === 'Kopie – Alfa hala');
ok(`kopie dostala další číslo nabídky (${kopie.cislo}, zdroj ${kopie.zdrojCislo})`,
   /\.\d+$/.test(kopie.cislo) && kopie.cislo !== kopie.zdrojCislo);
ok('kopie přibyla do seznamu (5)', (await nazvy()).length === 5);

/* --- #17 historická kalkulace → alternativní nabídka -----------------------
 * Archiv se plní jen soubory, které uživatel sám otevře. Soubor se proto
 * nejdřív vyrobí z aplikace samotné (StorageAdapter.exportuj), aby test
 * pracoval s formátem, jaký aplikace opravdu ukládá, ne s ručním výmyslem. */
const HIST = '/tmp/hist_0207.json';
const histJson = await p.evaluate(() => {
  const z = novaZakazka();
  z.cislo = '2024 - OPR - CN - 0207';
  z.nazevAkce = 'Úvoz Brno – nástavba';
  z.objednatel = 'Reality Úvoz a.s.';
  z.adresa = 'Úvoz 3, Brno';
  z.datum = '2024-06-20';
  const v = z.varianty[0];
  v.nazev = 'Varianta 1';
  v.data.cenik.marze = 0.19;            // tehdejší přirážka – podle ní se pozná ceník
  v.data.ock.zadani.pocetStanic = 7;        // tehdejší zadání – to se přebírá vždy
  zamkniVariantu(v, { typ: 'nabidkaTisk', cislo: variantaCislo(z, v),
    kdy: '2024-06-21T08:00:00.000Z', otisk: zamekOtisk({ celkemBezDph: 880000 }) });
  return StorageAdapter.exportuj(z);
});
fs.writeFileSync(HIST, histJson);

ok('seznam kalkulací i hlavička nabízejí načtení historické kalkulace',
   await p.locator('#page-zakazka button', { hasText: 'Historická kalkulace' }).count() === 1
   && await p.locator('#kalk-hlavicka .zak-cena button', { hasText: 'Historická kalkulace' }).count() === 1);

const marzeDnes = await p.evaluate(() => aktivniVarianta(ZAK).data.cenik.marze);
await p.locator('#page-zakazka button', { hasText: 'Historická kalkulace' }).click();
await p.waitForTimeout(300);
ok('panel archivu se otevřel', await p.locator('#archiv-overlay').isVisible());
ok('prázdný archiv řekne, co se má udělat',
   (await p.locator('#archivTelo .seznam-prazdno').innerText()).includes('Nahlédnout do souborů'));

await p.setInputFiles('#archivIn', HIST);
await p.waitForTimeout(400);
const radku = () => p.locator('#archivTelo table.archtbl tr').count();
ok('nahlédnutí do souboru přidalo kalkulaci', (await radku()) === 2);   // hlavička + 1 řádek
const archText = await p.locator('#archivTelo').innerText();
ok('řádek nese číslo, akci i odeslanou částku',
   archText.includes('2024 - OPR - CN - 0207') && archText.includes('Úvoz Brno – nástavba')
   && archText.replace(/ /g, ' ').includes('880 000'));
ok('panel vypíše, ze kterého souboru se nahlédlo',
   (await p.locator('#archivSoubory').innerText()).includes('hist_0207.json'));

await p.fill('#archivHledat', 'nesmysl xyz');
await p.waitForTimeout(250);
ok('hledání bez shody nabídne návrat', await p.locator('#archivTelo .seznam-prazdno').count() === 1);
await p.fill('#archivHledat', 'uvoz');
await p.waitForTimeout(250);
ok('hledá se bez diakritiky', (await radku()) === 2);

const pocetPred = await p.evaluate(() => ZAK.varianty.length);
const hlavickaPred = await p.evaluate(() => ZAK.cislo + '|' + ZAK.nazevAkce + '|' + ZAK.objednatel);
await p.locator('#archivTelo button', { hasText: 'Dnešní ceny' }).click();
await p.waitForTimeout(500);
const alt = await p.evaluate(() => {
  const v = ZAK.varianty[ZAK.varianty.length - 1];
  return { nazev: v.nazev, cislo: variantaCislo(ZAK, v), pocet: ZAK.varianty.length,
           aktivni: ZAK.aktivni === v.id, ridici: !!v.ridici, zamceno: variantaUzamcena(v),
           marze: v.data.cenik.marze, stanic: v.data.ock.zadani.pocetStanic,
           puvod: v.puvod ? v.puvod.cislo : '', cenik: v.puvod ? v.puvod.cenik : '',
           hlavicka: ZAK.cislo + '|' + ZAK.nazevAkce + '|' + ZAK.objednatel };
});
ok('panel se po převzetí zavřel', !(await p.locator('#archiv-overlay').isVisible()));
ok(`alternativa přibyla jako varianta (${alt.pocet})`, alt.pocet === pocetPred + 1);
ok(`alternativa se jmenuje podle zdroje („${alt.nazev}")`, alt.nazev === 'Alternativa – Varianta 1');
ok(`alternativa má další číslo v řadě zakázky (${alt.cislo})`,
   /\.\d+$/.test(alt.cislo) && alt.cislo.replace(/\.\d+$/, '') === alt.hlavicka.split('|')[0].trim());
ok('alternativa je otevřená, není řídící ani zamčená',
   alt.aktivni && !alt.ridici && !alt.zamceno);
ok('hlavička zakázky se převzetím nezměnila', alt.hlavicka === hlavickaPred);
ok(`historické zadání se přeneslo (stanic ${alt.stanic})`, alt.stanic === 7);
ok(`výchozí převzetí počítá dnešním ceníkem (${alt.marze} ≠ 0.19)`, alt.marze === marzeDnes);
ok('u varianty je zapsáno, odkud přišla', alt.puvod === '2024 - OPR - CN - 0207' && alt.cenik === 'aktualni');
ok('hlavička kalkulace ukazuje větu o původu',
   (await p.locator('#page-kalk .zak-puvod').innerText()).includes('2024 - OPR - CN - 0207'));

await p.locator('#tab-zakazka').click();
await p.waitForTimeout(300);
ok('v seznamu je alternativa označena značkou ⤺',
   await p.locator('#seznamTelo .pill[title*="převzato z nabídky"]').count() === 1);

// druhé převzetí – tentokrát 1:1 podle historie
await p.locator('#page-zakazka button', { hasText: 'Historická kalkulace' }).click();
await p.waitForTimeout(300);
ok('archiv si pamatuje soubory z minula (panel není prázdný)', (await radku()) === 2);
await p.locator('#archivTelo button', { hasText: '1:1 historie' }).click();
await p.waitForTimeout(500);
const alt2 = await p.evaluate(() => {
  const v = ZAK.varianty[ZAK.varianty.length - 1];
  return { nazev: v.nazev, cislo: variantaCislo(ZAK, v), marze: v.data.cenik.marze,
           cenik: v.puvod.cenik, popis: puvodPopis(v) };
});
ok(`druhá alternativa se jmenuje jinak („${alt2.nazev}")`, alt2.nazev === 'Alternativa (2) – Varianta 1');
ok(`1:1 podle historie ponechalo tehdejší ceník (${alt2.marze})`, alt2.marze === 0.19);
ok('u varianty je zapsáno, že se počítalo historickým ceníkem',
   alt2.cenik === 'historicky' && alt2.popis.includes('historickým ceníkem'));
ok(`obě alternativy jsou v jedné číselné řadě (${alt.cislo} → ${alt2.cislo})`,
   alt2.cislo !== alt.cislo && /\.\d+$/.test(alt2.cislo));

fs.unlinkSync(HIST);

/* --- #35 stáří ceníku u načtené zakázky ------------------------------------
 * Předchozí krok („1:1 historie") záměrně nechal ve variantě tehdejší ceník,
 * takže otevřená varianta má teď přesně ten stav, na který #35 upozorňuje.
 * Nic se nesmí blokovat – kontroluje se, že se rozsvítí varování a že přepočet
 * je nabídka, ne automat. */
await p.locator('#tab-cenik').click();
await p.waitForTimeout(300);
const lst = p.locator('#page-cenik .cenik-stari');
ok('na záložce Ceník OCK svítí upozornění na starší ceník', await lst.count() === 1);
const lstText = await lst.innerText();
ok('věta pojmenuje největší změnu („Globální přirážka OCK")',
   lstText.includes('Globální přirážka OCK') && /[+−-]?\d/.test(lstText));
ok('věta se odvolá na datum, ke kterému ceny patří', lstText.includes('Ceny jsou z '));
ok('upozornění se netiskne', (await lst.getAttribute('class')).includes('noprint'));
ok('stejné upozornění je i na záložce Ceník PROJ',
   await p.locator('#page-cenikproj .cenik-stari').count() === 1);
ok('nic se neblokuje – políčka ceníku zůstala zapisovatelná',
   await p.locator('#page-cenik input:not([disabled])').count() > 0);

/* Nejdůležitější místo: lišta tiskového náhledu. Nabídka za chvíli odejde ven,
 * takže tam upozornění patří – ale bez tlačítek, náhled běží ve vlastním okně
 * a na funkce aplikace by nedosáhl. */
const nahled = await p.evaluate(() => ({
  html: tiskListaHtml({ zamekTyp: 'nabidkaTisk' }),
  css: tiskListaCss(),
}));
ok('lišta tiskového náhledu upozorní na starší ceník před odesláním',
   nahled.html.includes('cenik-stari') && nahled.html.includes('dnešního ceníku aplikace'));
ok('upozornění stojí nad tlačítkem tisku',
   nahled.html.indexOf('cenik-stari') < nahled.html.indexOf('window.print()'));
ok('v náhledu nejsou tlačítka, na která by okno nedosáhlo',
   !nahled.html.includes('otevriPrepocet') && !nahled.html.includes('cenikDohodnute'));
ok('náhled má pro upozornění vlastní styl', nahled.css.includes('.cenik-stari'));

// nová zakázka bez rozdílů nesmí hlásit nic – jinak by si na varování zvykli
const tichoNaNove = await p.evaluate(() => {
  const zaloha = ZAK;
  ZAK = zajistiZamek(novaZakazka()); syncVarianta();
  const t = cenikStariLista();
  ZAK = zaloha; syncVarianta(); render();
  return t;
});
ok('u čerstvé zakázky je lišta zticha', tichoNaNove === '');

await p.locator('#page-cenik .cenik-stari button', { hasText: 'Zobrazit rozdíly' }).click();
await p.waitForTimeout(350);
ok('okno s rozdíly se otevřelo', await p.locator('#prepocet-overlay').isVisible());
ok('okno má hlavičku ve stejném tvaru jako ostatní panely',
   await p.locator('#prepocet-panel > h2').count() === 1
   && await p.locator('#prepocet-panel > .body').count() === 1);
const radkyPrep = await p.locator('#prepocetTelo table.archtbl tr').count();
ok(`tabulka vypisuje rozdíly po položkách (${radkyPrep - 1})`, radkyPrep >= 2);
const prepText = await p.locator('#prepocetTelo').innerText();
ok('u položky je stará i dnešní hodnota a změna v procentech',
   prepText.includes('19') && prepText.includes('%'));
ok('směr změny je barevně odlišený',
   await p.locator('#prepocetTelo .zm-up, #prepocetTelo .zm-down').count() >= 1);

await p.locator('#prepocet-panel button', { hasText: 'Odškrtnout vše' }).click();
await p.waitForTimeout(250);
ok('bez zaškrtnuté položky se přepočítat nedá',
   await p.locator('#prepocetBtn').isDisabled());
await p.locator('#prepocet-panel button', { hasText: 'Zaškrtnout vše' }).click();
await p.waitForTimeout(250);
ok('po zaškrtnutí je tlačítko zase živé', !(await p.locator('#prepocetBtn').isDisabled()));

const pred35 = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  return { marze: v.data.cenik.marze, stanic: v.data.ock.zadani.pocetStanic };
});
await p.locator('#prepocetBtn').click();
await p.waitForTimeout(600);
const po35 = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  return { marze: v.data.cenik.marze, stanic: v.data.ock.zadani.pocetStanic,
           razitko: v.data.cenikRazitko || null };
});
ok('okno se po přepočtu zavřelo', !(await p.locator('#prepocet-overlay').isVisible()));
ok(`ceník se přepsal na dnešní (${pred35.marze} → ${po35.marze})`, po35.marze === marzeDnes);
ok(`zadání kalkulace zůstalo beze změny (stanic ${po35.stanic})`, po35.stanic === pred35.stanic);
ok('u varianty je zapsáno, kdy a čím se přepočítalo',
   !!po35.razitko && /^\d{4}-\d{2}-\d{2}$/.test(po35.razitko.datum || '')
   && /^v\d/.test(po35.razitko.build || ''));
ok('po přepočtu už lišta nesvítí', await p.locator('#page-cenik .cenik-stari').count() === 0);

// „Ceny jsou dohodnuté" – ztišení bez přepisu cen
const kvit = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  v.data.cenik.marze = 0.19;             // zpět na dohodnutou cenu
  syncVarianta(); render();
  const pred = document.querySelectorAll('#page-cenik .cenik-stari').length;
  cenikDohodnute();
  const po = document.querySelectorAll('#page-cenik .cenik-stari').length;
  const v2 = aktivniVarianta(ZAK);
  return { pred, po, marze: v2.data.cenik.marze, kdo: (v2.cenikKvitance || {}).kdo != null };
});
ok('ruční změna ceny varování znovu rozsvítí', kvit.pred === 1);
ok('„Ceny jsou dohodnuté" varování ztiší', kvit.po === 0);
ok('ztišení ceny nepřepsalo (zůstává dohodnutá 0.19)', kvit.marze === 0.19);
ok('u kvitance je zapsáno, kdo ji dal', kvit.kdo);
const znovu = await p.evaluate(() => {
  aktivniVarianta(ZAK).data.cenik.montazHodKc = 1;   // další změna ceníku
  syncVarianta(); render();
  return document.querySelectorAll('#page-cenik .cenik-stari').length;
});
ok('po další změně ceníku se hlídání samo znovu ozve', znovu === 1);

// zamčená varianta: její ceny jsou historie, ne chyba
const zamcena = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  zamkniVariantu(v, { typ: 'nabidkaTisk', cislo: variantaCislo(ZAK, v),
                      otisk: zamekOtisk({ celkemBezDph: 1 }) });
  render();
  return { lista: document.querySelectorAll('#page-cenik .cenik-stari').length,
           varovat: cenikPrehledAkt().varovat };
});
ok('u odeslané (zamčené) nabídky se na starý ceník neupozorňuje',
   zamcena.lista === 0 && zamcena.varovat === false);


/* ---------- #40 – stáří sestavení ----------
 * Čerstvě sestavený soubor musí mlčet, takže „viditelný" stav se nedá vyvolat
 * jinak než tím, že se funkcím podstrčí jiný den. Značku __SESTAVENO__ přepsat
 * nejde (je to const), proto se stáří počítá proti vymyšlenému „dnes". */
const b40 = await p.evaluate(() => {
  const znacka = buildDatum();
  const dnesPlus = (dni) => new Date(Date.parse(znacka + 'T00:00:00Z') + dni * 86400000)
                              .toISOString().slice(0, 10);
  return {
    znacka,
    listaDnes: document.getElementById('buildLista') ? document.getElementById('buildLista').innerHTML.trim() : null,
    cerstve: buildStari(znacka).stupen,
    mirne: buildStari(dnesPlus(BUILD_STARI_DNU.starsi)).stupen,
    durazne: buildStari(dnesPlus(BUILD_STARI_DNU.stare)).stupen,
    vetaMirna: buildStariText(buildStari(dnesPlus(BUILD_STARI_DNU.starsi + 3))),
    vetaDurazna: buildStariText(buildStari(dnesPlus(BUILD_STARI_DNU.stare + 3))),
  };
});
ok('sestavení nese datum ve značce', /^\d{4}-\d{2}-\d{2}$/.test(b40.znacka), b40.znacka);
ok('čerstvě sestavený soubor o svém stáří mlčí', b40.listaDnes === '' && b40.cerstve === '',
   JSON.stringify([b40.listaDnes, b40.cerstve]));
ok('po čtvrt roce se ozve mírně', b40.mirne === 'starsi');
ok('po půl roce se ozve důrazněji', b40.durazne === 'stare');
ok('věta uvádí verzi i datum sestavení',
   /* číslo verze je vDEN.MĚSÍC.pořadí – nesmí se tu zadrátovat konkrétní den */
   /v\d+\.\d+\.\d+/.test(b40.vetaMirna) && b40.vetaMirna.includes('. 20'), b40.vetaMirna);
ok('důraznější věta varuje před odesláním nabídky', b40.vetaDurazna.includes('nabídku'));

/* Lišta se kreslí ze stejné funkce jako v aplikaci; podstrčí se jí jen výsledek
 * měření, aby šlo zkontrolovat obě podoby i tlačítko „Rozumím, skrýt". */
const l40 = await p.evaluate(() => {
  const znacka = buildDatum();
  const orig = window.buildStari;
  const posun = (dni) => { window.buildStari = () => orig(
    new Date(Date.parse(znacka + 'T00:00:00Z') + dni * 86400000).toISOString().slice(0, 10)); };
  posun(BUILD_STARI_DNU.starsi + 3);  renderBuildLista();
  const mirna = document.getElementById('buildLista').innerHTML;
  posun(BUILD_STARI_DNU.stare + 3);   renderBuildLista();
  const durazna = document.getElementById('buildLista').innerHTML;
  buildListaSkryj();
  const poSkryti = document.getElementById('buildLista').innerHTML.trim();
  BUILD_LISTA_SKRYTA = false;
  window.buildStari = orig; renderBuildLista();
  return { mirna, durazna, poSkryti, poObnove: document.getElementById('buildLista').innerHTML.trim() };
});
ok('lišta stáří se vykreslí', l40.mirna.includes('build-lista'));
ok('mírná podoba není zvýrazněná', !l40.mirna.includes('durazne'));
ok('starší sestavení má důraznější podobu', l40.durazna.includes('durazne'));
ok('lišta se tiskem netáhne', await p.locator('#buildLista.noprint').count() === 1);
ok('„Rozumím, skrýt" lištu odklidí', l40.poSkryti === '');
ok('čerstvý soubor po překreslení zase mlčí', l40.poObnove === '');

/* ---------- #36 – hlídání marže ----------
 * Testuje se hlavně to, co se nedá vyčíst z jednotkových testů: že lišta
 * opravdu doputuje na obě záložky, že běžný uživatel varování VIDÍ, ale
 * čísla ne, a že se nic neblokuje (vstupy zůstanou editovatelné). */
await p.evaluate(() => {          // čistý stůl po předchozích blocích
  ZAK = novaZakazka(); syncVarianta(); NAST.jeAdmin = true; render();
});
const m36klid = await p.evaluate(() => ({
  ock: document.querySelectorAll('#page-kalk .marze-lista').length,
  proj: document.querySelectorAll('#page-proj .marze-lista').length,
  tisk: /marze-lista/.test(tiskListaHtml({})),
}));
ok('u zdravé kalkulace se o marži nemluví',
   m36klid.ock === 0 && m36klid.proj === 0 && m36klid.tisk === false, JSON.stringify(m36klid));

const m36ock = await p.evaluate(() => {
  C.marze = 0.03; syncVarianta(); render();
  const l = document.querySelector('#page-kalk .marze-lista');
  return { je: !!l, text: l ? l.innerText : '', vstupy: !document.querySelector('#page-kalk input[disabled]'),
           tisk: /marze-lista/.test(tiskListaHtml({})) };
});
ok('nízká přirážka rozsvítí lištu marže na OCK', m36ock.je);
ok('administrátorovi se ukáže procento i minimum', /%/.test(m36ock.text) && /minim/i.test(m36ock.text), m36ock.text);
ok('lišta mluví o kalkulaci OCK, ne o celé nabídce', /kalkulace OCK/.test(m36ock.text), m36ock.text);
ok('nízká marže nic neblokuje – vstupy zůstávají živé', m36ock.vstupy);
ok('varování dojde i nad tlačítko tisku', m36ock.tisk);

const m36bezn = await p.evaluate(() => {
  NAST.jeAdmin = false; NAST.kpiViditelne = { naklad: false, hrubyZisk: false, sleva: false, marze: false };
  render();
  const l = document.querySelector('#page-kalk .marze-lista');
  const t = l ? l.innerText : '';
  return { je: !!l, cisla: /\d/.test(t), text: t,
           tisk: (tiskListaHtml({}).match(/marze-lista[\s\S]*?<\/div>/) || [''])[0] };
});
ok('běžný uživatel varování vidí taky', m36bezn.je);
ok('běžnému uživateli se čísla o marži neukazují', m36bezn.cisla === false, m36bezn.text);
ok('v náhledu tisku nejsou čísla o marži nikdy', !/\d/.test(m36bezn.tisk.replace(/<[^>]*>/g, '')),
   m36bezn.tisk);

const m36ztrata = await p.evaluate(() => {
  NAST.jeAdmin = true;
  C.marze = 0.30; PJ.sekce[0].prirazkaPct = -60; syncVarianta(); render();
  const lo = document.querySelector('#page-kalk .marze-lista');
  const lp = document.querySelector('#page-proj .marze-lista');
  return { ock: !!lo, proj: !!lp, tridaZtrata: lp ? lp.className.includes('ztrata') : false,
           textProj: lp ? lp.innerText : '' };
});
ok('ztrátová sekce PROJ se ozve na své záložce', m36ztrata.proj);
ok('práce pod cenu má důraznější podobu', m36ztrata.tridaZtrata);
ok('lišta PROJ jmenuje konkrétní sekci', /ZAMĚŘENÍ/.test(m36ztrata.textProj), m36ztrata.textProj);
ok('zdravé OCK vedle ztrátové sekce PROJ mlčí', m36ztrata.ock === false);

const m36min = await p.evaluate(() => {
  PJ.sekce[0].prirazkaPct = 30;            // zpět na zdravou sekci
  C.marze = 0.03;                          // málo, ale pořád se vydělává
  NAST.slevy.minMarze = 0; syncVarianta(); render();
  const vypnuto = document.querySelectorAll('.marze-lista').length;
  NAST.slevy.minMarze = 0.08; render();
  const zpet = document.querySelectorAll('.marze-lista').length;
  C.marze = 0.30; syncVarianta(); render();
  return { vypnuto, zpet, poOprave: document.querySelectorAll('.marze-lista').length };
});
ok('nulové minimum v Nastavení hlídání utne', m36min.vypnuto === 0);
ok('vrácené minimum ho zase zapne', m36min.zpet > 0);
ok('po opravě ceny varování zhasne', m36min.poOprave === 0);

/* --- #38 obchodní zaokrouhlení koncové ceny -------------------------------
 * Podstatné tu není, jestli se dobře dělí tisícem – to hlídá test_zaokrouhleni.js
 * v Node. Tady se kontroluje jediná věc, kterou v Node ověřit nejde: že všechna
 * místa v běžící aplikaci ukazují TÉŽ číslo. Rozejití hlavičky, nabídky, krycího
 * listu a porovnání variant je jediná chyba, kterou by zákazník uviděl. */
const z38 = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  return { karta: !!document.querySelector('#ock-zaokr'),
           vychozi: JSON.stringify(v.data.zaokr),
           chranene: ['zaokrSetKrok', 'zaokrSetSmer']
             .filter(n => typeof window[n] === 'function' && window[n]._zamek).length };
});
ok('karta zaokrouhlení je na Kalkulaci OCK', z38.karta);
/* Nová zakázka má od 30. 7. 2026 zapnuto nahoru na stokoruny. Na nabídce OCK
 * bez slevy to nic nemění (engine už základ zaokrouhluje na tisíce nahoru),
 * projeví se to až u slevy a u PROJ – proto se tu kontroluje nastavení, ne cena. */
ok('nová varianta zaokrouhluje nahoru na stokoruny',
   z38.vychozi === '{"krok":100,"smer":"nahoru"}', z38.vychozi);
ok('přepínače zaokrouhlení kryje zámek (#34)', z38.chranene === 2);

const z38vyp = await p.evaluate(() => {
  zaokrSetKrok(0);                       // vypnuto se musí nastavit, není to výchozí stav
  const r = vypocet(Z, C, JEKLY, OCK.fixes);
  return { cena: cenaNabidkyOck(r, SL, ZO).cena, zaklad: r.souhrn.zakladCena,
           radek: /obchodní zaokrouhlení/i.test(document.getElementById('outputs').innerText) };
});
ok('vypnuté zaokrouhlení cenu nemění', z38vyp.cena === z38vyp.zaklad, JSON.stringify(z38vyp));
ok('vypnuté zaokrouhlení nekreslí prázdný řádek', z38vyp.radek === false);

/* Zapnuto dolů na desetitisíce – krok schválně velký, aby se rozdíl nedal
 * splést se zaokrouhlením, které si engine dělá sám (CEIL na tisíce). */
const z38zap = await p.evaluate(() => {
  zaokrSetKrok(10000); zaokrSetSmer('dolu');
  const v = aktivniVarianta(ZAK);
  const r = vypocet(Z, C, JEKLY, OCK.fixes);
  const cn = cenaNabidkyOck(r, SL, ZO);
  const nd = nabidkaData(ZAK, v, JEKLY, 'cz');
  const kl = kryciCtx(ZAK, v, JEKLY);
  const por = porovnaniData();
  const radek = por.metriky.find(m => m.klic === 'ockPoSleve');
  /* částky chodí jako „1 210 000,00 Kč" – desetiny se musí useknout dřív,
   * než se vyhodí oddělovače, jinak z ceny vznikne stokrát větší číslo */
  const cislo = s => +String(s).split(',')[0].replace(/[^\d-]/g, '').replace(/^-?$/, '0');
  return {
    spoctena: cn.pred, nabidkova: cn.cena, rozdil: cn.zaokrKc,
    nasobek: cn.cena % 10000 === 0,
    /* souhrn se 3. 8. 2026 přestěhoval nad zadání (#81) — hledá se na celé stránce kalkulace */
    hlavicka: /obchodní zaokrouhlení/i.test(document.getElementById('page-kalk').innerText),
    nabidka: cislo(nd.placeholders.CENA_BEZ_DPH),
    nabidkaRadek: nd.placeholders.ZAOKROUHLENI_KC,
    kryci: cislo(kl.hodnota),
    porovnani: radek ? cislo(radek.hodnoty[0]) : null,
    vstupyZive: !document.querySelector('#page-kalk input[disabled]'),
  };
});
ok('zaokrouhlení dolů vrátí násobek kroku', z38zap.nasobek, String(z38zap.nabidkova));
ok('rozdíl je záporný a menší než krok',
   z38zap.rozdil <= 0 && Math.abs(z38zap.rozdil) < 10000, String(z38zap.rozdil));
ok('hlavička OCK rozdíl přizná', z38zap.hlavicka);
ok('nabídka ukazuje tutéž cenu jako hlavička', z38zap.nabidka === Math.round(z38zap.nabidkova),
   z38zap.nabidka + ' vs ' + z38zap.nabidkova);
/* Od 12. 8. 2026 (#135) nabídka dorovnávací řádek NEMÁ — zadání J. V.:
 * „ve výstupní vytištěné cenové nabídce online i work neuváděj řádek obchodní
 * zaokrouhlení. místo toho zaokrouhluj už jednotlivé položky." Symbol
 * v šabloně zůstává (starší šablony ho mají), ale plní se prázdnem. */
ok('nabídka OCK dorovnávací řádek neuvádí', !z38zap.nabidkaRadek, z38zap.nabidkaRadek);
ok('krycí list ukazuje tutéž cenu', z38zap.kryci === Math.round(z38zap.nabidkova),
   z38zap.kryci + ' vs ' + z38zap.nabidkova);
ok('porovnání variant ukazuje tutéž cenu', z38zap.porovnani === Math.round(z38zap.nabidkova),
   z38zap.porovnani + ' vs ' + z38zap.nabidkova);
ok('zaokrouhlení nic neblokuje – vstupy zůstávají živé', z38zap.vstupyZive);

/* Od 4. 8. 2026 má PROJ VLASTNÍ nastavení (ZOP) – zadání: „do kalkulace ock
 * patří pouze část týkající se výtahové šachty, část týkající se projekčních
 * prací pak patří do sekce kalkulace proj." Krok se schválně volí jiný než
 * u OCK (5 000 vs. 10 000), aby bylo poznat, když by některé místo sáhlo na
 * cizí pole. */
const z38proj = await p.evaluate(() => {
  const ockPred = cenaNabidkyOck(vypocet(Z, C, JEKLY, OCK.fixes), SL, ZO).cena;
  zaokrProjSetKrok(5000); zaokrProjSetSmer('dolu');
  const v = aktivniVarianta(ZAK);
  const r = vypocetProj(PJ, PC);
  const cn = cenaNabidkyProj(r, SLP, ZOP);
  const np = nabidkaProjData(ZAK, v, 'cz');
  const cislo = s => +String(s).split(',')[0].replace(/[^\d-]/g, '');
  return { cena: cn.cena, nasobek: cn.cena % 5000 === 0,
           ockNezmenena: cenaNabidkyOck(vypocet(Z, C, JEKLY, OCK.fixes), SL, ZO).cena === ockPred,
           oddelene: ZOP.krok === 5000 && ZO.krok === 10000,
           souhrn: /CENA NABÍDKY PROJ/.test(document.getElementById('page-proj').innerText),
           dokument: cislo(np.placeholders.PROJ_CELKEM_BEZ_DPH),
           dokumentRadek: np.placeholders.PROJ_ZAOKROUHLENI_KC };
});
ok('PROJ se zaokrouhlí vlastním nastavením', z38proj.nasobek, String(z38proj.cena));
ok('nastavení OCK a PROJ jsou oddělená', z38proj.oddelene);
ok('změna zaokrouhlení PROJ nezmění cenu OCK', z38proj.ockNezmenena);
ok('souhrn PROJ ukáže cenu nabídky zvlášť', z38proj.souhrn);
/* Cena v dokumentu se skládá ze zaokrouhlených cen jednotlivých činností
 * (#135) — a přesně to samé číslo musí ukazovat hlavička kalkulace, jinak by
 * obchodník viděl jinou cenu na obrazovce a jinou v odeslané nabídce. */
ok('nabídka PROJ ukazuje tutéž cenu', Math.abs(z38proj.dokument - Math.round(z38proj.cena)) <= 1,
   z38proj.dokument + ' vs ' + z38proj.cena);
ok('nabídka PROJ dorovnávací řádek neuvádí', !z38proj.dokumentRadek, z38proj.dokumentRadek);

const z38zpet = await p.evaluate(() => {
  zaokrSetKrok(0); zaokrProjSetKrok(0);   // obě části zpět do výchozího stavu
  const r = vypocet(Z, C, JEKLY, OCK.fixes);
  return { cena: cenaNabidkyOck(r, SL, ZO).cena, zaklad: r.souhrn.zakladCena,
           radek: /obchodní zaokrouhlení/i.test(document.getElementById('outputs').innerText) };
});
ok('vypnutí vrátí původní cenu', z38zpet.cena === z38zpet.zaklad, JSON.stringify(z38zpet));
ok('po vypnutí řádek zase zmizí', z38zpet.radek === false);

// --- #33 kontrola logických chyb před nabídkou -----------------------------
/* Modul, který chybí v seznamu v build.py, se do sestavení tiše nedostane –
 * aplikace pak funguje dál, jen bez varování. Proto se tu neptáme knihovny,
 * ale běžící stránky: je panel opravdu vidět v kartě nabídky? */
await p.locator('#tab-zakazka').click();
await p.waitForTimeout(400);

const k33 = await p.evaluate(() => ({
  logika: typeof kontrolyProved === 'function',
  panelFn: typeof kontrolyPanel === 'function',
  pravidel: typeof kontrolyPravidla === 'function' ? kontrolyPravidla().length : -1,
  uroven: typeof kontrolyPravidla === 'function'
    ? kontrolyPravidla().every(r => r.uroven === 2) : false,
  nalezy: kontrolyStavAkt().kody,
}));
ok('modul kontrol je v sestavení', k33.logika && k33.panelFn);
// 11 = 10 z vlny B + „ico" (30. 7. 2026)
/* 12 = 10 z vlny B + „ico" + „atypBezCeny" (obojí 30. 7. 2026). Číslo je tu
 * napevno schválně: omylem zdvojené pravidlo by se jinak nepoznalo. */
ok(`pravidel je ${k33.pravidel} (čekám 13 – slevaProjMax přibylo po auditu)`, k33.pravidel === 13);
ok('všechna pravidla jsou varování (úroveň 2)', k33.uroven);
/* Sestavení nese ukázkový ceník, takže tohle pravidlo svítí vždycky – je to
 * zároveň důkaz, že se panel v čerstvé instalaci opravdu ukáže. */
ok('nad ukázkovým ceníkem svítí varování', k33.nalezy.includes('ukazkovyCenik'),
   k33.nalezy.join(','));

const panel = p.locator('#page-zakazka .kontroly-panel').first();
ok('panel kontrol je v kartě cenové nabídky', await panel.count() === 1);
ok('panel vyjmenuje nálezy',
   await p.locator('#page-zakazka .kontroly-panel .kontroly-seznam li').count() >= 1);

/* Nic se neblokuje: tlačítka nabídky zůstávají funkční i s rozsvíceným panelem. */
const tlacitka = await p.evaluate(() => {
  const b = [...document.querySelectorAll('#page-zakazka button')]
    .filter(x => /tisk nabídky|nabídku \(Word\)/i.test(x.textContent));
  return { pocet: b.length, zakazana: b.filter(x => x.disabled).length };
});
ok('tlačítka nabídky nejsou zablokovaná',
   tlacitka.pocet > 0 && tlacitka.zakazana === 0, JSON.stringify(tlacitka));

/* Odklepnutí se uloží k variantě a panel na tentýž stav zhasne do klidové
 * podoby; nový problém ho musí rozsvítit znovu. */
const odklep = await p.evaluate(() => {
  kontrolyPotvrd();
  const v = aktivniVarianta(ZAK);
  const poOdklepu = document.querySelector('#page-zakazka .kontroly-panel');
  const bylo = { kody: (v.kontroly || {}).kody || [],
                 trida: poOdklepu ? poOdklepu.className : '' };
  /* Nový nález, který v odklepnutém stavu určitě nebyl: jedno nástupiště.
   * (Vyprázdnit hlavičku by nestačilo – v ukázkové zakázce může být prázdná
   * už teď, a pak by se nezměnilo nic.) */
  const zaloha = Z.nastupiste;
  Z.nastupiste = 1;
  render();
  const znovu = document.querySelector('#page-zakazka .kontroly-panel');
  const potom = { kody: kontrolyStavAkt().kody,
                  plati: kontrolyPotvrzeniPlati(v.kontroly, kontrolyStavAkt()),
                  trida: znovu ? znovu.className : '' };
  Z.nastupiste = zaloha; render();
  return { bylo, potom };
});
ok('odklepnutí se uloží k variantě', odklep.bylo.kody.includes('ukazkovyCenik'),
   JSON.stringify(odklep.bylo));
ok('po odklepnutí panel zklidní', /odklepnuto/.test(odklep.bylo.trida), odklep.bylo.trida);
ok('nový problém odklepnutí zneplatní', odklep.potom.plati === false);
ok('a panel se rozsvítí znovu', !/odklepnuto/.test(odklep.potom.trida), odklep.potom.trida);

/* Náhled tisku odchází zákazníkovi – varování tam být musí, částky ne. */
const tisk = await p.evaluate(() => {
  const h = tiskListaHtml({});
  const l = kontrolyTiskLista();
  return { v: h.includes('kontroly-tisk'), lista: l, kc: /Kč/.test(l) };
});
ok('náhled tisku nese varování kontrol', tisk.v && tisk.lista.length > 0);
ok('a neprozradí v něm žádnou částku', tisk.kc === false, tisk.lista);

// --- #37 interní poznámky a přílohy ---------------------------------------
/* Stejný důvod jako u #33: kdyby poznamky.js chyběl v seznamu v build.py,
 * aplikace by běžela dál, jen by karta zmizela a nikdo by si toho nevšiml. */
const p37 = await p.evaluate(() => ({
  logika: typeof poznamkyPridej === 'function' && typeof poznamkySeznam === 'function',
  karta: typeof poznamkyKarta === 'function',
  druhu: typeof POZN_DRUHY !== 'undefined' ? POZN_DRUHY.length : -1,
}));
ok('modul poznámek je v sestavení', p37.logika && p37.karta, JSON.stringify(p37));
ok('druhů poznámek je pět', p37.druhu === 5);

const kartaPozn = await p.evaluate(() => {
  const h = [...document.querySelectorAll('#page-zakazka .card h2')]
    .find(x => /Interní poznámky/i.test(x.textContent));
  return { je: !!h, nadpis: h ? h.textContent.trim() : '',
           zapis: !!document.querySelector('#page-zakazka .pozn-zapis'),
           pole: !!document.getElementById('poznText') };
});
ok('karta poznámek je na záložce Zakázka', kartaPozn.je, kartaPozn.nadpis);
ok('a v nadpisu stojí, že se netiskne', /netisknou se/i.test(kartaPozn.nadpis), kartaPozn.nadpis);
ok('karta má zápisník i pole pro text', kartaPozn.zapis && kartaPozn.pole);

const TAJNE37 = 'TAJNÁ INTERNÍ VĚTA 4711';
const zapis37 = await p.evaluate((tajne) => {
  poznamkyPridej(ZAK, tajne, { kdo: 'Test', druh: 'sleva' });
  prilohyPridej(ZAK, { nazev: 'Interni_kalkulace.pdf', typ: 'application/pdf',
                       velikost: 2048, data: 'data:application/pdf;base64,AAAA' }, { kdo: 'Test' });
  render();
  return {
    radku: document.querySelectorAll('#page-zakazka .pozn-seznam .pozn-radek').length,
    priloh: document.querySelectorAll('#page-zakazka .pozn-prilohy .pozn-priloha').length,
    vidim: document.getElementById('page-zakazka').innerText.includes(tajne),
  };
}, TAJNE37);
ok('poznámka se objeví v seznamu', zapis37.radku >= 1, JSON.stringify(zapis37));
ok('příloha se objeví v seznamu', zapis37.priloh === 1);
ok('a text poznámky je v kartě opravdu vidět', zapis37.vidim);

/* Měkké mazání: záznam z běžného seznamu zmizí, ale v datech zůstane
 * i se jménem a datem, a jde ho vrátit. */
const smaz37 = await p.evaluate(() => {
  const id = poznamkySeznam(ZAK)[0].id;
  poznamkySmazUI(id);
  const po = { vidi: document.querySelectorAll('#page-zakazka .pozn-seznam .pozn-radek').length,
               vDatech: ZAK.poznamky.length,
               stopa: !!(ZAK.poznamky.find(x => x.id === id) || {}).smazano };
  poznamkySmazanePrepni();
  po.skrz = document.querySelectorAll('#page-zakazka .pozn-radek.smazana').length;
  poznamkyObnovUI(id);
  po.zpet = poznamkySeznam(ZAK).length;
  poznamkySmazanePrepni();
  return po;
});
ok('smazaná poznámka zmizí ze seznamu', smaz37.vidi === 0, JSON.stringify(smaz37));
ok('ale v datech zůstane se stopou', smaz37.vDatech >= 1 && smaz37.stopa);
ok('smazané jdou zobrazit zvlášť', smaz37.skrz >= 1);
ok('a dají se vrátit', smaz37.zpet >= 1);

/* A to hlavní: nic z toho se nesmí dostat do dokumentu, který jde ven. */
const tajne37 = await p.evaluate((tajne) => {
  const v = aktivniVarianta(ZAK);
  let text = '';
  try { text += JSON.stringify(nabidkaData(ZAK, v, JEKLY, 'cz')); } catch (e) {}
  try { text += JSON.stringify(kryciData(ZAK, v, JEKLY)); } catch (e) {}
  try { text += tiskListaHtml({}); } catch (e) {}
  return { delka: text.length, pozn: text.includes(tajne),
           priloha: text.includes('Interni_kalkulace') };
}, TAJNE37);
ok('dokumenty se opravdu sestavily', tajne37.delka > 0);
ok('poznámka se do dokumentů nedostane', tajne37.pozn === false);
ok('ani název přílohy', tajne37.priloha === false);

/* Úklid, ať do snímků obrazovky nelezou testovací data. */
await p.evaluate(() => { ZAK.poznamky = []; ZAK.prilohy = []; ZAK.prilohySmazane = []; render(); });

// --- #41 protokol o kalkulaci ---------------------------------------------
/* Stejný důvod jako u #33 a #37: chybějící řádek v build.py aplikaci
 * neshodí, jen tiše zahodí celou funkci. */
const p41 = await p.evaluate(() => ({
  logika: typeof protokolZaznamenej === 'function' && typeof protokolRozdil === 'function',
  karta: typeof protokolKarta === 'function' && typeof protokolTik === 'function',
  klic: !!ZAK.protokolKlic,
  pole: Array.isArray(ZAK.protokol),
}));
ok('modul protokolu je v sestavení', p41.logika && p41.karta, JSON.stringify(p41));
ok('zakázka má protokol i vlastní klíč', p41.klic && p41.pole, JSON.stringify(p41));

const karta41 = await p.evaluate(() => {
  const h = [...document.querySelectorAll('#page-zakazka .card h2')]
    .find(x => /Protokol o kalkulaci/i.test(x.textContent));
  return { je: !!h, nadpis: h ? h.textContent.trim() : '',
           telo: !!document.getElementById('protokolTelo') };
});
ok('karta protokolu je na záložce Zakázka', karta41.je, karta41.nadpis);
ok('v nadpisu stojí, na co se ptá', /kdo, kdy/i.test(karta41.nadpis), karta41.nadpis);
ok('karta má tělo k naplnění', karta41.telo);

/* Zápis nechodí přes obsluhy tlačítek, ale z porovnání dat – proto se tady
 * mění ZAK přímo a čeká se na prodlevu, přesně jako při psaní do pole. */
/* Karta se vykresluje sbalená, takže innerText její obsah nevidí – čte se
 * proto textContent těla, které na zobrazení nezávisí. */
const zapis41 = await p.evaluate(async () => {
  const spi = ms => new Promise(r => setTimeout(r, ms));
  NAST.uzivatel = 'Zkouška';
  /* Úklid po #37 je taky změna dat a zapsal by se. Vynulováním klíče se
   * protokol srovná na aktuální stav, jako by se zakázka právě otevřela. */
  ZAK.protokol = []; PROT.klic = null;
  render();
  ZAK.nazevAkce = 'Bytový dům Kolbenova';
  render();
  await spi(PROTOKOL_KLID + 600);
  return { pocet: ZAK.protokol.length,
           co: (ZAK.protokol[0] || {}).co || '',
           kdo: (ZAK.protokol[0] || {}).kdo || '',
           radku: document.querySelectorAll('#page-zakazka .prot-seznam .prot-radek').length,
           vidim: document.getElementById('protokolTelo').textContent.includes('Bytový dům Kolbenova') };
});
ok('změna hlavičky se sama zapsala', zapis41.pocet === 1, JSON.stringify(zapis41));
ok('a je popsaná česky', /Název akce/i.test(zapis41.co), zapis41.co);
ok('a podepsaná uživatelem', zapis41.kdo === 'Zkouška', zapis41.kdo);
ok('řádek je vidět v kartě', zapis41.radku === 1 && zapis41.vidim, JSON.stringify(zapis41));

/* Doťukávání téhož pole je jedno rozhodnutí, ne tři. */
const tuk41 = await p.evaluate(async () => {
  const spi = ms => new Promise(r => setTimeout(r, ms));
  ZAK.adresa = 'Prah';   render(); await spi(PROTOKOL_KLID + 400);
  ZAK.adresa = 'Praha 9'; render(); await spi(PROTOKOL_KLID + 400);
  const a = ZAK.protokol.filter(z => /Adresa stavby/i.test(z.co));
  return { pocet: a.length, pred: a.length ? a[0].pred : null, po: a.length ? a[0].po : null };
});
ok('doťukávání je jeden řádek', tuk41.pocet === 1, JSON.stringify(tuk41));
ok('a drží první i poslední hodnotu', tuk41.pred === '' && tuk41.po === 'Praha 9', JSON.stringify(tuk41));

/* Krok „Zpět" vrací data, ne protokol – jinak by šel zápis vygumovat. */
const zpet41 = await p.evaluate(async () => {
  const spi = ms => new Promise(r => setTimeout(r, ms));
  const pred = ZAK.protokol.length;
  historieZpet();
  await spi(PROTOKOL_KLID + 600);
  return { pred, po: ZAK.protokol.length, adresa: ZAK.adresa };
});
ok('krok zpět protokol nevygumuje', zpet41.po >= zpet41.pred, JSON.stringify(zpet41));

/* Náklady z ceníku vidí jen administrátor – i tady, ne jen v ceníku. */
const citlive41 = await p.evaluate(async () => {
  const spi = ms => new Promise(r => setTimeout(r, ms));
  const byl = NAST.jeAdmin;
  C.nytKc = (Number(C.nytKc) || 0) + 3;
  render();
  await spi(PROTOKOL_KLID + 600);
  const zaznam = ZAK.protokol.filter(z => z.citlive).pop() || null;
  /* Čte se právě ten citlivý řádek, ne celá karta – ostatní řádky (název
   * akce, adresa) hodnoty ukazovat smějí a otázka zní jen na ceník. */
  const citlivy = () => {
    const el = document.querySelector('#protokolTelo .prot-radek.citlivy');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  NAST.jeAdmin = false; render();
  const uzivatel = citlivy();
  NAST.jeAdmin = byl; render();
  const admin = citlivy();
  return { je: !!zaznam, kde: zaznam ? zaznam.kde : '', uzivatel, admin,
           uzivatelVidi: /→/.test(uzivatel),
           uzivatelSkryto: /vidí administrátor/i.test(uzivatel),
           adminVidi: /→/.test(admin) && /nytKc/i.test(admin) };
});
ok('změna ceníku se zapsala jako citlivá', citlive41.je && /Cen[ií]k/i.test(citlive41.kde),
   JSON.stringify(citlive41));
ok('běžný uživatel hodnoty z ceníku nevidí', citlive41.uzivatelVidi === false, JSON.stringify(citlive41));
ok('ale ví, že se ceník měnil', citlive41.uzivatelSkryto, JSON.stringify(citlive41));
ok('administrátor hodnoty vidí', citlive41.adminVidi, JSON.stringify(citlive41));

/* A to hlavní: protokol nesmí ven v žádném dokumentu. */
const ven41 = await p.evaluate(() => {
  const v = aktivniVarianta(ZAK);
  let text = '';
  try { text += JSON.stringify(nabidkaData(ZAK, v, JEKLY, 'cz')); } catch (e) {}
  try { text += JSON.stringify(kryciData(ZAK, v, JEKLY)); } catch (e) {}
  try { text += tiskListaHtml({}); } catch (e) {}
  return { delka: text.length, protokol: /protokol/i.test(text), klic: text.includes(ZAK.protokolKlic) };
});
ok('dokumenty se sestavily i s protokolem v datech', ven41.delka > 0);
ok('protokol se do dokumentů nedostane', ven41.protokol === false && ven41.klic === false,
   JSON.stringify(ven41));

/* --- IČO v hlavičkách (zadání z 30. 7. 2026) ------------------------------
 * Zadání bylo polohové: „mezi Kontaktní osobu a Sazbu DPH". Kontroluje se
 * proto pořadí popisků tak, jak je opravdu vidí uživatel v sestaveném
 * souboru – ne to, co je ve zdrojáku. Obě hlavičky (OCK i PROJ) jsou
 * samostatné sady, takže se testují obě zvlášť. */
const icoPoradi = await p.evaluate(() => {
  const bary = [...document.querySelectorAll('.zak-bar')];
  return bary.map(bar => {
    /* Prázdné popisky se přeskakují – to jsou odsazovací sloupečky u tlačítek
     * (např. „Najít firmu v ARES" pod IČO). Zadání mluvilo o pořadí ÚDAJŮ,
     * ne o tom, že mezi nimi nesmí být tlačítko. */
    const popisky = [...bar.querySelectorAll('label')]
      .map(l => l.textContent.trim()).filter(t => t !== '');
    const k = popisky.findIndex(t => t.startsWith('Kontaktní osoba'));
    const i = popisky.findIndex(t => t.startsWith('IČO'));
    const d = popisky.findIndex(t => t.startsWith('Sazba DPH'));
    return { k, i, d };
  });
});
ok(`hlavičky se našly obě (nalezeno ${icoPoradi.length}, čekám 2)`, icoPoradi.length === 2);
icoPoradi.forEach((r, n) => {
  ok(`hlavička ${n + 1}: IČO stojí mezi Kontaktní osobou a Sazbou DPH `
     + `(kontakt=${r.k}, ico=${r.i}, dph=${r.d})`,
     r.k >= 0 && r.i === r.k + 1 && r.d === r.i + 1);
});

/* Každé pole musí zapisovat do své vlastní hlavičky – kdyby obě mířila na
 * ZAK.ico, vypadalo by to v UI správně a data by se tiše slévala. */
const icoVazby = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('.zak-bar').forEach(bar => {
    bar.querySelectorAll('label').forEach(l => {
      if (!l.textContent.trim().startsWith('IČO')) return;
      const inp = l.parentElement.querySelector('input');
      out.push(inp ? (inp.getAttribute('onchange') || '') : 'BEZ POLE');
    });
  });
  return out;
});
ok('IČO OCK zapisuje do ZAK.ico', icoVazby.some(s => s.includes("'ZAK.ico'")));
ok('IČO PROJ zapisuje do ZAK.projHlavicka.ico',
   icoVazby.some(s => s.includes("'ZAK.projHlavicka.ico'")));

/* Neplatné IČO má rozsvítit štítek u pole – a nesmí nic zablokovat
 * (KONTROLY_UROVEN = 2, zadání „pouze rozsviť varování"). */
const icoStitek = await p.evaluate(() => {
  const pred = document.querySelectorAll('.zak-bar .pill.warn').length;
  ZAK.ico = '00177042';                      // překlep v kontrolní číslici
  render();
  const spatne = document.querySelectorAll('.zak-bar .pill.warn').length;
  ZAK.ico = '00177041';                      // platné IČO
  render();
  const dobre = document.querySelectorAll('.zak-bar .pill.warn').length;
  ZAK.ico = '';
  render();
  return { pred, spatne, dobre, prazdne: document.querySelectorAll('.zak-bar .pill.warn').length };
});
ok(`neplatné IČO rozsvítí štítek (prázdno=${icoStitek.pred}, chyba=${icoStitek.spatne})`,
   icoStitek.spatne > icoStitek.pred);
ok(`platné IČO štítek zhasne (${icoStitek.dobre})`, icoStitek.dobre === icoStitek.pred);
ok(`prázdné IČO se nehlásí (${icoStitek.prazdne})`, icoStitek.prazdne === icoStitek.pred);

/* Úklid po sobě. */
await p.evaluate(() => {
  ZAK.protokol = []; ZAK.nazevAkce = ''; ZAK.adresa = ''; NAST.uzivatel = '';
  render();
});

/* ---------- ARES: kdo se skrývá pod IČO (#10, 30. 7. 2026) ----------
 * Rejstřík se odsud nevolá – `fetch` se na chvíli podstrčí, takže se ověřuje
 * celá cesta (tlačítko → panel → potvrzení → hlavička → protokol), ale test
 * nezávisí na tom, jestli je zrovna síť a co v rejstříku dneska stojí. */
const ares = await p.evaluate(async () => {
  const puvodniFetch = window.fetch;
  const out = {};
  const btny = () => [...document.querySelectorAll('#page-zakazka button')]
    .filter(b => /Najít firmu v ARES/.test(b.textContent));
  const panelText = () => {
    const p = document.querySelector('#page-zakazka .ares-panel');
    return p ? p.innerText : '';
  };

  prepniTab('zakazka');
  ZAK.ico = ''; ZAK.objednatel = ''; ZAK.adresaObjednatele = ''; ZAK.kontakt = 'Ing. Ruční';
  ZAK.protokol = []; NAST.uzivatel = 'Zkoušející';
  render();
  out.tlacitek = btny().length;
  out.zhaslychBezIco = btny().filter(b => b.disabled).length;

  /* neplatné IČO – dotaz se nemá vůbec odeslat */
  let volani = 0;
  window.fetch = async () => { volani++; throw new Error('sem se to nemělo dostat'); };
  ZAK.ico = '12345678'; render();
  await aresHledej('ock');
  out.neplatneText = panelText();
  out.volaniPriNeplatnem = volani;

  /* platné IČO, podstrčená odpověď rejstříku */
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    ico: '25596641', obchodniJmeno: 'Zkušební strojírny s.r.o.', dic: 'CZ25596641',
    sidlo: { nazevObce: 'Brno', textovaAdresa: 'Vlárská 22/3, Černovice, 618 00 Brno' },
  }) });
  ZAK.ico = '25596641'; render();
  await aresHledej('ock');
  out.nalezenoText = panelText();
  out.radku = document.querySelectorAll('#page-zakazka .ares-tab tr').length;
  out.pred = { objednatel: ZAK.objednatel, adresa: ZAK.adresaObjednatele };

  /* teprve potvrzení přepíše hlavičku */
  const potvrd = [...document.querySelectorAll('#page-zakazka .ares-panel button')]
    .find(b => /Přepsat údaje/.test(b.textContent));
  out.maPotvrzeni = !!potvrd;
  out.maOdmitnuti = !![...document.querySelectorAll('#page-zakazka .ares-panel button')]
    .find(b => /Nechat, jak je/.test(b.textContent));
  if (potvrd) potvrd.click();
  out.po = { objednatel: ZAK.objednatel, adresa: ZAK.adresaObjednatele, kontakt: ZAK.kontakt };
  out.panelPoPotvrzeni = document.querySelectorAll('#page-zakazka .ares-panel').length;
  if (typeof protokolZapisTed === 'function') protokolZapisTed();
  out.protokol = (ZAK.protokol || []).map(z => z.co + ': ' + z.po).join(' | ');

  /* výpadek sítě nesmí hlavičku ani škrtnout */
  window.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await aresHledej('ock');
  out.sitText = panelText();
  out.poVypadku = ZAK.objednatel;

  aresZavri();
  window.fetch = puvodniFetch;
  ZAK = novaZakazka(); syncVarianta(); NAST.uzivatel = ''; render();
  return out;
});
ok(`tlačítko ARES stojí u obou hlaviček (nalezeno ${ares.tlacitek})`, ares.tlacitek === 2);
ok('bez vyplněného IČO je tlačítko zhasnuté', ares.zhaslychBezIco === ares.tlacitek);
ok('neplatné IČO se do rejstříku vůbec neodešle', ares.volaniPriNeplatnem === 0);
ok('u neplatného IČO panel mluví o kontrolní číslici',
   /kontrolní číslici/.test(ares.neplatneText), ares.neplatneText);
ok('nalezená firma je vidět jménem', /Zkušební strojírny/.test(ares.nalezenoText), ares.nalezenoText);
ok('panel ukáže i sídlo z rejstříku', /Vlárská/.test(ares.nalezenoText), ares.nalezenoText);
ok(`tabulka staví „teď" proti „z rejstříku" (řádků i s hlavičkou: ${ares.radku})`, ares.radku === 3);
ok('panel nabídne přepis i odmítnutí', ares.maPotvrzeni && ares.maOdmitnuti);
ok('do potvrzení se hlavička nezmění',
   ares.pred.objednatel === '' && ares.pred.adresa === '', JSON.stringify(ares.pred));
ok('po potvrzení se objednatel přepsal',
   ares.po.objednatel === 'Zkušební strojírny s.r.o.', ares.po.objednatel);
ok('po potvrzení se doplnilo sídlo',
   ares.po.adresa === 'Vlárská 22/3, Černovice, 618 00 Brno', ares.po.adresa);
ok('ručně vyplněná kontaktní osoba zůstala', ares.po.kontakt === 'Ing. Ruční', ares.po.kontakt);
ok('po potvrzení panel zmizí', ares.panelPoPotvrzeni === 0);
ok('přepis z rejstříku je vidět v protokolu zakázky',
   /Objednatel/.test(ares.protokol) && /Zkušební strojírny/.test(ares.protokol), ares.protokol);
ok('výpadek sítě se hlásí větou, ne mlčením', /ARES/.test(ares.sitText), ares.sitText);
ok('výpadek sítě hlavičku nezmění',
   ares.poVypadku === 'Zkušební strojírny s.r.o.', ares.poVypadku);

/* ---------- hlavička a zarovnání (zadání 31. 7. 2026) ----------
 * „posuň datum vytvoření na úroveň sazby DPH. a odstraň text pod modrou
 * lištou s tlačítky. totéž proveď i v kalkulaci projekce." + „do kalkulace
 * projekce přidej globální přirážku stejně jako je to v kalkulaci OCK"
 * + „Zarovnej tlačítko ARES doprava s ostatními buňkami v sekci přehled
 * cenových nabídek." Kontroluje se rozložení, ne text – proto v prohlížeči. */
const hlav = await p.evaluate(async () => {
  NAST.jeAdmin = true;
  const kolik = (kde, sel) => document.querySelectorAll(kde + ' ' + sel).length;
  const popisky = kde => [...document.querySelectorAll(kde + ' .zak-head-col')]
    .map(c => [...c.querySelectorAll(':scope > .row > label')].map(l => l.textContent.trim()));
  /* „Na úrovni" je otázka pixelů, ne pořadí: druhý sloupec má navíc řádek
   * s tlačítkem ARES, takže stejný index by ještě neznamenal stejnou výšku.
   * Měří se střed pole, ne horní okraj: kalendářové pole je o 4 px vyšší než
   * rozbalovací sazba DPH, takže shodné horní okraje by naopak znamenaly, že
   * řádky vedle sebe nesedí. Oba řádky stojí na dně svého sloupce (margin-top:
   * auto), spodní okraje si tedy sednou přesně. */
  const stred = (kde, popis) => {
    const l = [...document.querySelectorAll(kde + ' .zak-head-col > .row > label')]
      .find(x => x.textContent.trim().indexOf(popis) === 0);
    if (!l) return null;
    const r = l.parentElement.getBoundingClientRect();
    return Math.round((r.top + r.bottom) / 2);
  };
  const sada = kde => ({ sloupce: popisky(kde), not: kolik(kde + ' .zak-bar', '.note'),
    datum: kolik(kde, '.zak-datum'),
    yDatum: stred(kde, 'Datum vytvoření'), yDph: stred(kde, 'Sazba DPH') });
  prepniTab('kalk'); render();
  const ock = sada('#page-kalk');
  prepniTab('proj'); render();
  const proj = sada('#page-proj');
  return { ock, proj };
});
const naUrovni = h => h.yDatum != null && h.yDph != null && Math.abs(h.yDatum - h.yDph) <= 3;
ok(`OCK: datum vytvoření stojí na úrovni sazby DPH (střed ${hlav.ock.yDatum} vs ${hlav.ock.yDph})`, naUrovni(hlav.ock));
ok(`PROJ: datum vytvoření stojí na úrovni sazby DPH (střed ${hlav.proj.yDatum} vs ${hlav.proj.yDph})`, naUrovni(hlav.proj));
ok('OCK: samostatný řádek s datem pod hlavičkou zmizel', hlav.ock.datum === 0);
ok('PROJ: samostatný řádek s datem pod hlavičkou zmizel', hlav.proj.datum === 0);
ok(`OCK: pod lištou tlačítek už není vysvětlující text (${hlav.ock.not})`, hlav.ock.not === 0);
ok(`PROJ: pod lištou tlačítek už není vysvětlující text (${hlav.proj.not})`, hlav.proj.not === 0);
ok('PROJ: globální přirážka je v hlavičce jako v OCK',
   (hlav.proj.sloupce[2] || []).indexOf('Globální přirážka') >= 0,
   JSON.stringify(hlav.proj.sloupce[2]));
ok('OCK: globální přirážka v hlavičce zůstala',
   (hlav.ock.sloupce[2] || []).indexOf('Globální přirážka') >= 0,
   JSON.stringify(hlav.ock.sloupce[2]));

const zarovnani = await p.evaluate(() => {
  prepniTab('zakazka'); render();
  const karty = [...document.querySelectorAll('#page-zakazka .card')]
    .filter(c => c.querySelector('button') && /Najít firmu v ARES/.test(c.innerText));
  return karty.map(k => {
    /* Od 4. 8. 2026 stojí na začátku karty hlavičky ještě trojice
     * „Uložit / Načíst / Nová zakázka", takže první tlačítko na kartě už
     * není to od ARESu – hledá se podle popisku. */
    const tl = [...k.querySelectorAll('button')]
      .find(b => /Najít firmu v ARES/.test(b.textContent || ''));
    const vstupy = [...k.querySelectorAll('.row input[type=text]')];
    if (!tl || !vstupy.length) return null;
    return { tlacitko: tl.getBoundingClientRect().right,
             pole: vstupy[0].getBoundingClientRect().right };
  });
});
ok(`tlačítko ARES je na obou kartách hlavičky (${zarovnani.length})`, zarovnani.length === 2);
zarovnani.forEach((z, i) => ok(
  `tlačítko ARES má pravý okraj v řadě s ostatními buňkami (karta ${i + 1}: `
  + `${z ? Math.round(z.tlacitko) + ' vs ' + Math.round(z.pole) : 'neměřeno'})`,
  !!z && Math.abs(z.tlacitko - z.pole) < 1.5));

/* ---------- zábrana: nenahraný ceník (30. 7. 2026) ----------
 * „Buď se z databáze natáhne ostrý ceník, anebo svítí všude nuly a není
 * z čeho počítat." Tenhle oddíl jde jako jediný proti pravidlu, že se v
 * aplikaci nic neblokuje – proto se ověřuje v prohlížeči, ne jen v Node:
 * musí být vidět, že tlačítka opravdu zhasla a že je nad nimi napsáno proč.
 * Běží až úplně nakonec, protože si ceník vyprázdní a zpátky ho nevrací. */
const zab = await p.evaluate(() => {
  const nulyz = o => { Object.keys(o).forEach(k => {
    const v = o[k];
    if (v && typeof v === 'object') nulyz(v);
    else if (typeof v === 'number') o[k] = 0;
  }); };
  nulyz(DEFAULT_CENIK); nulyz(DEFAULT_CENIK_PROJ);
  DEFAULT_CENIK.prazdny = true; DEFAULT_CENIK_PROJ.prazdny = true;
  DEFAULT_CENIK.ukazkove = true; DEFAULT_CENIK_PROJ.ukazkove = true;
  ZAK = novaZakazka(); syncVarianta(); prepniTab('zakazka'); render();
  const btn = [...document.querySelectorAll('#page-zakazka button')]
    .filter(x => /tisk nabídky|nabídku \(Word\)/i.test(x.textContent));
  const stav = kontrolyStavAkt();
  return {
    panel: document.querySelectorAll('#page-zakazka .zabrana-panel').length,
    panelText: (document.querySelector('#page-zakazka .zabrana-panel') || {}).innerText || '',
    tlacitek: btn.length, zhaslych: btn.filter(x => x.disabled).length,
    titulek: btn.length ? btn[0].getAttribute('title') || '' : '',
    brani: stav.brani, kodyBrani: (stav.kodyBrani || []).join(','),
    odklep: (() => { kontrolyPotvrd();
      return !!document.querySelector('#page-zakazka .kontroly-btns'); })(),
    duvod: dokumentZabrana(),
  };
});
/* Na přehledu zakázky stojí obě nabídky vedle sebe (OCK i PROJ) a každá má
 * zábranu nad svými tlačítky – jeden panel na kartu, tedy dva. Kdyby byl jen
 * jeden, znamenalo by to, že jedna z nabídek zhasla bez vysvětlení. */
ok(`nad nenahraným ceníkem se ukáže zábrana u obou nabídek (panelů: ${zab.panel})`, zab.panel === 2);
ok('zábrana řekne, že dokument nevznikne', /nevznikne|nedá vytvořit/i.test(zab.panelText), zab.panelText);
ok('zábrana pošle uživatele pro složku _DB', /_DB/.test(zab.panelText), zab.panelText);
ok(`tlačítka nabídky zhasla (${zab.zhaslych}/${zab.tlacitek})`,
   zab.tlacitek > 0 && zab.zhaslych === zab.tlacitek);
ok('zhasnuté tlačítko má v bublině důvod', /ceník/i.test(zab.titulek), zab.titulek);
ok('kontroly hlásí zábranu vlastním příznakem',
   zab.brani === true && zab.kodyBrani === 'ukazkovyCenik', zab.kodyBrani);
ok('zábrana se nedá odklepnout – tlačítko „Beru na vědomí" zůstává', zab.odklep === true);
ok('registr dokumentů zná důvod odmítnutí', !!zab.duvod, zab.duvod);

/* Červená lišta musí nabídnout cestu ven rovnou kliknutím. Prohlížeč se na
 * právo k zápisu do složky smí zeptat jen z kliknutí, takže po restartu (a po
 * otevření nového sestavení, které je pro něj jiná stránka) zůstane složka
 * odpojená a svítí nuly; odkaz „Nastavení → Úložiště" je pravdivý, ale je to
 * obrazovka navíc přesně ve chvíli, kdy uživatel čeká čísla. Zkoušejí se oba
 * stavy – zapamatovaná složka bez práva i žádná složka. */
const listaVen = await p.evaluate(() => {
  const cti = () => {
    const l = document.querySelector('#ukazkoveLista .ukazkove-lista');
    const b = l && l.querySelector('button');
    return { text: l ? l.innerText : '', popis: b ? b.textContent.trim() : '',
             klik: b ? (b.getAttribute('onclick') || '') : '' };
  };
  const zaloha = { koren: ULO_STAV.koren, jmeno: ULO_STAV.jmeno, pripraveno: ULO_STAV.pripraveno };
  ULO_STAV.koren = null; ULO_STAV.jmeno = ''; ULO_STAV.pripraveno = false;
  renderUkazkoveLista(); const bezSlozky = cti();
  ULO_STAV.koren = {}; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = false;
  renderUkazkoveLista(); const zapamatovana = cti();
  ULO_STAV.koren = {}; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = true;
  renderUkazkoveLista(); const pripojena = cti();
  Object.assign(ULO_STAV, zaloha); renderUkazkoveLista();
  return { bezSlozky, zapamatovana, pripojena };
});
ok(`bez složky lišta nabídne tlačítko pro její připojení („${listaVen.bezSlozky.popis}")`,
   /_DB/.test(listaVen.bezSlozky.popis) && /uloPripojZnovu/.test(listaVen.bezSlozky.klik));
ok('bez složky lišta pořád zmiňuje i Nastavení → Úložiště',
   /Nastavení/.test(listaVen.bezSlozky.text));
ok(`zapamatovaná složka bez práva nabídne „připojit znovu" („${listaVen.zapamatovana.popis}")`,
   /znovu/i.test(listaVen.zapamatovana.popis) && /_DB/.test(listaVen.zapamatovana.popis)
   && /uloPripojZnovu/.test(listaVen.zapamatovana.klik));
ok('u zapamatované složky lišta říká, že přístup zapomněl prohlížeč',
   /zapomněl/.test(listaVen.zapamatovana.text), listaVen.zapamatovana.text);
/* Připojená složka a přitom svítící lišta není chyba: varianta si nese ceník
 * zmrazený z doby svého vzniku. Tlačítko by tu nepomohlo, jen mátlo. */
ok('u připojené složky se tlačítko nenabízí', listaVen.pripojena.popis === '');

/* Poslední pojistka: i kdyby se tlačítko rozsvítilo, generování musí spadnout. */
const zabGen = await p.evaluate(async () => {
  try { await dokumentVygeneruj('kryci_bo', null, ZAK, aktivniVarianta(ZAK), JEKLY); return 'PROŠLO'; }
  catch (e) { return e.message; }
});
ok('generování dokumentu se zastaví i při obejití tlačítka',
   /ceník/i.test(zabGen) && zabGen !== 'PROŠLO', zabGen);
await p.screenshot({ path: 'snimek_zabrana.png', clip: { x: 0, y: 0, width: 1500, height: 950 } });

// screenshoty pro vizuální kontrolu
await p.screenshot({ path: 'snimek_prehled.png' });
await p.screenshot({ path: 'snimek_seznam.png', clip: { x: 0, y: 0, width: 1500, height: 950 } });
await p.locator('#tab-kalk').click();
await p.waitForTimeout(400);
await p.evaluate(() => window.scrollTo(0, 1200));
await p.waitForTimeout(700);
await p.screenshot({ path: 'snimek_lista_sticky.png' });

await b.close();

const spatne = chyby.filter(x => !x).length;
console.log(spatne ? `\nNEPROŠLO: ${spatne}` : `\nVšech ${chyby.length} kontrol prošlo.`);
console.log(konzole.length ? 'KONZOLE:' : 'Konzole čistá.');
konzole.forEach(c => console.log('  · ' + c));
process.exit(spatne ? 1 : 0);
