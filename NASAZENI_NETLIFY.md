# Nasazení na Netlify (schaftscalc.netlify.app) — krok za krokem

Netlify neprovozuje trvale běžící server. Funguje to tak, že si při každém
nasazení SÁM sestaví web z GitHub repozitáře (spustí `python3 build.py` nad
vynulovanými zdrojáky — žádná ceníková hodnota v repozitáři není a není ani
ve výsledném webu) a adresy `/api/…` obsluhují serverové funkce ze složky
`netlify/functions`. Vše je připravené v repozitáři: `netlify.toml`, funkce
(`/api/zdravi`, `/api/vypocet` a od v4.8.1 celá online databáze) a
`package.json` se závislostí `@netlify/blobs` (Netlify si ji nainstaluje sám).

## Propojení (jednorázově, ~5 minut)

1. Na netlify.com otevři svůj tým → **Add new site → Import an existing
   project → GitHub** → povol Netlify přístup a vyber repozitář kalkulátoru.
2. Netlify si přečte `netlify.toml`, takže **Build command** (`python3 build.py`)
   i **Publish directory** (`dist`) budou předvyplněné — nic neměň, jen
   **Deploy**. (Kdyby se build command nepředvyplnil, zadej ho ručně.)
3. V **Site configuration → Site details → Change site name** nastav
   `schaftscalc`, ať adresa je schaftscalc.netlify.app (pokud už site
   s tímhle jménem máš založený, propoj repozitář v něm).
4. Kontrola: `https://schaftscalc.netlify.app/api/zdravi` musí odpovědět
   `{ ok: true, verze: … }` a kořen webu musí otevřít kalkulačku.

## Online databáze (od v4.8.1) — dvě proměnné prostředí

Přihlašování a databáze potřebují dvě hodnoty, které si nastavuješ VÝHRADNĚ
sám v Netlify (nikdy se neposílají konverzací ani nepatří do repozitáře):

1. **Site configuration → Environment variables → Add a variable:**
   - `TAJEMSTVI_RELACE` — libovolný náhodný text, **aspoň 16 znaků**.
     Podepisují se jím přihlašovací relace; kdo ho zná, mohl by se vydávat
     za přihlášeného — nikomu ho nesděluj a nikam nezapisuj.
   - `ADMIN_INIT_HESLO` — počáteční heslo administrátora (aspoň 8 znaků).
2. Proměnné se do funkcí propíšou při dalším nasazení — buď nahraj nové
   dávky, nebo dej **Deploys → Trigger deploy**.
3. Otevři web → záložka **Zakázka** → karta **Online databáze** → přihlas se
   jako `vendl.jaroslav@engineers-cz.cz` s heslem z `ADMIN_INIT_HESLO`.
   **Prvním přihlášením se účet založí** (heslo se uloží jen jako otisk).
   Potom můžeš `ADMIN_INIT_HESLO` z Netlify smazat; heslo si kdykoli změníš
   v kartě **Uživatelé…** („Nové heslo…" u svého účtu).
4. První naplnění: připoj složku `_DB`, na záložce Ceník dej **„Zveřejnit
   ceník této varianty online"** a zakázky ulož tlačítkem **„Uložit online"**.

## Co funguje

- Celá kalkulačka v prohlížeči, odkudkoli a z jakéhokoli zařízení.
- Online databáze: zakázky i platný ceník na serveru po přihlášení; správa
  účtů (role Obchodník / Vedoucí / Administrátor, reset hesla administrátorem).
- Zálohy: denní odlévání do připojené složky na Disku Google + noční otisk
  na serveru (plánovaná funkce ve 2:00 UTC).
- Přechodné období: dokud je připojená složka `_DB`, má přednost — všechno
  se chová jako dosud. Bez složky vládne online databáze.
- Poznámka: pokud je web zaheslovaný ochranou Netlify (odpovídá 401), vypni
  ji v Site configuration → Site protection — aplikace už má vlastní
  přihlašování.

## Každá další verze

Nahraješ dávky na GitHub (jako dosud) → Netlify si změny sám stáhne,
sestaví a nasadí. Žádný další ruční krok.
