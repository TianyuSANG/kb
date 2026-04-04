import Anthropic from "@anthropic-ai/sdk";
import { WRITER_SYSTEM_PROMPT } from "../lib/prompts.js";

const client = new Anthropic();

function findRelated(topic, entries, max = 15) {
  const words = topic.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const scored = entries.map((e) => {
    const hay = [e.title, e.summary, e.category, ...e.tags].join(" ").toLowerCase();
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 2 : 0), 0)
      + (e.tags.some((t) => words.includes(t)) ? 3 : 0);
    return { entry: e, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).filter((s) => s.score > 0).map((s) => s.entry);
}

export async function write(topic, dbEntries) {
  const related = findRelated(topic, dbEntries);

  const context = related.length > 0
    ? `可用素材（${related.length} 条相关知识）：\n${JSON.stringify(
        related.map((e) => ({
          title: e.title,
          summary: e.summary,
          category: e.category,
          tags: e.tags,
          raw: e.raw?.slice(0, 800),
        })),
        null, 2
      )}`
    : "知识库中暂无相关素材，请基于通用知识创作。";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: WRITER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${context}\n\n请以"${topic}"为主题写一篇文章。` }],
  });

  return {
    text: response.content.find((b) => b.type === "text")?.text ?? "",
    sourceCount: related.length,
  };
}
