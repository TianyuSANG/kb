import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "db.json");

export function readDb() {
  if (!existsSync(DB_PATH)) {
    return { entries: [] };
  }
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf8"));
  } catch {
    return { entries: [] };
  }
}

export function writeDb(data) {
  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function addEntry(entry) {
  const db = readDb();
  db.entries.push(entry);
  writeDb(db);
}

export function deleteEntry(id) {
  const db = readDb();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => e.id !== id);
  if (db.entries.length === before) return false;
  writeDb(db);
  return true;
}

export function deleteEntries(ids) {
  const set = new Set(ids);
  const db = readDb();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => !set.has(e.id));
  writeDb(db);
  return before - db.entries.length;
}
