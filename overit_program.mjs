/* Databáze programu (_program.json) nad sestavením dist/kalkulacka.html.
 *
 * Stejný trik jako u zakázek: složku podstrčíme jako paměťovou, takže se
 * dá projet celý život ceníku programu – založení, zveřejnění další verze,
 * historie s daty platnosti, kolize dvou zapisovatelů, poškozený soubor,
 * odpojení složky a hlavně to nejdůležitější (zadání 31. 7. 2026): že se
 * rozpracovaná nabídka novým ceníkem přepočítá sama, zatímco vytištěná
 * (uzamčená) zůstává ve stavu, ve kterém odešla.
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
stranka.on('dialog', d => d.accept('zdrazil material'));   // confirm = ano, prompt = zdůvodnění
await stranka.goto(soubor);
await stranka.waitForTimeout(400);

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

console.log('\nDatabáze programu – ceníky, ceny a náklady ve složce');

// 1. prázdná složka: jede se ze sestavení
const start = await stranka.evaluate(async () => {
  const v = await progNactiZeSlozky();
  return { v, db: PROG_STAV.db, cena: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc'), hlaska: PROG_STAV.hlaska };
});
zkus('prázdná složka databázi programu nenese', start.v === false && start.db === null);
/* Do 30. 7. 2026 se tu čekalo, že sestavení nese nějakou cenu (ukázkový ceník).
 * Od té doby platí opak: v sestavení žádné ceny nejsou, a dokud se z databáze
 * nenatáhne ostrý ceník, svítí všude nuly a není z čeho počítat. Nabídka
 * postavená na vymyšlených cenách ven nesmí, tak to sem patří jako kontrola. */
zkus('sestavení samo o sobě žádné ceny nenese', start.cena === 0, String(start.cena));
zkus('obsluha se to dozví bez varování', /ze sestavení/i.test(start.hlaska), start.hlaska);

// 2. běžný uživatel nezveřejňuje
const bezny = await stranka.evaluate(async () => {
  NAST.jeAdmin = false;
  const v = await progZverejni();
  NAST.jeAdmin = true;
  return { v, souboru: window.SLOZKA.size, typ: PROG_STAV.hlaskaTyp };
});
zkus('běžný uživatel ceník nezveřejní', bezny.v === false && bezny.souboru === 0);
zkus('a dostane varování', bezny.typ === 'varovani');

// 3. první zveřejnění založí databázi
const prvni = await stranka.evaluate(async () => {
  cenikSet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc', 111);
  const v = await progZverejni();
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR) || 'null');
  return { v, jmeno: [...window.SLOZKA.keys()],
           verze: db && db.platny.verze, historie: db && db.historie.length,
           vBuildu: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc'),
           pozn: db && db.platny.poznamka, platnoDo: db && ('platnoDo' in db.platny) };
});
zkus('první zveřejnění projde', prvni.v === true);
zkus('vznikl soubor _program.json', prvni.jmeno.includes('_program.json'), prvni.jmeno.join(', '));
zkus('je to verze 1 bez historie', prvni.verze === 1 && prvni.historie === 0);
zkus('platná verze nemá datum konce platnosti', prvni.platnoDo === false);
zkus('zdůvodnění se uložilo', prvni.pozn === 'zdrazil material', String(prvni.pozn));
zkus('od té chvíle platí zveřejněná cena', prvni.vBuildu === 111, String(prvni.vBuildu));

// 4. soubor databáze se neplete mezi zakázky
const mimo = await stranka.evaluate(async () => {
  return { zakazkovy: uloJeZakazkovySoubor(PROG_SOUBOR), seznam: await uloSeznamSouboru() };
});
zkus('_program.json není zakázka', mimo.zakazkovy === false);
zkus('a v seznamu zakázek se neukáže', mimo.seznam.length === 0, mimo.seznam.join(', '));

// 5. nová nabídka vychází z platné verze
const nova = await stranka.evaluate(() => {
  ZAK = novaZakazka(); syncVarianta();
  return cenikGet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc');
});
zkus('nová zakázka počítá platnou cenou', nova === 111, String(nova));

