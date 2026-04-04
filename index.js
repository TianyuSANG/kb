import readline from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readDb, addEntry, deleteEntries } from "./lib/db.js";
import { generateViewer } from "./lib/viewer.js";
import { readConfig, setMode, setOllama } from "./lib/config.js";
import { importFiles } from "./lib/importer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_PATH = join(__dirname, "viewer.html");

// ── ANSI colors ──────────────────────────────────────────────
const R = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";

// ── Agent factory (lazy-loaded by mode) ──────────────────────
async function getAgents() {
  const cfg = readConfig();
  if (cfg.mode === "ollama") {
    const { orchestrateLocal, collectLocal, analyzeLocal, reviewLocal, writeLocal } = await import("./agents/local-llm.js");
    return { orchestrate: orchestrateLocal, collect: collectLocal, analyze: analyzeLocal, review: reviewLocal, write: writeLocal };
  }
  // default: claude
  const { orchestrate } = await import("./agents/orchestrator.js");
  const { collect } = await import("./agents/collector.js");
  const { analyze } = await import("./agents/analyst.js");
  const { review } = await import("./agents/reviewer.js");
  const { write } = await import("./agents/writer.js");
  return { orchestrate, collect, analyze, review, write };
}

// ── Manual entry via readline prompts ────────────────────────
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function manualAdd(rl) {
  console.log(`\n  ${BOLD}手动录入知识${R} ${DIM}(内容多行时，单独输入 --- 结束)${R}\n`);

  const title = (await ask(rl, `  ${CYAN}标题:${R} `)).trim();
  if (!title) { console.log(`  ${DIM}已取消${R}\n`); return; }

  const category = (await ask(rl, `  ${CYAN}分类:${R} `)).trim() || "其他";
  const tagsRaw = (await ask(rl, `  ${CYAN}标签 (逗号分隔):${R} `)).trim();
  const tags = tagsRaw ? tagsRaw.split(/[,，\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean) : [];
  const summary = (await ask(rl, `  ${CYAN}摘要 (可留空):${R} `)).trim();

  console.log(`  ${CYAN}内容:${R} ${DIM}(输入 --- 单独一行结束)${R}`);
  const lines = [];
  await new Promise((resolve) => {
    const handler = (line) => {
      if (line.trim() === "---") { rl.removeListener("line", handler); resolve(); }
      else lines.push(line);
    };
    rl.on("line", handler);
  });
  const raw = lines.join("\n").trim();

  if (!raw && !summary) { console.log(`  ${DIM}内容为空，已取消${R}\n`); return; }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    summary: summary || title,
    category,
    tags,
    raw: raw || summary,
    createdAt: new Date().toISOString(),
  };

  addEntry(entry);
  generateViewer(readDb().entries);

  console.log(`\n  ${GREEN}✓ 已保存${R} ${BOLD}${title}${R}`);
  console.log(`  ${DIM}分类：${R}${category}  ${DIM}标签：${R}${CYAN}${tags.join(", ") || "无"}${R}`);
  console.log(`  ${DIM}viewer.html 已更新 (共 ${readDb().entries.length} 条)${R}\n`);
}

