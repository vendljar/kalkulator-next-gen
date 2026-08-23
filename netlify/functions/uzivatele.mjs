/* Správa účtů. GET seznam a POST { akce } — kdo smí co:
 *   'zaloz'     { email, jmeno, titul, funkce, telefon, role, heslo }
 *                                              — nový účet         (jen Administrátor)
 *   'heslo'     { email, heslo }               — reset cizího hesla (jen Administrátor;
 *                rozhodnutí 3. 8. 2026: reset hesla dělá vždy administrátor)
 *   'role'      { email, role }                — změna role        (jen Administrátor)
 *   'aktivni'   { email, aktivni }             — zapnout/vypnout   (jen Administrátor)
 *   'mojeheslo' { stare, nove }                — VLASTNÍ heslo     (každý přihlášený)
 *   'profil'    { jmeno, titul, funkce, telefon [, email] }
 *                                              — údaje pod nabídku (svoje každý,
 *                                                cizí jen Administrátor)
 *   'podpis'    { obrazek [, email] }          — sken podpisu s razítkem (dtto)
 *   'archiv'    { email, archiv }              — odsunout účet do archivu (jen Administrátor)
 *   'prevod'    { email, na }                  — převést zakázky po kolegovi (jen Administrátor)
 *   'smaz'      { email [, i_se_zakazkami] }   — nevratné smazání účtu (jen Administrátor)
 *
 * Proč 'mojeheslo' vyžaduje staré heslo: relace je cookie. Kdyby stačila
 * cookie sama, kdokoli u odemčeného počítače by tiše změnil heslo a účet
 * ukradl. Se starým heslem změnu provede jen ten, kdo ho zná. Administrátorský
 * reset staré heslo nechce z principu — je pro případ, že se zapomnělo.
 *
 * Proč 'profil' a 'podpis' zvládne každý sám (5. 8. 2026, #145): telefon
 * a podpis se propisují do cenové nabídky. Kdyby je směl měnit jen správce,
 * v praxi by se neměnily vůbec — nikdo mu kvůli novému číslu psát nebude
 * a z nabídek by odcházel starý kontakt. Cizí profil ale nikdo přepsat
 * nesmí: s cizím podpisem by šla poslat nabídka jménem kolegy. */
import { uloziste, otiskHesla, hesloSedi, vyzadujRoli, json, ROLE, ADMIN_EMAIL,
         PODPIS_ULOZISTE, podpisZkontroluj } from '../lib/sdilene.mjs';

/* Text z formuláře: ořízne okolní mezery a nepustí dál román. Telefon se
 * jinak NEUPRAVUJE — každý si ho píše po svém („+420 602 590 945",
 * „602590945", klidně i s linkou — a do nabídky patří tak, jak ho zadal. */
const text = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);

/* Kniha smazaných účtů (akce 'smaz', 11. 8. 2026). Samostatné úložiště, ne
 * klíč v „uzivatele": seznam účtů i obě zálohy procházejí VŠECHNY klíče
 * úložiště účtů a co v nich najdou, považují za účet. Záznam o smazání
 * uložený mezi nimi by se tak vozil v zálohách jako podivný poloúčet bez
 * hesla a role. Takhle je stranou a nikomu nepřekáží. */
const SMAZANI_ULOZISTE = 'smazani';

/* Počet zakázek česky. „1 zakázku", „3 zakázky", „7 zakázek" — hláška, kterou
 * si správce přečte v okamžiku, kdy mu server smazání odmítne, má znít jako
 * věta, ne jako výpis z databáze. */
const zakazekSlovem = (n) => n + (n === 1 ? ' zakázku' : (n >= 2 && n <= 4 ? ' zakázky' : ' zakázek'));

/* Klíče zakázek, u kterých je daný účet podepsaný jako AUTOR (tj. „kdo to má
 * dnes na starost"). Poškozená zakázka se přeskočí — jedna vadná položka
 * nesmí zastavit celou akci, stejně jako u převodu. */
async function zakazkyAutora(sz, email) {
  const klice = (await sz.seznam('z/')) || [];
  const moje = [];
  for (const k of klice) {
    let zak = null;
    try { zak = await sz.cti(k); } catch (e) { zak = null; }
    if (zak && String(zak.autor || '').toLowerCase() === email) moje.push(k);
  }
  return moje;
}

