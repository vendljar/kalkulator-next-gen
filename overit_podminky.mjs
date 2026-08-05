/* Ověření v prohlížeči: smluvní a platební podmínky v souhrnu cenových nabídek
 * a jejich provázání s krycími listy (zadání 5. 8. 2026).
 *
 * Jednotková sada src/test_nabidka_podminky.js hlídá datový model — že sekce
 * pro nabídku existují i v krycím listu, že v nich nejsou pole hlavičky a že
 * zápis do varianta.data.kryci.hodnoty čte i krycí list. To všechno se ale dá
 * ověřit bez prohlížeče, a proto to nestačí: pořád by šlo omylem vykreslit
 * blok, který zapisuje jinam (třeba do vlastní kopie), a testy by mlčely.
 *
 * Tenhle soubor proto dělá to, co uživatel: přepíše splatnost v souhrnu
 * nabídky, přepne se na záložku krycího listu a podívá se, co tam je. A pak
 * totéž opačným směrem a stejně pro PROJ. Zvlášť se hlídá, že se OCK a PROJ
 * navzájem nepropisují — obchodník má u projekce běžně jinou splatnost
 * i jiné pokuty než u ocelové konstrukce a tiché sjednocení by bylo horší
 * než chybějící funkce.
 *
 * Spouští se nad sestaveným buildem:
 *   NODE_PATH=$(npm root -g) node overit_podminky.mjs
 */
import { chromium } from 'playwright';

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

/* Build nese prázdný ceník (samé nuly) – podstrčíme zkušební, aby nabídka
 * měla co počítat a karta se vůbec vykreslila. */
const { createRequire } = await import('module');
const ZC = createRequire(import.meta.url)('/home/claude/work/kng/src/zkusebni_cenik.js');
await p.evaluate(([c, cp]) => {
  Object.assign(DEFAULT_CENIK, c); delete DEFAULT_CENIK.prazdny;
  Object.assign(DEFAULT_CENIK_PROJ, cp); delete DEFAULT_CENIK_PROJ.prazdny;
  ZAK = novaZakazka(); syncVarianta(); render();
}, [ZC.zkusebniCenik(), ZC.zkusebniCenikProj()]);
await p.waitForTimeout(300);

await p.click('#tab-zakazka');
await p.waitForTimeout(400);

// --- 1) blok se vůbec vykreslí a je pod cenami -----------------------------
/* Blok je od 5. 8. 2026 sbalovací karta (helper card() z ui/common.js), takže
 * nadpis je vlastní <h2> karty – tedy sourozenec .body, ne potomek
 * .kl-podminky. Karta nemá id (nabídkové karty se vykreslují i v Kalkulaci,
 * dvě stejná id v dokumentu nechceme), pozná se podle třídy uvnitř. */
