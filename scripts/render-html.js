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

// Agency-wide business defaults (not visual branding) — always applied
// regardless of what content.json says, per agency policy: every KP closes
// with the same point of contact, and payment is always staged per milestone
// rather than a flat prepayment split.
function loadAgencyDefaults() {
  return JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, "agency-defaults.json"), "utf8"));
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

// Per-slide caps for pricing/cases lists — these rows are short and don't
// vary much in height, so a fixed item count is a safe, simple guard against
// overflowing the fixed 1280x720 slide.
const MAX_PRICING_ITEMS_PER_SLIDE = 5;
const MAX_CASES_PER_SLIDE = 4;

// Splits into ceil(n/maxSize) chunks of as-even-as-possible size, instead of
// greedily filling each chunk to maxSize — avoids a lonely 1-item last slide
// (e.g. 6 items with maxSize=5 becomes 3+3, not 5+1).
function chunk(arr, maxSize) {
  const n = arr.length;
  if (n === 0) return [];
  const chunkCount = Math.ceil(n / maxSize);
  const base = Math.floor(n / chunkCount);
  const remainder = n % chunkCount;
  const out = [];
  let idx = 0;
  for (let c = 0; c < chunkCount; c++) {
    const size = base + (c < remainder ? 1 : 0);
    out.push(arr.slice(idx, idx + size));
    idx += size;
  }
  return out;
}

// Stage descriptions vary a lot in length (unlike pricing/cases), so a fixed
// item-per-slide cap either overflows on long descriptions or needlessly
// splits short ones. Instead, estimate each stage's rendered height from its
// description length and pack stages into slides by an estimated height
// budget. Constants are calibrated against templates/partials/scope.hbs +
// styles.css (.stage) and verified by rendering both a short-description and
// a long-description deck and checking for overflow.
const SCOPE_HEIGHT_BUDGET_PX = 480;
const SCOPE_CHARS_PER_LINE = 70;
const SCOPE_STAGE_BASE_HEIGHT_PX = 61; // title line + row padding + border
const SCOPE_STAGE_LINE_HEIGHT_PX = 22;

function estimateStageHeight(stage) {
  const lines = Math.max(1, Math.ceil((stage.description || "").length / SCOPE_CHARS_PER_LINE));
  return SCOPE_STAGE_BASE_HEIGHT_PX + lines * SCOPE_STAGE_LINE_HEIGHT_PX;
}

function chunkStages(stages) {
  const chunks = [];
  let current = [];
  let currentHeight = 0;
  for (const stage of stages) {
    const h = estimateStageHeight(stage);
    if (current.length > 0 && currentHeight + h > SCOPE_HEIGHT_BUDGET_PX) {
      chunks.push(current);
      current = [];
      currentHeight = 0;
    }
    current.push(stage);
    currentHeight += h;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function withPagedHeading(section, chunkIndex, chunkCount) {
  const heading = chunkCount > 1 ? `${section.heading} (${chunkIndex + 1}/${chunkCount})` : section.heading;
  return { ...section, heading };
}

function buildDeck(content) {
  const deck = [];
  let i = 1;
  const push = (type, data) => deck.push({ type, index: i++, data });

  push("cover", content.cover);
  push("problem", content.problem);
  push("solution", content.solution);

  const stageChunks = chunkStages(content.scope.stages);
  stageChunks.forEach((stages, ci) => {
    push("scope", { ...withPagedHeading(content.scope, ci, stageChunks.length), stages });
  });

  if (content.timeline) push("timeline", content.timeline);

  const itemChunks = chunk(content.pricing.items || [], MAX_PRICING_ITEMS_PER_SLIDE);
  if (itemChunks.length <= 1) {
    push("pricing", content.pricing);
  } else {
    itemChunks.forEach((items, ci) => {
      const isLast = ci === itemChunks.length - 1;
      push("pricing", {
        ...withPagedHeading(content.pricing, ci, itemChunks.length),
        items,
        total: isLast ? content.pricing.total : null,
        packages: isLast ? content.pricing.packages : null,
      });
    });
  }

  if (content.cases) {
    const caseChunks = chunk(content.cases.items, MAX_CASES_PER_SLIDE);
    caseChunks.forEach((items, ci) => {
      push("cases", { ...withPagedHeading(content.cases, ci, caseChunks.length), items });
    });
  }

  push("terms", content.terms);
  push("contacts", content.contacts);
  return deck;
}

function renderHtml(content) {
  registerHelpers();
  registerPartials();

  const brand = loadBrand();
  const agencyDefaults = loadAgencyDefaults();

  const context = JSON.parse(JSON.stringify(content));
  context.meta = context.meta || {};
  context.meta.dateFormatted = formatDateRu(context.meta.date);

  // Agency policy overrides — always applied, independent of what the
  // generated content.json contains for these two fields.
  context.contacts = context.contacts || {};
  context.contacts.heading = context.contacts.heading || "Контакты";
  context.contacts.personName = agencyDefaults.defaultContact.personName;
  context.contacts.messenger = agencyDefaults.defaultContact.messenger;

  context.terms = context.terms || {};
  context.terms.heading = context.terms.heading || "Условия";
  context.terms.paymentTerms = agencyDefaults.defaultPaymentTerms;

  context.brand = brand;
  context.deck = buildDeck(context);
  context.totalSlides = context.deck.length;
  context.fontFaceCss = buildFontFaceCss();
  context.brandVarsCss = buildBrandVarsCss(brand);
  context.stylesCss = fs.readFileSync(path.join(TEMPLATES_DIR, "styles.css"), "utf8");

  const templateSrc = fs.readFileSync(path.join(TEMPLATES_DIR, "kp.html.hbs"), "utf8");
  const template = Handlebars.compile(templateSrc, { noEscape: false });
  return template(context);
}

module.exports = { renderHtml };
