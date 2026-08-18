/* ========== SLOŽKOVÁ DATABÁZE ZAKÁZEK – prohlížečová část ==========
 *
 * Model (jména souborů, rejstřík, hledání, pojistka na uzamčené nabídky)
 * je v uloziste.js a testuje se v Node. Tady je to, co v Node otestovat
 * nejde: File System Access API, tedy skutečný výběr složky a zápis na
 * disk. Sondy i zkušební stránka na uživatelově počítači potvrdily, že
 * to funguje i při spuštění dvojklikem (file://) a že si prohlížeč
 * vybranou složku pamatuje i po restartu.
 *
 * PROČ SE SLOŽKA UKLÁDÁ DO IndexedDB A NE DO localStorage:
 * odkaz na složku (handle) není text, je to objekt. localStorage umí jen
 * řetězce, IndexedDB umí strukturovaná data – a jen díky tomu se složka
 * vybírá jednou, ne při každém spuštění.
 *
 * PROČ SE NEUKLÁDÁ PO KAŽDÉ ZMĚNĚ:
 * měření na skutečném Disku Google dalo 270–390 ms na jeden zápis. Po
 * každém úhozu do klávesnice by aplikace zadrhávala. Ukládá se proto na
 * povel a k tomu automaticky po chvíli klidu (ULO_PRODLEVA).
 *
 * POJISTKA NA VYTIŠTĚNOU NABÍDKU (#34):
 * automatické ukládání je zápis bez zeptání. Než se soubor přepíše,
 * přečte se, co v něm je, a porovná se stav uzamčených variant. Kdyby
 * měla uzamčená nabídka zmizet nebo se změnit, zápis se neprovede a
 * rozsvítí se varování – nic se přitom neblokuje jinde v aplikaci.
 * =================================================================== */

const ULO_DB_NAZEV = 'kng_uloziste';
const ULO_DB_STORE = 'handles';
const ULO_DB_KLIC = 'slozka';
const ULO_PRODLEVA = 15000;      // klid v ms, po kterém se uloží samo

const ULO_STAV = {
  koren: null,        // FileSystemDirectoryHandle vybrané složky
  jmeno: '',          // název složky pro uživatele
  pripraveno: false,  // složka je vybraná a máme k ní právo zápisu
  rejstrik: [],
  soubor: '',         // pod jakým jménem je otevřená zakázka ve složce
  razitko: '',        // s jakým razítkem jsme ji odsud načetli
  posledni: '',       // JSON, který jsme naposledy zapsali (proti zbytečným zápisům)
  kdyUlozeno: null,   // čas posledního úspěšného zápisu (lišta z něj ukazuje „v HH:MM")
  auto: true,
  hledat: '',
  hlaska: '',
  hlaskaTyp: '',      // '' | 'varovani'
  pracuje: false,
  timer: null,
};

/* Rozhodnutí 18. 8. 2026 (#150): jediná databáze je ONLINE. Složka _DB se
 * už nepřipojuje — dvě databáze vedle sebe dvakrát způsobily „zmizelé" ceny
 * (složka měla přednost a zastínila novější online ceník). Vypínač drží
 * všechno složkové vypnuté: bez něj se nikdy nenastaví ULO_STAV.pripraveno,
 * takže karta, autoukládání, odlévání záloh i čtení ceníku ze složky mlčí.
 * Model v uloziste.js zůstává — jeho pojistky (zámky, kolize) sdílí i online
 * kanál. Případné úplné vyříznutí kódu je samostatný úklid na pokyn. */
const ULO_SLOZKA_POVOLENA = false;

function uloPodporovano() {
  return ULO_SLOZKA_POVOLENA
    && typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function uloZprava(text, typ) {
  ULO_STAV.hlaska = text || '';
  ULO_STAV.hlaskaTyp = typ || '';
}

/* ---------- zapamatovaná složka (IndexedDB) ---------- */

function uloDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB není k dispozici')); return; }
    const q = indexedDB.open(ULO_DB_NAZEV, 1);
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains(ULO_DB_STORE)) q.result.createObjectStore(ULO_DB_STORE); };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

