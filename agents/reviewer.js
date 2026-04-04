import Anthropic from "@anthropic-ai/sdk";
import { REVIEWER_SYSTEM_PROMPT } from "../lib/prompts.js";

const client = new Anthropic();

const BATCH_SIZE = 30; // max entries per review call

export async function review(dbEntries) {
  if (dbEntries.length === 0) return { duplicates: [], lowQuality: [], suggestions: ["知识库为空"] };

  // Send compact representation to save tokens
  const compact = dbEntries.slice(0, BATCH_SIZE).map((e) => ({
    id: e.id,
    title: e.title,
    summary: e.summary,
    category: e.category,
    tags: e.tags,
    tagCount: e.tags?.length ?? 0,
    summaryLen: e.summary?.length ?? 0,
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: REVIEWER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `请审查以下 ${compact.length} 条知识库条目：\n${JSON.stringify(compact, null, 2)}` }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  const json = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(json);
  } catch {
    return { duplicates: [], lowQuality: [], suggestions: [text] };
  }
}
