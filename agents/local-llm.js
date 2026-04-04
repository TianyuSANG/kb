import { readConfig } from "../lib/config.js";
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  COLLECTOR_SYSTEM_PROMPT,
  ANALYST_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
  WRITER_SYSTEM_PROMPT,
} from "../lib/prompts.js";

async function ollamaChat(system, userContent) {
  const cfg = readConfig();
  const res = await fetch(`${cfg.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: cfg.ollamaModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      stream: false,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama 连接失败 (${res.status}): ${msg}\n请确认 Ollama 已启动：ollama serve`);
  }

  const data = await res.json();
  return data.message?.content ?? "";
}

export async function orchestrateLocal(userInput, dbEntries) {
  const dbContext =
    dbEntries.length > 0
      ? `DB_CONTEXT（当前知识库共 ${dbEntries.length} 条）:\n${JSON.stringify(
          dbEntries.map((e) => ({
            id: e.id,
            title: e.title,
            summary: e.summary,
            category: e.category,
            tags: e.tags,
          })),
          null,
          2
        )}\n\n`
      : "DB_CONTEXT: 知识库为空\n\n";

  const text = await ollamaChat(
    ORCHESTRATOR_SYSTEM_PROMPT,
    `${dbContext}USER_INPUT:\n${userInput}`
  );

  try {
    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(json);
    if (parsed.action === "collect") return { type: "collect", raw: parsed.raw ?? userInput };
    if (parsed.action === "analyze") return { type: "analyze", query: parsed.query ?? userInput };
    if (parsed.action === "write")   return { type: "write",   topic: parsed.topic ?? userInput };
    return { type: "answer", text: parsed.text ?? text };
  } catch {
    return { type: "answer", text };
  }
}

export async function collectLocal(rawText) {
  const text = await ollamaChat(COLLECTOR_SYSTEM_PROMPT, rawText);

  const json = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(json);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: parsed.title,
    summary: parsed.summary,
    category: parsed.category,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    raw: rawText,
    createdAt: new Date().toISOString(),
  };
}

export async function analyzeLocal(query, dbEntries) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const relevant = dbEntries
    .map((e) => {
      const hay = [e.title, e.summary, e.category, ...e.tags].join(" ").toLowerCase();
      return { entry: e, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .filter((s) => s.score > 0)
    .map((s) => s.entry);

  const context = relevant.length > 0
    ? `相关知识（${relevant.length} 条）：\n${JSON.stringify(relevant.map((e) => ({ title: e.title, summary: e.summary, tags: e.tags, raw: e.raw?.slice(0, 400) })), null, 2)}`
    : "知识库中无相关内容。";

  const text = await ollamaChat(ANALYST_SYSTEM_PROMPT, `${context}\n\n问题：${query}`);
  return { text, sourceCount: relevant.length };
}

export async function reviewLocal(dbEntries) {
  if (dbEntries.length === 0) return { duplicates: [], lowQuality: [], suggestions: ["知识库为空"] };
  const compact = dbEntries.slice(0, 30).map((e) => ({
    id: e.id, title: e.title, summary: e.summary, category: e.category,
    tags: e.tags, tagCount: e.tags?.length ?? 0,
  }));
  const text = await ollamaChat(REVIEWER_SYSTEM_PROMPT, `请审查：\n${JSON.stringify(compact, null, 2)}`);
  const json = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(json); } catch { return { duplicates: [], lowQuality: [], suggestions: [text] }; }
}

export async function writeLocal(topic, dbEntries) {
  const words = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const related = dbEntries
    .map((e) => {
      const hay = [e.title, e.summary, e.category, ...e.tags].join(" ").toLowerCase();
      return { entry: e, score: words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .filter((s) => s.score > 0)
    .map((s) => s.entry);

  const context = related.length > 0
    ? `素材（${related.length} 条）：\n${JSON.stringify(related.map((e) => ({ title: e.title, summary: e.summary, raw: e.raw?.slice(0, 600) })), null, 2)}`
    : "无相关素材，请基于通用知识创作。";

  const text = await ollamaChat(WRITER_SYSTEM_PROMPT, `${context}\n\n主题：${topic}`);
  return { text, sourceCount: related.length };
}

export async function checkOllama() {
  const cfg = readConfig();
  try {
    const res = await fetch(`${cfg.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models ?? []).map((m) => m.name);
    const hasModel = models.some((m) => m.startsWith(cfg.ollamaModel));
    return { ok: true, models, hasModel };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