function uloDbZapis(hodnota) {
  return uloDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(ULO_DB_STORE, 'readwrite');
    if (hodnota == null) t.objectStore(ULO_DB_STORE).delete(ULO_DB_KLIC);
    else t.objectStore(ULO_DB_STORE).put(hodnota, ULO_DB_KLIC);
    t.oncomplete = () => res(true);
    t.onerror = () => rej(t.error);
  }));
}

function uloDbCti() {
  return uloDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(ULO_DB_STORE, 'readonly');
    const q = t.objectStore(ULO_DB_STORE).get(ULO_DB_KLIC);
    q.onsuccess = () => res(q.result || null);
    q.onerror = () => rej(q.error);
  }));
}

/* ---------- oprávnění ---------- */

/* Prohlížeč se na právo k zápisu může znovu zeptat – typicky po restartu.
 * Zeptat se smí jen v reakci na kliknutí, proto se `tiche` volání spokojí
 * s tím, co už je uděleno, a jinak nechá složku odpojenou. */
function uloPravo(h, tiche) {
  if (!h || typeof h.queryPermission !== 'function') return Promise.resolve(true);
  const o = { mode: 'readwrite' };
  return h.queryPermission(o).then(stav => {
    if (stav === 'granted') return true;
    if (tiche || typeof h.requestPermission !== 'function') return false;
    return h.requestPermission(o).then(s => s === 'granted');
  });
}

/* ---------- soubory ve složce ---------- */

function uloCtiSoubor(jmeno) {
  if (!ULO_STAV.koren) return Promise.resolve(null);
  return ULO_STAV.koren.getFileHandle(jmeno)
    .then(fh => fh.getFile()).then(f => f.text())
    .catch(() => null);                       // soubor tam prostě není
}

function uloZapisSoubor(jmeno, text) {
  return ULO_STAV.koren.getFileHandle(jmeno, { create: true })
    .then(fh => fh.createWritable())
    .then(w => w.write(text).then(() => w.close()));
}

function uloSeznamSouboru() {
  const jmena = [];
  if (!ULO_STAV.koren) return Promise.resolve(jmena);
  const it = ULO_STAV.koren.entries();
  const dalsi = () => it.next().then(r => {
    if (r.done) return jmena;
    const [j, h] = r.value;
    if (h.kind === 'file' && uloJeZakazkovySoubor(j)) jmena.push(j);
    return dalsi();
  });
  return dalsi();
}

/* ---------- rejstřík ---------- */

function uloNactiRejstrik() {
  return uloCtiSoubor(ULO_REJSTRIK_SOUBOR).then(text => {
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
    ULO_STAV.rejstrik = uloRejstrikSerad(uloRejstrikNormalizuj(data));
    return ULO_STAV.rejstrik;
  });
}

function uloZapisRejstrik() {
  return uloZapisSoubor(ULO_REJSTRIK_SOUBOR,
    JSON.stringify({ schema: ULO_SCHEMA, zapsano: new Date().toISOString(),
                     zakazky: ULO_STAV.rejstrik }, null, 1));
}

/* Obnova rejstříku ze skutečných souborů. Potřeba jen výjimečně – když se
 * rejstřík ztratí, poškodí, nebo když do složky někdo nakopíruje zakázky
 * ručně. Čte VŠECHNY soubory, takže na Disku trvá desítky sekund; proto
 * je to výslovný krok, ne nic automatického. */
function uloPrestavRejstrik() {
  if (!ULO_STAV.koren) return Promise.resolve();
  ULO_STAV.pracuje = true; uloZprava('Přestavuji rejstřík – čte se každý soubor, chvíli to potrvá…'); renderUloziste();
  return uloSeznamSouboru().then(jmena => {
    let rej = [], chyb = 0;
    const krok = i => {
      if (i >= jmena.length) return rej;
      return uloCtiSoubor(jmena[i]).then(text => {
        try {
          const zak = StorageAdapter.importuj(text);
          rej = uloRejstrikSloucit(rej, uloRejstrikZaznam(zak, { soubor: jmena[i] }));
        } catch (e) { chyb++; }
        return krok(i + 1);
      });
    };
    return krok(0).then(() => {
      ULO_STAV.rejstrik = uloRejstrikSerad(rej);
      return uloZapisRejstrik().then(() => {
        uloZprava('Rejstřík přestavěn z ' + jmena.length + ' souborů'
          + (chyb ? ' – ' + chyb + ' se nepodařilo přečíst a do rejstříku se nedostaly.' : '.'),
          chyb ? 'varovani' : '');
      });
    });
  }).catch(e => uloZprava('Rejstřík se přestavět nepodařilo: ' + (e && e.message), 'varovani'))
    .then(() => { ULO_STAV.pracuje = false; renderUloziste(); });
}

