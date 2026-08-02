# Kalkulačka OCK / PROJ – zdrojové soubory

Verze v tomto archivu: **v31.7.7** (soubor `verze.txt`).

## Co je uvnitř

- `src/` – všechny zdrojové JavaScripty, šablona `app_template.html`, katalog `jekly.json`
  a jednotkové testy `test_*.js`
- `src/ui/` – uživatelské rozhraní rozdělené po záložkách
- `build.py` – sestavovací skript
- `verze.txt` – aktuální číslo verze (tvar DEN.MĚSÍC.pořadí)

## Jak sestavit aplikaci

    python3 build.py

Skript poskládá všechny zdroje do jednoho HTML souboru a vytvoří:

- `dist/kalkulacka.html` – vždy poslední sestavení
- `dist/kalkulacka_vXX.X.X.html` – archivní kopie s číslem verze
- `dist/index.html`

Výsledek je jediný soubor bez jakýchkoli závislostí – stačí ho otevřít v prohlížeči.

## Jak spustit testy

    ./spust_testy.sh

Skript pustí všechny sady a na konci vypíše souhrn; návratový kód 0 znamená,
že prošlo všechno. Testy se pouštějí **před** `python3 build.py`.

Ručně (kdyby nebyl k dispozici bash):

    cd src
    node test.js                              # 41 testů shody jádra s Excelem
    for f in test_*.js; do node "$f"; done    # ostatní sady

Pozor na to, že `test.js` **nespadá** pod glob `test_*.js`. Dřívější návod
pouštěl jen `test_*.js`, takže sada hlídající shodu výpočtu se šablonou VZOR
se tiše přeskakovala a rozbité jádro mohlo projít jako „zelené".

## Kouřový test v prohlížeči

    python3 build.py
    ./spust_testy.sh --smoke

Node sady ověřují jádro, ale nikdy nespustí prohlížeč. Jednosouborový build
přitom umí selhat způsobem, který se v Node neprojeví: zapomenutý modul
v `CORE`/`UI` v `build.py`, špatné pořadí souborů, překlep v inline `onclick`,
výjimka při prvním `render()`. `smoke.mjs` otevře opravdu sestavený
`dist/kalkulacka.html` v Chromiu a projde start, všechny záložky, Zpět/Znovu,
zálohu do prohlížeče i panely nastavení.

Potřebuje playwright (`npm i -g playwright`); bez něj se krok jen přeskočí,
sady v Node běží dál. Samostatně:

    NODE_PATH=$(npm root -g) node smoke.mjs

Vedle kouřového testu existuje `overit_lista.mjs` – cílená kontrola klouzající
lišty kalkulací (Zpět/Znovu + kotvy sekcí, sticky chování), přejmenované
záložky Přehled cenových nabídek a karet obou nabídek v ní (od v29.7.5).
Od v29.7.6 kontroluje i modrou barvu lišty (shodnou s lištami názvů sekcí)
a zadané krátké názvy kotev v liště PROJ. Od v29.7.7 navíc hlídá ztlumený
vzhled: rámeček lišty nesmí být plná akcentová modř a stín nesmí být modrý
ani rozlitý (žádná „luminiscence“). Stejnou kontrolou prochází i ovládací
lišta v Detailu výpočtu – porovnává se přímo s klouzající lištou (podklad,
rámeček, barva písma, stín, bílé pilulky kotev), aby obě zůstaly stejné:

    NODE_PATH=$(npm root -g) node overit_lista.mjs
