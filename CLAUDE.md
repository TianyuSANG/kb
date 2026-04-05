# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

```bash
npm install
node index.js
```

No build step, no tests, no linter. The app runs directly with Node.js ES modules.

## Architecture

AI-powered personal knowledge base REPL targeting Chinese-speaking users. All UI text, prompts, and AI output are in Simplified Chinese.

**Three operating modes** (set via `config` command or `config.json`):
- `claude` — Anthropic API (`ANTHROPIC_API_KEY` env var required), uses `claude-sonnet-4-6`
- `ollama` — Local Ollama LLM (configurable model/URL in `config.json`)
- `manual` — No AI; user enters metadata directly

**Request flow:**

```
index.js (readline REPL)
  → agents/orchestrator.js   (classifies intent: collect / analyze / answer / write)
  → agents/collector.js      (extracts title, summary, category, tags from raw input)
  → agents/analyst.js        (synthesizes answer across relevant DB entries)
  → agents/writer.js         (generates Markdown article from knowledge)
  → agents/reviewer.js       (detects duplicates and quality issues)
  → agents/reminder.js       (spaced repetition scheduling)
  → lib/db.js                (JSON persistence to db.json)
  → lib/viewer.js            (regenerates viewer.html after every write)
```

Each agent has a parallel implementation in `agents/local-llm.js` for Ollama mode. All agents are lazy-loaded at runtime based on config.

## Data

`db.json` — array of entry objects:
```js
{
  id, title, summary, category, tags,
  raw,           // original full content
  createdAt,     // ISO 8601
  reviewCount,   // spaced repetition counter
  nextReview     // ISO 8601 | null
}
```

Spaced repetition intervals: `[1, 3, 7, 14, 30, 60, 90]` days.

## Key Conventions

- **Agent prompts** (`lib/prompts.js`) always request JSON output. Agents strip markdown code fences before parsing.
- **Token optimization**: `analyst.js` and `writer.js` pre-filter entries by keyword score before sending to API.
- **viewer.html** is auto-regenerated on every DB write — it is a static file (gitignored), not a server.
- `config.json` is gitignored; users create it via the `config` command in the REPL.