/* ---------- výběr a odpojení složky ---------- */

function uloVyberSlozku() {
  if (!uloPodporovano()) {
    alert('Tenhle prohlížeč výběr složky neumí. Funguje v Chrome a Edge; ve Firefoxu a Safari zůstává ruční ukládání souborem.');
    return Promise.resolve(false);
  }
  return window.showDirectoryPicker({ mode: 'readwrite', id: 'kngZakazky' })
    .then(h => uloPravo(h).then(ok => {
      if (!ok) { uloZprava('Ke složce se nepodařilo získat právo zápisu.', 'varovani'); return false; }
      ULO_STAV.koren = h; ULO_STAV.jmeno = h.name; ULO_STAV.pripraveno = true;
      return uloDbZapis(h).catch(() => null)
        .then(() => uloNactiRejstrik())
        .then(() => progNactiZeSlozky())
        .then(() => nastdbNactiZeSlozky())
        .then(() => { uloZprava('Složka „' + h.name + '" je připojená – ' + ULO_STAV.rejstrik.length + ' zakázek v rejstříku.'); return true; });
    }))
    .catch(e => {
      // zavřený dialog není chyba, jen rozmyšlená volba
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return false;
      uloZprava('Složku se nepodařilo otevřít: ' + (e && e.message), 'varovani');
      return false;
    })
    .then(v => { render(); return v; });
}

/* Obnova po spuštění aplikace: bez ptaní, jen když právo pořád platí.
 * Když prohlížeč právo zapomněl, složka zůstane odpojená a v kartě se
 * ukáže tlačítko „Připojit znovu" – to už je kliknutí, na které se
 * prohlížeč zeptat smí. */
function uloObnovSlozku() {
  if (!uloPodporovano()) return Promise.resolve(false);
  return uloDbCti().then(h => {
    if (!h) return false;
    ULO_STAV.koren = h; ULO_STAV.jmeno = h.name || '';
    return uloPravo(h, true).then(ok => {
      ULO_STAV.pripraveno = ok;
      if (!ok) { uloZprava('Složka „' + ULO_STAV.jmeno + '" čeká na potvrzení přístupu.', 'varovani'); return false; }
      return uloNactiRejstrik().then(() => progNactiZeSlozky()).then(() => nastdbNactiZeSlozky()).then(() => true);
    });
  }).catch(() => false)
    .then(v => { if (typeof renderUloziste === 'function') renderUloziste(); renderZakazka(); return v; });
}

function uloPripojZnovu() {
  if (!ULO_STAV.koren) return uloVyberSlozku();
  return uloPravo(ULO_STAV.koren, false).then(ok => {
    ULO_STAV.pripraveno = ok;
    if (!ok) { uloZprava('Přístup ke složce nebyl povolen.', 'varovani'); render(); return false; }
    return uloNactiRejstrik().then(() => progNactiZeSlozky()).then(() => nastdbNactiZeSlozky())
      .then(() => { uloZprava('Složka „' + ULO_STAV.jmeno + '" je zase připojená.'); render(); return true; });
  });
}

/* Odpojení nic nemaže – jen se aplikace přestane do složky dívat. */
function uloOdpojSlozku() {
  if (!confirm('Odpojit složku?\n\nNa disku se nic nesmaže ani nezmění, aplikace do ní jen přestane ukládat.')) return;
  ULO_STAV.koren = null; ULO_STAV.jmeno = ''; ULO_STAV.pripraveno = false;
  ULO_STAV.rejstrik = []; ULO_STAV.soubor = ''; ULO_STAV.razitko = ''; ULO_STAV.posledni = '';
  ULO_STAV.kdyUlozeno = null;
  uloDbZapis(null).catch(() => null);
  // ceník se vrátí na ten ze sestavení – bez složky k němu aplikace nemá zdroj
  if (typeof progOdpoj === 'function') progOdpoj();
  // nastavení naopak zůstává v paměti – jen se přestane ukládat
  if (typeof nastdbOdpoj === 'function') nastdbOdpoj();
  uloZprava('Složka odpojena. Na disku zůstalo všechno beze změny.');
  render();
}

