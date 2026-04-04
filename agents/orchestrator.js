import Anthropic from "@anthropic-ai/sdk";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../lib/prompts.js";

const client = new Anthropic();

export async function orchestrate(userInput, dbEntries) {
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

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${dbContext}USER_INPUT:\n${userInput}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";

  try {
    const json = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(json);

    if (parsed.action === "collect") {
      return { type: "collect", raw: parsed.raw ?? userInput };
    } else if (parsed.action === "answer") {
      return { type: "answer", text: parsed.text ?? text };
    } else {
      return { type: "answer", text: parsed.text ?? text };
    }
  } catch {
    // Fallback: treat as direct answer
    return { type: "answer", text };
  }
}
