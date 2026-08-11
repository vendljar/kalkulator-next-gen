/* ============================================================
 * SERVER KALKULÁTORU (#24, krok K3 — kostra, 3. 8. 2026)
 *
 * Malý server bez jediné závislosti (jen vestavěné moduly Node.js):
 *   – vydává sestavenou aplikaci (dist/kalkulacka.html),
 *   – /api/zdravi       → { ok, verze }  (kontrola, že server žije),
 *   – /api/vypocet POST → spočítá zakázku službou sluzba.js (krok K2)
 *                         stejnými jádry, jaká běží v prohlížeči.
 *
 * Proč bez závislostí: na rosti.cz se nasazuje z GitHubu a server bez
 * npm balíčků nemá co selhat při instalaci a co zastarat. Stejná filozofie
 * jako jednosouborová aplikace.
 *
 * CO TU ZATÍM NENÍ (vědomě, přijde po založení účtu na rosti.cz):
 * přihlašování (e-mail + heslo, reset provádí administrátor — rozhodnutí
 * 3. 8. 2026), databáze zakázek a ceníku, noční záloha na Disk (#77).
 * Kostra slouží k ověření, že nasazení z GitHubu funguje.
 *
 * První uživatel (rozhodnutí 3. 8. 2026): Jaroslav Vendl,
 * adresa z ADMIN_EMAIL (netlify/lib/sdilene.mjs), role Administrátor — založí se při
 * zavedení přihlašování; heslo si nastaví při prvním spuštění, do
 * repozitáře žádné heslo nepatří.
 *
 * Spuštění:  node server/server.js   (port z PORT, výchozí 8000)
 * ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---- jádra aplikace: stejné soubory jako v prohlížeči ----------------
 * Moduly spolu mluví přes globální jména (v prohlížeči je skládá build);
 * tady je jednou provždy globalizujeme ve stejném pořadí jako build.py. */
const SRC = path.join(__dirname, '..', 'src');
['preklad.js', 'format.js', 'engine.js', 'engine_proj.js', 'techspec.js',
 'sleva.js', 'zaokrouhleni.js', 'marze.js', 'kontroly.js', 'zakazka.js',
 'sluzba.js'].forEach(f => Object.assign(global, require(path.join(SRC, f))));

const JEKLY = JSON.parse(fs.readFileSync(path.join(SRC, 'jekly.json'), 'utf8'));
const VERZE = fs.readFileSync(path.join(__dirname, '..', 'verze.txt'), 'utf8').trim();
const DIST = path.join(__dirname, '..', 'dist');

function posliJson(res, kod, data) {
  const text = JSON.stringify(data);
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

function posliSoubor(res, soubor) {
  fs.readFile(soubor, (chyba, obsah) => {
    if (chyba) { posliJson(res, 404, { chyba: 'Soubor nenalezen.' }); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(obsah);
  });
}

const server = http.createServer((req, res) => {
  const cesta = (req.url || '/').split('?')[0];

  if (cesta === '/api/zdravi') {
    posliJson(res, 200, { ok: true, verze: VERZE, cas: new Date().toISOString() });
    return;
  }

  if (cesta === '/api/vypocet' && req.method === 'POST') {
    let telo = '';
    req.on('data', d => {
      telo += d;
      if (telo.length > 20 * 1024 * 1024) req.destroy();   // pojistka velikosti
    });
    req.on('end', () => {
      try {
        const vstup = JSON.parse(telo || '{}');
        /* importZakazka provede stejné migrace jako aplikace (role, jenProj,
         * hlavička PROJ…) — server nesmí počítat z nezmigrovaných dat */
        const zak = importZakazka(vstup.zakazka || {});
        const vysl = sluzbaVypocet(zak, vstup.program || {}, JEKLY);
        posliJson(res, 200, { ok: true, vysledek: vysl });
      } catch (e) {
        posliJson(res, 400, { ok: false, chyba: 'Vstup se nepodařilo zpracovat: ' + e.message });
      }
    });
    return;
  }

  if (cesta === '/' || cesta === '/index.html' || cesta === '/kalkulacka.html') {
    const soubor = path.join(DIST, 'kalkulacka.html');
    if (fs.existsSync(soubor)) { posliSoubor(res, soubor); return; }
    /* Repozitář sestavení neobsahuje (dist/ do něj nepatří). Kostra serveru
     * tím není rozbitá — API běží; jak doplnit aplikaci říká NASAZENI.md. */
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="cs"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:640px;margin:40px auto">'
      + '<h1>Server Kalkulátoru běží (v' + VERZE + ')</h1>'
      + '<p>Sestavená aplikace zatím není nahraná — repozitář ji záměrně neobsahuje. '
      + 'Kontrola serveru: <a href="/api/zdravi">/api/zdravi</a>. '
      + 'Jak doplnit aplikaci popisuje <code>server/NASAZENI.md</code>.</p></body></html>');
    return;
  }

  posliJson(res, 404, { chyba: 'Neznámá cesta: ' + cesta });
});

const PORT = +(process.env.PORT || 8000);
server.listen(PORT, () => console.log('Kalkulátor v' + VERZE + ' poslouchá na portu ' + PORT));
