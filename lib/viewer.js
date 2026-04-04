import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_PATH = join(__dirname, "..", "viewer.html");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateViewer(entries) {
  const categories = [...new Set(entries.map((e) => e.category))].sort();
  const allTags = [...new Set(entries.flatMap((e) => e.tags))].sort();
  const entriesJson = JSON.stringify(entries);

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>知识库 — ${entries.length} 条记录</title>
  <style>
    :root {
      --bg:       #1a1b2e;
      --surface:  #24283b;
      --surface2: #2f3549;
      --border:   #3d4166;
      --accent:   #7aa2f7;
      --purple:   #bb9af7;
      --cyan:     #7dcfff;
      --green:    #9ece6a;
      --orange:   #ff9e64;
      --red:      #f7768e;
      --text:     #c0caf5;
      --muted:    #565f89;
      --dim:      #414868;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Header ── */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo {
      font-size: 20px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.5px;
      white-space: nowrap;
    }
    .logo span { color: var(--purple); }
    .count-badge {
      background: var(--surface2);
      color: var(--muted);
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 10px;
      border: 1px solid var(--border);
      white-space: nowrap;
    }
    .search-wrap {
      flex: 1;
      max-width: 480px;
      margin-left: auto;
      position: relative;
    }
    .search-wrap svg {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      pointer-events: none;
    }
    #search {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px 8px 34px;
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    }
    #search:focus { border-color: var(--accent); }
    #search::placeholder { color: var(--muted); }

    /* ── Sidebar + Main ── */
    .layout {
      display: flex;
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
      gap: 24px;
    }
    .sidebar {
      width: 200px;
      flex-shrink: 0;
    }
    .sidebar-section { margin-bottom: 24px; }
    .sidebar-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .cat-btn {
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-radius: 6px;
      padding: 6px 10px;
      color: var(--text);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .cat-btn:hover { background: var(--surface2); }
    .cat-btn.active { background: var(--accent); color: var(--bg); font-weight: 600; }
    .cat-count {
      float: right;
      font-size: 11px;
      color: var(--muted);
      background: var(--surface2);
      padding: 1px 6px;
      border-radius: 8px;
    }
    .cat-btn.active .cat-count { background: rgba(0,0,0,0.2); color: rgba(0,0,0,0.6); }

    /* ── Tags sidebar ── */
    .tag-cloud { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag-pill {
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--cyan);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.1s;
      user-select: none;
    }
    .tag-pill:hover { border-color: var(--cyan); }
    .tag-pill.active { background: var(--cyan); color: var(--bg); border-color: var(--cyan); font-weight: 600; }

    /* ── Card grid ── */
    .main { flex: 1; min-width: 0; }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 8px;
    }
    .result-info { font-size: 13px; color: var(--muted); }
    .result-info strong { color: var(--text); }
    .sort-select {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 8px;
      color: var(--text);
      font-size: 12px;
      outline: none;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      transition: border-color 0.15s, transform 0.1s;
      cursor: default;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .card-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card-title {
      flex: 1;
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
    }
    .cat-label {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .card-summary {
      font-size: 13px;
      color: var(--muted);
      line-height: 1.6;
      margin-bottom: 12px;
    }
    .card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
    .card-tag {
      background: var(--surface2);
      color: var(--cyan);
      font-size: 11px;
      padding: 1px 7px;
      border-radius: 8px;
      cursor: pointer;
    }
    .card-tag:hover { text-decoration: underline; }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--dim);
      padding-top: 10px;
    }
    .card-date { font-size: 11px; color: var(--muted); }
    .expand-btn {
      background: none;
      border: none;
      color: var(--accent);
      font-size: 12px;
      cursor: pointer;
      padding: 0;
    }
    .expand-btn:hover { text-decoration: underline; }
    .card-raw {
      display: none;
      margin-top: 10px;
      padding: 10px;
      background: var(--bg);
      border-radius: 6px;
      border: 1px solid var(--dim);
      font-size: 12px;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
    }
    .card-raw.visible { display: block; }

    /* ── Empty state ── */
    .empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 60px 20px;
      color: var(--muted);
    }
    .empty h2 { font-size: 18px; margin-bottom: 8px; color: var(--dim); }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

    @media (max-width: 700px) {
      .layout { flex-direction: column; padding: 12px; }
      .sidebar { width: 100%; }
      header { flex-wrap: wrap; }
      .search-wrap { min-width: 100%; margin-left: 0; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">知识<span>库</span></div>
    <div class="count-badge" id="totalBadge">${entries.length} 条记录</div>
    <div class="search-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input id="search" type="text" placeholder="搜索知识库… (Ctrl+K)">
    </div>
  </header>

  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-title">分类</div>
        <button class="cat-btn active" data-cat="" onclick="setCategory(this, '')">
          全部 <span class="cat-count" id="allCount">${entries.length}</span>
        </button>
        ${categories
          .map((cat) => {
            const n = entries.filter((e) => e.category === cat).length;
            return `<button class="cat-btn" data-cat="${escapeHtml(cat)}" onclick="setCategory(this, '${escapeHtml(cat)}')">
          ${escapeHtml(cat)} <span class="cat-count">${n}</span>
        </button>`;
          })
          .join("\n        ")}
      </div>
      <div class="sidebar-section">
        <div class="sidebar-title">标签</div>
        <div class="tag-cloud" id="tagCloud">
          ${allTags
            .map(
              (t) =>
                `<span class="tag-pill" onclick="toggleTag(this, '${escapeHtml(t)}')">${escapeHtml(t)}</span>`
            )
            .join("\n          ")}
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="toolbar">
        <div class="result-info" id="resultInfo"></div>
        <select class="sort-select" id="sortSelect" onchange="render()">
          <option value="newest">最新优先</option>
          <option value="oldest">最早优先</option>
          <option value="title">按标题</option>
        </select>
      </div>
      <div class="grid" id="grid"></div>
    </main>
  </div>

<script>
const ENTRIES = ${entriesJson};

const CAT_COLORS = {
  "编程": ["#bb9af7","#1a1b2e"],
  "运维": ["#7dcfff","#1a1b2e"],
  "安全": ["#f7768e","#1a1b2e"],
  "AI": ["#9ece6a","#1a1b2e"],
  "科学": ["#ff9e64","#1a1b2e"],
  "工具": ["#7aa2f7","#1a1b2e"],
  "网络": ["#2ac3de","#1a1b2e"],
  "数学": ["#e0af68","#1a1b2e"],
  "历史": ["#db4b4b","#1a1b2e"],
};
function catColor(cat) {
  if (CAT_COLORS[cat]) return CAT_COLORS[cat];
  let h = 0;
  for (let i=0; i<cat.length; i++) h = (h*31 + cat.charCodeAt(i)) & 0xffff;
  const colors = ["#7aa2f7","#bb9af7","#7dcfff","#9ece6a","#ff9e64","#f7768e","#e0af68","#2ac3de"];
  return [colors[h % colors.length], "#1a1b2e"];
}

let activeCategory = "";
let activeTags = new Set();

function setCategory(btn, cat) {
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  activeCategory = cat;
  render();
}

function toggleTag(el, tag) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
    el.classList.remove("active");
  } else {
    activeTags.add(tag);
    el.classList.add("active");
  }
  render();
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit" })
    + " " + d.toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit" });
}

