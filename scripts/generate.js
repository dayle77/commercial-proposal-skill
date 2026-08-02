#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const { renderHtml } = require("./render-html");
const { validateContent } = require("./validate-content");

function parseArgs(argv) {
  const args = { format: "pdf,png" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--content") args.content = argv[++i];
    else if (a === "--format") args.format = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`Использование:
  node scripts/generate.js --content <path/to/content.json> [--format pdf,png] [--out <dir>]

  --content   путь к content.json (обязателен)
  --format    pdf, png или pdf,png (по умолчанию: pdf,png)
  --out       папка вывода (по умолчанию: ./output/<outputSlug>)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.content) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const formats = args.format.split(",").map((f) => f.trim()).filter(Boolean);
  for (const f of formats) {
    if (f !== "pdf" && f !== "png") {
      console.error(`Неизвестный формат: "${f}". Допустимо: pdf, png`);
      process.exit(1);
    }
  }

  const contentPath = path.resolve(args.content);
  if (!fs.existsSync(contentPath)) {
    console.error(`Файл не найден: ${contentPath}`);
    process.exit(1);
  }

  let content;
  try {
    content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  } catch (err) {
    console.error(`Не удалось разобрать JSON в ${contentPath}: ${err.message}`);
    process.exit(1);
  }

  const errors = validateContent(content);
  if (errors.length > 0) {
    console.error("content.json не прошёл проверку:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const outDir = args.out
    ? path.resolve(args.out)
    : path.join(__dirname, "..", "output", content.outputSlug);
  fs.mkdirSync(outDir, { recursive: true });

  const html = renderHtml(content);
  fs.writeFileSync(path.join(outDir, "deck.html"), html, "utf8");

  const brand = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "assets", "brand.json"), "utf8")
  );
  const slideW = (brand.slide && brand.slide.widthPx) || 1280;
  const slideH = (brand.slide && brand.slide.heightPx) || 720;

  const result = { html: path.join(outDir, "deck.html") };

  const browser = await puppeteer.launch({ headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: slideW, height: slideH, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "load" });

    if (formats.includes("pdf")) {
      const pdfPath = path.join(outDir, "kp.pdf");
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        preferCSSPageSize: true,
      });
      result.pdf = pdfPath;
    }

    if (formats.includes("png")) {
      const pngDir = path.join(outDir, "png");
      fs.mkdirSync(pngDir, { recursive: true });
      const slides = await page.$$(".slide");
      result.png = [];
      for (const slide of slides) {
        const index = await slide.evaluate((el) => el.getAttribute("data-slide"));
        const num = String(index).padStart(2, "0");
        const pngPath = path.join(pngDir, `slide-${num}.png`);
        await slide.screenshot({ path: pngPath });
        result.png.push(pngPath);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