/* ---------- uložení zakázky do složky ---------- */

/* opts.tiche = automatické uložení (nikdy se neptá, při pochybnosti neuloží)
 * opts.jinakoJmeno = uložit pod jménem odvozeným z dnešního čísla zakázky */
function uloUlozDoSlozky(opts) {
  opts = opts || {};
  // #41: rozepsané změny se do protokolu dopíšou hned, ne až za chvilku –
  // uložený soubor tak nese protokol k okamžiku uložení a po zápisu už se
  // do zakázky nic nedoplňuje (jinak by se ukládalo znovu a znovu dokola).
  if (typeof protokolZapisTed === 'function') protokolZapisTed();
  if (!ULO_STAV.koren || !ULO_STAV.pripraveno) {
    if (!opts.tiche) uloZprava('Nejdřív je potřeba vybrat složku.', 'varovani');
    return Promise.resolve(false);
  }
  const jmeno = (opts.tiche && ULO_STAV.soubor) ? ULO_STAV.soubor : uloJmenoSouboru(ZAK);
  ULO_STAV.pracuje = true;

  return uloCtiSoubor(jmeno).then(text => {
    let naDisku = null;
    if (text) { try { naDisku = JSON.parse(text); } catch (e) { naDisku = null; } }

    // 1) pojistka na vytištěné (odeslané) nabídky – ta platí vždycky
    const k = uloKontrolaZamku(naDisku, ZAK);
    if (!k.ok) {
      uloZprava('Neuloženo do složky: v souboru ' + jmeno + ' by se změnila odeslaná nabídka – '
        + k.problemy.map(uloProblemPopis).join('; ')
        + '. Uložte zakázku jako soubor (JSON) a rozdíl si nejdřív prohlédněte.', 'varovani');
      return false;
    }

    // 2) mezitím do souboru zapsal někdo jiný
    const kol = uloKolize(naDisku, ULO_STAV.razitko);
    if (naDisku && kol.kolize) {
      if (opts.tiche) {
        uloZprava('Neuloženo automaticky: soubor ' + jmeno + ' se mezitím ve složce změnil. '
          + 'Uložte ručně tlačítkem – zeptám se, co s tím.', 'varovani');
        return false;
      }
      if (!confirm('Soubor ' + jmeno + ' se ve složce mezitím změnil'
        + (kol.naDisku ? ' (naposledy ' + kol.naDisku.slice(0, 16).replace('T', ' ') + ')' : '')
        + '.\n\nOK = přepsat tím, co mám otevřené\nZrušit = nechat soubor na disku být')) return false;
    }

    // 3) vlastní zápis
    const razitko = uloRazitkoNove();
    ZAK.uloRazitko = razitko;
    const text2 = StorageAdapter.exportuj(ZAK);
    return uloZapisSoubor(jmeno, text2).then(() => {
      const stary = ULO_STAV.soubor;
      ULO_STAV.soubor = jmeno; ULO_STAV.razitko = razitko; ULO_STAV.posledni = JSON.stringify(ZAK);
      ULO_STAV.kdyUlozeno = new Date();
      ULO_STAV.rejstrik = uloRejstrikSerad(
        uloRejstrikSloucit(ULO_STAV.rejstrik, uloRejstrikZaznam(ZAK, { soubor: jmeno, razitko })));
      return uloZapisRejstrik().then(() => {
        const prejmenovano = stary && stary !== jmeno;
        uloZprava('Uloženo do složky jako ' + jmeno + ' (' + new Date().toLocaleTimeString('cs-CZ') + ')'
          + (prejmenovano ? ' – dřívější soubor ' + stary + ' zůstal ve složce, smazat ho můžete v seznamu zakázek.' : '.'),
          prejmenovano ? 'varovani' : '');
        if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
        /* Zakázka leží ve složce – nouzová záloha v prohlížeči je odbytá. */
        if (typeof historieZalohaHotovo === 'function') historieZalohaHotovo();
        return true;
      });
    });
  }).catch(e => { uloZprava('Uložení do složky selhalo: ' + (e && e.message)
      + ' Zakázka zůstává otevřená – uložte ji ručně tlačítkem „Uložit do souboru (JSON)"'
      + ' v záložce Přehled cenových nabídek a soubor si odložte, než se složka vzpamatuje.', 'varovani'); return false; })
    .then(v => { ULO_STAV.pracuje = false; render(); return v; });
}

