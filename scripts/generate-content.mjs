// scripts/generate-content.mjs
// Genera un .md in src/content/<category>/ con cover in public/images/
// Richiede: OPENAI_API_KEY, UNSPLASH_ACCESS_KEY

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Input da workflow
const CATEGORY = process.env.CATEGORY || "news"; // news | tests | guides
const USER_PROMPT = process.env.USER_PROMPT || "Novità automotive";
const IMAGE_QUERY = process.env.IMAGE_QUERY || USER_PROMPT;

// ---- Helper ---------------------------------------------------------------

const BASE_URL_TOKEN = "${import.meta.env.BASE_URL}";
const root = process.cwd();

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // rimuovi accenti
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function quote(s) {
  // escape doppi apici nel YAML
  return String(s).replace(/"/g, '\\"');
}

// ---- OpenAI content generation -------------------------------------------

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS = {
  news: (brief) => `
Sei un redattore auto. Scrivi una breve NEWS in italiano sul tema: "${brief}".
Requisiti:
- Titolo accattivante (massimo 80 caratteri).
- Sottotitolo/descrizione (una frase, 140-180 caratteri).
- Corpo: 4-6 paragrafi brevi con dati concreti e tono giornalistico.
- Evita affermazioni non verificabili.
RESTITUISCI in JSON: { "title": "...", "description":"...", "body":"<html semplice con <p>, <h2>, <ul> se serve>" }`,
  tests: (brief) => `
Sei un tester auto. Scrivi una PROVA su strada in italiano sul tema: "${brief}".
Requisiti:
- Titolo forte (<= 80).
- Descrizione sintetica (140-180).
- Struttura corpo in HTML semplice con sezioni:
  <h2>Come va</h2> <p>...</p>
  <h2>Consumi</h2> <p>...</p>
  <h2>Tecnologia e ADAS</h2> <p>...</p>
  <h2>Pro e Contro</h2> <ul><li>Pro: ...</li><li>Contro: ...</li></ul>
  <h2>Pagella</h2> <ul><li>Comfort: 8/10</li>...</ul>
- Tono chiaro, dati verosimili (indicativi), niente esagerazioni.
JSON: { "title":"...", "description":"...", "body":"<html...>" }`,
  guides: (brief) => `
Sei un autore di guide auto. Scrivi una GUIDA in italiano sul tema: "${brief}".
Requisiti:
- Titolo chiaro (<= 80).
- Descrizione (140-180).
- Corpo in HTML con sezioni:
  <h2>Perché è importante</h2>
  <h2>I punti chiave</h2> (lista)
  <h2>Costi e incentivi</h2>
  <h2>Checklist finale</h2>
JSON: { "title":"...", "description":"...", "body":"<html...>" }`,
};

async function generateStructuredJSON(kind, brief) {
  const prompt = PROMPTS[kind](brief);
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  let text = res.choices[0].message.content.trim();
  // Prova a trovare JSON nel testo
  const jsonMatch = text.match(/\{[\s\S]*\}$/);
  if (!jsonMatch) throw new Error("JSON non trovato nella risposta");
  return JSON.parse(jsonMatch[0]);
}

// ---- Unsplash download ----------------------------------------------------

async function fetchJSON(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}
async function fetchImageBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function downloadUnsplash(query, outPath) {
  if (!process.env.UNSPLASH_ACCESS_KEY) return false;
  const api = "https://api.unsplash.com/search/photos";
  const data = await fetchJSON(`${api}?per_page=1&query=${encodeURIComponent(query)}`, {
    Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
  });
  const photo = data?.results?.[0];
  if (!photo) return false;
  const url = photo.urls?.regular || photo.urls?.full || photo.urls?.small;
  if (!url) return false;
  const buf = await fetchImageBuffer(url);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, buf);
  return true;
}

// ---- Main ----------------------------------------------------------------

(async () => {
  console.log(`→ Generazione: ${CATEGORY} | brief="${USER_PROMPT}"`);
  const { title, description, body } = await generateStructuredJSON(CATEGORY, USER_PROMPT);

  const slug = slugify(title);
  const mdDir = path.join(root, "src", "content", CATEGORY === "tests" ? "tests" : CATEGORY);
  const imgDir = path.join(root, "public", "images");
  ensureDir(mdDir);
  ensureDir(imgDir);

  // Cover
  const coverFile = path.join(imgDir, `${slug}.jpg`);
  try {
    const ok = await downloadUnsplash(IMAGE_QUERY || title, coverFile);
    if (!ok) console.warn("⚠️  Nessuna immagine da Unsplash: userai placeholder se presente.");
  } catch (e) {
    console.warn("⚠️  Download immagine fallito:", e.message);
  }

  // Front-matter (SEMPre quotato)
  const frontmatter = [
    "---",
    `title: "${quote(title)}"`,
    `description: "${quote(description)}"`,
    `cover: "${BASE_URL_TOKEN}images/${slug}.jpg"`,
    `categories: ["${CATEGORY === "tests" ? "Tests" : CATEGORY.charAt(0).toUpperCase() + CATEGORY.slice(1)}"]`,
    `tags: ["auto","novità"]`,
    `author: "Redazione"`,
    `pubDate: "${todayISO()}"`,
    "---",
    "",
  ].join("\n");

  // Corpo: accettiamo HTML semplice dentro il markdown
  const content = `${frontmatter}\n${body}\n`;

  const mdFile = path.join(mdDir, `${slug}.md`);
  fs.writeFileSync(mdFile, content, "utf-8");

  console.log(`✔ Articolo creato: ${path.relative(root, mdFile)}`);
  console.log(`✔ Cover: ${path.relative(root, coverFile)} (se scaricata)`);
})();
