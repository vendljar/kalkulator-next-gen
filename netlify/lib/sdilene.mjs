/* ============================================================
 * SDÍLENÝ ZÁKLAD SERVEROVÝCH FUNKCÍ (online databáze, 4. 8. 2026)
 *
 * Úložiště: Netlify Blobs (trvalé, per-site). Pro lokální testy v Node
 * se použije zásuvná náhrada (globalThis.__TEST_ULOZISTE) — stejné API.
 *
 * Přihlášení: e-mail + heslo. Hesla se ukládají VÝHRADNĚ jako scrypt otisk
 * (sůl + hash, vestavěné node:crypto — žádné závislosti). Relace je podepsaná
 * HMAC kódem (TAJEMSTVI_RELACE z prostředí Netlify) v HttpOnly cookie.
 * Reset hesla provádí administrátor (rozhodnutí 3. 8. 2026) — žádný e-mail.
 *
 * První administrátor: vendl.jaroslav@engineers-cz.cz (rozhodnutí 3. 8. 2026).
 * Účet vznikne prvním přihlášením s heslem z proměnné ADMIN_INIT_HESLO,
 * kterou si uživatel nastaví v Netlify (heslo nikdy neputuje přes konverzaci
 * ani repozitář); po založení účtu lze proměnnou smazat.
 * ============================================================ */
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const ADMIN_EMAIL = 'vendl.jaroslav@engineers-cz.cz';
export const ROLE = ['Obchodník', 'Vedoucí', 'Administrátor'];

/* ---------- úložiště ---------- */
export async function uloziste(nazev) {
  if (globalThis.__TEST_ULOZISTE) return globalThis.__TEST_ULOZISTE(nazev);
  const { getStore } = await import('@netlify/blobs');
  /* consistency: 'strong' je NUTNÉ. Výchozí režim Blobs je „eventual" —
   * čtení hned po zápisu smí vrátit starý stav. V praxi (4. 8. 2026 večer):
   * administrátor založil účet, seznam načtený hned nato ho nenesl a
   * v obrazovce to vypadalo, že se účet nezaložil. Silná konzistence
   * platí pro všechna úložiště: účty, ceník, zakázky i zálohy. */
  const s = getStore({ name: nazev, consistency: 'strong' });
  return {
    async cti(klic) { return await s.get(klic, { type: 'json' }); },
    async zapis(klic, hodnota) { await s.setJSON(klic, hodnota); },
    async seznam(prefix) {
      const { blobs } = await s.list(prefix ? { prefix } : {});
      return blobs.map(b => b.key);
    },
  };
}

/* ---------- hesla (scrypt) ---------- */
export function otiskHesla(heslo) {
  const sul = randomBytes(16).toString('hex');
  const hash = scryptSync(String(heslo), sul, 64).toString('hex');
  return sul + ':' + hash;
}
export function hesloSedi(heslo, ulozene) {
  try {
    const [sul, hash] = String(ulozene).split(':');
    const b = scryptSync(String(heslo), sul, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), b);
  } catch (e) { return false; }
}

/* ---------- relace (HMAC cookie) ---------- */
function tajemstvi() {
  const t = process.env.TAJEMSTVI_RELACE;
  if (!t || t.length < 16)
    throw new Error('Chybí proměnná prostředí TAJEMSTVI_RELACE (min. 16 znaků). '
      + 'Nastav ji v Netlify: Site configuration → Environment variables.');
  return t;
}
function podpis(data) { return createHmac('sha256', tajemstvi()).update(data).digest('base64url'); }

export function relaceVytvor(email, role) {
  const telo = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + 12 * 3600 * 1000 }))
    .toString('base64url');
  return telo + '.' + podpis(telo);
}
export function relaceOver(cookieHlavicka) {
  const m = /(?:^|;\s*)relace=([^;]+)/.exec(cookieHlavicka || '');
  if (!m) return null;
  const [telo, pod] = m[1].split('.');
  if (!telo || !pod || podpis(telo) !== pod) return null;
  try {
    const r = JSON.parse(Buffer.from(telo, 'base64url').toString());
    return (r.exp > Date.now()) ? r : null;
  } catch (e) { return null; }
}

/* ---------- pomůcky pro funkce ---------- */
export function json(data, status = 200, hlavicky = {}) {
  return new Response(JSON.stringify(data), { status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...hlavicky } });
}
export async function prihlaseny(req) {
  return relaceOver(req.headers.get('cookie'));
}
export async function vyzadujRoli(req, ...role) {
  const r = await prihlaseny(req);
  if (!r) return { chyba: json({ ok: false, chyba: 'Nepřihlášen.' }, 401) };
  if (role.length && !role.includes(r.role))
    return { chyba: json({ ok: false, chyba: 'K této akci je potřeba role: ' + role.join(' / ') + '.' }, 403) };
  return { relace: r };
}
