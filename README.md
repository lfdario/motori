# Motori • Astro

Sito news automotive (stile motori.it / motor1.com) basato su **Astro + Tailwind** e contenuti Markdown.
Ottimizzato per **GitHub Pages** (branch `main` → deploy automatico su `gh-pages`).

## Avvio locale
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy su GitHub Pages
1. Imposta il repo con default branch **main**.
2. Copia tutto il contenuto nel repo.
3. Vai su **Settings → Pages** e come *Source* seleziona **GitHub Actions**.
4. Fai push su `main` → il workflow `.github/workflows/deploy.yml` pubblica su `gh-pages`.
5. URL del sito: `https://<utente>.github.io/site-automation-pro/`

## Struttura contenuti
- `src/content/news` — notizie
- `src/content/tests` — prove
- `src/content/guides` — guide

Crea nuovi articoli copiando un file `.md` e aggiornando il frontmatter.
