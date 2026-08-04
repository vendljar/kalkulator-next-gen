/* Správa účtů. GET seznam a POST { akce } — kdo smí co:
 *   'zaloz'     { email, jmeno, role, heslo }  — nový účet         (jen Administrátor)
 *   'heslo'     { email, heslo }               — reset cizího hesla (jen Administrátor;
 *                rozhodnutí 3. 8. 2026: reset hesla dělá vždy administrátor)
 *   'role'      { email, role }                — změna role        (jen Administrátor)
 *   'aktivni'   { email, aktivni }             — zapnout/vypnout   (jen Administrátor)
 *   'mojeheslo' { stare, nove }                — VLASTNÍ heslo     (každý přihlášený)
 *
 * Proč 'mojeheslo' vyžaduje staré heslo: relace je cookie. Kdyby stačila
 * cookie sama, kdokoli u odemčeného počítače by tiše změnil heslo a účet
 * ukradl. Se starým heslem změnu provede jen ten, kdo ho zná. Administrátorský
 * reset staré heslo nechce z principu — je pro případ, že se zapomnělo. */
import { uloziste, otiskHesla, hesloSedi, vyzadujRoli, json, ROLE, ADMIN_EMAIL } from '../lib/sdilene.mjs';

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
      ucet = { email, jmeno: String(t.jmeno || ''), role: t.role,
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
    if (x) out.push({ email: x.email, jmeno: x.jmeno, role: x.role, aktivni: x.aktivni !== false });
  }
  return json({ ok: true, uzivatele: out });
};
export const config = { path: '/api/uzivatele' };
