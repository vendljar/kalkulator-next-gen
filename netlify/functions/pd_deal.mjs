/* Detail jednoho obchodního případu přeložený do polí kalkulačky
 * (9. 8. 2026, #16 — čtecí část).
 *
 * GET /api/pd/deal?id=<číslo>
 *   → { ok, nastaveno, deal: { …hlavička…, …krycí list…, odkaz },
 *       chybiPole: [...], varovani: [...] }
 *
 * Co se sem VĚDOMĚ nedostane: cena. `hodnotaCrm` je informativní údaj pro
 * porovnání „v CRM je X, spočítali jste Y" a do výpočtu nevstupuje. Pravidlo
 * projektu je, že částky vznikají výhradně z kalkulace — převzatá cena
 * z CRM by byla přesně ten „odhad", který se do dokumentů nesmí dostat.
 *
 * Organizace a osoba se dotahují zvlášť, protože deal nese jen jejich ID.
 * Jsou to dva dotazy navíc po 2 tokenech; načtení dealu tedy stojí 6 tokenů
 * denního rozpočtu, což je proti seznamu (20) zanedbatelné.
 *
 * Dvouúrovňový model objednatele (ověřeno na účtu 9. 8. 2026): `org_id`
 * dealu bývá investor nebo majitel, kdežto skutečný objednatel — výtahová
 * firma — visí ve vlastním poli. Když je vyplněné, má přednost; jinak se
 * bere organizace dealu. */
import { vyzadujRoli, json } from '../lib/sdilene.mjs';
import { pdNastaveno, pdZavolej, pdOdkazNaDeal, PdChyba } from '../lib/pipedrive.mjs';
import { pdDealNaNase, pdZbytekDoSta, pdHodnota } from '../lib/pd_mapa.mjs';
import { pdPoleMapa } from './pd_pole.mjs';

async function bezpecne(cesta) {
  /* Chybějící organizace nebo osoba nesmí shodit celé načtení — deal je
   * použitelný i bez nich, jen se nedoplní objednatel. */
  try { return await pdZavolej(cesta); } catch (e) { return null; }
}

export default async (req) => {
  const { chyba } = await vyzadujRoli(req);
  if (chyba) return chyba;

  if (!pdNastaveno())
    return json({ ok: true, nastaveno: false, deal: null,
      chyba: 'Napojení na Pipedrive zatím není nastavené.' });

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id || !isFinite(id))
    return json({ ok: false, chyba: 'Chybí číslo obchodního případu.' }, 400);

  try {
    const pole = await pdPoleMapa();
    const deal = await pdZavolej('/api/v2/deals/' + id, { dotaz: { include_option_labels: true } });
    if (!deal) return json({ ok: false, chyba: 'Pipedrive takový případ nezná.' }, 404);

    const cf = deal.custom_fields || {};
    const idFirmy = Number(pdHodnota(cf[pole.mapa.objednatelFirma])) || deal.org_id || null;
    const idOsoby = Number(pdHodnota(cf[pole.mapa.objednatelOsoba])) || deal.person_id || null;

    const [organizace, osoba] = await Promise.all([
      idFirmy ? bezpecne('/api/v2/organizations/' + idFirmy) : null,
      idOsoby ? bezpecne('/api/v2/persons/' + idOsoby) : null,
    ]);

    const nase = pdDealNaNase(deal, pole.mapa,
      { organizace, osoba, mapaOrganizace: pole.mapaOrganizace });
    nase.fakturaKoncProc = pdZbytekDoSta(nase.zaloha1Proc, nase.faktura2Proc);
    nase.odkaz = pdOdkazNaDeal(id);

    /* Varování říkají obchodníkovi, co si musí doplnit sám. Bez nich by se
     * prázdné pole tvářilo jako „v CRM je prázdno", i kdyby jen chyběla
     * mapa — a to jsou dvě úplně jiné situace. */
    const varovani = [];
    if (!nase.cislo) varovani.push('Z názvu případu nejde vyčíst číslo nabídky '
      + '(očekává se tvar „CN-123 …") — doplňte ho v hlavičce ručně.');
    if (!organizace) varovani.push('K případu není navázaná organizace, objednatel zůstal prázdný.');
    else if (!nase.ico) varovani.push('Organizace v CRM nemá vyplněné IČO.');
    if (!nase.adresa) varovani.push('V CRM není vyplněná adresa stavby.');
    if (pole.chybi && pole.chybi.length)
      varovani.push('Nepodařilo se v CRM najít pole: '
        + pole.chybi.map((x) => x.popis).join(', ') + '.');

    return json({ ok: true, nastaveno: true, deal: nase,
      chybiPole: pole.chybi || [], varovani });
  } catch (e) {
    if (e instanceof PdChyba)
      return json({ ok: false, nastaveno: true, chyba: e.message }, e.stav >= 500 ? 502 : e.stav);
    throw e;
  }
};
export const config = { path: '/api/pd/deal' };