// ── config command ────────────────────────────────────────────
async function cmdConfig(args) {
  const cfg = readConfig();

  if (!args.length) {
    console.log(`\n  ${BOLD}当前配置：${R}`);
    console.log(`  模式:         ${CYAN}${cfg.mode}${R}`);
    console.log(`  Ollama 模型:  ${cfg.ollamaModel}`);
    console.log(`  Ollama 地址:  ${cfg.ollamaUrl}`);
    console.log(`\n  ${DIM}用法：${R}`);
    console.log(`  ${CYAN}config mode claude${R}          切换到 Claude API 模式`);
    console.log(`  ${CYAN}config mode ollama${R}          切换到 Ollama 本地模式`);
    console.log(`  ${CYAN}config mode manual${R}          切换到纯手动录入模式`);
    console.log(`  ${CYAN}config ollama model qwen2.5${R} 设置 Ollama 模型`);
    console.log(`  ${CYAN}config ollama url http://...${R} 设置 Ollama 地址\n`);
    return;
  }

  if (args[0] === "mode" && args[1]) {
    const valid = ["claude", "ollama", "manual"];
    if (!valid.includes(args[1])) {
      console.log(`  ${RED}无效模式，可选：${valid.join(" / ")}${R}\n`);
      return;
    }
    setMode(args[1]);
    console.log(`  ${GREEN}✓ 模式已切换为：${args[1]}${R}\n`);

    if (args[1] === "ollama") {
      const { checkOllama } = await import("./agents/local-llm.js");
      process.stdout.write(`  ${DIM}正在检测 Ollama…${R}`);
      const status = await checkOllama();
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      if (!status.ok) {
        console.log(`  ${YELLOW}⚠ Ollama 未启动或无法连接：${status.error}${R}`);
        console.log(`  ${DIM}请先运行：ollama serve${R}\n`);
      } else if (!status.hasModel) {
        const cfg2 = readConfig();
        console.log(`  ${YELLOW}⚠ 模型 ${cfg2.ollamaModel} 未找到${R}`);
        console.log(`  ${DIM}已安装的模型：${status.models.join(", ") || "（无）"}${R}`);
        console.log(`  ${DIM}下载模型：ollama pull ${cfg2.ollamaModel}${R}\n`);
      } else {
        console.log(`  ${GREEN}✓ Ollama 已就绪，模型：${readConfig().ollamaModel}${R}\n`);
      }
    }
    return;
  }

  if (args[0] === "ollama") {
    if (args[1] === "model" && args[2]) { setOllama(args[2], null); console.log(`  ${GREEN}✓ 模型设为：${args[2]}${R}\n`); }
    else if (args[1] === "url" && args[2]) { setOllama(null, args[2]); console.log(`  ${GREEN}✓ 地址设为：${args[2]}${R}\n`); }
    else console.log(`  ${DIM}用法：config ollama model <名称>  /  config ollama url <地址>${R}\n`);
    return;
  }

  console.log(`  ${DIM}未知参数，输入 config 查看帮助${R}\n`);
}

// ── import command ────────────────────────────────────────────
async function cmdImport(pathArg) {
  if (!pathArg) {
    console.log(`  ${DIM}用法：import <文件路径或目录>（支持 .md / .txt）${R}\n`);
    return;
  }

  const cfg = readConfig();
  let collectFn;

  if (cfg.mode === "manual") {
    console.log(`  ${YELLOW}⚠ 手动模式下无法自动提取元数据，将以文件名作为标题、文件内容作为正文导入${R}`);
    const { basename, extname } = await import("path");
    collectFn = async (raw, filePath) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: filePath ? basename(filePath, extname(filePath)) : raw.slice(0, 60),
      summary: raw.slice(0, 120),
      category: "导入",
      tags: [],
      raw,
      createdAt: new Date().toISOString(),
    });
  } else {
    const agents = await getAgents();
    collectFn = agents.collect;
  }

  console.log(`\n  ${BOLD}开始导入：${pathArg}${R}  ${DIM}(模式: ${cfg.mode})${R}\n`);
  try {
    const result = await importFiles(pathArg, collectFn, (msg) => console.log(msg));
    console.log(`\n  ${GREEN}导入完成：${result.imported} 成功 / ${result.failed} 失败 / 共 ${result.total} 个文件${R}`);
    console.log(`  ${DIM}viewer.html 已更新 (共 ${readDb().entries.length} 条)${R}\n`);
  } catch (e) {
    console.log(`  ${RED}导入失败：${e.message}${R}\n`);
  }
}