/* ---------- otevření zakázky ze složky ---------- */

/* Srovnání otevřené zakázky s ceníkem, který právě platí (zadání 31. 7. 2026).
 * Zakázka mohla ve složce ležet měsíc a ceník se mezitím dvakrát změnil;
 * kdo ji otevře a odešle, nesmí počítat z cen, které už neplatí. Rozhodnutí,
 * čeho se to týká, je v `cenikPrepoctiRozpracovane` – zamčené (vytištěné)
 * varianty se nedotkne a varianta s dohodnutými cenami se vynechá.
 * Nová hodnota `ULO_STAV.posledni` se schválně NEnastavuje: přepočet je proti
 * souboru na disku změna a autosave ji má uložit. */
function uloSrovnejSPlatnymCenikem() {
  if (typeof cenikPrepoctiRozpracovane !== 'function'
    || typeof cenikDnesniData !== 'function'
    || typeof ZAK === 'undefined' || !ZAK) return null;
  const info = (typeof progPlatnaVerzeInfo === 'function')
    ? progPlatnaVerzeInfo() : { verze: null, platnoOd: '' };
  const r = cenikPrepoctiRozpracovane(ZAK, cenikDnesniData(), Object.assign(
    { build: (typeof buildVerze === 'function') ? buildVerze() : '' }, info));
  /* Srovnaná značka je taky změna: zakázka spočítaná bez připojené složky si
   * v ceníku varianty nese „nejsou to ostrá data" a po otevření nad platným
   * ceníkem by jinak dál svítila červená lišta a dokument by byl zablokovaný. */
  if ((r.prepocteno || r.orazitkovano || r.znacky) && typeof syncVarianta === 'function') syncVarianta();
  return r;
}

/* Věta do lišty. Mlčet o přepočtu by znamenalo, že se čísla v otevřené
 * nabídce změnila a nikdo neví proč. */
function uloPrepocetVeta(r) {
  if (!r || !r.prepocteno) return '';
  const kolik = r.prepocteno === 1 ? '1 rozpracovaná varianta'
    : (r.prepocteno < 5 ? r.prepocteno + ' rozpracované varianty'
                        : r.prepocteno + ' rozpracovaných variant');
  let t = kolik + ' přepočítána na ceník, který platí dnes';
  if (r.zmen) t += ' (' + r.zmen + (r.zmen === 1 ? ' změněná cena' :
    (r.zmen < 5 ? ' změněné ceny' : ' změněných cen')) + ')';
  t += '.';
  if (r.zamcene) t += ' Vytištěné nabídky (' + r.zamcene + ') zůstávají beze změny.';
  if (r.dohodnute) t += ' Varianty s dohodnutými cenami (' + r.dohodnute + ') se nepřepočítávají.';
  return t;
}

