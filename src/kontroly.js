/* ============================================================
 * KONTROLA LOGICKÝCH CHYB PŘED NABÍDKOU (#33)
 *
 * Kalkulačka spočítá poslušně cokoli. Šachtu o jednom nástupišti, sklo bez
 * konstrukce, která by ho nesla, dveře širší než šachta, nabídku s prázdnou
 * hlavičkou. Ve výsledku to vypadá stejně důvěryhodně jako správný výpočet –
 * je to sloupec čísel a součet sedí. Chyba se pozná až u zákazníka.
 *
 * Tenhle modul je jedenáct otázek, které by položil zkušený kolega, kdyby se
 * podíval přes rameno těsně před odesláním. Nic víc. (Jedenáctá – kontrolní
 * číslice IČO – přibyla 30. 7. 2026 spolu s polem v hlavičce.)
 *
 * NIC SE NEBLOKUJE. Zadání z 30. 7. 2026 je v tomhle jednoznačné: „pouze
 * rozsviť varování před nabídkou". Všechna pravidla mají úroveň 2 –
 * upozornění. Důvod je praktický, ne měkký: tvrdá zábrana v cenotvorbě se
 * vždycky obejde (zadá se nesmysl o kus vedle, jen aby aplikace pustila dál)
 * a od té chvíle hlídání nehlídá nic, zato mu nikdo nevěří. Varování, které
 * se dá odklepnout, se čte. Zábrana, která se dá obejít, se obchází.
 *
 * Kdo vidí čísla: stejné pravidlo jako u marže (#36) a KPI. Konkrétní částky
 * o nákladech a marži patří administrátorovi; běžný uživatel vidí, ŽE je něco
 * pod minimem, ne o kolik. Proto se text skládá ve dvou podobách a v té
 * nepodrobné nezůstane ani koruna. Varování ale vidět musí – nabídku posílá
 * právě on.
 *
 * Odklepnutí platí jen na to, co se odklepávalo (kontrolyPotvrzeniPlati).
 * Kdyby potvrzení umlčelo i problém, který přibyl potom, byla by to tichá
 * ztráta pojistky – a tichá ztráta je horší než žádná pojistka.
 *
 * Logika se nepřepisuje tam, kde už je: marže se ptá #36 (marze.js), slevy
 * #ZAK-10 (sleva.js), ukázkový ceník #40 (ukazkove.js), hlavička zakazka.js.
 * Dvě různá minima nebo dvě různé definice „schválené slevy" v jedné aplikaci
 * jsou horší než žádná kontrola: aplikace pak tvrdí dvě pravdy podle toho,
 * kdo se zeptá dřív.
 *
 * Modul je čistá logika bez DOM – panel je v ui/kontroly_ui.js.
 * ============================================================ */

/* Výchozí úroveň pravidel je 2 = varování: aplikace upozorní, člověk rozhodne.
 *
 * Úroveň 1 = tvrdá zábrana. Od 30. 7. 2026 ji nese JEDINÉ pravidlo –
 * `ukazkovyCenik` ve chvíli, kdy je ceník prázdný (samé nuly). Zadání zní
 * doslova: „S tím nabídka ven jít nesmí za žádnou cenu." Není to obrat
 * v přístupu, je to výjimka s jasným důvodem: u ostatních pravidel je co
 * vážit (sleva může být schválená, atyp promyšlený), zatímco nabídka za
 * nula korun není rozhodnutí, ale omyl. Odklepnout se nedá – potvrzení
 * na zábranu neplatí (viz kontrolyPotvrzeniPlati). */
const KONTROLY_UROVEN = 2;
const KONTROLY_UROVEN_ZABRANA = 1;

/* Výška dveřního otvoru v metrech. Není to volba téhle kontroly – engine.js
 * s ní počítá na dvou místech (opláštění dveří `2.3 * 2 + sirkaDveri`
 * a plocha světlíku `svetlaVyska - 2.3`). Kdyby se rozešla, kontrola by
 * hlídala jiný výtah, než se počítá. */