// 6. druhé zveřejnění: stará verze do historie s datem, do kdy platila
const druhe = await stranka.evaluate(async () => {
  cenikSet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc', 222);
  const v = await progZverejni();
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  return { v, verze: db.platny.verze, historie: db.historie.length,
           staraCena: cenikGet(db.historie[0].cenik, 'C.profilasKgKc'),
           platnoDo: !!db.historie[0].platnoDo,
           navazuje: db.historie[0].platnoDo === db.platny.platnoOd,
           vBuildu: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc') };
});
zkus('druhé zveřejnění projde', druhe.v === true);
zkus('je to verze 2 a jedna v historii', druhe.verze === 2 && druhe.historie === 1);
zkus('v historii zůstala původní cena', druhe.staraCena === 111, String(druhe.staraCena));
zkus('historická verze má datum konce platnosti', druhe.platnoDo === true);
zkus('platnosti na sebe navazují', druhe.navazuje === true);
zkus('platí nová cena', druhe.vBuildu === 222);

// 7. zveřejnit beze změny nemá smysl
const bezeZmeny = await stranka.evaluate(async () => {
  const v = await progZverejni();
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  return { v, verze: db.platny.verze, hlaska: PROG_STAV.hlaska };
});
zkus('shodný ceník se znovu nezveřejní', bezeZmeny.v === false && bezeZmeny.verze === 2);
zkus('a řekne se proč', /neliší/i.test(bezeZmeny.hlaska), bezeZmeny.hlaska);

// 8. rozpracovaná nabídka se přepočítá sama (zadání 31. 7. 2026)
const zamrzla = await stranka.evaluate(async () => {
  const v = aktivniVarianta(ZAK);
  cenikSet(v.data.cenik, 'C.profilasKgKc', 999);       // ručně upravená varianta
  v.upraveno = new Date().toISOString();
  await progNactiZeSlozky();                            // znovunačtení ze složky
  const va = aktivniVarianta(ZAK);
  return { cena: cenikGet(va.data.cenik, 'C.profilasKgKc'),
           razitko: va.data.cenikRazitko && va.data.cenikRazitko.verze,
           zadani: va.data.ock.zadani.sirka };
});
zkus('ceník rozpracované nabídky se srovná s platnou verzí', zamrzla.cena === 222, String(zamrzla.cena));
zkus('a razítko doloží, z které verze se počítá', zamrzla.razitko === 2, String(zamrzla.razitko));
zkus('zadání zůstává, přepisuje se ceník, ne kalkulace', typeof zamrzla.zadani === 'number');

// 9. odeslaná (uzamčená) varianta je nedotknutelná
const odeslana = await stranka.evaluate(async () => {
  ZAK = novaZakazka(); syncVarianta();
  const v = aktivniVarianta(ZAK);
  v.zamek = { zamceno: true, kdy: '2026-07-20T08:00:00.000Z', typ: 'nabidka', cislo: 'X', otisk: {} };
  const pred = cenikGet(v.data.cenik, 'C.profilasKgKc');
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  cenikSet(db.platny.cenik, 'C.profilasKgKc', 777);      // mezitím se zveřejnila jiná cena
  progPouzij(programNormalizuj(JSON.stringify(db)).platny);
  return { pred, po: cenikGet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc'),
           platna: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc') };
});
zkus('nová platná cena se opravdu použila', odeslana.platna === 777, String(odeslana.platna));
zkus('uzamčená varianta zůstane na svých cenách',
  odeslana.po === odeslana.pred && odeslana.po !== 777, String(odeslana.po));

// 10. převzetí historické verze do varianty nezmění platnou verzi
const prevzeti = await stranka.evaluate(async () => {
  ZAK = novaZakazka(); syncVarianta();
  progPrevezmiVerzi(1);
  await new Promise(r => setTimeout(r, 60));
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  return { varianta: cenikGet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc'),
           platna: db.platny.verze, platnaCena: cenikGet(db.platny.cenik, 'C.profilasKgKc') };
});
zkus('historický ceník se dá převzít do varianty', prevzeti.varianta === 111, String(prevzeti.varianta));
zkus('platná verze se tím nemění', prevzeti.platna === 2 && prevzeti.platnaCena === 222);

// 11. kolize dvou zapisovatelů: cizí verze se neztratí
const kolize = await stranka.evaluate(async () => {
  const cizi = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  cizi.razitko = '2026-07-30T23:59:59.000Z';
  cizi.platny.poznamka = 'zapsal kolega';
  window.SLOZKA.set(PROG_SOUBOR, JSON.stringify(cizi));
  ZAK = novaZakazka(); syncVarianta();
  cenikSet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc', 333);
  const v = await progZverejni();                       // confirm se potvrdí
  const db = JSON.parse(window.SLOZKA.get(PROG_SOUBOR));
  return { v, verze: db.platny.verze, historie: db.historie.length,
           kolegaVHistorii: db.historie.some(z => z.poznamka === 'zapsal kolega') };
});
zkus('po potvrzení se zveřejní i přes kolizi', kolize.v === true && kolize.verze === 3);
zkus('verze kolegy zůstala v historii', kolize.kolegaVHistorii === true);
zkus('historie má obě starší verze', kolize.historie === 2, String(kolize.historie));

// 12. poškozený soubor se nepoužije ani nepřepíše
const rozbity = await stranka.evaluate(async () => {
  const zaloha = window.SLOZKA.get(PROG_SOUBOR);
  window.SLOZKA.set(PROG_SOUBOR, '{tohle není JSON');
  const v = await progNactiZeSlozky();
  return { v, chyba: !!PROG_STAV.chyba, typ: PROG_STAV.hlaskaTyp,
           naDisku: window.SLOZKA.get(PROG_SOUBOR) === '{tohle není JSON',
           cena: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc'), zaloha };
});
zkus('poškozený soubor se nenačte', rozbity.v === false && rozbity.chyba === true);
zkus('a nepřepíše se sám od sebe', rozbity.naDisku === true);
zkus('obsluha dostane varování', rozbity.typ === 'varovani');
zkus('mezitím platí ceník ze sestavení', rozbity.cena !== 333 && typeof rozbity.cena === 'number', String(rozbity.cena));

// 13. cizí soubor stejného jména se odmítne
const cizi = await stranka.evaluate(async () => {
  window.SLOZKA.set(PROG_SOUBOR, JSON.stringify({ aplikace: 'Něco jiného', schema: 1, platny: { cenik: {} } }));
  const v = await progNactiZeSlozky();
  return { v, chyba: PROG_STAV.chyba };
});
zkus('soubor z jiné aplikace se nepoužije', cizi.v === false && /aplikac/i.test(cizi.chyba), cizi.chyba);

// 14. ruční zásah do souboru se pozná podle otisku
const otisk = await stranka.evaluate(async (zaloha) => {
  const db = JSON.parse(zaloha);
  cenikSet(db.platny.cenik, 'C.profilasKgKc', 444);      // ruční přepis mimo aplikaci
  window.SLOZKA.set(PROG_SOUBOR, JSON.stringify(db));
  await progNactiZeSlozky();
  return { nesedi: !!PROG_STAV.db.platny.otiskNesedi, pouzito: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc') };
}, rozbity.zaloha);
zkus('ruční zásah do souboru se pozná', otisk.nesedi === true);
zkus('data se přesto použijí, jen se to řekne', otisk.pouzito === 444, String(otisk.pouzito));

// 15. odpojení složky vrátí ceník ze sestavení
const odpoj = await stranka.evaluate(async () => {
  const zeSlozky = cenikGet(DEFAULT_CENIK, 'C.profilasKgKc');
  uloOdpojSlozku();
  await new Promise(r => setTimeout(r, 60));
  return { zeSlozky, poOdpojeni: cenikGet(DEFAULT_CENIK, 'C.profilasKgKc'),
           db: PROG_STAV.db, souboru: window.SLOZKA.size };
});
zkus('po odpojení se ceník vrátí na sestavení',
  odpoj.zeSlozky === 444 && odpoj.poOdpojeni !== 444 && odpoj.db === null, String(odpoj.poOdpojeni));
zkus('odpojení ve složce nic nesmaže', odpoj.souboru > 0);

// 16. karta a panel se vykreslí
const ui = await stranka.evaluate(() => {
  ULO_STAV.koren = window.KOREN; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = true;
  render();
  const karta = document.getElementById('page-cenik').innerHTML;
  const kartaProj = document.getElementById('page-cenikproj').innerHTML;
  const dupl = (() => {   // dvojí vykreslení karty nesmí zdvojit žádné id
    const vsechna = [...document.querySelectorAll('[id]')].map(e => e.id);
    return vsechna.filter((x, i) => vsechna.indexOf(x) !== i);
  })();
  otevriProgram();
  const panel = document.getElementById('program-panel').innerHTML;
  zavriProgram();
  return { karta: /Databáze programu/.test(karta), zverejnit: /progZverejni/.test(karta),
           kartaProj: /Databáze programu/.test(kartaProj), zverejnitProj: /progZverejni/.test(kartaProj),
           dupl,
           panel: panel.length > 0, skryto: document.getElementById('program-overlay').style.display };
});
zkus('karta Databáze programu je na záložce Ceník', ui.karta === true);
zkus('karta nabízí zveřejnění', ui.zverejnit === true);
/* Zveřejňování a verzování je jedno pro OCK i PROJ (jeden _program.json,
 * jedna verze) — karta proto musí stát i na záložce Ceník nákladů PROJ
 * (zadání 2. 8. 2026: „Proč u ceníku proj nemáme stejné zveřejňování
 * a verzování jako u OCK? Zaveď."). */
zkus('karta Databáze programu je i na záložce Ceník PROJ',
  ui.kartaProj === true && ui.zverejnitProj === true);
zkus('dvojí vykreslení karty nezdvojilo žádné id', ui.dupl.length === 0, JSON.stringify(ui.dupl));
zkus('panel s verzemi se otevře a zavře', ui.panel === true && ui.skryto === 'none');

/* ---------- 17. verze ceníku v razítku varianty (#39) ----------
 *
 * Databáze umí říct, co v ceníku kdy bylo. Tohle hlídá druhou polovinu:
 * ze KTERÉ verze konkrétní kalkulace opravdu počítala. Na to se za půl roku
 * ptá zákazník i fakturace a odpověď „asi z té tehdejší" nestačí. */
const v39start = await stranka.evaluate(async () => {
  window.SLOZKA.delete(PROG_SOUBOR);
  await progNactiZeSlozky();
  ZAK = novaZakazka(); syncVarianta();
  cenikSet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc', 100);
  await progZverejni();                                   // verze 1
  ZAK = novaZakazka(); syncVarianta();
  const p = cenikPrehledAkt();
  return { verze: p.verze, odvozena: p.verzeOdvozena, platna: progPlatnaVerzeInfo() };
});
zkus('po zveřejnění platí verze 1', v39start.platna.verze === 1, JSON.stringify(v39start.platna));
zkus('nová varianta se shodným ceníkem se přiřadí k platné verzi',
  v39start.verze === 1 && v39start.odvozena === true, JSON.stringify(v39start));

/* Zveřejnění nové verze má nedotčené varianty přerazítkovat – jinak by
 * zůstaly viset u čísla verze, ze které už dávno nepočítají. Sesterská
 * varianta se do zakázky přidá právě proto: aktivní varianta je ta, ze které
 * se zveřejňuje, takže na ní se „nedotčenost" ověřit nedá. */
const v39nova = await stranka.evaluate(async () => {
  const s = JSON.parse(JSON.stringify(ZAK.varianty[0]));
  s.id = 'sestra'; s.nazev = 'Nedotčená'; s.ridici = false;
  ZAK.varianty.push(s);
  cenikSet(aktivniVarianta(ZAK).data.cenik, 'C.profilasKgKc', 200);
  await progZverejni();                                   // verze 2
  const r = s.data.cenikRazitko;
  const p = cenikPrehled(s, cenikDnesniData(), cenikPlatnaVerzeInfo());
  return { verze: r && r.verze, platnoOd: r && r.platnoOd,
           cena: cenikGet(s.data.cenik, 'C.profilasKgKc'),
           odvozena: p.verzeOdvozena, zaostava: p.verzeZaostava, text: p.verzeText };
});
zkus('nedotčená varianta se přepočte na novou verzi', v39nova.cena === 200, String(v39nova.cena));
zkus('a nese verzi 2 v razítku', v39nova.verze === 2, JSON.stringify(v39nova));
zkus('razítko si drží i datum platnosti verze', !!v39nova.platnoOd, String(v39nova.platnoOd));
zkus('verze není odvozená ze shody cen, ale zapsaná', v39nova.odvozena === false);
zkus('a nic nezaostává', v39nova.zaostava === false);
zkus('verze se dá říct větou', /verze 2 ceníku/.test(v39nova.text || ''), v39nova.text);

/* Převzetí historického ceníku: razítko musí jít s ním. Kdyby zůstalo na
 * dvojce, nabídka by se doložila verzí, ze které se nepočítalo. */
const v39zpet = await stranka.evaluate(async () => {
  const v = aktivniVarianta(ZAK);
  cenikKvitovat(v, cenikPrehledAkt().otisk, 'zkouska');   // „ceny jsou dohodnuté"
  progPrevezmiVerzi(1);
  await new Promise(r => setTimeout(r, 60));
  const p = cenikPrehledAkt();
  return { razitko: v.data.cenikRazitko && v.data.cenikRazitko.verze,
           cena: cenikGet(v.data.cenik, 'C.profilasKgKc'),
           verze: p.verze, verzeDnes: p.verzeDnes, zaostava: p.verzeZaostava,
           veta: cenikVarovaniText(p), lista: cenikVerzeLista(),
           kvitance: !!v.cenikKvitance };
});
zkus('převzatý historický ceník se opravdu použil', v39zpet.cena === 100, String(v39zpet.cena));
zkus('a razítko jde s ním, ne s platnou verzí', v39zpet.razitko === 1, String(v39zpet.razitko));
zkus('přehled ví, že varianta zaostává za platnou verzí',
  v39zpet.verze === 1 && v39zpet.verzeDnes === 2 && v39zpet.zaostava === true, JSON.stringify(v39zpet));
zkus('varování pojmenuje obě čísla verzí',
  /z verze 1 ceníku, teď platí verze 2/.test(v39zpet.veta || ''), v39zpet.veta);
zkus('tichá lišta na záložce Ceník řekne totéž',
  /verze 1 ceníku/.test(v39zpet.lista || '') && /verze 2 ceníku/.test(v39zpet.lista || ''), v39zpet.lista);
zkus('a rovnou i co to znamená pro rozpracovanou zakázku',
  /Rozpracované nabídky/.test(v39zpet.lista || '')
  && /přepoč[íi]taj[íi] samy/.test(v39zpet.lista || '')
  && /Uzamčená/.test(v39zpet.lista || ''), v39zpet.lista);
zkus('výměna celého ceníku zruší dřívější „ceny jsou dohodnuté"', v39zpet.kvitance === false);

/* Sestavení žádné číslo zveřejnění nemá. Po odpojení složky se tedy verze
 * maže – tvrdit u prázdného ceníku verzi 2 by bylo horší než mlčet. */
const v39odpoj = await stranka.evaluate(async () => {
  const s = ZAK.varianty.find(v => v.id === 'sestra');
  ZAK.aktivni = s.id; syncVarianta();
  const pred = s.data.cenikRazitko && s.data.cenikRazitko.verze;
  uloOdpojSlozku();
  await new Promise(r => setTimeout(r, 60));
  return { pred, po: s.data.cenikRazitko && s.data.cenikRazitko.verze,
           platna: progPlatnaVerzeInfo().verze, lista: cenikVerzeLista() };
});
zkus('před odpojením varianta verzi měla', v39odpoj.pred === 2, String(v39odpoj.pred));
zkus('po odpojení složky se verze v razítku smaže', v39odpoj.po === null, String(v39odpoj.po));
zkus('a aplikace žádnou platnou verzi netvrdí', v39odpoj.platna === null, String(v39odpoj.platna));
zkus('bez verze lišta mlčí, místo aby si číslo domyslela', v39odpoj.lista === '', v39odpoj.lista);

/* Ať následující kontrola konzole neběží nad odpojenou složkou. */
await stranka.evaluate(async () => {
  ULO_STAV.koren = window.KOREN; ULO_STAV.jmeno = '_DB'; ULO_STAV.pripraveno = true;
  await progNactiZeSlozky();
});

/* ---------- 18. značka „nejsou to ostrá data" jde s čísly ----------
 *
 * Nahlášeno 31. 7. 2026: „připojení jsem potvrdil, ale ceník se stále
 * nestahuje" – a na obrazovce přitom byly skutečné částky. Ceník varianty je
 * zmrazená kopie; když vznikla bez připojené složky, nese značku prázdného
 * sestavení. Přepočet do ní zapsal ostré ceny, ale značky se nedotkl, takže
 * aplikace počítala správně a zároveň tvrdila „není z čeho počítat": svítila
 * červená lišta a dokument zůstal zablokovaný nad hotovou nabídkou.
 *
 * Nejhorší je varianta, jejíž ceny už se s platným ceníkem SHODUJÍ (třeba
 * proto, že se ceník mezitím načetl jinudy). Rozdíl žádný, takže se přepočet
 * dřív vůbec nespustil a značka tam byla napořád – bez cesty ven. */
const znacka = await stranka.evaluate(async () => {
  ZAK = novaZakazka(); syncVarianta();
  const v = aktivniVarianta(ZAK);
  const oznac = c => { c.ukazkove = true; c.prazdny = true; };
  oznac(v.data.cenik); oznac(v.data.proj.cenik);
  const pred = ukazkoveStavAkt();
  const stav = {
    predPrazdne: pred.prazdne, predBrani: ukazkoveBraniDokumentu(pred),
    predLista: /není z čeho počítat|není nahraný/.test(ukazkoveLista()),
    predZabrana: dokumentZabrana().length > 0,
    rozdily: cenikRozdily(v.data, cenikDnesniData()).length,
  };
  stav.zmen = progSrovnejNedotcene();
  const po = ukazkoveStavAkt();
  stav.poPrazdne = po.prazdne;
  stav.poBrani = ukazkoveBraniDokumentu(po);
  stav.poKde = po.kde.join(', ');
  stav.poZabrana = dokumentZabrana();
  stav.poLista = ukazkoveLista();
  stav.cena = cenikGet(v.data.cenik, 'C.profilasKgKc');
  return stav;
});
zkus('výchozí stav je přesně ten nahlášený: ceny sedí, značka zůstala',
  znacka.rozdily === 0 && znacka.predPrazdne === true, JSON.stringify(znacka));
zkus('a v něm lišta svítí i dokument je zablokovaný',
  znacka.predBrani === true && znacka.predLista === true && znacka.predZabrana === true,
  JSON.stringify(znacka));
zkus('srovnání se ohlásí jako změna, i když se žádná cena nezměnila',
  znacka.zmen >= 2, String(znacka.zmen));
zkus('po srovnání značka na ceníku varianty není',
  znacka.poPrazdne === false && !/ceník/.test(znacka.poKde), znacka.poKde);
/* Lišta v téhle zkoušce úplně nezhasne – firemní údaje ve složce nejsou,
 * takže dál (správně) hlásí je. Podstatné je, že o ceníku už mlčí: zmizel
 * jak výčet („ceník OCK"), tak věta „Ceník není nahraný". */
zkus('lišta o ceníku už nemluví',
  !/ceník/i.test(znacka.poLista) && !/není z čeho počítat/.test(znacka.poLista),
  znacka.poLista);
zkus('a dokument se odblokuje',
  znacka.poBrani === false && znacka.poZabrana === '', znacka.poZabrana);
zkus('ceny přitom zůstaly ostré, srovnání s nimi nehýbe',
  znacka.cena === 200, String(znacka.cena));

/* Uzamčená (vytištěná = odeslaná) varianta je doklad o tom, co odešlo.
 * Kdyby se z ní značka sundala, aplikace by zpětně tvrdila, že nabídka
 * počítala z ostrých čísel – i když nepočítala. */
const znackaZam = await stranka.evaluate(async () => {
  ZAK = novaZakazka(); syncVarianta();
  const v = aktivniVarianta(ZAK);
  const oznac = c => { c.ukazkove = true; c.prazdny = true; };
  oznac(v.data.cenik); oznac(v.data.proj.cenik);
  zamkniVariantu(v, { typ: 'nabidkaOck', kdy: '2026-07-30T08:00:00.000Z' });
  const zmen = progSrovnejNedotcene();
  return { zmen, ukazkove: !!v.data.cenik.ukazkove, prazdny: !!v.data.cenik.prazdny,
           proj: !!(v.data.proj.cenik && v.data.proj.cenik.prazdny) };
});
zkus('uzamčená varianta si značku ponechá',
  znackaZam.ukazkove === true && znackaZam.prazdny === true && znackaZam.proj === true,
  JSON.stringify(znackaZam));
zkus('a nehlásí se jako změna', znackaZam.zmen === 0, String(znackaZam.zmen));

zkus('konzole je čistá', chyby.length === 0);
if (chyby.length) chyby.slice(0, 5).forEach(c => console.log('     ! ' + c));

await prohlizec.close();
console.log('\n' + ok + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