function uloOtevriZeSlozky(soubor) {
  if (!ULO_STAV.koren) return Promise.resolve(false);
  if (typeof historieNeulozeno === 'function' && historieNeulozeno()
      && !confirm('Otevřená zakázka má neuložené změny. Otevřít jinou a ty změny zahodit?')) return Promise.resolve(false);

  ULO_STAV.pracuje = true; renderUloziste();
  return uloCtiSoubor(soubor).then(text => {
    if (text == null) throw new Error('soubor se nepodařilo přečíst');
    const zak = StorageAdapter.importuj(text);
    ZAK = zak; syncVarianta();
    ULO_STAV.soubor = soubor;
    ULO_STAV.razitko = uloRazitko(zak);
    ULO_STAV.posledni = JSON.stringify(ZAK);
    ULO_STAV.kdyUlozeno = null;
    if (typeof seznamReset === 'function') seznamReset();
    /* Zakázka ze složky se otevírá s platným ceníkem: rozpracované varianty
     * se srovnají s tím, co platí dnes (zadání 31. 7. 2026). Uzamčené
     * (vytištěné) se nedotkne – ty musí zůstat ve stavu vytištění.
     * Děje se to hned po načtení, ještě před renderem, aby uživatel neviděl
     * ani vteřinu ceny, se kterými se dál nepočítá. */
    const prep = uloSrovnejSPlatnymCenikem();
    uloZprava('Otevřeno ze složky: ' + soubor + '.'
      + (prep && prep.prepocteno ? ' ' + uloPrepocetVeta(prep) : ''));
    zavriUloziste();
    render();
    if (typeof historieOznacUlozeno === 'function') historieOznacUlozeno();
    if (prep && prep.prepocteno && typeof nabidkaStavTextBezpecne === 'function') {
      nabidkaStavTextBezpecne(uloPrepocetVeta(prep));
    } else if (typeof cenikPrehledAkt === 'function') {
      const p = cenikPrehledAkt();
      if (p && p.varovat && typeof nabidkaStavTextBezpecne === 'function')
        nabidkaStavTextBezpecne(cenikVarovaniText(p) + ' Rozdíly a přepočet najdete na záložce Ceník.');
    }
    return true;
  }).catch(e => { uloZprava('Zakázku se nepodařilo otevřít: ' + (e && e.message), 'varovani'); renderUloziste(); return false; })
    .then(v => { ULO_STAV.pracuje = false; return v; });
}

/* ---------- smazání ----------
 * Nic se nemaže bez dotazu a mazat smí jen správce: ve složce jsou
 * odeslané nabídky a smazaný soubor na Disku Google nikdo z aplikace
 * nevrátí. */
function uloSmazZeSlozky(soubor) {
  if (!ULO_STAV.koren) return;
  if (!smiZobrazit('uloziste.mazani')) { uloZprava('Mazat zakázky ze složky smí jen správce.', 'varovani'); renderUloziste(); return; }
  if (!confirm('Smazat soubor ' + soubor + ' ze složky?\n\nSmaže se skutečný soubor na disku a z aplikace ho nelze vrátit.')) return;
  ULO_STAV.koren.removeEntry(soubor)
    .then(() => {
      ULO_STAV.rejstrik = uloRejstrikOdeber(ULO_STAV.rejstrik, soubor);
      if (ULO_STAV.soubor === soubor) { ULO_STAV.soubor = ''; ULO_STAV.razitko = ''; }
      return uloZapisRejstrik().then(() => uloZprava('Soubor ' + soubor + ' byl ze složky smazán.'));
    })
    .catch(e => uloZprava('Smazat se nepodařilo: ' + (e && e.message), 'varovani'))
    .then(() => renderUloziste());
}

/* ---------- automatické ukládání ---------- */

function uloAutoPrepni(zap) {
  ULO_STAV.auto = !!zap;
  if (!ULO_STAV.auto && ULO_STAV.timer) { clearTimeout(ULO_STAV.timer); ULO_STAV.timer = null; }
  renderZakazka();
}

/* Volá se na konci každého render(). Musí být levné: porovná se jen text
 * zakázky proti tomu, co je zapsané, a naplánuje se zápis po klidu. */
function uloTik() {
  /* Brána je stejná jako u online kanálu (onlineTik) a ze stejného důvodu:
   * do 4. 8. 2026 se samo ukládalo jen to, co už ve složce jednou leželo,
   * takže nová zakázka se do složky nikdy sama nedostala. Nově stačí
   * vyplněná hlavička; „bez-cisla-…" tím ve složce nevznikne. */
  if (!ULO_STAV.auto || !ULO_STAV.pripraveno || ULO_STAV.pracuje) return;
  if (!ULO_STAV.soubor && !uloHlavickaVyplnena(ZAK)) return;
  let text = '';
  try { text = JSON.stringify(ZAK); } catch (e) { return; }
  if (text === ULO_STAV.posledni) return;
  if (ULO_STAV.timer) clearTimeout(ULO_STAV.timer);
  ULO_STAV.timer = setTimeout(() => {
    ULO_STAV.timer = null;
    uloUlozDoSlozky({ tiche: true });
  }, ULO_PRODLEVA);
}

/* ---------- karta na záložce Zakázka ---------- */

