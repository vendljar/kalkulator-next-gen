/* ============================================================
 * OTISK ONLINE DATABÁZE (4. 8. 2026)
 *
 * Proč vlastní knihovna: do 4. 8. uměla otisk jen plánovaná funkce
 * zaloha_nocni.mjs, která vyváží `export const config = { schedule: … }`
 * a ŽÁDNOU cestu. Ručně se tedy vyvolat nedala, nikde se nedalo zjistit,
 * jestli kdy proběhla, a v obrazovce to vypadalo, že „vynucené zálohování
 * nefunguje" – ono totiž nebylo co vynutit. Pořízení otisku proto bydlí
 * tady a používají ho dvě funkce: plánovaná (noční) a obyčejná cesta
 * /api/zaloha_vynuceno pro administrátora.
 *
 * Otisk leží v úložišti `zalohy`, klíč = datum (jeden za den; nová záloha
 * v témž dni tu předchozí přepíše – nechceme z jednoho klikání nadělat
 * stovky kopií). Uživatelé se ukládají CELÍ včetně otisků hesel: otisk
 * zůstává ve stejném Blobs jako ostrá data a nikdy neopouští server, takže
 * obnova nevyžaduje reset všech hesel. Ven (na Disk Google) míří jiná
 * záloha – functions/zaloha.mjs, ta otisky hesel nenese.
 * ============================================================ */
import { uloziste } from './sdilene.mjs';

export function denDnes(kdy) {
  return new Date(kdy || Date.now()).toISOString().slice(0, 10);
}

/* zdroj = 'nocni-otisk' | 'vynuceno' … ; kdo = e-mail administrátora nebo '' */
export async function porizOtisk(zdroj, kdo) {
  const den = denDnes();
  const sProg = await uloziste('program');
  const program = await sProg.cti('db');
  const firma = await sProg.cti('firma');   // od 4. 8. 2026 online (viz functions/firma.mjs)

  const zak = await uloziste('zakazky');
  const zakazky = {};
  for (const k of await zak.seznam('z/')) zakazky[k.slice(2)] = await zak.cti(k);
  const rejstrik = await zak.cti('_rejstrik');

  const uziv = await uloziste('uzivatele');
  const uzivatele = [];
  for (const k of await uziv.seznam()) {
    const x = await uziv.cti(k);
    if (x) uzivatele.push(x);              // celé účty včetně otisků hesel (viz výše)
  }

  const otisk = {
    porizena: new Date().toISOString(),
    zdroj: String(zdroj || 'nocni-otisk'),
    kdo: String(kdo || ''),
    program: program || null, firma: firma || null,
    rejstrik: rejstrik || null, zakazky, uzivatele,
  };
  await (await uloziste('zalohy')).zapis(den, otisk);
  return { den, pocetZakazek: Object.keys(zakazky).length, pocetUctu: uzivatele.length };
}

/* Souhrn pro obrazovku – vědomě BEZ dat. Kdyby seznam vozil obsah otisků,
 * stačilo by otevřít vývojářskou konzoli a přečíst celou databázi jedním
 * požadavkem; tady jde jen o to, kdy naposledy záloha vznikla.
 * Řadí se od nejnovější, protože obrazovku zajímá poslední otisk. */
export async function seznamOtisku(kolik) {
  const s = await uloziste('zalohy');
  const dny = (await s.seznam()).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().reverse();
  const vybrane = dny.slice(0, Math.max(1, kolik || 14));
  const otisky = [];
  for (const den of vybrane) {
    const o = await s.cti(den);
    if (!o) continue;
    otisky.push({
      den,
      porizena: String(o.porizena || ''),
      zdroj: String(o.zdroj || ''),
      kdo: String(o.kdo || ''),
      pocetZakazek: Object.keys(o.zakazky || {}).length,
      pocetUctu: (o.uzivatele || []).length,
    });
  }
  return otisky;
}