// ── delete command ────────────────────────────────────────────
async function cmdDelete(args, rl) {
  const db = readDb();
  if (db.entries.length === 0) {
    console.log(`  ${DIM}知识库为空。${R}\n`);
    return;
  }

  // delete all
  if (args[0] === "all") {
    const answer = await ask(rl, `  ${RED}确认删除全部 ${db.entries.length} 条记录？(yes/no): ${R}`);
    if (answer.trim().toLowerCase() !== "yes") {
      console.log(`  ${DIM}已取消。${R}\n`);
      return;
    }
    deleteEntries(db.entries.map((e) => e.id));
    generateViewer([]);
    console.log(`  ${GREEN}✓ 已删除全部记录。${R}\n`);
    return;
  }

  // delete <编号> [编号2 ...]  — 1-based index from `list`
  if (args.length > 0) {
    const indices = args.map((a) => parseInt(a, 10) - 1).filter((i) => i >= 0 && i < db.entries.length);
    if (indices.length === 0) {
      console.log(`  ${RED}无效编号，请用 list 查看编号后再删除。${R}\n`);
      return;
    }
    const toDelete = indices.map((i) => db.entries[i]);
    console.log(`\n  将删除以下 ${toDelete.length} 条：`);
    toDelete.forEach((e) => console.log(`  ${DIM}•${R} ${e.title} ${DIM}(${e.category})${R}`));
    const answer = await ask(rl, `  确认？(yes/no): `);
    if (answer.trim().toLowerCase() !== "yes") {
      console.log(`  ${DIM}已取消。${R}\n`);
      return;
    }
    const count = deleteEntries(toDelete.map((e) => e.id));
    generateViewer(readDb().entries);
    console.log(`  ${GREEN}✓ 已删除 ${count} 条，剩余 ${readDb().entries.length} 条。${R}\n`);
    return;
  }

  // interactive: show list and prompt
  console.log(`\n  ${BOLD}当前知识库（共 ${db.entries.length} 条）：${R}`);
  db.entries.forEach((e, i) =>
    console.log(`  ${DIM}[${String(i + 1).padStart(2)}]${R} ${e.title}  ${DIM}(${e.category})${R}`)
  );
  console.log(`\n  ${DIM}输入编号删除，多个用空格隔开，all 删除全部，直接回车取消${R}`);
  const input = (await ask(rl, `  删除编号: `)).trim();
  if (!input) { console.log(`  ${DIM}已取消。${R}\n`); return; }
  if (input === "all") { await cmdDelete(["all"], rl); return; }
  await cmdDelete(input.split(/\s+/), rl);
}

// ── analyze command ───────────────────────────────────────────
async function cmdAnalyze(query) {
  if (!query) { console.log(`  ${DIM}用法：analyze <问题>  或直接输入复杂问题${R}\n`); return; }
  try {
    process.stdout.write(`\n  ${DIM}分析员正在深度分析…${R}`);
    const agents = await getAgents();
    const db = readDb();
    const result = await agents.analyze(query, db.entries);
    process.stdout.clearLine(0); process.stdout.cursorTo(0);
    console.log(`\n  ${BOLD}分析员（引用 ${result.sourceCount} 条知识）：${R}\n`);
    result.text.split("\n").forEach((l) => console.log(`  ${l}`));
    console.log();
  } catch (e) {
    process.stdout.clearLine?.(0); process.stdout.cursorTo?.(0);
    console.log(`  ${RED}错误：${e.message}${R}\n`);
  }
}

// ── review command ────────────────────────────────────────────
async function cmdReview() {
  const db = readDb();
  if (db.entries.length === 0) { console.log(`  ${DIM}知识库为空。${R}\n`); return; }
  try {
    process.stdout.write(`\n  ${DIM}审核员正在检查知识库…${R}`);
    const agents = await getAgents();
    const result = await agents.review(db.entries);
    process.stdout.clearLine(0); process.stdout.cursorTo(0);

    console.log(`\n  ${BOLD}审核报告${R}\n`);

    if (result.duplicates?.length > 0) {
      console.log(`  ${YELLOW}重复条目（${result.duplicates.length} 组）：${R}`);
      result.duplicates.forEach((d) => {
        const titles = d.ids.map((id) => db.entries.find((e) => e.id === id)?.title ?? id);
        console.log(`  ${DIM}•${R} ${titles.join(" / ")}  ${DIM}— ${d.reason}${R}`);
      });
      console.log();
    } else {
      console.log(`  ${GREEN}✓ 未发现重复条目${R}`);
    }

    if (result.lowQuality?.length > 0) {
      console.log(`\n  ${YELLOW}待改善条目（${result.lowQuality.length} 条）：${R}`);
      result.lowQuality.forEach((q) => {
        const title = db.entries.find((e) => e.id === q.id)?.title ?? q.id;
        console.log(`  ${DIM}•${R} ${title}  ${DIM}— ${q.issues?.join("、")}${R}`);
        if (q.suggestion) console.log(`    ${DIM}建议：${q.suggestion}${R}`);
      });
      console.log();
    } else {
      console.log(`  ${GREEN}✓ 条目质量良好${R}`);
    }

    if (result.suggestions?.length > 0) {
      console.log(`\n  ${BOLD}整体建议：${R}`);
      result.suggestions.forEach((s) => console.log(`  ${DIM}•${R} ${s}`));
    }
    console.log();
  } catch (e) {
    process.stdout.clearLine?.(0); process.stdout.cursorTo?.(0);
    console.log(`  ${RED}错误：${e.message}${R}\n`);
  }
}