const KONTROLY_VYSKA_DVERI = 2.3;

/* Výčet do věty („šířka šachty, hloubka šachty a rozteč"). */
function kontrolyVyctem(pole) {
  const k = (pole || []).filter(Boolean);
  if (!k.length) return '';
  if (k.length === 1) return k[0];
  return k.slice(0, -1).join(', ') + ' a ' + k[k.length - 1];
}

/* Přehled marže se počítá nanejvýš jednou za běh – používají ho dvě pravidla
 * (K7 marže, K8 cena pod nákladem) a je to jediný kus, který sahá na peníze. */
function kontrolyMarze(ctx) {
  if (ctx.__marze !== undefined) return ctx.__marze;
  let p = ctx.marzePrehled || null;
  if (!p && typeof marzePrehled === 'function') {
    /* Zakázka jen projekce (2. 8. 2026): OCK se neprodává, takže jeho čísla
     * do marže nabídky nepatří — jinak by nepoužité zadání OCK tahalo celek. */
    try { p = marzePrehled(ctx.jenProj ? null : ctx.vysledek, ctx.projVysledek,
                           ctx.jenProj ? null : ctx.sleva, ctx.nast, ctx.zaokr,
                           /* PROJ má od 4. 8. 2026 vlastní zaokrouhlení; kontext
                            * bez něj se chová jako dřív (jedno pro obě části). */
                           ctx.zaokrProj === undefined ? ctx.zaokr : ctx.zaokrProj,
                           /* sleva projekce (#134) – vlastní, nikdy ne ta z OCK */
                           ctx.slevaProj); }
    catch (e) { p = null; }
  }
  try { ctx.__marze = p; } catch (e) { /* zmrazený kontext – nevadí */ }
  return p;
}

/* ---------- pravidla ----------
 * Pořadí je pořadí, ve kterém se nálezy ukazují. Je vědomé: nejdřív to, co je
 * špatně v zadání (a co tedy zneplatňuje všechna čísla pod tím), potom peníze,
 * a nakonec dvě věci, které se týkají odesílaného dokumentu.
 *
 * zjisti(ctx) vrací null (v pořádku) nebo { text, detail }.
 *   text   – věta bez jediné částky; vidí ji každý,
 *   detail – doplněk s čísly; jen pro toho, kdo na náklady má právo. */
