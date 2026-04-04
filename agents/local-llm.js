import { readConfig } from "../lib/config.js";
import { ORCHESTRATOR_SYSTEM_PROMPT, COLLECTOR_SYSTEM_PROMPT } from "../lib/prompts.js";

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
