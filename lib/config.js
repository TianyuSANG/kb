import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "config.json");

const DEFAULTS = {
  mode: "claude",           // "claude" | "ollama" | "manual"
  ollamaModel: "qwen2.5",
  ollamaUrl: "http://localhost:11434",
};

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(data) {
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function setMode(mode) {
  const cfg = readConfig();
  cfg.mode = mode;
  writeConfig(cfg);
}

export function setOllama(model, url) {
  const cfg = readConfig();
  if (model) cfg.ollamaModel = model;
  if (url) cfg.ollamaUrl = url;
  writeConfig(cfg);
}