const KONTROLY = [
  {
    kod: 'rozmery', kde: 'Kalkulace OCK', nazev: 'Nesmyslný rozměr nebo počet',
    zjisti(ctx) {
      const z = ctx.zadani;
      if (!z) return null;
      /* Nula projde výpočtem bez chyby a udělá z kalkulace nesmysl, který
       * vypadá jako sleva – proto se hlídá kladnost, ne jen „je to číslo". */
      const kladne = [['zdvih', 'zdvih'], ['sirka', 'šířka šachty'], ['hloubka', 'hloubka šachty'],
        ['roztec', 'rozteč'], ['cistyVstupMm', 'čistý vstup'], ['sirkaRamuMm', 'šířka rámu'],
        ['rohoveSloupky', 'počet rohových sloupků']];
      /* Přejezd i prohlubeň smějí být nula (šachta bez jámy existuje). */
      const nezaporne = [['prejezd', 'přejezd'], ['prohluben', 'prohlubeň']];
      const spatne = [];
      kladne.forEach(([k, n]) => { const v = +z[k]; if (!isFinite(v) || v <= 0) spatne.push(n); });
      nezaporne.forEach(([k, n]) => { const v = +z[k]; if (!isFinite(v) || v < 0) spatne.push(n); });
      if (!spatne.length) return null;
      return { text: 'V zadání je rozměr nebo počet, který nedává smysl: '
        + kontrolyVyctem(spatne) + '. Čísla nad tím se z toho počítají dál.' };
    },
  },
  {
    kod: 'stanice', kde: 'Kalkulace OCK', nazev: 'Méně než dvě nástupiště',
    zjisti(ctx) {
      const z = ctx.zadani;
      if (!z) return null;
      const n = +z.nastupiste;
      if (isFinite(n) && n >= 2) return null;
      /* Výška podlaží se počítá jako zdvih/(nástupiště−1); při jednom
       * nástupišti se dělí nulou a odvozené rozměry přestanou dávat smysl. */
      return { text: 'Šachta má míň než dvě nástupiště. Z toho se nedá spočítat '
        + 'výška podlaží, takže odvozené rozměry v kalkulaci neplatí.' };
    },
  },
  {
    kod: 'vysky', kde: 'Kalkulace OCK', nazev: 'Výšky a šířky si odporují',
    zjisti(ctx) {
      const z = ctx.zadani;
      if (!z) return null;
      const o = (ctx.vysledek && ctx.vysledek.odvozene) || null;
      const n = +z.nastupiste;
      /* Výška šachty se NEPOROVNÁVÁ se součtem: engine.js ji jako součet
       * přejezdu, zdvihu a prohlubně přímo počítá, takže se rozejít nemůže.
       * Rozejít se dají dvě jiné věci, a na těch stojí montáž. */
      const svetla = o ? o.svetlaVyska
        : (isFinite(n) && n > 1 && isFinite(+z.zdvih) ? (+z.zdvih) / (n - 1) - 0.2 : null);
      const dvere = o ? o.sirkaDveri
        : ((+z.cistyVstupMm + 2 * (+z.sirkaRamuMm) + 40) / 1000);
      const potize = [];
      if (svetla != null && isFinite(svetla) && svetla < KONTROLY_VYSKA_DVERI)
        potize.push('světlá výška podlaží nestačí na dveřní otvor ' + KONTROLY_VYSKA_DVERI + ' m');
      if (isFinite(dvere) && +z.sirka > 0 && dvere > +z.sirka)
        potize.push('sestava dveří je širší než šachta');
      if (!potize.length) return null;
      return { text: 'Rozměry si odporují: ' + kontrolyVyctem(potize)
        + '. Vyrobit se to dá, postavit ne.' };
    },
  },
  {
    kod: 'oplasteniBezKonstrukce', kde: 'Kalkulace OCK', nazev: 'Opláštění bez konstrukce',
    zjisti(ctx) {
      const s = ctx.vysledek && ctx.vysledek.souctySekci;
      if (!s || !s.oplasteni || !s.hrubaOck) return null;
      if (!(s.oplasteni.sMarzi > 0) || s.hrubaOck.sMarzi > 0) return null;
      return { text: 'Nabídka obsahuje opláštění, ale žádnou nosnou konstrukci. '
        + 'Sklo a plechy nemá na čem viset.' };
    },
  },
  {
    kod: 'atypBezProjekce', kde: 'Kalkulace OCK', nazev: 'ATYP bez práce navíc',
    zjisti(ctx) {
      const z = ctx.zadani;
      if (!z || !z.atyp) return null;
      /* Přirážku za atyp přidá ceník sám. Co ceník neví, je práce navíc –
       * a ta se u atypu zapomíná nejčastěji, protože přirážka vypadá, že
       * už je v ceně všechno. */
      const navic = (+z.projekceAtypHod || 0) + (+z.montazAtypHod || 0)
        + (+z.zamecnikAtypKs || 0) + (+z.zamecnikAtypKc || 0);
      if (navic > 0) return null;
      return { text: 'Zakázka je označená jako atypická, ale nemá ani hodinu navíc '
        + 'na projekci, montáž nebo zámečnické práce. Přirážka z ceníku je něco jiného '
        + 'než odpracovaný čas.' };
    },
  },
  {
    /* Atypická práce bez ceny (#7). Nula v ceníku není cena, je to nevyplněné
     * políčko – ale ve sloupci se tváří úplně stejně jako skutečná nula
     * a v součtu po ní nezůstane stopa. Nabídka pak práci navíc rozdá zdarma
     * a přijde se na to až při fakturaci. Proto se ptáme jmenovitě.
     * Bez částek: běžný uživatel nákladové ceny nevidí (#36). */
    kod: 'atypBezCeny', kde: 'Kalkulace OCK', nazev: 'Atypická práce bez ceny',
    zjisti(ctx) {
      const h = ctx.vysledek && ctx.vysledek.sekce && ctx.vysledek.sekce.hrubaOck;
      if (!Array.isArray(h)) return null;
      const bez = h.filter(r => r && r.atyp && r.bezCeny).map(r => r.nazev || r.origNazev);
      if (!bez.length) return null;
      return { text: (bez.length === 1
        ? 'Atypická položka nemá cenu: '
        : 'Atypické položky nemají cenu: ') + kontrolyVyctem(bez)
        + '. Doplňte sazbu v ceníku (sekce ATYP), nebo položku ze zakázky odeberte – '
        + 'takhle se práce navíc udělá zadarmo.' };
    },
  },
  {
    kod: 'sleva', kde: 'Nabídka', nazev: 'Sleva mimo rozsah nebo bez schválení',
    zjisti(ctx) {
      if (ctx.jenProj) return null;   // ZAK-10 se počítá z ceny OCK; bez OCK není co hlídat
      const s = ctx.sleva;
      if (!s) return null;
      /* Na zadanou hodnotu, ne na výsledek: slevaVyhodnot() zápornou slevu
       * tiše ořízne na nulu, takže z jejího výstupu se překlep nepozná. */
      const p = +s.procenta;
      if (s.procenta !== '' && s.procenta != null && !isFinite(p))
        return { text: 'Sleva není číslo, takže se do nabídky nepromítne.' };
      if (p < 0)
        return { text: 'Sleva je zadaná záporně. Záporná sleva je přirážka a aplikace ji '
          + 'bere jako nulovou – v nabídce tedy žádná sleva nebude.' };
      if (p > 100)
        return { text: 'Sleva je vyšší než sto procent. Taková nabídka nedává smysl.' };
      if (!(p > 0)) return null;
      if (typeof slevaVyhodnot !== 'function') return null;
      const zaklad = ctx.vysledek && ctx.vysledek.souhrn ? ctx.vysledek.souhrn.zakladCena : 0;
      const naklad = ctx.vysledek && ctx.vysledek.souhrn ? ctx.vysledek.souhrn.zakladNaklad : 0;
      const nast = (ctx.nast && ctx.nast.slevy) || {};
      const v = slevaVyhodnot(zaklad, naklad, s, nast);
      const schvalena = s.stav === 'schváleno' || s.stav === 'schváleno automaticky';
      if (v.podMarzi && !schvalena)
        return { text: 'Sleva je tak velká, že by nabídku srazila pod firemní minimum marže; '
          + 'zůstává zamítnutá a do nabídky nevstoupí.' };
      if (v.nadStrop && !schvalena)
        return { text: 'Sleva je nad stropem role a nikdo ji zatím neschválil. '
          + 'Dokud schválená není, počítá se nabídka bez ní.' };
      return null;
    },
  },
  {
    kod: 'slevaProj', kde: 'Kalkulace PROJ', nazev: 'Sleva projekce mimo rozsah nebo bez schválení',
    zjisti(ctx) {
      /* Zrcadlo pravidla „sleva" nad projekční částí (#134, 12. 8. 2026).
       * Do té doby tu bylo pravidlo „slevaProjMax", které hlídalo jen horní
       * mez zrušeného pole „Globální sleva PROJ" — a nic víc, protože ta
       * sleva neměla ani strop podle role, ani schvalování. Teď má obojí,
       * takže se hlídá stejně jako sleva na výtahovou šachtu.
       *
       * Na rozdíl od OCK se pravidlo NEVYPÍNÁ u zakázky „jen projekce" —
       * tam je to naopak jediná sleva, která na nabídce je. */
      const s = ctx.slevaProj;
      if (!s) return null;
      /* Na zadanou hodnotu, ne na výsledek: slevaVyhodnot() zápornou slevu
       * tiše ořízne na nulu, takže z jejího výstupu se překlep nepozná. */
      const p = +s.procenta;
      if (s.procenta !== '' && s.procenta != null && !isFinite(p))
        return { text: 'Sleva projekce není číslo, takže se do nabídky nepromítne.' };
      if (p < 0)
        return { text: 'Sleva projekce je zadaná záporně. Záporná sleva je přirážka a aplikace ji '
          + 'bere jako nulovou – v nabídce tedy žádná sleva nebude.' };
      if (p > 100)
        return { text: 'Sleva projekce je vyšší než sto procent. Taková nabídka nedává smysl.' };
      if (!(p > 0)) return null;
      if (typeof slevaVyhodnot !== 'function') return null;
      const souhrn = ctx.projVysledek && ctx.projVysledek.souhrn ? ctx.projVysledek.souhrn : null;
      if (!souhrn) return null;
      const nast = (ctx.nast && ctx.nast.slevy) || {};
      const v = slevaVyhodnot(souhrn.celkem, souhrn.naklad + (souhrn.doprava || 0), s, nast);
      const schvalena = s.stav === 'schváleno' || s.stav === 'schváleno automaticky';
      if (v.podMarzi && !schvalena)
        return { text: 'Sleva projekce je tak velká, že by projekční část srazila pod firemní '
          + 'minimum marže; zůstává zamítnutá a do nabídky nevstoupí.' };
      if (v.nadStrop && !schvalena)
        return { text: 'Sleva projekce je nad stropem role a nikdo ji zatím neschválil. '
          + 'Dokud schválená není, počítá se nabídka projekce bez ní.' };
      return null;
    },
  },
  {
    kod: 'marze', kde: 'Nabídka', nazev: 'Marže pod firemním minimem',
    zjisti(ctx) {
      const p = kontrolyMarze(ctx);
      if (!p || !p.varovat) return null;
      /* Kde přesně to je, se dá říct beze jmen částek – názvy sekcí nejsou
       * citlivé, čísla ano. */
      const kde = (p.pod || []).map(s => s.nazev).filter(Boolean);
      const text = 'Marže je pod firemním minimem'
        + (kde.length ? ' (' + kontrolyVyctem(kde) + ')' : '') + '.';
      const detail = (typeof marzeText === 'function') ? marzeText(p, { cisla: true }) : '';
      return { text, detail };
    },
  },
  {
    kod: 'cenaPodNakladem', kde: 'Nabídka', nazev: 'Cena pod nákladem',
    zjisti(ctx) {
      const p = kontrolyMarze(ctx);
      if (!p) return null;
      /* „Malá marže" a „prodělek" se v hlavě čtou jinak, i když je to jedna
       * stupnice – proto zvlášť, i za cenu, že obojí svítí najednou. */
      const vse = [p.ock, p.celek].concat(p.proj ? p.proj.sekce || [] : []);
      const ztrat = [], videno = {};
      vse.forEach(s => {
        if (!s || s.marze == null || !(s.marze < 0)) return;
        if (videno[s.nazev]) return;
        videno[s.nazev] = 1;
        ztrat.push(s);
      });
      if (!ztrat.length) return null;
      const detail = (typeof marzeKc === 'function')
        ? 'Chybí ' + ztrat.map(s => `${s.nazev}: ${marzeKc(s.naklad - s.cena)}`).join(', ') + '.'
        : '';
      return { text: 'Cena je pod nákladem (' + kontrolyVyctem(ztrat.map(s => s.nazev))
        + '). Na téhle zakázce se prodělá.', detail };
    },
  },
  {
    kod: 'ukazkovyCenik', kde: 'Nabídka', nazev: 'Ceník není ostrý',
    zabranaMozna: true,
    zjisti(ctx) {
      if (typeof ukazkoveStav !== 'function') return null;
      const s = ukazkoveStav({ cenik: ctx.cenik, cenikProj: ctx.cenikProj,
        slevy: ctx.nast && ctx.nast.slevy, firma: ctx.nast && ctx.nast.firma });
      if (!s.jsou) return null;
      /* Text se přebírá z #40, aby aplikace na dvou místech neříkala dvě
       * různé věty o téže věci. Prázdný ceník (samé nuly) je jediná tvrdá
       * zábrana v aplikaci – ostatní případy zůstávají varováním. */
      return {
        text: (typeof ukazkoveKratce === 'function') ? ukazkoveKratce(s)
          : 'Dokument je spočítaný z dat, která nejsou ostrá. Neposílejte ho zákazníkovi.',
        uroven: s.prazdne ? KONTROLY_UROVEN_ZABRANA : KONTROLY_UROVEN,
      };
    },
  },
  {
    kod: 'hlavicka', kde: 'Hlavička zakázky', nazev: 'Prázdná hlavička',
    zjisti(ctx) {
      const zak = ctx.zak;
      if (!zak) return null;
      /* IČO se tu záměrně NEVYŽADUJE, i když v hlavičce od 30. 7. 2026 je.
       * Nabídka odchází běžně dřív, než je objednatel potvrzený, a pravidlo,
       * které svítí u každé druhé zakázky, se za týden přestane číst. Jestli
       * je vyplněné IČO platné, hlídá samostatné pravidlo níž. */
      const pole = [['cislo', 'číslo nabídky'], ['nazevAkce', 'název akce'],
        ['objednatel', 'objednatel']];
      const vypln = (typeof hlavickaVyplneno === 'function')
        ? hlavickaVyplneno : v => String(v == null ? '' : v).trim() !== '';
      const chybi = pole.filter(([k]) => !vypln(zak[k])).map(([, n]) => n);
      if (!chybi.length) return null;
      return { text: 'V hlavičce zakázky chybí ' + kontrolyVyctem(chybi)
        + '. Na dokumentu zůstane prázdné místo.' };
    },
  },
  {
    /* IČO je jediný údaj, kterým se objednatel dá jednoznačně určit – název
     * firmy se píše pokaždé jinak. Právě proto se z něj opisuje do smlouvy
     * a do faktury, a právě proto se u něj překlep pozná až v účtárně.
     * Kontroluje se kontrolní číslice (modulo 11), ne délka: osmimístné číslo
     * s prohozenými ciframi vypadá jako IČO a přes kontrolu délky projde. */
    kod: 'ico', kde: 'Hlavička zakázky', nazev: 'IČO objednatele',
    zjisti(ctx) {
      const zak = ctx.zak;
      if (!zak || typeof icoPlatne !== 'function') return null;
      if (!icoVyplneno(zak.ico)) return null;   // prázdné IČO není chyba
      if (icoPlatne(zak.ico)) return null;
      return { text: 'IČO objednatele „' + String(zak.ico).trim() + '" neodpovídá '
        + 'kontrolní číslici – takové IČO neexistuje. Bývá to překlep nebo '
        + 'prohozené cifry; opisuje se do smlouvy i na fakturu.' };
    },
  },
];

