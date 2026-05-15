/**
 * Skillhub 一键安装脚本 — 跨平台自动安装
 *
 * 用法: node install.js [--user] [--project <path>] [--all]
 *
 *   --user           仅安装到用户级 (~/.claude/)
 *   --project <path> 仅安装到指定项目
 *   --all            同时安装到用户级和当前项目 (默认)
 *
 * 示例:
 *   node install.js                          # 默认: 用户级 + 当前目录项目
 *   node install.js --user                   # 仅用户级
 *   node install.js --project /path/to/proj  # 仅指定项目
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 配置 ---
const HOME = os.homedir();
const USER_COMMANDS = path.join(HOME, ".claude", "commands", "skillhub");
const USER_SETTINGS = path.join(HOME, ".claude", "settings.json");

// 本脚本所在目录 = skillhub 仓库根目录
const SKILLHUB_SRC = path.resolve(__dirname, "..");

// --- 工具函数 ---
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function writeJSON(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

// --- 安装步骤 ---
function installUserLevel() {
  console.log("\n[1/4] 安装到用户级: " + USER_COMMANDS);

  // 复制 skillhub 核心文件（不复制 README/LICENSE/.gitignore）
  const scriptsSrc = path.join(SKILLHUB_SRC, "scripts");
  const scriptsDest = path.join(USER_COMMANDS, "scripts");
  copyDir(scriptsSrc, scriptsDest);

  const skillMdSrc = path.join(SKILLHUB_SRC, "SKILL.md");
  const skillMdDest = path.join(USER_COMMANDS, "SKILL.md");
  fs.copyFileSync(skillMdSrc, skillMdDest);

  console.log("   ✓ 已复制到用户级命令目录");
}

function installProjectLevel(projectPath) {
  console.log("\n[2/4] 安装到项目级: " + projectPath);

  const projectCommands = path.join(projectPath, ".claude", "commands", "skillhub");
  const scriptsSrc = path.join(SKILLHUB_SRC, "scripts");
  const scriptsDest = path.join(projectCommands, "scripts");
  copyDir(scriptsSrc, scriptsDest);

  const skillMdSrc = path.join(SKILLHUB_SRC, "SKILL.md");
  const skillMdDest = path.join(projectCommands, "SKILL.md");
  fs.copyFileSync(skillMdSrc, skillMdDest);

  console.log("   ✓ 已复制到项目命令目录");
}

function buildIndex(projectPath) {
  console.log("\n[3/4] 构建初始技能索引...");

  const indexerPath = path.join(USER_COMMANDS, "scripts", "indexer.js");
  if (!fs.existsSync(indexerPath)) {
    console.log("   ⚠ indexer.js 不存在，跳过。");
    return;
  }

  try {
    const { execSync } = require("child_process");
    const result = execSync(`node "${indexerPath}" --project-path "${projectPath}"`, {
      encoding: "utf-8",
      cwd: projectPath,
    });
    console.log("   ✓ " + result.trim().split("\n").slice(-2).join("\n"));
  } catch (err) {
    console.log("   ⚠ 索引构建失败: " + err.message);
    console.log("   你可以稍后手动运行: node .claude/commands/skillhub/scripts/indexer.js");
  }
}

function configureHook() {
  console.log("\n[4/4] 配置 SessionStart Hook...");

  // 生成跨平台 hook 命令
  const hookCmd = process.platform === "win32"
    ? `node "${path.join(USER_COMMANDS, "scripts", "inject-hook.js").replace(/\\/g, "/")}"`
    : `node "${path.join(USER_COMMANDS, "scripts", "inject-hook.js")}"`;

  const settings = readJSON(USER_SETTINGS);

  // 检查是否已有 skillhub hook
  if (settings.hooks && settings.hooks.SessionStart) {
    for (const entry of settings.hooks.SessionStart) {
      if (entry.hooks) {
        for (const h of entry.hooks) {
          if (h.command && h.command.includes("skillhub")) {
            console.log("   ✓ Hook 已存在，跳过配置。");
            return;
          }
        }
      }
    }
  }

  // 添加 hook
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  settings.hooks.SessionStart.push({
    hooks: [
      {
        type: "command",
        command: hookCmd,
      },
    ],
  });

  writeJSON(USER_SETTINGS, settings);
  console.log("   ✓ SessionStart Hook 已配置: " + hookCmd);
}

// --- 主流程 ---
function main() {
  const args = process.argv.slice(2);

  const doUser = args.includes("--user") || args.includes("--all") || args.length === 0;
  const doProject = args.includes("--all") || args.length === 0;
  const projectIdx = args.indexOf("--project");
  const projectPath = projectIdx !== -1 ? args[projectIdx + 1] : (doProject ? process.cwd() : null);

  console.log("=== Skillhub 安装 ===");
  console.log("平台: " + os.platform() + " (" + os.release() + ")");
  console.log("用户目录: " + HOME);

  if (doUser) installUserLevel();
  if (projectPath) installProjectLevel(projectPath);

  // 构建索引 (使用项目路径)
  const indexProject = projectPath || process.cwd();
  buildIndex(indexProject);

  // 配置 hook
  if (doUser) configureHook();

  console.log("\n=== 安装完成 ===");
  console.log("下次启动 Claude Code 时，skillhub 将自动生效。");
  console.log("测试: node \"" + path.join(USER_COMMANDS, "scripts", "inject-hook.js") + "\"");
}

main();
