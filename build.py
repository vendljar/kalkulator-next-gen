#!/usr/bin/env python3
"""Sestaví dist/kalkulacka.html a dist/index.html ze src/.

Skládá jednosouborovou aplikaci (bez CDN, bez serveru):
  CORE  = engine.js + engine_proj.js + techspec.js + zakazka.js
  JEKLY = jekly.json
  UI    = ui/common.js + ui/kalk_ock.js + ui/techspec_ui.js
          + ui/kalk_proj.js + ui/cenik_ui.js + ui/zakazka_ui.js
          + ui/nastaveni_ui.js + ui/historie.js + start

Úložiště prohlížeče: aplikace na něm NESMÍ stát. ui/historie.js si ho jen
volitelně ověří v try/catch a použije jako zálohu rozpracované kalkulace;
kde není (sandbox Apps Script), aplikace běží dál bez něj.

Verzování (konvence): Kalkulačka vDEN.MĚSÍC.verze konkrétního dne
  – verze se čte/zapisuje do verze.txt; při dalším buildu tentýž den se
    zvýší poslední číslo, v nový den začíná od 1.
  – ruční přepis:  python3 build.py --ver 23.7.5

Nikdy needitujte dist/* přímo – po změně src/ spusťte: python3 build.py
Po změně enginů spusťte testy: cd src && node test.js && node test_proj.js
"""
import datetime, os, pathlib, re, shutil, sys

root = pathlib.Path(__file__).parent
CORE = ['build_info.js',
        'preklad.js', 'format.js', 'engine.js', 'engine_proj.js', 'techspec.js', 'zakazka.js', 'uloziste.js', 'zamek.js', 'seznam.js', 'archiv.js',
        'docxgen.js', 'xlsx.js',
        'dokumenty.js', 'sleva.js', 'schvalovani.js', 'zaokrouhleni.js', 'marze.js', 'kontroly.js', 'ares.js', 'poznamky.js', 'protokol.js', 'firma.js', 'zpracovatel.js', 'nabidka.js', 'nabidka_proj.js', 'kryci.js', 'kryci_proj.js',
        'cenik.js', 'cenik_stari.js', 'katalog.js', 'prepisy.js', 'slovnik.js',
        'konfigurace.js', 'nastaveni_db.js', 'program.js', 'ukazkove.js', 'prava.js', 'zobrazeni.js']
UI = ['ui/common.js', 'ui/zakulozeni_ui.js', 'ui/kalk_ock.js', 'ui/detail_ui.js', 'ui/techspec_ui.js', 'ui/specdata_ui.js',
      'ui/kryci_ui.js', 'ui/kryci_proj_ui.js', 'ui/kalk_proj.js', 'ui/nabidka_proj_ui.js',
      'ui/cenik_stari_ui.js', 'ui/cenik_ui.js',
      'ui/zaokrouhleni_ui.js', 'ui/marze_ui.js', 'ui/zakazka_ui.js', 'ui/schvalovani_ui.js', 'ui/ares_ui.js', 'ui/zamek_ui.js', 'ui/build_info_ui.js', 'ui/ukazkove_ui.js', 'ui/kontroly_ui.js', 'ui/poznamky_ui.js', 'ui/protokol_ui.js', 'ui/seznam_ui.js', 'ui/archiv_ui.js', 'ui/program_ui.js', 'ui/nastaveni_db_ui.js', 'ui/uloziste_ui.js', 'ui/online_ui.js', 'ui/nastaveni_ui.js', 'ui/historie.js']

# ---- verze: DEN.MĚSÍC.pořadí buildu v daném dni ----
#
# POZOR na dvě různá prostředí (poučení z 5. 8. 2026):
# netlify.toml má `command = "python3 build.py"`, takže tenhle skript běží
# ZNOVU na serveru při každém nasazení. Dokud se verze zvyšovala vždycky,
# nasadila se z commitu v5.8.2 aplikace hlásící v5.8.3 — a podle čísla na
# obrazovce nešlo poznat, co je vlastně nasazené. Na serveru se proto verze
# jen PŘEBÍRÁ z verze.txt; zvyšuje ji výhradně lokální build, jehož výsledek
# se commituje. Ruční `--ver` platí všude (poslední záchrana).
verfile = root / 'verze.txt'
na_serveru = bool(os.environ.get('NETLIFY') or os.environ.get('KNG_NEZVYSOVAT_VERZI'))
if '--ver' in sys.argv:
    ver = sys.argv[sys.argv.index('--ver') + 1]
    verfile.write_text(ver + '\n')
elif na_serveru and verfile.exists() and verfile.read_text().strip():
    ver = verfile.read_text().strip()          # verze z gitu, soubor se nepřepisuje
    print(f'build.py: serverové sestavení, verze se přebírá z verze.txt (v{ver})')
else:
    d = datetime.date.today()
    dnes = f'{d.day}.{d.month}'
    last = verfile.read_text().strip() if verfile.exists() else ''
    if last.startswith(dnes + '.'):
        n = int(last.rsplit('.', 1)[1]) + 1
    else:
        n = 1
    ver = f'{dnes}.{n}'
    verfile.write_text(ver + '\n')

def strip_exports(js: str) -> str:
    """Odstraní node-only module.exports (v prohlížeči nemá co dělat)."""
    return re.sub(r"if \(typeof module !== 'undefined'\)\s*\n?\s*module\.exports = \{[^}]*\};?", '', js)

core = '\n'.join(strip_exports((root / 'src' / f).read_text()) for f in CORE)
ui = '\n'.join((root / 'src' / f).read_text() for f in UI) + '\nrender();\n'
jekly = (root / 'src/jekly.json').read_text()

html = (root / 'src/app_template.html').read_text()
# __SESTAVENO__ = den sestavení v ISO tvaru. Aplikace z něj počítá vlastní stáří
# (#40) a razítko přepočtu ceníku (#35). V Node testech se značka nenahrazuje,
# proto ji build_info.js vydává jen po kontrole tvaru.
# Ikona aplikace (11. 8. 2026): SVG ze složky ikona/ se zapeče do html jako
# datová adresa. Drží se tím pravidlo jednoho souboru — favicon jako externí
# soubor by u aplikace otevřené z disku nebo z přílohy vedl do prázdna.
import base64
ikona_svg = (root / 'src' / 'ikona.svg')
ikona_b64 = base64.b64encode(ikona_svg.read_bytes()).decode('ascii') if ikona_svg.exists() else ''

html = (html.replace('/*__CORE__*/', core).replace('/*__JEKLY__*/', jekly)
            .replace('/*__UI__*/', ui).replace('__VERZE__', 'v' + ver)
            .replace('__SESTAVENO__', datetime.date.today().isoformat())
            .replace('__IKONA_B64__', ikona_b64))

(root / 'dist').mkdir(exist_ok=True)
(root / 'dist/kalkulacka.html').write_text(html)
shutil.copy(root / 'dist/kalkulacka.html', root / 'dist/index.html')
shutil.copy(root / 'dist/kalkulacka.html', root / f'dist/kalkulacka_v{ver}.html')
print(f'OK -> dist/kalkulacka.html + dist/index.html + dist/kalkulacka_v{ver}.html  (Kalkulačka v{ver})')
