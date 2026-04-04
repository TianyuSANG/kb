// Pure logic agent — no AI API needed, just spaced repetition scheduling
import { getDueEntries, markReviewed } from "../lib/db.js";

export function getDueList() {
  return getDueEntries();
}

export function markDone(id) {
  return markReviewed(id);
}

export function getStats(entries) {
  const now = new Date().toISOString();
  const total = entries.length;
  const reviewed = entries.filter((e) => e.reviewCount > 0).length;
  const due = entries.filter((e) => !e.nextReview || e.nextReview <= now).length;
  const upcoming7 = entries.filter((e) => {
    if (!e.nextReview || e.nextReview <= now) return false;
    const days7 = new Date(Date.now() + 7 * 86400000).toISOString();
    return e.nextReview <= days7;
  }).length;
  return { total, reviewed, due, upcoming7, neverReviewed: total - reviewed };
}