function uloStavPopis() {
  if (!uloPodporovano())
    return 'Tenhle prohlížeč ukládání do složky neumí (funguje v Chrome a Edge). Zakázky se ukládají souborem.';
  if (!ULO_STAV.koren) return 'Složka zatím není vybraná – zakázky se ukládají jen ručně jako soubor.';
  if (!ULO_STAV.pripraveno) return 'Složka „' + ULO_STAV.jmeno + '" je zapamatovaná, ale prohlížeč čeká na potvrzení přístupu.';
  const n = ULO_STAV.rejstrik.length;
  return 'Složka „' + ULO_STAV.jmeno + '" · ' + n + ' '
    + (n === 1 ? 'zakázka' : (n >= 2 && n < 5 ? 'zakázky' : 'zakázek'))
    + ' · otevřeno: ' + (ULO_STAV.soubor || 'zatím neuloženo do složky');
}

function renderUlozisteKarta() {
  if (!ULO_SLOZKA_POVOLENA) return '';   // #150: složka skončila, karta se nekreslí
  const zap = ULO_STAV.pripraveno;
  const tlacitka = !uloPodporovano() ? ''
    : !ULO_STAV.koren
      ? `<button class="primary" onclick="uloVyberSlozku()">Vybrat složku</button>`
      : (!zap
        ? `<button class="primary" onclick="uloPripojZnovu()">Připojit složku znovu</button>
           <button onclick="uloOdpojSlozku()">Odpojit</button>`
        : `<button class="primary" onclick="uloUlozDoSlozky()">Uložit do složky</button>
           <button onclick="otevriUloziste()">Zakázky ve složce…</button>
           <button onclick="uloVyberSlozku()">Změnit složku</button>
           <button onclick="uloOdpojSlozku()">Odpojit</button>`);

  return card('Databáze zakázek (složka)',
    `<div class="note" style="margin-top:0">${esc(uloStavPopis())}</div>
     ${ULO_STAV.hlaska ? `<div class="${ULO_STAV.hlaskaTyp === 'varovani' ? 'seznam-varovani' : 'seznam-prazdno'}">${esc(ULO_STAV.hlaska)}</div>` : ''}
     <div class="btns" style="margin-top:10px">${tlacitka}</div>
     ${zap ? `<div class="row" style="margin-top:10px"><label>Ukládat samo po chvíli klidu</label>
        <input type="checkbox" ${ULO_STAV.auto ? 'checked' : ''} onchange="uloAutoPrepni(this.checked)"><span class="u"></span></div>` : ''}
     <div class="note">Jedna zakázka = jeden soubor JSON ve zvolené složce; vedle nich leží rejstřík
       <code>${esc(ULO_REJSTRIK_SOUBOR)}</code> se stručnými údaji, aby se seznam zakázek nemusel prokousávat
       všemi soubory. Když složka leží na Disku Google, zálohuje a synchronizuje se sama.
       <b>Vytištěná (odeslaná) nabídka se nikdy nepřepíše</b> – kdyby se v souboru měla změnit,
       zápis se neprovede a ukáže se varování.</div>`);
}

/* ---------- panel „Zakázky ve složce" ---------- */

function otevriUloziste() {
  renderUloziste();
  const o = document.getElementById('uloziste-overlay');
  if (o) o.style.display = 'flex';
  const h = document.getElementById('ulozisteHledat');
  if (h) h.focus();
}

function zavriUloziste() {
  const o = document.getElementById('uloziste-overlay');
  if (o) o.style.display = 'none';
}

function ulozisteOtevreno() {
  const o = document.getElementById('uloziste-overlay');
  return !!(o && o.style.display !== 'none');
}

function ulozisteHledatSet(val) {
  ULO_STAV.hledat = val;
  renderUlozisteTelo();
}

