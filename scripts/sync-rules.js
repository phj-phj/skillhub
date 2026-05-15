/**
 * Skillhub Sync Rules — 自动检测 AI 工具并写入/更新索引表到各平台规则文件
 *
 * 支持的平台:
 *   - Cursor         (.cursorrules 或 .cursor/rules/skillhub.mdc)
 *   - WindSurf       (.windsurfrules)
 *   - GitHub Copilot (.github/copilot-instructions.md)
 *   - Claude Code    (.claude/skillhub-index.md 静态备份)
 *
 * 用法:
 *   node sync-rules.js [--project-path <path>] [--cursor] [--windsurf] [--copilot] [--claude] [--all]
 *
 *   --all        写入所有检测到的平台
 *   --detect     仅检测并报告可用的平台 (默认行为)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 查找 registry.json（与 inject-hook.js 共用逻辑） ---
function findRegistry(projectPath) {
  if (projectPath) {
    const p = path.join(projectPath, ".claude", "skillhub-registry.json");
    if (fs.existsSync(p)) return p;
  }

  let dir = projectPath || process.cwd();
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, ".claude", "skillhub-registry.json");
    if (fs.existsSync(p)) return p;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

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
  lines.push("> 一个请求可能匹配多个技能——请检查所有触发词并并行调用匹配的技能。");
  lines.push("");

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
      const summary = (sk.summary || "").substring(0, 50);
      const triggers = (sk.keywords || []).slice(0, 5).join(", ");
      lines.push(`| ${sk.name} | ${summary} | ${triggers} |`);
    }

    lines.push("");
  }

  lines.push("> **说明**: 上表列出了所有可用的技能及其触发词。");
  lines.push("> 用户请求匹配触发词时，请主动建议使用对应技能。");
  lines.push(`> 索引生成时间: ${registry.generated_at || "未知"}`);

  return lines.join("\n");
}

// --- 更新规则文件（只替换 skillhub 区块，保留其他内容） ---
function updateRulesFile(filePath, table) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const marker = "## Skill Index (skillhub)";
  let content = "";

  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, "utf-8");
    // 移除已有的 skillhub 区块
    const startIdx = content.indexOf(marker);
    if (startIdx !== -1) {
      // 找到下一个 ## 的位置作为结束
      const afterBlock = content.indexOf("\n## ", startIdx + marker.length);
      if (afterBlock !== -1) {
        content = content.substring(0, startIdx) + content.substring(afterBlock);
      } else {
        content = content.substring(0, startIdx);
      }
    }
    content = content.trimEnd();
  }

  // 追加 skillhub 区块
  const newContent = content
    ? content + "\n\n" + table + "\n"
    : table + "\n";

  fs.writeFileSync(filePath, newContent, "utf-8");
}

// --- 平台检测 ---
const PLATFORMS = {
  cursor: {
    name: "Cursor",
    files: [".cursorrules", ".cursor/rules/skillhub.mdc"],
  },
  windsurf: {
    name: "WindSurf",
    files: [".windsurfrules"],
  },
  copilot: {
    name: "GitHub Copilot",
    files: [".github/copilot-instructions.md"],
  },
  claude: {
    name: "Claude Code",
    files: [".claude/skillhub-index.md"],
  },
};

function detectPlatforms(projectPath) {
  const detected = [];
  for (const [key, plat] of Object.entries(PLATFORMS)) {
    // 检测: 如果项目已有该文件，或者项目目录存在（总是使用第一个文件路径）
    const filePath = path.join(projectPath, plat.files[0]);
    const altPath = plat.files[1] ? path.join(projectPath, plat.files[1]) : null;

    if (fs.existsSync(filePath) || (altPath && fs.existsSync(altPath))) {
      detected.push({ key, ...plat });
    }
  }
  return detected;
}

// --- 主流程 ---
function main() {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf("--project-path");
  const projectPath = projectIdx !== -1 ? args[projectIdx + 1] : process.cwd();

  const doAll = args.includes("--all");
  const doDetect = args.includes("--detect") || (!doAll && args.length === 0);

  // 读取 registry
  const registryPath = findRegistry(projectPath);
  if (!registryPath) {
    console.error("[skillhub] registry.json 未找到，请先运行 node install.js 或 indexer.js。");
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  const table = formatTable(registry);

  if (!table) {
    console.error("[skillhub] 没有可用的技能。");
    process.exit(0);
  }

  // 仅检测模式
  if (doDetect) {
    console.log("=== skillhub 平台检测 ===\n");
    const detected = detectPlatforms(projectPath);
    if (detected.length === 0) {
      console.log("未检测到现有平台规则文件。");
    } else {
      for (const plat of detected) {
        console.log(`  ✓ ${plat.name} (${plat.files[0]})`);
      }
    }
    console.log("\n使用 --all 写入所有检测到的平台，或指定 --cursor / --windsurf / --copilot / --claude。");
    console.log("对于未检测到的平台，指定后会自动创建规则文件。");
    return;
  }

  // 写入模式
  const selected = [];
  if (doAll) {
    // 自动检测所有平台（包括未检测到的）
    for (const [key, plat] of Object.entries(PLATFORMS)) {
      const filePath = path.join(projectPath, plat.files[0]);
      const detected = fs.existsSync(filePath);
      selected.push({ key, ...plat, filePath, existed: detected });
    }
  } else {
    for (const key of ["cursor", "windsurf", "copilot", "claude"]) {
      if (args.includes("--" + key)) {
        const plat = PLATFORMS[key];
        const filePath = path.join(projectPath, plat.files[0]);
        const existed = fs.existsSync(filePath);
        selected.push({ key, ...plat, filePath, existed });
      }
    }
  }

  if (selected.length === 0) {
    console.log("请指定要写入的平台: --cursor / --windsurf / --copilot / --claude / --all");
    process.exit(0);
  }

  console.log("=== skillhub 同步索引表 ===\n");

  for (const plat of selected) {
    updateRulesFile(plat.filePath, table);
    const label = plat.existed ? "已更新" : "已创建";
    console.log(`  ✓ ${plat.name}: ${plat.filePath} (${label})`);
  }

  console.log(`\n已同步 ${selected.length} 个平台。`);
  console.log("提示: 后续添加/删除技能后，重新运行 node scripts/sync-rules.js --all 即可。");
}

main();
