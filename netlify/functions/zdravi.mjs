/* /api/zdravi — kontrola, že serverová část na Netlify žije (K3).
 * Odpovídá { ok, verze, cas }; verze se čte z verze.txt přibalené k funkci. */
import { readFileSync } from 'node:fs';

function verze() {
  for (const cesta of ['verze.txt', '../../verze.txt', new URL('../../verze.txt', import.meta.url).pathname]) {
    try { return readFileSync(cesta, 'utf8').trim(); } catch (e) { /* zkusí další */ }
  }
  return 'neznámá';
}

/* Prostředí (20. 8. 2026): TESTOVACÍ web má vlastní Netlify site, a tedy
 * i vlastní úložiště Blobs — data se s ostrým provozem nikdy nepotkají.
 * Jediné, co chybělo, byla jistota, KDE člověk zrovna je: dvě stejně
 * vypadající kalkulačky vedle sebe jsou pozvánka k tomu udělat nabídku
 * v testu a odeslat ji zákazníkovi. Proměnná PROSTREDI (`test` / `ostre`)
 * se proto hlásí sem a klient podle ní kreslí červený pruh.
 * Nenastavená proměnná = ostrý provoz: kdo si nový web zakládá, nastaví ji,
 * a starý ostrý web se chová dál stejně. */
function prostredi() {
  const p = String(process.env.PROSTREDI || '').trim().toLowerCase();
  return (p === 'test' || p === 'sandbox' || p === 'testovaci') ? 'test' : 'ostre';
}

export default async () =>
  Response.json({ ok: true, verze: verze(), prostredi: prostredi(),
    popisProstredi: String(process.env.PROSTREDI_POPIS || '').trim(),
    cas: new Date().toISOString(), beh: 'netlify' });

export const config = { path: '/api/zdravi' };