export default async (req) => {
  const prihlaseni = await vyzadujRoli(req);            // nejdřív jen: kdo jsi?
  if (prihlaseni.chyba) return prihlaseni.chyba;
  const relace = prihlaseni.relace;
  const u = await uloziste('uzivatele');

  /* --- vlastní heslo: jediná akce dostupná bez role Administrátor --- */
  if (req.method === 'POST') {
    let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

    if (t.akce === 'mojeheslo') {
      const ucet = await u.cti(relace.email);
      if (!ucet) return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);
      if (!hesloSedi(String(t.stare || ''), ucet.heslo))
        return json({ ok: false, chyba: 'Staré heslo nesouhlasí.' }, 401);
      if (!t.nove || String(t.nove).length < 8)
        return json({ ok: false, chyba: 'Nové heslo musí mít aspoň 8 znaků.' }, 400);
      ucet.heslo = otiskHesla(t.nove);
      await u.zapis(relace.email, ucet);
      return json({ ok: true, email: ucet.email });
    }

    /* --- vlastní profil a podpis: svůj každý, cizí jen administrátor ---
     *
     * Chybějící `email` v těle znamená „můj účet". Když ho někdo pošle,
     * musí na cizí účet mít právo — a rozhoduje se podle role z databáze
     * (vyzadujRoli), ne podle cookie. */
    if (t.akce === 'profil' || t.akce === 'podpis') {
      const cil = String(t.email || relace.email).trim().toLowerCase();
      if (cil !== relace.email && relace.role !== 'Administrátor')
        return json({ ok: false, chyba: 'Cizí profil smí měnit jen administrátor.' }, 403);
      const u2 = await uloziste('uzivatele');
      const ucet = await u2.cti(cil);
      if (!ucet) return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);

      if (t.akce === 'profil') {
        /* Jmenovitě vypsaná políčka, žádné kopírování celého těla. Kdyby se
         * do účtu slil přijatý objekt, stačilo by k povýšení poslat vlastní
         * profil s polem `role` — a e-mail (klíč záznamu) by šlo přepsat
         * na cizí. Proto se přebírá jen to, co sem opravdu patří. */
        if ('jmeno' in t) ucet.jmeno = text(t.jmeno);
        if ('titul' in t) ucet.titul = text(t.titul, 40);
        if ('funkce' in t) ucet.funkce = text(t.funkce, 80);
        if ('telefon' in t) ucet.telefon = text(t.telefon, 40);
        await u2.zapis(cil, ucet);
        return json({ ok: true, email: ucet.email, jmeno: ucet.jmeno || '',
          titul: ucet.titul || '', funkce: ucet.funkce || '', telefon: ucet.telefon || '' });
      }

      const kontrola = podpisZkontroluj(t.obrazek);
      if (!kontrola.ok) return json({ ok: false, chyba: kontrola.chyba }, 400);
      const p = await uloziste(PODPIS_ULOZISTE);
      await p.zapis(cil, { obrazek: kontrola.obrazek, zmeneno: new Date().toISOString(),
        zmenil: relace.email });
      return json({ ok: true, email: cil, podpis: kontrola.obrazek ? 'uložen' : 'odebrán' });
    }

    /* --- všechno ostatní jen Administrátor --- */
    if (relace.role !== 'Administrátor')
      return json({ ok: false, chyba: 'K této akci je potřeba role: Administrátor.' }, 403);

    const email = String(t.email || '').trim().toLowerCase();
    if (!email) return json({ ok: false, chyba: 'Chybí e-mail.' }, 400);
    let ucet = await u.cti(email);

    if (t.akce === 'zaloz') {
      if (ucet) return json({ ok: false, chyba: 'Účet už existuje.' }, 400);
      if (!ROLE.includes(t.role)) return json({ ok: false, chyba: 'Neznámá role.' }, 400);
      if (!t.heslo || String(t.heslo).length < 8)
        return json({ ok: false, chyba: 'Heslo musí mít aspoň 8 znaků.' }, 400);
      ucet = { email, jmeno: text(t.jmeno), titul: text(t.titul, 40),
               funkce: text(t.funkce, 80), telefon: text(t.telefon, 40), role: t.role,
               heslo: otiskHesla(t.heslo), zalozen: new Date().toISOString(),
               zalozil: relace.email, aktivni: true };
    } else if (!ucet) {
      return json({ ok: false, chyba: 'Účet neexistuje.' }, 404);
    } else if (t.akce === 'heslo') {
      if (!t.heslo || String(t.heslo).length < 8)
        return json({ ok: false, chyba: 'Heslo musí mít aspoň 8 znaků.' }, 400);
      ucet.heslo = otiskHesla(t.heslo);
    } else if (t.akce === 'role') {
      if (!ROLE.includes(t.role)) return json({ ok: false, chyba: 'Neznámá role.' }, 400);
      if (email === ADMIN_EMAIL && t.role !== 'Administrátor')
        return json({ ok: false, chyba: 'Hlavnímu administrátorovi roli nesnižuj — zamkl by sis dveře.' }, 400);
      ucet.role = t.role;
    } else if (t.akce === 'aktivni') {
      if (email === ADMIN_EMAIL && t.aktivni === false)
        return json({ ok: false, chyba: 'Hlavní administrátorský účet nejde vypnout.' }, 400);
      ucet.aktivni = !!t.aktivni;
    } else if (t.akce === 'archiv') {
      /* Archivace (11. 8. 2026) — třetí stav vedle „zapnutý" a „vypnutý".
       *
       * Účet po odchodu kolegy se dnes vypne, ale zůstane v seznamu navždy.
       * Po roce je v něm víc bývalých než současných a správce v něm hledá.
       * Smazat ho přitom nejde: jeho jméno je podepsané pod odeslanými
       * nabídkami a pod rozhodnutími o slevách, a ta razítka musí zůstat
       * čitelná. Archiv je proto jen odsunutí z očí — účet se nemaže,
       * jen se nezobrazuje v běžném seznamu a nedá se jím přihlásit. */
      if (email === ADMIN_EMAIL && t.archiv)
        return json({ ok: false, chyba: 'Hlavní administrátorský účet nejde archivovat.' }, 400);
      ucet.archiv = !!t.archiv;
      if (ucet.archiv) {
        ucet.aktivni = false;          // archivovaný účet se nikdy nepřihlásí
        ucet.archivKdy = new Date().toISOString();
        ucet.archivKdo = relace.email;
      } else {
        delete ucet.archivKdy; delete ucet.archivKdo;
      }
    } else if (t.akce === 'prevod') {
      /* Převod zakázek po odcházejícím kolegovi (11. 8. 2026).
       *
       * Archivovat účet nestačí — práce po něm zůstane podepsaná jménem,
       * které už ve firmě není, a nikdo neví, na koho se s ní obrátit.
       * Tahle akce přepíše AUTORA zakázek na jiného, činného kolegu.
       *
       * Co se NEPŘEPISUJE: razítka na odeslaných nabídkách a podpisy pod
       * rozhodnutími o slevách. Ta říkají, kdo co tehdy udělal, a přepsat
       * je by znamenalo přepsat historii. Autor je „kdo to má dnes na
       * starost", ne „kdo to tehdy počítal". */
      const na = String(t.na || '').trim().toLowerCase();
      if (!na) return json({ ok: false, chyba: 'Chybí e-mail kolegy, na kterého se má převést.' }, 400);
      if (na === email) return json({ ok: false, chyba: 'Převádět na tentýž účet nedává smysl.' }, 400);
      const cil = await u.cti(na);
      if (!cil) return json({ ok: false, chyba: 'Cílový účet neexistuje.' }, 404);
      if (cil.aktivni === false || cil.archiv)
        return json({ ok: false, chyba: 'Převádět jde jen na činný účet — '
          + 'na vypnutý nebo archivovaný by se práce ztratila podruhé.' }, 400);

      const sz = await uloziste('zakazky');
      const klice = (await sz.seznam('z/')) || [];
      let prevedeno = 0, preskoceno = 0;
      for (const k of klice) {
        let zak = null;
        /* Jedna poškozená zakázka nesmí zastavit převod zbytku — správce by
         * netušil, kde skončil, a spustil by to znovu. */
        try { zak = await sz.cti(k); } catch (e) { zak = null; }
        if (!zak) { preskoceno++; continue; }
        if (String(zak.autor || '').toLowerCase() !== email) continue;
        zak.autor = na;
        try { await sz.zapis(k, zak); prevedeno++; } catch (e) { preskoceno++; }
      }
      /* Rejstřík se přestavuje ze zakázek, ne obráceně — aby v něm zůstal
       * jediný zdroj pravdy, přepíše se autor i v něm. */
      const rej = await sz.cti('_rejstrik');
      if (rej && Array.isArray(rej.zakazky)) {
        rej.zakazky.forEach((z) => {
          if (z && String(z.autor || '').toLowerCase() === email) z.autor = na;
        });
        await sz.zapis('_rejstrik', rej);
      }
      await u.zapis(email, ucet);
      return json({ ok: true, email, na, prevedeno, preskoceno });
    } else if (t.akce === 'smaz') {
      /* Smazání účtu (11. 8. 2026) — třetí akce v rodině vedle 'archiv'
       * a 'prevod', a jediná NEVRATNÁ. Archiv účet jen odsune z očí, převod
       * mu odebere práci; tohle ho odstraní z databáze nadobro.
       *
       * JAK SE MAŽE, KDYŽ ÚLOŽIŠTĚ MAZAT NEUMÍ
       * Naše obálka nad Netlify Blobs (lib/sdilene.mjs) nabízí jen `cti`,
       * `zapis` a `seznam` — odstranit klíč nejde. Účet se proto přepíše
       * NÁHROBKEM: na jeho klíč se zapíše prázdno (JSON null). Klíč v úložišti
       * zůstane, ale `cti` nad ním vrátí totéž co nad klíčem, který nikdy
       * neexistoval — a přesně o to jde. Všechna místa, kudy se účet čte,
       * se tím chovají správně bez jediné úpravy:
       *   · vyzadujRoli (lib/sdilene.mjs)  → `if (!ucet)` → 401, i s platnou
       *     cookie vydanou PŘED smazáním (relace žije 12 hodin, účet ne);
       *   · přihlášení (functions/prihlaseni.mjs) → `!!ucet` neprojde;
       *   · seznam účtů níž v tomhle souboru → `if (!x)` záznam přeskočí;
       *   · záloha ke stažení i noční otisk (functions/zaloha.mjs,
       *     lib/zalohovani.mjs) → obě mají `if (x)`, takže smazaný účet
       *     neputuje ani do zálohy a nevrátí se obnovou.
       * Kdo, kdy a kolik zakázek — to se zapíše do knihy smazaných účtů
       * (SMAZANI_ULOZISTE) stranou. Do samotného náhrobku to jít nemůže:
       * jakýkoli obsah by z něj udělal záznam, který někde projde jako účet.
       *
       * CO SE NEMAŽE A NEPŘEPISUJE
       * Razítka pod odeslanými nabídkami (`zamek.kdo`) a podpisy pod
       * rozhodnutími o slevách (`sleva.schvalil`, `sleva.zamitl`). Ta říkají,
       * kdo co TEHDY udělal, a přepsat je by znamenalo přepsat historii —
       * nabídka, kterou zákazník drží v ruce, by najednou byla ničí.
       * Až sem někdo za půl roku přijde „uklidit i tohle": nedělej to. */
      if (email === ADMIN_EMAIL)
        return json({ ok: false, chyba: 'Hlavní administrátorský účet smazat nejde — '
          + 'zamkli byste si tím dveře od vlastní databáze.' }, 400);
      if (email === relace.email)
        return json({ ok: false, chyba: 'Sám sebe smazat nemůžete. Ať vás smaže jiný '
          + 'administrátor — jinak byste se odřízli uprostřed práce.' }, 400);

      /* Zakázky napřed. Účet podepsaný pod prací se nesmí ztratit dřív, než
       * práce dostane nového hospodáře: jinak by zakázky zůstaly podepsané
       * e-mailem, který už neexistuje, a nikdo by nevěděl, čí jsou. */
      const sz = await uloziste('zakazky');
      const moje = await zakazkyAutora(sz, email);
      const iSeZakazkami = t.i_se_zakazkami === true;
      if (moje.length && !iSeZakazkami)
        return json({ ok: false, zakazek: moje.length,
          chyba: 'Účet ' + email + ' má na sobě ' + zakazekSlovem(moje.length)
            + '. Nejdřív je převeďte na jiného kolegu (akce „Převést zakázky"), '
            + 'jinak by zůstaly podepsané e-mailem, který už neexistuje.' }, 409);

      /* Přebití přepínačem `i_se_zakazkami`: účet zmizí, ale odkaz na sebe
       * po sobě nechat nesmí — autor se přepíše na PRÁZDNO, tedy „nikdo",
       * ne na adresu, která už nikomu nepatří. Tlačítko v prohlížeči na to
       * schválně není: kdo přepínač použije, musí ho poslat vědomě. */
      let odepsano = 0, preskoceno = 0;
      for (const k of moje) {
        let zak = null;
        try { zak = await sz.cti(k); } catch (e) { zak = null; }
        if (!zak) { preskoceno++; continue; }
        zak.autor = '';
        try { await sz.zapis(k, zak); odepsano++; } catch (e) { preskoceno++; }
      }
      if (odepsano) {
        const rej = await sz.cti('_rejstrik');
        if (rej && Array.isArray(rej.zakazky)) {
          rej.zakazky.forEach((z) => {
            if (z && String(z.autor || '').toLowerCase() === email) z.autor = '';
          });
          await sz.zapis('_rejstrik', rej);
        }
      }

      /* Podpis leží v samostatném úložišti (PODPIS_ULOZISTE), takže by
       * smazání účtu přežil. Sken podpisu s razítkem člověka, který
       * v aplikaci není, nemá na serveru co dělat — a kdyby se e-mail
       * jednou použil znovu, podepisoval by se jím někdo cizí. */
      try { await (await uloziste(PODPIS_ULOZISTE)).zapis(email, null); } catch (e) { /* podpis tam být nemusel */ }

      const kdy = new Date().toISOString();
      await (await uloziste(SMAZANI_ULOZISTE)).zapis(email,
        { email, smazano: true, kdy, kdo: relace.email, zakazek: odepsano });
      await u.zapis(email, null);          // náhrobek: klíč zůstane, účet ne
      return json({ ok: true, email, smazano: true, kdy, odepsano, preskoceno });
    } else {
      return json({ ok: false, chyba: 'Neznámá akce.' }, 400);
    }
    await u.zapis(email, ucet);
    return json({ ok: true, email: ucet.email, role: ucet.role, aktivni: ucet.aktivni !== false });
  }

  if (req.method !== 'GET') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  /* GET seznam — jen Administrátor (seznam kolegů s rolemi je interní údaj) */
  if (relace.role !== 'Administrátor')
    return json({ ok: false, chyba: 'K této akci je potřeba role: Administrátor.' }, 403);
  const klice = await u.seznam();
  const out = [];
  for (const k of klice) {
    const x = await u.cti(k);
    /* Políčka se vypisují jmenovitě: záznam nese i scrypt otisk hesla
     * a rozesílat ho do prohlížeče nemá důvod. Podpis tu schází schválně —
     * je to pár set kilobajtů na účet a seznam se načítá při každém otevření
     * správy účtů; kdo ho chce vidět, otevře profil konkrétního kolegy. */
    /* `hlavni` posílá server (#95, 9. 8. 2026). Do té doby si prohlížeč
     * porovnával e-mail s adresou napsanou v `online_ui.js` — takže adresa
     * hlavního administrátora byla ve zdrojácích dvakrát a při změně na
     * serveru by se aplikace začala chovat jinak než server. */
    /* Smazaný účet do seznamu nepatří vůbec. `!x` chytí náhrobek (na klíči
     * smazaného účtu leží prázdno — viz akce 'smaz'); `x.smazano` je tu
     * navíc pro případ, že by někdo někdy zapsal náhrobek s obsahem. Lepší
     * dvě podmínky navíc než smazaný kolega zpátky v tabulce. */
    if (x && !x.smazano) out.push({ email: x.email, jmeno: x.jmeno, titul: x.titul || '',
      funkce: x.funkce || '', telefon: x.telefon || '',
      role: x.role, aktivni: x.aktivni !== false, hlavni: x.email === ADMIN_EMAIL,
      archiv: !!x.archiv, archivKdy: String(x.archivKdy || '') });
  }
  return json({ ok: true, uzivatele: out });
};
export const config = { path: '/api/uzivatele' };