// ── write command ─────────────────────────────────────────────
async function cmdWrite(topic) {
  if (!topic) { console.log(`  ${DIM}用法：write <主题>  例：write Docker入门指南${R}\n`); return; }
  try {
    process.stdout.write(`\n  ${DIM}写作员正在创作…${R}`);
    const agents = await getAgents();
    const db = readDb();
    const result = await agents.write(topic, db.entries);
    process.stdout.clearLine(0); process.stdout.cursorTo(0);
    console.log(`\n  ${BOLD}写作员（引用 ${result.sourceCount} 条知识）：${R}\n`);
    result.text.split("\n").forEach((l) => console.log(`  ${l}`));
    console.log();
  } catch (e) {
    process.stdout.clearLine?.(0); process.stdout.cursorTo?.(0);
    console.log(`  ${RED}错误：${e.message}${R}\n`);
  }
}

// ── remind command ────────────────────────────────────────────
async function cmdRemind(args, rl) {
  const { getDueList, markDone, getStats } = await import("./agents/reminder.js");
  const db = readDb();

  if (args[0] === "stats") {
    const s = getStats(db.entries);
    console.log(`\n  ${BOLD}复习统计：${R}`);
    console.log(`  总条目：${s.total}  已复习：${GREEN}${s.reviewed}${R}  从未复习：${YELLOW}${s.neverReviewed}${R}`);
    console.log(`  今日待复习：${RED}${s.due}${R}  未来7天到期：${CYAN}${s.upcoming7}${R}\n`);
    return;
  }

  const due = getDueList();
  if (due.length === 0) {
    console.log(`\n  ${GREEN}✓ 今日无待复习条目！${R}\n`);
    return;
  }

  console.log(`\n  ${BOLD}今日待复习（${due.length} 条）：${R}\n`);
  for (let i = 0; i < due.length; i++) {
    const e = due[i];
    const reviewInfo = e.reviewCount > 0
      ? `${DIM}已复习 ${e.reviewCount} 次${R}`
      : `${YELLOW}从未复习${R}`;
    console.log(`  ${DIM}[${i + 1}/${due.length}]${R} ${BOLD}${e.title}${R}  ${reviewInfo}`);
    console.log(`  ${DIM}分类：${e.category}  标签：${e.tags.join(", ")}${R}`);
    console.log(`  ${DIM}${e.summary}${R}\n`);

    const ans = await ask(rl, `  标记为已复习？(y跳过/n推迟/q退出) `);
    if (ans.trim().toLowerCase() === "q") break;
    if (ans.trim().toLowerCase() !== "n") {
      const res = markDone(e.id);
      console.log(`  ${GREEN}✓ 已记录，下次复习：${new Date(res.nextReview).toLocaleDateString("zh-CN")}（${res.days}天后）${R}\n`);
    } else {
      console.log(`  ${DIM}已推迟。${R}\n`);
    }
  }
}

// ── list command ──────────────────────────────────────────────
function cmdList() {
  const db = readDb();
  if (db.entries.length === 0) {
    console.log(`  ${DIM}知识库为空。${R}\n`);
    return;
  }
  console.log(`\n  ${BOLD}知识库共 ${db.entries.length} 条：${R}`);
  db.entries.forEach((e, i) => {
    console.log(
      `  ${DIM}[${String(i + 1).padStart(2)}]${R} ${BOLD}${e.title}${R}  ${DIM}(${e.category})${R}  ${CYAN}${e.tags.join(", ")}${R}`
    );
  });
  console.log();
}

