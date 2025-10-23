// scripts/generate-content.mjs
// Genera un articolo in src/content/<category>/ e una cover in public/images/<slug>-<ts>.jpg (se possibile).
// Secrets richiesti: OPENAI_API_KEY (obbligatorio), UNSPLASH_ACCESS_KEY (opzionale).

import fs from "node:fs";
import path from "node:path";

// ====== INPUT DAL WORKFLOW ==================================================
const CATEGORY = process.env.CATEGORY || "news"; // "news" | "tests" | "guides"
const USER_PROMPT = process.env.USER_PROMPT || "Novità automotive";
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// NON interpolare questo token: deve rimanere letterale nel .md
const BASE_URL_TOKEN = "${import.meta.env.BASE_URL}";

// ====== UTIL ================================================================
function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function nowStamp() {
  // es: 20251023T081530
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function quoteYAML(s) {
  return String(s).replace(/"/g, '\\"').replace(/\r/g, "");
}

// ====== OPENAI (risposta forzata in JSON) ==================================
import OpenAI from "openai";
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY mancante nei Secrets del repository.");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const PROMPTS = {
  news: (brief) => `
Sei un redattore automotive. Scrivi una NEWS in italiano sul tema: "${brief}".
Requisiti:
- title (<= 80 caratteri, senza virgolette)
- description (140–180 caratteri)
- body (HTML semplice con <p>, <h2>, <ul> se serve). Niente markdown.
Restituisci SOLO un JSON con chiavi: title, description, body.
`,
  tests: (brief) => `
Sei un tester auto. Scrivi una PROVA in italiano sul tema: "${brief}".
Requisiti: title (<=80), description (140–180), body in HTML con sezioni:
<h2>Come va</h2>, <h2>Consumi</h2>, <h2>Tecnologia e ADAS</h2>,
<h2>Pro e Contro</h2> (lista), <h2>Pagella</h2> (lista voti).
Solo JSON con: title, description, body.
`,
  guides: (brief) => `
Sei un autore di guide auto. Scrivi una GUIDA in italiano: "${brief}".
Requisiti: title (<=80), description (140–180), body HTML con:
<h2>Perché è importante</h2>, <h2>I punti chiave</h2> (lista),
<h2>Costi e incentivi</h2>, <h2>Checklist finale</h2>.
Solo JSON con: title, description, body.
`,
};

async function generateStructuredJSON(kind, brief) {
  const prompt = PROMPTS[kind] ? PROMPTS[kind](brief) : PROMPTS.news(brief);

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    response_format: { type: "json_object" }, // forza JSON valido
    messages: [{ role: "user", content: prompt }],
  });

  let text = res.choices?.[0]?.message?.content?.trim() ?? "";
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error("Risposta non JSON o invalida:\n", text);
    throw new Error("JSON non trovato o non valido");
  }
  if (!json.title || !json.description || !json.body) {
    throw new Error("JSON senza campi obbligatori");
  }
  return json;
}

// ====== UNSPLASH (opzionale) ===============================================
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
  if (!UNSPLASH_ACCESS_KEY) return false;
  try {
    const api = "https://api.unsplash.com/search/photos";
    const data = await fetchJSON(
      `${api}?per_page=1&query=${encodeURIComponent(query)}`,
      { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` }
    );
    const photo = data?.results?.[0];
    if (!photo) return false;
    const url = photo.urls?.regular || photo.urls?.full || photo.urls?.small;
    if (!url) return false;
    const buf = await fetchImageBuffer(url);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, buf);
    return true;
  } catch (e) {
    console.warn("⚠️  Download Unsplash fallito:", e.message);
    return false;
  }
}

// ====== MAIN ===============================================================
(async () => {
  try {
    console.log(`→ Generazione: ${CATEGORY} | brief="${USER_PROMPT}"`);

    const { title, description, body } = await generateStructuredJSON(
      CATEGORY,
      USER_PROMPT
    );

    const slug = slugify(title);
    const ts = nowStamp(); // garantisce filename univoco
    const mdDir = path.join(
      process.cwd(),
      "src",
      "content",
      CATEGORY === "tests" ? "tests" : CATEGORY
    );
    const imgDir = path.join(process.cwd(), "public", "images");
    ensureDir(mdDir);
    ensureDir(imgDir);

    // Cover (opzionale): usa la query del brief
    const coverFilename = `${slug}-${ts}.jpg`;
    const coverFile = path.join(imgDir, coverFilename);
    let coverExists = false;
    if (await downloadUnsplash(USER_PROMPT, coverFile)) {
      coverExists = true;
      console.log(`✔ Cover scaricata: public/images/${coverFilename}`);
    } else {
      console.log("ℹ️ Nessuna cover scaricata: verrà usato il placeholder.");
    }

    // Front-matter YAML (sempre quotato)
    const frontmatter = [
      "---",
      `title: "${quoteYAML(title)}"`,
      `description: "${quoteYAML(description)}"`,
      `cover: "${coverExists ? `${BASE_URL_TOKEN}images/${coverFilename}` : `${BASE_URL_TOKEN}images/placeholder.jpg`}"`,
      `categories: ["${CATEGORY === "tests" ? "Tests" : CATEGORY.charAt(0).toUpperCase() + CATEGORY.slice(1)}"]`,
      `tags: ["auto", "novità"]`,
      `author: "Redazione"`,
      `pubDate: "${todayISO()}"`,
      "---",
      "",
    ].join("\n");

    const content = `${frontmatter}\n${body}\n`;

    // Filename sempre nuovo con timestamp
    const mdFile = path.join(mdDir, `${slug}-${ts}.md`);
    fs.writeFileSync(mdFile, content, "utf-8");

    console.log(`✔ Articolo creato: ${path.relative(process.cwd(), mdFile)}`);

  } catch (e) {
    console.error("❌ Errore:", e.message);
    process.exit(1);
  }
})();
