/**
 * Skillhub Hook Injector — 自动维护 registry.json 并输出索引表
 *
 * 由 SessionStart Hook 在每次会话启动时调用。
 * 轻量检测技能变更 → 自动重建索引 → 输出紧凑索引表。
 *
 * 兼容性:
 *   - 支持 Windows / macOS / Linux
 *   - 自动向上查找项目根目录
 *   - 自动检测新增/删除技能并重建索引
 *   - 无需任何外部依赖
 *
 * 用法: node inject-hook.js [--project-path <path>]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// --- 路径工具 ---
function findProjectRoot() {
  const argIdx = process.argv.indexOf("--project-path");
  if (argIdx !== -1) return process.argv[argIdx + 1];

  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, ".claude", "skillhub-registry.json")) ||
        fs.existsSync(path.join(dir, ".claude", "commands"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// --- 查找 registry.json ---
function findRegistry(projectRoot) {
  if (projectRoot) {
    const p = path.join(projectRoot, ".claude", "skillhub-registry.json");
    if (fs.existsSync(p)) return p;
  }

  let dir = process.cwd();
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

// --- 轻量检测：比较文件数，有变化则自动重建 ---
function countSkillFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(dir, entry.name, "SKILL.md"))) count++;
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        count++;
      }
    }
  } catch { /* ignore permission errors */ }
  return count;
}

function checkAndRebuild(projectRoot, registryPath) {
  if (!projectRoot) return null;

  const projectCommands = path.join(projectRoot, ".claude", "commands");
  const userCommands = path.join(os.homedir(), ".claude", "commands");

  const actualProject = countSkillFiles(projectCommands);
  const actualUser = countSkillFiles(userCommands);

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch {
    return null;
  }

  const regProject = (registry.skills || []).filter(s => s.source === "project").length;
  const regUser = (registry.skills || []).filter(s => s.source === "user").length;

  // 文件数一致 → 无需重建
  if (actualProject === regProject && actualUser === regUser) {
    return registry;
  }

  // 有变化 → 自动重建
  console.error(`[skillhub] 检测到技能变更 (项目: ${regProject}→${actualProject}, 用户: ${regUser}→${actualUser})，自动重建索引...`);

  const indexerPath = path.join(path.dirname(__dirname), "scripts", "indexer.js");
  if (!fs.existsSync(indexerPath)) return registry; // indexer 不存在，用旧数据

  try {
    execSync(`node "${indexerPath}" --project-path "${projectRoot}"`, {
      encoding: "utf-8",
      timeout: 10000,
    });
    // 重新读取
    return JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch (err) {
    console.error("[skillhub] 自动重建失败: " + err.message);
    return registry; // 回退到旧数据
  }
}

// --- Format index output (ultra-compact) ---
function formatIndex(registry) {
  const skills = registry.skills || [];
  if (skills.length === 0) return "";

  const lines = [];
  lines.push("## Skill Index");
  lines.push("");

  // Group
  const groups = {};
  for (const sk of skills) {
    const src = sk.source || "project";
    (groups[src] = groups[src] || []).push(sk);
  }

  const labels = { project: "project:", user: "user:" };

  for (const [source, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    lines.push(labels[source] || source);
    for (const sk of list) {
      const triggers = (sk.keywords || []).slice(0, 4).join(", ");
      lines.push(`/${sk.name}  ${triggers}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- 主流程 ---
function main() {
  const projectRoot = findProjectRoot();
  const registryPath = findRegistry(projectRoot);

  // 如果 registry.json 不存在，尝试运行 indexer 首次创建
  if (!registryPath) {
    const indexerPath = path.join(path.dirname(__dirname), "scripts", "indexer.js");
    if (fs.existsSync(indexerPath)) {
      console.error("[skillhub] registry.json 不存在，首次自动创建...");
      try {
        execSync(`node "${indexerPath}" --project-path "${projectRoot}"`, {
          encoding: "utf-8",
          timeout: 10000,
        });
      } catch (err) {
        console.error("[skillhub] 首次创建失败: " + err.message);
        return;
      }
    } else {
      console.error("[skillhub] registry.json 未找到，indexer.js 也不存在，跳过。");
      return;
    }
  }

  // 重新查找（刚创建的）
  const finalPath = findRegistry(projectRoot);
  if (!finalPath) {
    console.error("[skillhub] 无法找到或创建 registry.json。");
    return;
  }

  // 轻量检测 → 有变化则自动重建
  let registry = checkAndRebuild(projectRoot, finalPath);
  if (!registry) {
    try {
      registry = JSON.parse(fs.readFileSync(finalPath, "utf-8"));
    } catch (err) {
      console.error("[skillhub] 无法解析 registry.json: " + err.message);
      return;
    }
  }

  const output = formatIndex(registry);
  if (output) console.log(output);
}

main();