/* Katalog pravidel bez funkcí – pro nápovědu, protokol o kalkulaci (#41)
 * a pro test, že se pravidlo nikam neztratilo. */
function kontrolyPravidla() {
  return KONTROLY.map(r => ({ kod: r.kod, kde: r.kde, nazev: r.nazev,
    uroven: KONTROLY_UROVEN,
    /* Jestli pravidlo umí zvednout ruku a dokument zastavit. Dnes jediné –
     * `ukazkovyCenik` při prázdném ceníku. V nápovědě i v protokolu má být
     * poznat, které pravidlo se dá odklepnout a které ne. */
    zabranaMozna: !!r.zabranaMozna }));
}

/* Projde všechna pravidla nad kontextem.
 * ctx = { zadani, vysledek, projZadani, projVysledek, cenik, cenikProj,
 *         sleva, nast, zak, zaokr, marzePrehled? }
 * Co v kontextu není, to se nehlídá – kontrola nad rozdělanou zakázkou nesmí
 * hlásit chybu jen proto, že se ještě nezadalo všechno. */
function kontrolyProved(ctx) {
  const nalezy = [];
  if (ctx && typeof ctx === 'object') {
    KONTROLY.forEach(r => {
      let v = null;
      /* Rozbité pravidlo nesmí vzít s sebou panel. Kontrola běží nad
       * rozdělaným zadáním, kde může chybět cokoli; kdyby jediné pravidlo
       * spadlo na nedefinované hodnotě, zhasla by i varování, která fungují –
       * a nikdo by si toho nevšiml. */
      /* Zakázka jen projekce: pravidla nad zadáním OCK mlčí (2. 8. 2026,
       * „někdy jí prodáváme zvlášť") — čistě projekční nabídka nesmí svítit
       * varováními o šachtě, kterou nikdo neprodává. */
      if (ctx && ctx.jenProj && r.kde === 'Kalkulace OCK') return;
      try { v = r.zjisti(ctx); } catch (e) { v = null; }
      if (!v) return;
      nalezy.push({ kod: r.kod, kde: r.kde, nazev: r.nazev,
        uroven: v.uroven || KONTROLY_UROVEN,
        text: v.text, detail: v.detail || '' });
    });
  }
  const zabrany = nalezy.filter(n => n.uroven === KONTROLY_UROVEN_ZABRANA);
  return { varovat: nalezy.length > 0, nalezy, kody: nalezy.map(n => n.kod),
           /* brani = dokument nesmí vzniknout. Odděleno od `varovat`, aby
            * volající nemusel prohledávat nálezy a nemohl na to zapomenout. */
           brani: zabrany.length > 0, kodyBrani: zabrany.map(n => n.kod),
           textBrani: zabrany.map(n => n.text).join(' ') };
}

