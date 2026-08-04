/* Správa účtů — jen Administrátor. GET seznam; POST { akce } :
 *   'zaloz'   { email, jmeno, role, heslo }   — nový účet
 *   'heslo'   { email, heslo }                — reset hesla (rozhodnutí 3. 8. 2026)
 *   'role'    { email, role }                 — změna role
 *   'aktivni' { email, aktivni }              — zapnout/vypnout účet */
import { uloziste, otiskHesla, vyzadujRoli, json, ROLE, ADMIN_EMAIL } from '../lib/sdilene.mjs';

export default async (req) => {
  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;
  const u = await uloziste('uzivatele');

  if (req.method === 'GET') {
    const klice = await u.seznam();
    const out = [];
    for (const k of klice) {
      const x = await u.cti(k);
      if (x) out.push({ email: x.email, jmeno: x.jmeno, role: x.role, aktivni: x.aktivni !== false });
    }
    return json({ ok: true, uzivatele: out });
  }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte GET nebo POST.' }, 405);

  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }
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
};
export const config = { path: '/api/uzivatele' };