// ── banner ────────────────────────────────────────────────────
function banner() {
  const cfg = readConfig();
  const modeLabel = { claude: `${BLUE}Claude API${R}`, ollama: `${GREEN}Ollama 本地${R}`, manual: `${MAGENTA}手动录入${R}` };
  console.log(`
${BLUE}${BOLD}  ╔════════════════════════════════════╗
  ║         个人知识库管理系统         ║
  ╚════════════════════════════════════╝${R}
  ${DIM}当前模式:${R} ${modeLabel[cfg.mode] ?? cfg.mode}

  ${DIM}智能命令（直接输入内容）：${R}
    输入知识内容  → 自动整理并存入知识库
    输入问题 (?)  → 从知识库中回答

  ${DIM}内置命令：${R}
    ${CYAN}add${R}              手动逐步录入知识
    ${CYAN}delete [编号]${R}    删除知识条目（交互式 / 指定编号 / all）
    ${CYAN}import <路径>${R}    批量导入文件（pdf/docx/xlsx/html/csv/代码等）
    ${CYAN}analyze <问题>${R}   分析员：深度分析并综合多条知识回答
    ${CYAN}write <主题>${R}     写作员：整合知识生成文章
    ${CYAN}review${R}           审核员：检测重复/低质量条目
    ${CYAN}remind${R}           提醒员：今日待复习条目（间隔重复）
    ${CYAN}remind stats${R}     查看复习统计
    ${CYAN}list${R}             列出所有条目
    ${CYAN}config${R}           查看/切换模式（claude/ollama/manual）
    ${CYAN}open${R}             显示 viewer.html 路径
    ${CYAN}clear${R}            清屏
    ${CYAN}exit${R}             退出
`);
}

// ── Main REPL ─────────────────────────────────────────────────
generateViewer(readDb().entries);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

banner();

async function handleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  const [cmd, ...rest] = trimmed.split(/\s+/);

  switch (cmd.toLowerCase()) {
    case "exit": case "quit":
      console.log(`\n  ${DIM}再见！${R}\n`);
      rl.close();
      process.exit(0);
    case "list":    cmdList(); return;
    case "open":    console.log(`\n  ${YELLOW}${VIEWER_PATH}${R}\n`); return;
    case "clear":   console.clear(); banner(); return;
    case "add":      await manualAdd(rl); return;
    case "delete":   await cmdDelete(rest, rl); return;
    case "import":   await cmdImport(rest.join(" ") || null); return;
    case "config":   await cmdConfig(rest); return;
    case "analyze":  await cmdAnalyze(rest.join(" ") || null); return;
    case "review":   await cmdReview(); return;
    case "write":    await cmdWrite(rest.join(" ") || null); return;
    case "remind":   await cmdRemind(rest, rl); return;
  }

  const cfg = readConfig();

  // Manual mode: auto-route all free text to manual add
  if (cfg.mode === "manual") {
    console.log(`  ${DIM}手动模式下请使用 add 命令录入知识，或 config mode claude/ollama 切换模式${R}\n`);
    return;
  }

  // AI modes: Claude or Ollama
  try {
    process.stdout.write(`\n  ${DIM}调度员正在分析…${R}`);
    const agents = await getAgents();
    const db = readDb();
    const decision = await agents.orchestrate(trimmed, db.entries);
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);

    if (decision.type === "collect") {
      process.stdout.write(`  ${DIM}整理员正在处理…${R}`);
      const entry = await agents.collect(decision.raw);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);

      addEntry(entry);
      generateViewer(readDb().entries);

      console.log(`\n  ${GREEN}✓ 已保存${R} ${BOLD}${entry.title}${R}`);
      console.log(`  ${DIM}分类：${R}${entry.category}  ${DIM}标签：${R}${CYAN}${entry.tags.join(", ")}${R}`);
      console.log(`  ${DIM}摘要：${entry.summary}${R}`);
      console.log(`  ${DIM}viewer.html 已更新 (共 ${readDb().entries.length} 条)${R}\n`);
    } else if (decision.type === "analyze") {
      await cmdAnalyze(decision.query ?? trimmed);
    } else if (decision.type === "write") {
      await cmdWrite(decision.topic ?? trimmed);
    } else {
      console.log(`\n  ${BOLD}调度员：${R}\n`);
      decision.text.split("\n").forEach((l) => console.log(`  ${l}`));
      console.log();
    }
  } catch (err) {
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
    if (err.message?.includes("401") || err.message?.includes("auth")) {
      console.error(`  ${YELLOW}⚠ 认证失败：请设置 ANTHROPIC_API_KEY 环境变量${R}\n`);
    } else {
      console.error(`  ${RED}错误：${err.message}${R}\n`);
    }
  }
}

function prompt() {
  const cfg = readConfig();
  const modeShort = { claude: "claude", ollama: "ollama", manual: "manual" };
  rl.question(`${BLUE}kb${DIM}(${modeShort[cfg.mode]})>${R} `, async (input) => {
    await handleInput(input);
    prompt();
  });
}

prompt();
