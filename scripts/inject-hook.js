/**
 * Skillhub Hook Injector — 纯读 registry.json，输出紧凑索引表
 *
 * 由 SystemPrompt Hook 在每次会话启动时调用。
 * 不做任何文件扫描，只读取已有的 registry.json。
 *
 * 用法: node inject-hook.js [--project-path <path>]
 */

const fs = require("fs");
const path = require("path");

const PROJECT_PATH = process.argv.includes("--project-path")
  ? process.argv[process.argv.indexOf("--project-path") + 1]
  : process.cwd();

const REGISTRY_PATH = path.join(PROJECT_PATH, ".claude", "skillhub-registry.json");

// --- 主流程 ---
function main() {
  // 1. 检查 registry.json 是否存在
  if (!fs.existsSync(REGISTRY_PATH)) {
    // 不存在则静默退出，不输出任何内容到 stdout
    console.error("[skillhub] registry.json 不存在，跳过。请先运行 indexer.js 构建索引。");
    return;
  }

  // 2. 读取 registry.json
  let registry;
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    registry = JSON.parse(raw);
  } catch (err) {
    console.error("[skillhub] 无法解析 registry.json: " + err.message);
    return;
  }

  const skills = registry.skills || [];
  if (skills.length === 0) return;

  // 3. 分组 (project / user)
  const groups = { project: [], user: [] };
  for (const sk of skills) {
    const src = sk.source || "project";
    (groups[src] = groups[src] || []).push(sk);
  }

  // 4. 输出紧凑 markdown 表格
  console.log("## Skill Index (skillhub)");
  console.log("");

  for (const [source, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    const label = source === "project" ? "项目技能" : "用户技能";
    console.log(`### ${label}`);
    console.log("");
    console.log("| Skill | 概要 | 触发词 |");
    console.log("|-------|------|--------|");

    for (const sk of list) {
      const name = sk.name;
      const summary = (sk.summary || "").substring(0, 50);
      const triggers = (sk.keywords || []).slice(0, 5).join(", ");
      console.log(`| ${name} | ${summary} | ${triggers} |`);
    }

    console.log("");
  }

  // 5. 使用提示
  console.log("> Tip: 一个请求可能匹配多个技能——请并行调用所有匹配的技能。");
  console.log("> 用法: `/skillname` 直接调用，或通过 Skill 工具并行调用多个。");
}

main();
