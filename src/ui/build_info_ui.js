/* ============================================================
 * STÁŘÍ SESTAVENÍ – lišta pod hlavičkou (#40, UI)
 *
 * Logika je v build_info.js; tady je jen lišta a její schování.
 *
 * Lišta se dá zavřít, ale jen do zavření okna – nikam se to neukládá.
 * Trvalé „už mi to neukazuj" by přesně u téhle věci nedávalo smysl: jde o to,
 * že někdo pracuje na staré kopii souboru, a ta kopie bude za měsíc ještě
 * starší. Zároveň nemá cenu otravovat při každém překreslení, takže jedno
 * kliknutí ji na tuhle práci utne.
 * ============================================================ */

let BUILD_LISTA_SKRYTA = false;

function buildStariLista() {
  if (BUILD_LISTA_SKRYTA) return '';
  const s = buildStari();
  const veta = buildStariText(s);
  if (!veta) return '';
  return `<div class="build-lista ${s.stupen === 'stare' ? 'durazne' : ''}">
    <span class="ikona">${s.stupen === 'stare' ? '⏳' : '🕗'}</span>
    <span>${esc(veta)}</span>
    <span class="sp"></span>
    <button class="mini" onclick="buildListaSkryj()">Rozumím, skrýt</button>
  </div>`;
}

function renderBuildLista() {
  const el = document.getElementById('buildLista');
  if (el) el.innerHTML = buildStariLista();
}

function buildListaSkryj() {
  BUILD_LISTA_SKRYTA = true;
  renderBuildLista();
}
