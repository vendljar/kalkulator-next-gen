/* POST /api/obnova — HROMADNÁ OBNOVA ONLINE DATABÁZE (nález V26, 7. 9. 2026)
 * =========================================================================
 *
 * Do 7. 9. 2026 byla záloha jednosměrná: `/api/zaloha` ji uměl vydat,
 * `/api/zaloha_vynuceno` pořídit otisk — ale zpátky se nedala nalít vůbec.
 * Hlášeno J. V.: „online databázi zřejmě umím stáhnout, ale nedokážu jí
 * hromadně nahrát zpět." Obnova po havárii tak byla ruční práce na hodiny
 * a účty by se zakládaly znovu.
 *
 * DVA ZDROJE:
 *   – `soubor` — nahraná záloha ze stažení (`/api/zaloha`). NEOBSAHUJE otisky
 *     hesel (schválně, viz zaloha.mjs), takže z ní účty obnovit NELZE; jen se
 *     vypíšou, aby bylo vidět, které chybí.
 *   – `otisk`  — noční nebo vynucený otisk na serveru. Ten je ÚPLNÝ včetně
 *     otisků hesel (porizOtisk), takže obnoví i účty i s jejich hesly.
 *
 * TŘI POJISTKY, bez kterých by tahle funkce byla nebezpečnější než chybějící:
 *   1) NÁHLED. `nahled: true` nic nezapíše a vrátí, co by se stalo — kolik
 *      záznamů přibude, kolik se přepíše, co se přeskočí a proč.
 *   2) OTISK PŘED OBNOVOU. Než se sáhne na první záznam, pořídí se vynucený
 *      otisk současného stavu. Špatně mířená obnova jde tím pádem vrátit.
 *   3) UZAMČENÉ NABÍDKY. Vytištěná (odeslaná) nabídka je doklad, ne pracovní
 *      soubor. Zakázka, které by obnova změnila data uzamčené varianty nebo
 *      jí sundala zámek, se PŘESKOČÍ a vypíše — i v režimu „přepsat".
 *
 * OBNOVA NIKDY NEMAŽE. Ani „přepsat" neodstraní záznam, který v záloze není:
 * mazání je samostatné vědomé rozhodnutí (/api/zakazky DELETE), ne vedlejší
 * účinek obnovy. Kdo chce stav 1:1, smaže si přebytek zvlášť.
 */
import { uloziste, vyzadujRoli, json } from '../lib/sdilene.mjs';
import { jadro, jadroChyba } from '../lib/jadro.mjs';
import { porizOtisk } from '../lib/zalohovani.mjs';

/* Záloha celé databáze bývá jednotky MB (šablony DOCX v base64 jsou v ní
 * schválně — viz zaloha.mjs). 25 MB je strop proti zaplnění úložiště, ne
 * provozní hranice. */
const ZALOHA_MAX_B = 25 * 1024 * 1024;

/* Části, které umíme obnovit. Pořadí je pořadím zápisu: ceník a firemní
 * údaje první, protože zakázky se proti nim zobrazují. */
export const CASTI = ['program', 'firma', 'zobrazeni', 'zakaznici', 'sablony',
                      'podpisy', 'uzivatele', 'zakazky'];

/* Uzamčenou (odeslanou) nabídku obnova nepřepíše. Vrací důvod, nebo prázdno. */
export function obnovaKolizeZamku(stara, nova) {
  if (!stara) return '';
  const uzamcena = v => !!(globalThis.variantaUzamcena && globalThis.variantaUzamcena(v));
  for (const sv of (stara.varianty || [])) {
    if (!uzamcena(sv)) continue;
    const nv = (nova.varianty || []).find(v => v && v.id === sv.id);
    if (!nv) return 'v záloze chybí uzamčená varianta ' + (sv.nazev || sv.id);
    if (!uzamcena(nv)) return 'záloha by sundala zámek z varianty ' + (nv.nazev || nv.id);
    if (JSON.stringify(nv.data) !== JSON.stringify(sv.data))
      return 'záloha by změnila data uzamčené varianty ' + (nv.nazev || nv.id);
  }
  return '';
}

/* Souhrn jedné části pro náhled i pro výsledek. */
const pocet = () => ({ novych: 0, prepsanych: 0, bezeZmeny: 0, preskocenych: 0, duvody: [] });