const rozvrzeni = await p.evaluate(() => {
  const karta = tr => {
    const d = document.querySelector('#page-zakazka .' + tr);
    return d ? d.closest('.card') : null;
  };
  const karty = [karta('kl-podminky-ock'), karta('kl-podminky-proj')].filter(Boolean);
  const nadpisy = karty.map(x => (x.querySelector('h2') || {}).textContent || '');
  /* „pod Celkem s DPH“ = blok OCK musí být v DOM až za buňkou s tím popiskem. */
  const bunka = [...document.querySelectorAll('#page-zakazka td')]
    .find(td => /Celkem s DPH/.test(td.textContent));
  const ock = karta('kl-podminky-ock');
  const podCenou = !!(bunka && ock)
    && (bunka.compareDocumentPosition(ock) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  /* Karta musí být ve výchozím stavu otevřená – zadání bylo mít podmínky pod
   * cenou vidět, ne za dalším kliknutím. */
  const otevrene = karty.every(x => !x.classList.contains('closed'));
  /* Žádné id se nesmí v dokumentu opakovat (blok je vykreslený i v Kalkulaci). */
  const dvojiId = [...document.querySelectorAll('[id]')].map(x => x.id)
    .filter((v, i, a) => v && a.indexOf(v) !== i);
  return { pocet: karty.length, nadpisy, podCenou, otevrene, dvojiId,
           radky: document.querySelectorAll('#page-zakazka .kl-podminky').length };
});
ok('v Přehledu cenových nabídek jsou dva bloky podmínek (OCK a PROJ)', rozvrzeni.pocet === 2,
   JSON.stringify(rozvrzeni.nadpisy));
ok('blok OCK má vlastní nadpis se zkratkou OCK',
   rozvrzeni.nadpisy.some(t => /OCK/.test(t)), JSON.stringify(rozvrzeni.nadpisy));
ok('blok PROJ má vlastní nadpis se zkratkou PROJ',
   rozvrzeni.nadpisy.some(t => /PROJ/.test(t)), JSON.stringify(rozvrzeni.nadpisy));
ok('blok podmínek OCK je až pod řádkem „Celkem s DPH"', rozvrzeni.podCenou === true);
ok('obě karty s podmínkami jsou ve výchozím stavu rozbalené', rozvrzeni.otevrene === true);
ok('uvnitř karet jsou právě dva bloky řádků .kl-podminky', rozvrzeni.radky === 2, String(rozvrzeni.radky));
ok('podmínky nevyrobily v dokumentu dvojí id', rozvrzeni.dvojiId.length === 0,
   JSON.stringify(rozvrzeni.dvojiId));

/* Sekce, které tam mají být podle konstant v jádru – ať se název sekce nedá
 * přejmenovat, aniž si toho někdo všimne. */
const sekce = await p.evaluate(() => {
  const nadpis = tr => {
    const d = document.querySelector('#page-zakazka .' + tr);
    return d ? [...d.querySelectorAll('h3')].map(h => h.textContent.trim()) : [];
  };
  return { ock: nadpis('kl-podminky-ock'), proj: nadpis('kl-podminky-proj') };
});
ok('blok OCK nese sekci Platební podmínky',
   sekce.ock.includes('Platební podmínky'), JSON.stringify(sekce.ock));
ok('blok OCK nese i smluvní sekci',
   sekce.ock.some(t => /smlouv/i.test(t)), JSON.stringify(sekce.ock));
ok('blok PROJ nese sekci Platební podmínky',
   sekce.proj.includes('Platební podmínky'), JSON.stringify(sekce.proj));
ok('blok PROJ nese i smluvní sekci',
   sekce.proj.some(t => /smlouv/i.test(t)), JSON.stringify(sekce.proj));

/* Pole hlavičky (objednatel, číslo nabídky) do bloku nepatří – vyplňují se
 * v kartě Zakázka o kus výš a dvakrát na jedné obrazovce by mátla. */
const bezHlavicky = await p.evaluate(() =>
  [...document.querySelectorAll('#page-zakazka .kl-podminky .kl-row .lbl')]
    .map(x => x.textContent.trim())
    .filter(t => /objednatel|číslo nabídky|adresa stavby|název akce/i.test(t)));
ok('v podmínkách nejsou pole hlavičky zakázky', bezHlavicky.length === 0, JSON.stringify(bezHlavicky));

// --- 2) zápis v nabídce OCK → vidí ho krycí list OCK ------------------------
/* Píše se přes klSet() – tedy přesně to, co udělá onchange na políčku.
 * (Vyplnit input a poslat událost by testovalo hlavně playwright; tohle
 * testuje aplikaci.) */
await p.evaluate(() => klSet('splatnostDni', '30'));
await p.waitForTimeout(200);
const vNabidce = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-zakazka .kl-podminky .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  return r ? r.querySelector('input').value : null;
});
ok('splatnost zapsaná v souhrnu nabídky OCK se v něm i zobrazí', vNabidce === '30', String(vNabidce));

await p.click('#tab-kryci');
await p.waitForTimeout(400);
const vKrycim = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-kryci .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  return r ? r.querySelector('input').value : null;
});
ok('tatáž splatnost je vidět v krycím listu OCK (propsalo se)', vKrycim === '30', String(vKrycim));

