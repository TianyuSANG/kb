import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, basename } from "path";
import { createRequire } from "module";
import { addEntry, readDb } from "./db.js";
import { generateViewer } from "./viewer.js";

const require = createRequire(import.meta.url);

// ── Supported extensions ─────────────────────────────────────
const TEXT_EXTS  = new Set([".md", ".txt", ".markdown", ".rst", ".log"]);
const CODE_EXTS  = new Set([".js", ".ts", ".jsx", ".tsx", ".py", ".java",
                             ".c", ".cpp", ".cs", ".go", ".rs", ".rb",
                             ".php", ".swift", ".kt", ".sh", ".bash",
                             ".yaml", ".yml", ".toml", ".ini", ".json",
                             ".xml", ".sql", ".r", ".m", ".lua"]);
const HTML_EXTS  = new Set([".html", ".htm"]);
const CSV_EXTS   = new Set([".csv", ".tsv"]);
const ALL_SUPPORTED = new Set([
  ...TEXT_EXTS, ...CODE_EXTS, ...HTML_EXTS, ...CSV_EXTS,
  ".pdf", ".docx", ".xlsx", ".xls",
]);

// ── Text extractors ──────────────────────────────────────────

function extractText(file) { return readFileSync(file, "utf8"); }

function extractHtml(file) {
  const raw = readFileSync(file, "utf8");
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ").trim();
}

function extractCsv(file) {
  const ext = extname(file).toLowerCase();
  const sep = ext === ".tsv" ? "\t" : ",";
  const lines = readFileSync(file, "utf8").trim().split("\n");
  const header = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    return header.map((h, i) => `${h}: ${cols[i] ?? ""}`).join(" | ");
  });
  return `列名: ${header.join(", ")}\n\n${rows.join("\n")}`;
}

async function extractPdf(file) {
  const pdfParse = require("pdf-parse");
  const buffer = readFileSync(file);
  const data = await pdfParse(buffer);
  return data.text.replace(/\s{3,}/g, "\n\n").trim();
}

async function extractDocx(file) {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ path: file });
  return result.value.trim();
}

function extractXlsx(file) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(file);
  const parts = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(ws);
    if (csv.trim()) parts.push(`【${sheetName}】\n${csv}`);
  }
  return parts.join("\n\n");
}

async function extractContent(file) {
  const ext = extname(file).toLowerCase();
  if (TEXT_EXTS.has(ext) || CODE_EXTS.has(ext)) return extractText(file);
  if (HTML_EXTS.has(ext))  return extractHtml(file);
  if (CSV_EXTS.has(ext))   return extractCsv(file);
  if (ext === ".pdf")      return extractPdf(file);
  if (ext === ".docx")     return extractDocx(file);
  if (ext === ".xlsx" || ext === ".xls") return extractXlsx(file);
  throw new Error(`不支持的文件类型: ${ext}`);
}

// ── File collector ───────────────────────────────────────────

function collectFiles(pathArg) {
  if (!existsSync(pathArg)) throw new Error(`路径不存在: ${pathArg}`);
  const stat = statSync(pathArg);
  if (stat.isFile()) {
    const ext = extname(pathArg).toLowerCase();
    if (!ALL_SUPPORTED.has(ext)) {
      throw new Error(
        `不支持的文件类型: ${ext}\n支持格式: ${[...ALL_SUPPORTED].join(", ")}`
      );
    }
    return [pathArg];
  }
  // directory: scan one level
  return readdirSync(pathArg)
    .filter(f => ALL_SUPPORTED.has(extname(f).toLowerCase()))
    .map(f => join(pathArg, f))
    .filter(f => statSync(f).isFile());
}

// ── Main export ──────────────────────────────────────────────

export async function importFiles(pathArg, collectFn, onProgress) {
  const files = collectFiles(pathArg);
  if (files.length === 0) {
    const supported = [...ALL_SUPPORTED].join(", ");
    throw new Error(`没有找到可导入的文件\n支持格式: ${supported}`);
  }

  let imported = 0;
  let failed = 0;
  const errors = [];

  for (const file of files) {
    const name = basename(file);
    onProgress?.(`  处理中: ${name}`);
    try {
      const content = await extractContent(file);
      if (!content.trim()) {
        onProgress?.(`  跳过空文件: ${name}`);
        continue;
      }

      // Prepend filename as context hint for AI
      const ext = extname(file).toLowerCase();
      const hint = CODE_EXTS.has(ext)
        ? `[代码文件: ${name}]\n\n${content}`
        : content;

      const entry = await collectFn(hint);
      if (!entry.title || entry.title.length < 3) {
        entry.title = basename(file, extname(file));
      }
      // Store original content (without hint prefix) as raw
      entry.raw = content;

      addEntry(entry);
      imported++;
      onProgress?.(`  ✓ 已保存: "${entry.title}" [${entry.category}]`);
    } catch (e) {
      failed++;
      errors.push(`${name}: ${e.message}`);
      onProgress?.(`  ✗ 失败: ${name} — ${e.message}`);
    }
  }

  generateViewer(readDb().entries);
  return { imported, failed, total: files.length, errors };
}

export const SUPPORTED_EXTENSIONS = ALL_SUPPORTED;
