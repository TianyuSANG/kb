import Anthropic from "@anthropic-ai/sdk";
import { COLLECTOR_SYSTEM_PROMPT } from "../lib/prompts.js";

const client = new Anthropic();

export async function collect(rawText) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: COLLECTOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawText }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";

  // Strip markdown code fences if present
  const json = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(json);

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return {
    id,
    title: parsed.title,
    summary: parsed.summary,
    category: parsed.category,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    raw: rawText,
    createdAt: new Date().toISOString(),
  };
}