// --- 3) a opačně: zápis v krycím listu OCK → vidí ho souhrn nabídky ---------
await p.evaluate(() => klSet('splatnostDni', '60'));
await p.waitForTimeout(200);
await p.click('#tab-zakazka');
await p.waitForTimeout(400);
const zpetOck = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-zakazka .kl-podminky .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  return r ? r.querySelector('input').value : null;
});
ok('změna v krycím listu OCK je vidět zpátky v souhrnu nabídky', zpetOck === '60', String(zpetOck));

// --- 4) OCK a PROJ se navzájem nepropisují ---------------------------------
await p.evaluate(() => klpSet('splatnostDni', '45'));
await p.waitForTimeout(200);
const oddelene = await p.evaluate(() => ({
  ock: (KL.hodnoty || {}).splatnostDni,
  proj: (KLP.hodnoty || {}).splatnostDni,
}));
ok('zápis do PROJ nezměnil splatnost OCK', oddelene.ock === '60', JSON.stringify(oddelene));
ok('PROJ si drží vlastní splatnost', oddelene.proj === '45', JSON.stringify(oddelene));

await p.click('#tab-kryciproj');
await p.waitForTimeout(400);
const vKrycimProj = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-kryciproj .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  return r ? r.querySelector('input').value : null;
});
ok('splatnost z nabídky PROJ je vidět v krycím listu PROJ', vKrycimProj === '45', String(vKrycimProj));

// --- 5) ↺ vrátí automatiku i z nabídky --------------------------------------
await p.click('#tab-zakazka');
await p.waitForTimeout(400);
const poResetu = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-zakazka .kl-podminky .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  const b = r && r.querySelector('.src button');
  if (!b) return { tlacitko: false };
  b.click();
  const r2 = [...document.querySelectorAll('#page-zakazka .kl-podminky .kl-row')]
    .find(x => /splatnost/i.test(x.querySelector('.lbl').textContent));
  return { tlacitko: true, hodnota: r2.querySelector('input').value,
           rucne: (KL.hodnoty || {}).splatnostDni };
});
ok('u ručně přepsaného pole je v nabídce tlačítko ↺', poResetu.tlacitko === true);
ok('↺ v nabídce smaže ruční hodnotu a vrátí automatiku',
   poResetu.rucne === undefined && poResetu.hodnota === '14', JSON.stringify(poResetu));

/* Uložení do zakázky: hodnoty musí být ve variantě, ne v nějakém pomocném
 * objektu, jinak by se po načtení zakázky ztratily. */
const vDatech = await p.evaluate(() => {
  klpSet('splatnostDni', '45');
  const v = aktivniVarianta(ZAK);
  return { proj: ((v.data.kryciProj || {}).hodnoty || {}).splatnostDni };
});
ok('podmínky se ukládají do dat varianty (přežijí uložení zakázky)',
   vDatech.proj === '45', JSON.stringify(vDatech));

/* --- 6) přepínače ano/ne a typ smlouvy (hlášení 5. 8. 2026) ----------------
 *
 * „nefungují tlačítka (resp. není vidět volba) po vybrání ano / ne nebo
 * typ smlouvy."
 *
 * Příčina: skupina přepínačů se v HTML pozná podle atributu `name` a platí
 * pro CELÝ dokument. Podmínky se přitom vykreslují třikrát — v Kalkulaci OCK,
 * v Přehledu cenových nabídek a v Krycím listu — a všechny tři kopie měly
 * `name="kl_typSmlouvy"`. Prohlížeč proto nechal zaškrtnutou jen jednu z nich
 * (tu poslední vykreslenou) a obchodník, který klikal v Kalkulaci, viděl
 * po překreslení prázdné kolečko. Hodnota se přitom uložila správně — o to
 * hůř, protože chybu nebylo poznat jinak než pohledem.
 *
 * Kontroluje se proto obojí: že se skupiny mezi kopiemi nesdílejí a že po
 * kliknutí zůstane kolečko zaškrtnuté právě tam, kde uživatel klikl. */
