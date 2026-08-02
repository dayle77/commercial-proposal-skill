"use strict";

const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");
const ASSETS_DIR = path.join(__dirname, "..", "assets");

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function formatDateRu(isoDate) {
  const d = isoDate ? new Date(isoDate) : new Date();
  if (Number.isNaN(d.getTime())) return isoDate || "";
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatPrice(value, currency) {
  if (typeof value !== "number") return value == null ? "" : String(value);
  const formatted = value.toLocaleString("ru-RU").replace(/ /g, " ");
  return currency ? `${formatted} ${currency}` : formatted;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fileToDataUri(absPath, mime) {
  const buf = fs.readFileSync(absPath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const FONT_FILES = {
  400: { cyrillic: "inter-cyrillic.woff2", latin: "inter-latin.woff2" },
  600: { cyrillic: "inter-cyrillic.woff2", latin: "inter-latin.woff2" },
  700: { cyrillic: "inter-cyrillic.woff2", latin: "inter-latin.woff2" },
  800: { cyrillic: "inter-cyrillic-800.woff2", latin: "inter-latin-800.woff2" },
};

function buildFontFaceCss() {
  const blocks = [];
  for (const [weight, files] of Object.entries(FONT_FILES)) {
    const cyrillic = fileToDataUri(path.join(ASSETS_DIR, "fonts", files.cyrillic), "font/woff2");
    const latin = fileToDataUri(path.join(ASSETS_DIR, "fonts", files.latin), "font/woff2");
    blocks.push(`@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;src:url(${cyrillic}) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;}`);
    blocks.push(`@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;src:url(${latin}) format('woff2');unicode-range:U+0000-00FF,U+2000-206F,U+20AC,U+2122;}`);
  }
  return blocks.join("\n");
}

function buildBrandVarsCss(brand) {
  const c = brand.colors || {};
  const s = brand.slide || { widthPx: 1280, heightPx: 720 };
  return `:root{
    --color-primary:${c.primary};
    --color-accent:${c.accent};
    --color-accent-soft:${c.accentSoft};
    --color-ink:${c.ink};
    --color-muted:${c.muted};
    --color-border:${c.border};
    --color-surface:${c.surface};
    --color-surface-alt:${c.surfaceAlt};
    --font-heading:'${(brand.fonts && brand.fonts.heading) || "Inter"}';
    --font-body:'${(brand.fonts && brand.fonts.body) || "Inter"}';
    --slide-w:${s.widthPx}px;
    --slide-h:${s.heightPx}px;
  }`;
}

const LOGO_MIME_BY_EXT = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function loadBrand() {
  const brand = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, "brand.json"), "utf8"));
  const logoPath = path.join(ASSETS_DIR, brand.logo || "logo.svg");
  const mime = LOGO_MIME_BY_EXT[path.extname(logoPath).toLowerCase()] || "image/png";
  brand.logoDataUri = fileToDataUri(logoPath, mime);
  return brand;
}

function registerPartials() {
  const dir = path.join(TEMPLATES_DIR, "partials");
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".hbs")) continue;
    const name = file.replace(/\.hbs$/, "");
    Handlebars.registerPartial(name, fs.readFileSync(path.join(dir, file), "utf8"));
  }
}

function registerHelpers() {
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("padIndex", (n) => pad2(n));
  Handlebars.registerHelper("padIndex0", (zeroBasedIndex) => pad2(zeroBasedIndex + 1));
  Handlebars.registerHelper("formatPrice", (value, currency) => formatPrice(value, currency));
}

function buildDeck(content) {
  const deck = [];
  let i = 1;
  deck.push({ type: "cover", index: i++ });
  deck.push({ type: "problem", index: i++ });
  deck.push({ type: "solution", index: i++ });
  deck.push({ type: "scope", index: i++ });
  if (content.timeline) deck.push({ type: "timeline", index: i++ });
  deck.push({ type: "pricing", index: i++ });
  if (content.cases) deck.push({ type: "cases", index: i++ });
  if (content.terms) deck.push({ type: "terms", index: i++ });
  deck.push({ type: "contacts", index: i++ });
  return deck;
}

function renderHtml(content) {
  registerHelpers();
  registerPartials();

  const brand = loadBrand();
  const context = JSON.parse(JSON.stringify(content));
  context.meta = context.meta || {};
  context.meta.dateFormatted = formatDateRu(context.meta.date);
  context.brand = brand;
  context.deck = buildDeck(content);
  context.totalSlides = context.deck.length;
  context.fontFaceCss = buildFontFaceCss();
  context.brandVarsCss = buildBrandVarsCss(brand);
  context.stylesCss = fs.readFileSync(path.join(TEMPLATES_DIR, "styles.css"), "utf8");

  const templateSrc = fs.readFileSync(path.join(TEMPLATES_DIR, "kp.html.hbs"), "utf8");
  const template = Handlebars.compile(templateSrc, { noEscape: false });
  return template(context);
}

module.exports = { renderHtml };
