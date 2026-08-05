/* ============================================================
 * overit_verzi.mjs — kontrola chování čísla verze při sestavení
 *
 * Proč tahle sada vznikla (5. 8. 2026):
 * Do GitHubu byl nahrán build v5.8.2, ale nasazená kalkulačka na
 * schaftscalc.netlify.app hlásila v5.8.3. Příčina: netlify.toml má
 * `command = "python3 build.py"`, takže build.py běží ZNOVU na serveru
 * při každém nasazení — a ten si při každém spuštění zvyšoval verze.txt.
 * Číslo se tím rozešlo s tím, co je v gitu, a nešlo podle něj poznat,
 * co je vlastně nasazené.
 *
 * Pravidlo, které se tu hlídá:
 *   – lokální build (na notebooku)  → verzi ZVÝŠIT (chová se jako dosud)
 *   – build na serveru (NETLIFY=1)  → verzi PŘEVZÍT z verze.txt, NEMĚNIT
 *
 * Sada nepotřebuje prohlížeč ani playwright, jen python3.
 * Spuštění:  node overit_verzi.mjs
 * ============================================================ */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const koren = path.dirname(fileURLToPath(import.meta.url));
const verzeTxt = path.join(koren, 'verze.txt');

let ok = 0, chyby = [];
const kontrola = (popis, podminka, detail = '') => {
  if (podminka) { ok++; console.log('  ✓ ' + popis); }
  else { chyby.push(popis + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + popis + (detail ? ' — ' + detail : '')); }
};

const cti = () => readFileSync(verzeTxt, 'utf8').trim();
const build = (env = {}) => execFileSync('python3', ['build.py'], {
  cwd: koren, encoding: 'utf8', env: { ...process.env, ...env },
});

/* Původní stav se na konci vrátí bit po bitu — sada nesmí posunout verzi
 * projektu jen tím, že se spustila. */
const puvodni = cti();
const zaloha = existsSync(path.join(koren, 'dist/kalkulacka.html'))
  ? readFileSync(path.join(koren, 'dist/kalkulacka.html'), 'utf8') : null;

console.log('Kontrola čísla verze při sestavení (výchozí verze.txt = ' + puvodni + ')');

try {
  /* 1) Serverový build: verze.txt se nesmí ani hnout, ať se spustí kolikrát chce. */
  build({ NETLIFY: 'true' });
  kontrola('serverový build (NETLIFY=true) nezvýšil verze.txt', cti() === puvodni,
    'po buildu je ' + cti() + ', čekáno ' + puvodni);

  build({ NETLIFY: 'true' });
  kontrola('ani druhý serverový build verzi neposunul', cti() === puvodni,
    'po druhém buildu je ' + cti());

  /* 2) Do sestaveného souboru se musí dostat právě ta verze, která je v gitu. */
  const html = readFileSync(path.join(koren, 'dist/kalkulacka.html'), 'utf8');
  kontrola('sestavený soubor nese verzi z verze.txt (v' + puvodni + ')',
    html.includes('v' + puvodni));
  kontrola('sestavený soubor nenese vyšší číslo verze',
    !new RegExp('v' + puvodni.replace(/\./g, '\\.').replace(/\d+$/, '') + (Number(puvodni.split('.').pop()) + 1) + '\\b').test(html));

  /* 3) Serverový build musí vyrobit i pojmenovanou kopii se správným číslem. */
  kontrola('vznikl dist/kalkulacka_v' + puvodni + '.html',
    existsSync(path.join(koren, 'dist/kalkulacka_v' + puvodni + '.html')));

  /* 4) Lokální build se chová jako dřív — číslo se zvýší. */
  build();
  const poLokalnim = cti();
  kontrola('lokální build verzi zvýšil', poLokalnim !== puvodni,
    'zůstalo ' + poLokalnim);

  /* 5) Ruční přepis --ver funguje i na serveru (poslední záchrana). */
  execFileSync('python3', ['build.py', '--ver', puvodni], {
    cwd: koren, encoding: 'utf8', env: { ...process.env, NETLIFY: 'true' },
  });
  kontrola('--ver přebije i serverový režim', cti() === puvodni, 'je ' + cti());
} finally {
  writeFileSync(verzeTxt, puvodni + '\n');
  execFileSync('python3', ['build.py', '--ver', puvodni], { cwd: koren, encoding: 'utf8' });
  if (zaloha != null) {
    const nyni = readFileSync(path.join(koren, 'dist/kalkulacka.html'), 'utf8');
    if (nyni !== zaloha) console.log('  (dist byl přesestaven na v' + puvodni + ')');
  }
}

console.log('\n' + ok + ' kontrol prošlo, ' + chyby.length + ' selhalo.');
if (chyby.length) { chyby.forEach(c => console.log('  ✗ ' + c)); process.exit(1); }