export default async (req) => {
  try { await jadro(); } catch (e) { return jadroChyba(e); }
  if (req.method !== 'POST') return json({ ok: false, chyba: 'Použijte POST.' }, 405);

  const { chyba, relace } = await vyzadujRoli(req, 'Administrátor');
  if (chyba) return chyba;

  const delka = +req.headers.get('content-length') || 0;
  if (delka > ZALOHA_MAX_B)
    return json({ ok: false, chyba: 'Záloha je příliš velká (' + Math.round(delka / 1024 / 1024)
      + ' MB, strop ' + Math.round(ZALOHA_MAX_B / 1024 / 1024) + ' MB).' }, 413);
  let t; try { t = await req.json(); } catch (e) { return json({ ok: false, chyba: 'Vstup není platný JSON.' }, 400); }

  const nahled = t.nahled === true;
  const rezim = t.rezim === 'prepsat' ? 'prepsat' : 'doplnit';
  const vybrane = Array.isArray(t.casti) && t.casti.length
    ? CASTI.filter(c => t.casti.includes(c)) : CASTI.slice();

  /* ---------- zdroj ---------- */
  let zaloha = null, zdrojPopis = '';
  if (t.zdroj === 'otisk') {
    const den = String(t.den || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(den))
      return json({ ok: false, chyba: 'Otisk se vybírá dnem ve tvaru RRRR-MM-DD.' }, 400);
    zaloha = await (await uloziste('zalohy')).cti(den);
    if (!zaloha) return json({ ok: false, chyba: 'Otisk ze dne ' + den + ' na serveru není.' }, 404);
    zdrojPopis = 'serverový otisk ' + den;
  } else {
    zaloha = t.zaloha;
    zdrojPopis = 'nahraný soubor' + (t.jmeno ? ' ' + String(t.jmeno).slice(0, 120) : '');
  }
  /* Cizí nebo poškozený soubor se NEOBNOVUJE. Databáze je to jediné, o co
   * při havárii jde — radši nic než něco, co jsme nečetli. */
  if (!zaloha || typeof zaloha !== 'object' || !zaloha.porizena
      || !CASTI.some(c => zaloha[c] != null))
    return json({ ok: false, chyba: 'Tohle není záloha z této aplikace — nic se neobnovilo. '
      + 'Čekám soubor ze „Stáhnout zálohu" (nebo vyberte serverový otisk).' }, 400);

  /* Účty jdou obnovit jen z otisku: stažená záloha otisky hesel schválně
   * nenese, takže by z ní vznikly účty, do kterých se nikdo nepřihlásí. */
  const uctyMajiHesla = (zaloha.uzivatele || []).some(u => u && u.heslo);

  const plan = {};
  for (const c of vybrane) plan[c] = pocet();
  const zapis = [];       // co se má zapsat, když nejde o náhled

  const jednoducha = { program: ['program', 'db'], firma: ['program', 'firma'],
                       zobrazeni: ['program', 'zobrazeni'] };
  for (const c of Object.keys(jednoducha)) {
    if (!vybrane.includes(c) || zaloha[c] == null) continue;
    const [store, klic] = jednoducha[c];
    const s = await uloziste(store);
    const ted = await s.cti(klic);
    if (ted == null) { plan[c].novych = 1; zapis.push([store, klic, zaloha[c]]); }
    else if (JSON.stringify(ted) === JSON.stringify(zaloha[c])) plan[c].bezeZmeny = 1;
    else if (rezim === 'prepsat') { plan[c].prepsanych = 1; zapis.push([store, klic, zaloha[c]]); }
    else { plan[c].preskocenych = 1; plan[c].duvody.push('na serveru je jiná verze (režim „doplnit chybějící")'); }
  }

  /* Mapová úložiště: klíč → hodnota, jeden záznam = jeden blob. */
  const mapova = { zakaznici: 'zakaznici', sablony: 'sablony', podpisy: 'podpisy' };
  for (const c of Object.keys(mapova)) {
    if (!vybrane.includes(c) || !zaloha[c]) continue;
    const s = await uloziste(mapova[c]);
    for (const klic of Object.keys(zaloha[c])) {
      const ted = await s.cti(klic);
      if (ted == null) { plan[c].novych++; zapis.push([mapova[c], klic, zaloha[c][klic]]); }
      else if (JSON.stringify(ted) === JSON.stringify(zaloha[c][klic])) plan[c].bezeZmeny++;
      else if (rezim === 'prepsat') { plan[c].prepsanych++; zapis.push([mapova[c], klic, zaloha[c][klic]]); }
      else plan[c].preskocenych++;
    }
  }

  /* ---------- účty ---------- */
  if (vybrane.includes('uzivatele') && Array.isArray(zaloha.uzivatele)) {
    const s = await uloziste('uzivatele');
    for (const u of zaloha.uzivatele) {
      if (!u || !u.email) continue;
      const klic = String(u.email).toLowerCase();
      const ted = await s.cti(klic);
      if (!u.heslo) {
        plan.uzivatele.preskocenych++;
        continue;                       // souhrn důvodu je jeden, viz níž
      }
      if (ted == null) { plan.uzivatele.novych++; zapis.push(['uzivatele', klic, u]); }
      else if (JSON.stringify(ted) === JSON.stringify(u)) plan.uzivatele.bezeZmeny++;
      else if (rezim === 'prepsat') { plan.uzivatele.prepsanych++; zapis.push(['uzivatele', klic, u]); }
      else plan.uzivatele.preskocenych++;
    }
    if (!uctyMajiHesla && (zaloha.uzivatele || []).length)
      plan.uzivatele.duvody.push('stažená záloha nenese otisky hesel — účty z ní obnovit nejdou, '
        + 'založte je v Nastavení → Uživatelé (nebo obnovujte ze serverového otisku)');
  }

  /* ---------- zakázky ---------- */
  let rejstrikNovy = null;
  if (vybrane.includes('zakazky') && zaloha.zakazky) {
    const s = await uloziste('zakazky');
    for (const jmeno of Object.keys(zaloha.zakazky)) {
      const nova = zaloha.zakazky[jmeno];
      if (!nova || typeof nova !== 'object') { plan.zakazky.preskocenych++; continue; }
      const stara = await s.cti('z/' + jmeno);
      const kolize = obnovaKolizeZamku(stara, nova);
      if (kolize) {
        plan.zakazky.preskocenych++;
        if (plan.zakazky.duvody.length < 20) plan.zakazky.duvody.push(jmeno + ': ' + kolize);
        continue;
      }
      if (stara == null) { plan.zakazky.novych++; zapis.push(['zakazky', 'z/' + jmeno, nova]); }
      else if (JSON.stringify(stara) === JSON.stringify(nova)) plan.zakazky.bezeZmeny++;
      else if (rezim === 'prepsat') { plan.zakazky.prepsanych++; zapis.push(['zakazky', 'z/' + jmeno, nova]); }
      else plan.zakazky.preskocenych++;
    }
    /* Rejstřík se skládá až po zápisu ze SKUTEČNÉHO obsahu úložiště, ne
     * z toho, co přišlo v záloze — jinak by v seznamu zůstal sirotek po
     * zakázce, kterou obnova přeskočila kvůli zámku. */
    rejstrikNovy = true;
  }

  const souhrn = { zdroj: zdrojPopis, porizena: String(zaloha.porizena || ''),
                   rezim, casti: vybrane, plan,
                   zapisu: zapis.length, uctyMajiHesla };

  if (nahled) return json({ ok: true, nahled: true, ...souhrn });

  /* Vědomé potvrzení. Obnova je jediná operace, která umí přepsat celou
   * databázi jedním požadavkem — na tu se neklikne omylem. */
  if (t.potvrzeni !== 'OBNOVIT')
    return json({ ok: false, chyba: 'Obnova se provádí až po výslovném potvrzení. '
      + 'Nejdřív si prohlédněte náhled.' }, 428);
  if (!zapis.length) return json({ ok: true, ...souhrn, otiskPred: null,
    zprava: 'Není co obnovovat — databáze už zálohu obsahuje.' });

  /* Otisk PŘED obnovou. Když se pořídit nepovede, obnova se NEPROVEDE:
   * nevratná operace bez cesty zpátky je horší než neprovedená obnova.
   *
   * Otisk se ukládá pod DNEŠNÍM dnem, stejně jako tlačítko „Zálohovat teď".
   * Obnovuje-li se z dnešního otisku, přepíše se tím zdroj — a je to tak
   * správně: jeho obsah se právě stal živou databází a v tom slotu má nově
   * ležet stav PŘED obnovou, tedy cesta zpátky. Nic se neztrácí, jen si obě
   * verze vymění místo. Zdroj je v tu chvíli dávno načtený v paměti. */
  let otiskPred = null;
  try { otiskPred = await porizOtisk('pred-obnovou', relace.email); }
  catch (e) {
    return json({ ok: false, chyba: 'Před obnovou se nepodařilo pořídit otisk současného stavu ('
      + (e && e.message ? e.message : e) + '). Obnova se neprovedla — bez cesty zpátky ji dělat nebudu.' }, 500);
  }

  const stores = {};
  for (const [store, klic, hodnota] of zapis) {
    if (!stores[store]) stores[store] = await uloziste(store);
    await stores[store].zapis(klic, hodnota);
  }

  if (rejstrikNovy) {
    const { ULO } = await jadro();
    const s = stores.zakazky || await uloziste('zakazky');
    const zaznamy = [];
    for (const k of await s.seznam('z/')) {
      const z = await s.cti(k);
      if (z) zaznamy.push(ULO.uloRejstrikZaznam(z, { soubor: k.slice(2) }));
    }
    await s.zapis('_rejstrik', { schema: 1, zakazky: ULO.uloRejstrikSerad(zaznamy),
                                 kdo: relace.email, upraveno: new Date().toISOString() });
  }

  return json({ ok: true, ...souhrn, otiskPred,
    zprava: 'Obnoveno ze zdroje: ' + zdrojPopis + '. Před obnovou byl pořízen otisk '
      + (otiskPred ? otiskPred.den : '') + '.' });
};
export const config = { path: '/api/obnova' };
