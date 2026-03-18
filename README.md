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
- Obecny runtime serwera obsluguje produkcyjnie baze `SQLite` jako plik na trwalym dysku serwera. `Postgres` ma tylko schemat startowy w `backend/db/schema.sql`, ale runtime nie jest jeszcze na niego przepiety.

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
   - `DATABASE_URL=file:/var/data/dino.sqlite`
   - albo `GAME_DB_FILE=/var/data/dino.sqlite`
3. Ustaw CORS:
   - `ALLOWED_ORIGIN=https://michsiwrudz10.github.io`
4. Ustaw host i port backendu:
   - `API_HOST=0.0.0.0`
   - `API_PORT=8787`
5. Zbuduj frontend z ustawionym API:
   - `VITE_API_BASE_URL=https://TWOJ_BACKEND.example.com`

Przyklad zmiennych masz w `.env.example`.
