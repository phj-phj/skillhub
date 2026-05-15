/**
 * Skillhub Hook Injector — 纯读 registry.json，输出紧凑索引表
 *
 * 由 SessionStart Hook 在每次会话启动时调用。
 * 不做任何文件扫描，只读取已有的 registry.json。
 *
 * 兼容性:
 *   - 支持 Windows / macOS / Linux
 *   - 自动向上查找项目根目录中的 registry.json
 *   - 无需任何外部依赖
 *
 * 用法: node inject-hook.js [--project-path <path>]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 查找 registry.json ---
function findRegistry() {
  // 1. 如果明确指定了项目路径，直接查找
  const argIdx = process.argv.indexOf("--project-path");
  if (argIdx !== -1) {
    const p = path.join(process.argv[argIdx + 1], ".claude", "skillhub-registry.json");
    if (fs.existsSync(p)) return p;
  }

  // 2. 从当前目录向上查找 .claude/skillhub-registry.json
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, ".claude", "skillhub-registry.json");
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. 检查用户 home 目录
  const homePath = path.join(os.homedir(), ".claude", "skillhub-registry.json");
  if (fs.existsSync(homePath)) return homePath;

  return null;
}

// --- 格式化索引表 ---
function formatTable(registry) {
  const skills = registry.skills || [];
  if (skills.length === 0) return "";

  const lines = [];
  lines.push("## Skill Index (skillhub)");
  lines.push("");

  // 分组
  const groups = {};
  for (const sk of skills) {
    const src = sk.source || "project";
    (groups[src] = groups[src] || []).push(sk);
  }

  const labels = { project: "项目技能", user: "用户技能" };

  for (const [source, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    lines.push(`### ${labels[source] || source}`);
    lines.push("");
    lines.push("| Skill | 概要 | 触发词 |");
    lines.push("|-------|------|--------|");

    for (const sk of list) {
      const name = sk.name;
      const summary = (sk.summary || "").substring(0, 50);
      const triggers = (sk.keywords || []).slice(0, 5).join(", ");
      lines.push(`| ${name} | ${summary} | ${triggers} |`);
    }

    lines.push("");
  }

  lines.push("> Tip: 一个请求可能匹配多个技能——请并行调用所有匹配的技能。");
  lines.push("> 用法: `/skillname` 直接调用，或通过 Skill 工具并行调用多个。");

  return lines.join("\n");
}

// --- 主流程 ---
function main() {
  const registryPath = findRegistry();

  if (!registryPath) {
    // 静默退出，不输出到 stdout
    console.error("[skillhub] registry.json 未找到，跳过。请先运行 node install.js 或 indexer.js。");
    return;
  }

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch (err) {
    console.error("[skillhub] 无法解析 registry.json: " + err.message);
    return;
  }

  const table = formatTable(registry);
  if (table) console.log(table);
}

main();
