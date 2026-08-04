/* /api/zdravi — kontrola, že serverová část na Netlify žije (K3).
 * Odpovídá { ok, verze, cas }; verze se čte z verze.txt přibalené k funkci. */
import { readFileSync } from 'node:fs';

function verze() {
  for (const cesta of ['verze.txt', '../../verze.txt', new URL('../../verze.txt', import.meta.url).pathname]) {
    try { return readFileSync(cesta, 'utf8').trim(); } catch (e) { /* zkusí další */ }
  }
  return 'neznámá';
}

export default async () =>
  Response.json({ ok: true, verze: verze(), cas: new Date().toISOString(), beh: 'netlify' });

export const config = { path: '/api/zdravi' };
