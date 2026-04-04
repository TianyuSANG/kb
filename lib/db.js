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

export function updateEntry(id, updates) {
  const db = readDb();
  const idx = db.entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  db.entries[idx] = { ...db.entries[idx], ...updates };
  writeDb(db);
  return true;
}

// Spaced repetition: mark entry as reviewed, update next review date
// Intervals: 1 → 3 → 7 → 14 → 30 → 60 → 90 days
const INTERVALS = [1, 3, 7, 14, 30, 60, 90];

export function markReviewed(id) {
  const db = readDb();
  const entry = db.entries.find((e) => e.id === id);
  if (!entry) return null;
  const count = (entry.reviewCount ?? 0) + 1;
  const days = INTERVALS[Math.min(count - 1, INTERVALS.length - 1)];
  const nextReview = new Date(Date.now() + days * 86400000).toISOString();
  updateEntry(id, { reviewCount: count, nextReview, lastReviewed: new Date().toISOString() });
  return { days, nextReview };
}

export function getDueEntries() {
  const db = readDb();
  const now = new Date().toISOString();
  return db.entries.filter((e) => !e.nextReview || e.nextReview <= now);
}