const skupiny = await p.evaluate(() => {
  const pocty = {};
  document.querySelectorAll('input[type=radio]').forEach(i => { pocty[i.name] = (pocty[i.name] || 0) + 1; });
  /* U žádné skupiny nesmí být víc přepínačů, než kolik má voleb — nejvíc
   * jich má typ smlouvy (3). Víc = dvě kopie sdílejí jednu skupinu. */
  const sdilene = Object.entries(pocty).filter(([, n]) => n > 3).map(([k, n]) => k + '×' + n);
  return { sdilene, skupin: Object.keys(pocty).length };
});
ok('žádná skupina přepínačů se nesdílí mezi kopiemi bloku',
   skupiny.sdilene.length === 0, skupiny.sdilene.join(', '));

const volba = await p.evaluate(() => {
  const blok = document.querySelector('#page-kalk .kl-podminky-ock');
  if (!blok) return { chyba: 'blok v kalkulaci nenalezen' };
  const radek = [...blok.querySelectorAll('.kl-row')]
    .find(x => /typ smlouvy/i.test(x.querySelector('.lbl').textContent));
  if (!radek) return { chyba: 'řádek typ smlouvy nenalezen' };
  const prvni = radek.querySelector('input[type=radio]');
  prvni.checked = true;
  prvni.dispatchEvent(new Event('change', { bubbles: true }));
  render();
  const znovu = [...document.querySelectorAll('#page-kalk .kl-podminky-ock .kl-row')]
    .find(x => /typ smlouvy/i.test(x.querySelector('.lbl').textContent));
  const zaskrtnute = [...znovu.querySelectorAll('input[type=radio]')].filter(i => i.checked);
  /* Táž volba musí být vidět i v druhé kopii — je to jeden a týž záznam. */
  const vPrehledu = [...document.querySelectorAll('#page-zakazka .kl-podminky-ock .kl-row')]
    .find(x => /typ smlouvy/i.test(x.querySelector('.lbl').textContent));
  const zaskrtnuteJinde = vPrehledu
    ? [...vPrehledu.querySelectorAll('input[type=radio]')].filter(i => i.checked) : [];
  return {
    hodnota: (KL.hodnoty || {}).typSmlouvy,
    videtVKalkulaci: zaskrtnute.length === 1 ? zaskrtnute[0].value : null,
    videtVPrehledu: zaskrtnuteJinde.length === 1 ? zaskrtnuteJinde[0].value : null,
  };
});
ok('po kliknutí zůstane volba zaškrtnutá tam, kde se klikalo',
   volba.videtVKalkulaci === volba.hodnota && !!volba.hodnota, JSON.stringify(volba));
ok('táž volba je vidět i v druhé kopii bloku (jeden záznam, dva pohledy)',
   volba.videtVPrehledu === volba.hodnota, JSON.stringify(volba));

const anoNe = await p.evaluate(() => {
  const radek = [...document.querySelectorAll('#page-kalk .kl-podminky-ock .kl-row')]
    .find(x => /zádržné/i.test(x.querySelector('.lbl').textContent));
  if (!radek) return { chyba: 'řádek zádržné nenalezen' };
  const ano = [...radek.querySelectorAll('input[type=radio]')].find(i => i.value === 'Ano');
  ano.checked = true; ano.dispatchEvent(new Event('change', { bubbles: true }));
  render();
  const znovu = [...document.querySelectorAll('#page-kalk .kl-podminky-ock .kl-row')]
    .find(x => /zádržné/i.test(x.querySelector('.lbl').textContent));
  const z = [...znovu.querySelectorAll('input[type=radio]')].filter(i => i.checked);
  return { videt: z.length === 1 ? z[0].value : null };
});
ok('volba Ano/Ne u zádržného zůstane po překreslení vidět',
   anoNe.videt === 'Ano', JSON.stringify(anoNe));

const projRadio = await p.evaluate(() => {
  const blok = document.querySelector('#page-zakazka .kl-podminky-proj')
    || document.querySelector('.kl-podminky-proj');
  if (!blok) return { chyba: 'blok PROJ nenalezen' };
  const radek = [...blok.querySelectorAll('.kl-row')]
    .find(x => x.querySelector('input[type=radio]'));
  if (!radek) return { chyba: 'v PROJ není žádný přepínač' };
  const prvni = radek.querySelector('input[type=radio]');
  const jmeno = prvni.name;
  prvni.checked = true; prvni.dispatchEvent(new Event('change', { bubbles: true }));
  render();
  const zn = [...blok.querySelectorAll('.kl-row')].find(x => x.querySelector('input[type=radio]'));
  const z = [...zn.querySelectorAll('input[type=radio]')].filter(i => i.checked);
  return { videt: z.length === 1 ? z[0].value : null, jmeno };
});
ok('přepínače PROJ drží volbu stejně jako OCK',
   !!projRadio.videt, JSON.stringify(projRadio));