function getFiltered() {
  const q = document.getElementById("search").value.toLowerCase().trim();
  return ENTRIES.filter(e => {
    if (activeCategory && e.category !== activeCategory) return false;
    if (activeTags.size > 0 && ![...activeTags].every(t => e.tags.includes(t))) return false;
    if (q) {
      const haystack = [e.title, e.summary, e.raw, e.category, ...e.tags].join(" ").toLowerCase();
      if (!q.split(/\\s+/).every(word => haystack.includes(word))) return false;
    }
    return true;
  });
}

function render() {
  const sort = document.getElementById("sortSelect").value;
  let entries = getFiltered();
  if (sort === "newest") entries = [...entries].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === "oldest") entries = [...entries].sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  else entries = [...entries].sort((a,b) => a.title.localeCompare(b.title, "zh"));

  const info = document.getElementById("resultInfo");
  info.innerHTML = entries.length === ENTRIES.length
    ? \`共 <strong>\${entries.length}</strong> 条记录\`
    : \`找到 <strong>\${entries.length}</strong> / \${ENTRIES.length} 条\`;

  const grid = document.getElementById("grid");
  if (entries.length === 0) {
    grid.innerHTML = \`<div class="empty"><h2>没有匹配的记录</h2><p>尝试修改搜索词或清除筛选条件</p></div>\`;
    return;
  }

  grid.innerHTML = entries.map(e => {
    const [bg, fg] = catColor(e.category);
    const tags = e.tags.map(t =>
      \`<span class="card-tag" onclick="quickTag('\${esc(t)}')">#\${esc(t)}</span>\`
    ).join("");
    return \`<div class="card">
      <div class="card-header">
        <div class="card-title">\${esc(e.title)}</div>
        <span class="cat-label" style="background:\${bg};color:\${fg}">\${esc(e.category)}</span>
      </div>
      <div class="card-summary">\${esc(e.summary)}</div>
      <div class="card-tags">\${tags}</div>
      <div class="card-footer">
        <span class="card-date">\${formatDate(e.createdAt)}</span>
        <button class="expand-btn" onclick="toggleRaw(this)">展开原文 ▾</button>
      </div>
      <div class="card-raw">\${esc(e.raw)}</div>
    </div>\`;
  }).join("");
}

function toggleRaw(btn) {
  const raw = btn.closest(".card").querySelector(".card-raw");
  raw.classList.toggle("visible");
  btn.textContent = raw.classList.contains("visible") ? "收起原文 ▴" : "展开原文 ▾";
}

function quickTag(tag) {
  const pill = [...document.querySelectorAll(".tag-pill")].find(p => p.textContent === tag);
  if (pill) toggleTag(pill, tag);
  else {
    activeTags.add(tag);
    render();
  }
}

document.getElementById("search").addEventListener("input", render);
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    document.getElementById("search").focus();
  }
});

render();
</script>
</body>
</html>`;

  writeFileSync(VIEWER_PATH, html, "utf8");
}
