# Nasazení na Netlify (schaftscalc.netlify.app) — krok za krokem

Netlify neprovozuje trvale běžící server. Funguje to tak, že si při každém
nasazení SÁM sestaví web z GitHub repozitáře (spustí `python3 build.py` nad
vynulovanými zdrojáky — žádná ceníková hodnota v repozitáři není a není ani
ve výsledném webu) a adresy `/api/…` obsluhují serverové funkce ze složky
`netlify/functions`. Vše je připravené v repozitáři: `netlify.toml` +
dvě funkce (`/api/zdravi`, `/api/vypocet`).

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

## Co bude fungovat hned

- Celá kalkulačka v prohlížeči, odkudkoli a z jakéhokoli zařízení.
- Skutečný ceník: v aplikaci připoj složku `_DB` tlačítkem jako dosud —
  File System Access funguje i nad https, data zůstávají u tebe.
- `/api/zdravi` a `/api/vypocet` (výpočet zakázky na serveru službou K2).

## Co přijde v dalším kroku (po ověření, že web běží)

Přihlašování e-mail + heslo se třemi rolemi, serverová databáze zakázek
a ceníku (Netlify Blobs) a noční zálohy na Disk Google (#77). Poznámka:
pokud je web zatím zaheslovaný ochranou Netlify (odpovídá 401), vypni ji
v Site configuration → Site protection, až budeš chtít pustit kolegy.

## Každá další verze

Nahraješ dávky na GitHub (jako dosud) → Netlify si změny sám stáhne,
sestaví a nasadí. Žádný další ruční krok.