/* --- 7) sazba DPH je výběr 12/21 % navázaný na hlavičku (hlášení 5. 8. 2026) --
 *
 * „Sazba DPH nemůže být přepisovatelná, ale musí být volitelná 12/21 %
 *  a navázaná na hlavičku kalkulace."
 *
 * Dřív to bylo textové pole s předvyplněnou hodnotou z ceníku. Obchodník do
 * něj mohl napsat „19 %" a krycí list i nabídka pak nesly jinou sazbu, než
 * jakou se počítalo „Celkem s DPH" o kus výš na téže stránce. Kontroluje se
 * proto obojí: že se do řádku nedá psát, a že přepnutí výběru opravdu změní
 * sazbu v hlavičce kalkulace — ne nějakou vlastní kopii hodnoty.
 */
const dphRadek = await p.evaluate(() => {
  const blok = document.querySelector('#page-kalk .kl-podminky-ock');
  if (!blok) return { chyba: 'blok v kalkulaci nenalezen' };
  const r = [...blok.querySelectorAll('.kl-row')]
    .find(x => /sazba dph/i.test(x.querySelector('.lbl').textContent));
  if (!r) return { chyba: 'řádek sazba DPH nenalezen' };
  const sel = r.querySelector('select');
  return {
    jeVyber: !!sel,
    textovePole: !!r.querySelector('input[type=text]'),
    volby: sel ? [...sel.options].map(o => o.value) : [],
    vybrano: sel ? sel.value : null,
    /* Proti čemu se porovnává: skutečná sazba v hlavičce, ne napevno psané
     * číslo. Zkušební ceník má OCK v 12 %, ostrý vychází z 21 % — kdyby tu
     * stálo natvrdo „21", kontrola by hlídala ceník, ne to, co má hlídat. */
    vHlavicce: (typeof C !== 'undefined' && C) ? Math.round((C.dph || 0) * 100) : null,
    resetTlacitko: !!r.querySelector('.src button'),
    rucne: /ručně/.test(r.querySelector('.src').textContent),
  };
});
ok('sazba DPH je v podmínkách výběr, ne psací pole',
   dphRadek.jeVyber === true && dphRadek.textovePole === false, JSON.stringify(dphRadek));
ok('nabízí se právě sazby 12 % a 21 %',
   dphRadek.volby.join(',') === '12,21', JSON.stringify(dphRadek.volby));
ok('sazba ukazuje hodnotu z hlavičky kalkulace',
   !!dphRadek.vHlavicce && String(dphRadek.vybrano) === String(dphRadek.vHlavicce),
   JSON.stringify(dphRadek));
ok('u sazby není ↺ ani značka „ručně" (není co přepisovat)',
   dphRadek.resetTlacitko === false && dphRadek.rucne === false, JSON.stringify(dphRadek));

/* Přepnutí na 12 % musí změnit sazbu v hlavičce — a tím i „Celkem s DPH".
 * Kdyby si podmínky držely vlastní hodnotu, hlavička by zůstala na 21 %
 * a dokument by se rozešel s cenou.
 *
 * Hlavička se nejdřív nastaví na 21 %, aby přepnutí na 12 % bylo opravdu
 * změnou. Zkušební ceník totiž startuje na 12 % a kontrola „přepnul jsem na
 * hodnotu, která už tam byla" by prošla i s úplně mrtvým výběrem. */