/* Text pro člověka. opts.cisla = smí vidět částky (administrátor / KPI marže).
 * Bez té volby se nevypíše ani koruna – ale všechny nálezy zazní. */
function kontrolyText(vysl, opts) {
  const n = (vysl && vysl.nalezy) || [];
  if (!n.length) return '';
  const o = opts || {};
  return n.map(x => x.text + (o.cisla && x.detail ? ' ' + x.detail : '')).join(' ');
}

/* Odklepnutí („vím o tom, pokračovat"). Ukládá se k variantě, aby ho protokol
 * o kalkulaci (#41) uměl vypsat: kdo to viděl a co konkrétně odklepl. */
function kontrolyPotvrzeni(vysl, kdo, kdy) {
  const kody = ((vysl && vysl.nalezy) || []).map(n => n.kod).slice().sort();
  return {
    kdy: kdy || new Date().toISOString(),
    kdo: kdo || '',
    kody,
    pocet: kody.length,
  };
}

/* Platí potvrzení na TENHLE stav? Jen tehdy, když se od odklepnutí neobjevil
 * problém, který tam nebyl. Že jich mezitím ubylo, potvrzení neruší – to je
 * oprava, ne nový důvod k varování. */
function kontrolyPotvrzeniPlati(potvrzeni, vysl) {
  if (!potvrzeni || !Array.isArray(potvrzeni.kody)) return false;
  /* Zábranu (úroveň 1) odklepnout nejde. Kdyby šla, nebyla by to zábrana,
   * jen varování s tlačítkem navíc – a přesně tomu má u prázdného ceníku
   * zadání zabránit. */
  if (vysl && vysl.brani) return false;
  const ted = ((vysl && vysl.nalezy) || []).map(n => n.kod);
  return ted.every(k => potvrzeni.kody.indexOf(k) >= 0);
}

if (typeof module !== 'undefined')
  module.exports = { KONTROLY_UROVEN, KONTROLY_UROVEN_ZABRANA,
                     KONTROLY_VYSKA_DVERI, kontrolyVyctem,
                     kontrolyPravidla, kontrolyProved, kontrolyText,
                     kontrolyPotvrzeni, kontrolyPotvrzeniPlati };
