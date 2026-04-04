import Anthropic from "@anthropic-ai/sdk";
import { ANALYST_SYSTEM_PROMPT } from "../lib/prompts.js";

const client = new Anthropic();

// Simple keyword pre-filter to find relevant entries before sending to AI
function preFilter(query, entries, maxEntries = 20) {
  if (entries.length === 0) return [];
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const scored = entries.map((e) => {
    const hay = [e.title, e.summary, e.category, ...e.tags, e.raw].join(" ").toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0);
    return { entry: e, score };
  });
  scored.sort((a, b) => b.score - a.score);
  // Always include at least some entries even if no keyword match
  return scored.slice(0, maxEntries).filter((s) => s.score > 0 || entries.length <= 5).map((s) => s.entry);
}

export async function analyze(query, dbEntries) {
  const relevant = preFilter(query, dbEntries);

  const context = relevant.length > 0
    ? `相关知识条目（共 ${relevant.length} 条）：\n${JSON.stringify(
        relevant.map((e) => ({
          id: e.id,
          title: e.title,
          summary: e.summary,
          category: e.category,
          tags: e.tags,
          raw: e.raw?.slice(0, 500), // limit raw to keep prompt manageable
        })),
        null, 2
      )}`
    : `知识库中没有找到与"${query}"相关的内容，请基于通用知识回答。`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: ANALYST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${context}\n\n用户问题：${query}` }],
  });

  return {
    text: response.content.find((b) => b.type === "text")?.text ?? "",
    sourceCount: relevant.length,
  };
}