const poPrepnuti = await p.evaluate(() => {
  set('C.dph', 0.21);
  const najdi = () => [...document.querySelectorAll('#page-kalk .kl-podminky-ock .kl-row')]
    .find(x => /sazba dph/i.test(x.querySelector('.lbl').textContent));
  const sel = najdi().querySelector('select');
  sel.value = '12';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  const znovu = najdi().querySelector('select');
  return {
    hlavicka: C.dph,
    vybrano: znovu.value,
    rucniHodnota: (KL.hodnoty || {}).sazbaDph,
  };
});
ok('přepnutí sazby v podmínkách změní sazbu v hlavičce kalkulace',
   poPrepnuti.hlavicka === 0.12, JSON.stringify(poPrepnuti));
ok('výběr po překreslení ukazuje nově zvolenou sazbu',
   poPrepnuti.vybrano === '12', JSON.stringify(poPrepnuti));
ok('sazba se neukládá jako ruční přepis podmínek',
   poPrepnuti.rucniHodnota === undefined, JSON.stringify(poPrepnuti));

/* A obráceně: přepnutí v hlavičce se projeví v podmínkách i v krycím listu. */
const zHlavicky = await p.evaluate(() => {
  set('C.dph', 0.21);
  const v = tr => {
    const r = [...document.querySelectorAll(tr + ' .kl-row')]
      .find(x => /sazba dph/i.test(x.querySelector('.lbl').textContent));
    const s = r && r.querySelector('select');
    return s ? s.value : null;
  };
  return { vKalkulaci: v('#page-kalk .kl-podminky-ock'), vPrehledu: v('#page-zakazka .kl-podminky-ock') };
});
ok('změna sazby v hlavičce se projeví v podmínkách u nabídky',
   zHlavicky.vKalkulaci === '21' && zHlavicky.vPrehledu === '21', JSON.stringify(zHlavicky));

await p.click('#tab-kryci');
await p.waitForTimeout(400);
const vKrycimDph = await p.evaluate(() => {
  const r = [...document.querySelectorAll('#page-kryci .kl-row')]
    .find(x => /sazba dph/i.test(x.querySelector('.lbl').textContent));
  const s = r && r.querySelector('select');
  return { jeVyber: !!s, hodnota: s ? s.value : null, psaciPole: !!(r && r.querySelector('input[type=text]')) };
});
ok('i v krycím listu OCK je sazba výběr s hodnotou z hlavičky',
   vKrycimDph.jeVyber === true && vKrycimDph.hodnota === '21' && vKrycimDph.psaciPole === false,
   JSON.stringify(vKrycimDph));

/* PROJ má vlastní sazbu — projekce bývá v jiné sazbě než stavební část,
 * takže přepnutí u projekce nesmí sáhnout na sazbu OCK. */
await p.click('#tab-zakazka');
await p.waitForTimeout(400);
const dphProj = await p.evaluate(() => {
  const blok = document.querySelector('#page-zakazka .kl-podminky-proj');
  if (!blok) return { chyba: 'blok PROJ nenalezen' };
  const najdi = () => [...document.querySelectorAll('#page-zakazka .kl-podminky-proj .kl-row')]
    .find(x => /sazba dph/i.test(x.querySelector('.lbl').textContent));
  const r = najdi();
  if (!r) return { chyba: 'řádek sazba DPH v PROJ nenalezen' };
  const sel = r.querySelector('select');
  if (!sel) return { chyba: 'sazba DPH v PROJ není výběr' };
  sel.value = '12';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return { proj: PC.dph, ock: C.dph, vybrano: najdi().querySelector('select').value };
});
ok('sazba DPH u projekce je také výběr a mění hlavičku PROJ',
   dphProj.proj === 0.12 && dphProj.vybrano === '12', JSON.stringify(dphProj));
ok('přepnutí sazby u projekce nesáhlo na sazbu OCK',
   dphProj.ock === 0.21, JSON.stringify(dphProj));

// --- souhrn ----------------------------------------------------------------
console.log('');
if (konzole.length) { console.log('Konzole hlásí:'); konzole.forEach(z => console.log('   ' + z)); }
else console.log('Konzole čistá.');
const spatne = chyby.filter(x => !x).length;
console.log(spatne ? `\n${spatne} z ${chyby.length} kontrol selhalo.` : `\nVšech ${chyby.length} kontrol prošlo.`);
await b.close();
process.exit(spatne ? 1 : 0);