function ulozisteRadekHtml(z) {
  const otevrena = z.soubor === ULO_STAV.soubor;
  const odeslane = z.odeslane ? `<span title="odeslané (vytištěné) nabídky">🔒 ${z.odeslane}</span>` : '';
  return `<tr class="${otevrena ? 'aktivni' : ''}">
    <td style="text-align:left">${esc(z.cislo || '(bez čísla)')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.nazevAkce || '—')}</td>
    <td style="text-align:left;white-space:normal">${esc(z.objednatel || '—')}</td>
    <td>${esc(z.datum || '')}</td>
    <td>${z.variant}</td>
    <td>${odeslane}</td>
    <td>${esc((z.upraveno || '').slice(0, 16).replace('T', ' '))}</td>
    <td><button class="mini" onclick="uloOtevriZeSlozky('${escJs(z.soubor)}')">Otevřít</button>${
      smiZobrazit('uloziste.mazani') ? `<button class="mini" onclick="uloSmazZeSlozky('${escJs(z.soubor)}')">Smazat</button>` : ''}</td>
  </tr>`;
}

function renderUlozisteTelo() {
  const el = document.getElementById('ulozisteTelo');
  if (!el) return;
  const radky = uloHledej(ULO_STAV.rejstrik, ULO_STAV.hledat);
  el.innerHTML = radky.length
    ? `<table class="vartbl archtbl">
        <tr><th style="text-align:left">Číslo</th><th style="text-align:left">Akce</th>
            <th style="text-align:left">Objednatel</th><th>Datum</th><th>Variant</th>
            <th>Odesláno</th><th>Uloženo</th><th></th></tr>
        ${radky.map(ulozisteRadekHtml).join('')}</table>`
    : `<div class="seznam-prazdno">${ULO_STAV.rejstrik.length
        ? 'Hledání „' + esc(ULO_STAV.hledat) + '" nic nenašlo. Hledá se v čísle, názvu akce i objednateli.'
        : 'Ve složce zatím není žádná zakázka. Uložte tu otevřenou tlačítkem „Uložit do složky", nebo přestavte rejstřík, pokud jste do složky soubory nakopírovali ručně.'}</div>`;
  const p = document.getElementById('ulozistePocet');
  if (p) p.textContent = radky.length + ' z ' + ULO_STAV.rejstrik.length;
}

function renderUloziste() {
  const el = document.getElementById('uloziste-panel');
  if (!el) return;
  el.innerHTML = `<h2>Zakázky ve složce
      <span class="note" style="font-weight:400">${esc(ULO_STAV.jmeno || 'složka není vybraná')}</span>
      <button class="mini" style="margin-left:auto" onclick="zavriUloziste()">Zavřít</button></h2>
    <div class="body">
      <div class="seznam-ovladani">
        <input type="text" class="seznam-hledat" id="ulozisteHledat" placeholder="Hledat číslo, akci, objednatele…"
               value="${esc(ULO_STAV.hledat)}" oninput="ulozisteHledatSet(this.value)">
        <span class="note" id="ulozistePocet"></span>
        <span class="sp"></span>
        ${smiZobrazit('uloziste.mazani') ? `<button class="mini" onclick="uloPrestavRejstrik()" ${ULO_STAV.pracuje ? 'disabled' : ''}>Přestavět rejstřík</button>` : ''}
      </div>
      ${ULO_STAV.hlaska ? `<div class="${ULO_STAV.hlaskaTyp === 'varovani' ? 'seznam-varovani' : 'seznam-prazdno'}">${esc(ULO_STAV.hlaska)}</div>` : ''}
      <div id="ulozisteTelo"></div>
      <div class="note">Seznam se čte z rejstříku, ne ze samotných zakázek – proto je rychlý i tehdy,
        když složka leží na Disku Google. Zakázka se otevře celá až kliknutím na <b>Otevřít</b>.
        Rejstřík záměrně nedrží žádné ceny: cena je vždycky výsledek výpočtu nad ceníkem varianty.</div>
      <div class="note">Přestavět rejstřík je potřeba jen tehdy, když do složky přibyly soubory mimo
        aplikaci nebo se rejstřík poškodil. Čte se při tom každý soubor, takže to chvíli trvá.</div>
    </div>`;
  renderUlozisteTelo();
}

/* Spuštění: stejná úvaha jako u historieStart(). Voláme hned při načtení
 * souboru, ne až z render() – obnova je asynchronní (IndexedDB), takže
 * doběhne až po prvním vykreslení a sama si pak stránku překreslí. */
function ulozisteStart() {
  try { uloObnovSlozku(); } catch (e) { /* bez složky aplikace běží dál */ }
}
ulozisteStart();
