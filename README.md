# DinoMeat Webapp

Frontend + backend do gry DinoMeat Tycoon / Telegram Mini App.

## Struktura

- `frontend/` - aplikacja React + Vite
- `backend/` - API Node i lokalny storage
- `shared/` - wspolna logika i dane gry
- `scripts/` - skrypty developerskie

## Lokalny start

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run dev
```

### Linux
```bash
cd ~/Pulpit/v10
npm run dev
```

## Build

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run build
```

### Linux
```bash
cd ~/Pulpit/v10
npm run build
```

## Wazne

- `dist/`, `node_modules/` i lokalne pliki bazy nie sa przeznaczone do commitowania.
- GitHub Pages moze wystawic tylko frontend statyczny.
- Backend i baza danych musza byc hostowane osobno, jesli gra ma dzialac online z zapisem serwerowym.
- Runtime serwera obsluguje teraz dwa tryby storage:
  - `SQLite` przez `GAME_DB_FILE`
  - `PostgreSQL / Neon` przez `DATABASE_URL`
- Gdy ustawisz `DATABASE_URL=postgresql://...`, backend automatycznie przechodzi na `postgres`.
- Implementacja `postgres` uzywa obecnej logiki gry i synchronizuje stan do Postgresa jako zrodla prawdy. Dziala, ale jest ciezsza od docelowego natywnego store Postgres.

## GitHub

Przykladowy push:

```bash
git add .
git commit -m "Prepare project for GitHub"
git branch -M main
git remote add origin https://github.com/TWOJ_LOGIN/TWOJE_REPO.git
git push -u origin main
```

## GitHub Pages

To repo jest teraz przygotowane pod publikacje frontendu do:

`https://michsiwrudz10.github.io/CyberDinoClicker2/`

Deploy:

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run pages:clean
npm.cmd run deploy
```

### Linux
```bash
cd ~/Pulpit/v10
npm run pages:clean
npm run deploy
```

Potem w GitHubie ustaw:

- `Settings -> Pages`
- `Source`: `Deploy from a branch`
- `Branch`: `pages`
- folder: `/ (root)`

Uwaga:

- GitHub Pages opublikuje tylko frontend statyczny.
- Backend Node i zapis serwerowy nie beda dzialaly na samym GitHub Pages bez osobnego hostingu API.

## Online backend + baza

Jesli chcesz, zeby wersja z GitHub Pages dzialala online:

1. Wystaw backend Node na osobnym hostingu, np. Render / Railway / VPS.
2. Daj backendowi trwaly dysk i ustaw plik bazy SQLite, np.:
   - `GAME_DB_FILE=/var/data/dino.sqlite`
3. Ustaw CORS:
   - `ALLOWED_ORIGIN=https://michsiwrudz10.github.io`
4. Ustaw host i port backendu:
   - `API_HOST=0.0.0.0`
   - `API_PORT=8787`
5. Zbuduj frontend z ustawionym API:
   - `VITE_API_BASE_URL=https://TWOJ_BACKEND.example.com`

Przyklad zmiennych masz w `.env.example`.

## Render backend

Repo jest teraz przygotowane pod prosty deploy backendu na Render.

### Co kliknac

1. Wejdz na Render i wybierz:
   - `New +`
   - `Blueprint`
2. Wskaz to repo GitHub.
3. Render wykryje plik:
   - `render.yaml`
4. Ustaw brakujace sekrety:
   - `DATABASE_URL` = connection string z Neon
   - `TELEGRAM_BOT_TOKEN`
   - `ADMIN_TELEGRAM_IDS`
   - opcjonalnie `TELEGRAM_WEBHOOK_SECRET`
   - opcjonalnie `TELEGRAM_PAYMENT_PROVIDER_TOKEN`
5. Wdroz backend.

### Co dostaniesz

Po deployu backend powinien odpowiadac pod:

- `/api/health`

Przyklad:

`https://twoj-backend.onrender.com/api/health`

### Co potem z frontendem

Jak juz masz publiczny URL backendu, zbuduj frontend z:

```powershell
$env:VITE_API_BASE_URL='https://twoj-backend.onrender.com'
npm.cmd run deploy
```

Wtedy GitHub Pages zacznie wolac prawdziwe API zamiast pustego hosta.

## Neon / PostgreSQL prep

Jesli chcesz juz przygotowac baze w Neon:

1. Skopiuj connection string Neon do:
   - `DATABASE_URL=postgresql://...?...sslmode=require`
2. Sprawdz polaczenie:

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run db:check:postgres
```

### Linux
```bash
cd ~/Pulpit/v10
npm run db:check:postgres
```

3. Utworz schemat i produkty:

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run db:init:postgres
```

### Linux
```bash
cd ~/Pulpit/v10
npm run db:init:postgres
```

4. Jesli chcesz przeniesc dane z lokalnego SQLite do Neon:

### Windows
```powershell
cd C:\DinoGame\webapp
npm.cmd run db:migrate:sqlite-to-postgres
```

### Linux
```bash
cd ~/Pulpit/v10
npm run db:migrate:sqlite-to-postgres
```

Ten krok kopiuje dane z lokalnego `dino.sqlite` do tabel w Postgresie.

5. Po ustawieniu `DATABASE_URL` backend gry zacznie uzywac Postgresa jako aktywnego silnika storage.
