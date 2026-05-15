/**
 * Skillhub Indexer — 扫描所有 SKILL.md，生成 registry.json
 *
 * 运行时机（仅手动触发）：
 *   1. 首次安装 skillhub
 *   2. 用户添加/删除了技能
 *   3. 用户明确要求重建索引
 *
 * 用法: node indexer.js [--project-path <path>]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// --- 配置 ---
const PROJECT_PATH = process.argv.includes("--project-path")
  ? process.argv[process.argv.indexOf("--project-path") + 1]
  : process.cwd();

const REGISTRY_OUTPUT = path.join(PROJECT_PATH, ".claude", "skillhub-registry.json");

const SEARCH_DIRS = [
  // 项目级技能
  {
    base: path.join(PROJECT_PATH, ".claude", "commands"),
    source: "project",
  },
  // 用户级技能（目录形式）
  {
    base: path.join(os.homedir(), ".claude", "commands"),
    source: "user",
  },
];

// --- YAML frontmatter 解析（轻量，无外部依赖） ---
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)---/);
  if (!match) return {};
  const fm = {};
  const lines = match[1].split("\n");
  let currentKey = null;
  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (keyMatch) {
      currentKey = keyMatch[1].trim();
      fm[currentKey] = keyMatch[2].trim();
    } else if (currentKey && line.trim()) {
      fm[currentKey] += " " + line.trim();
    }
  }
  return fm;
}

// --- 关键词提取 ---
function extractKeywords(description) {
  if (!description) return [];
  const keywords = new Set();

  // 1. 提取 "Use when" / "when user" 后的触发短语（最高优先级）
  const triggerMatch = description.match(
    /(?:Use when|when user)\s+(says?\s+)?(.+?)(?:\.\s*(?:Use|When|$)|$)/i
  );
  if (triggerMatch) {
    const triggerText = triggerMatch[2];
    // 按逗号/顿号/或/or 分割
    const parts = triggerText.split(/[,，]|\s+or\s+/i);
    for (const part of parts) {
      let cleaned = part.trim()
        .replace(/^[""]|[""]$/g, "")  // 去首尾引号
        .replace(/[""]/g, "")          // 去内部引号
        .replace(/^and\s+/i, "")       // 去前导 and
        .replace(/invokes?\s+\//g, "") // 去 "invokes /skill"
        .replace(/^(the\s+)?user\s+(says?\s+|wants\s+to\s+|asks\s+for\s+|mentions\s+)/i, "")
        .replace(/^or\s+(says?\s+|invokes?\s+)/i, "")
        .toLowerCase()
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 40) {
        keywords.add(cleaned);
      }
    }
  }

  // 2. 提取引号中的触发词/短语（如 "debug this", "use caveman"）
  const quoted = description.match(/[""]([^""]{2,40})[""]/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/[""""]/g, "").trim().toLowerCase();
      if (inner.length >= 2) keywords.add(inner);
    }
  }

  // 3. 提取技能名本身（通常是第一个词或斜杠命令）
  const skillNameMatch = description.match(/^(\w[\w-]*)/);
  if (skillNameMatch) {
    const name = skillNameMatch[1].toLowerCase();
    if (name.length > 2) keywords.add(name);
  }

  // 4. 若关键词不足，从首句提取有意义的实词
  if (keywords.size < 3) {
    const stopWords = new Set([
      "this", "that", "when", "user", "with", "from", "your", "want", "need",
      "mentions", "asks", "says", "use", "used", "using", "the", "and", "for",
      "what", "how", "does", "file", "files", "into", "its", "has", "been",
      "can", "all", "will", "not", "are", "you", "have", "had", "was", "were",
      "they", "them", "their", "our", "just", "also", "about", "than", "then",
      "each", "over", "under", "after", "before", "between", "through",
    ]);
    const firstSentence = description.split(/[.。]\s*/)[0];
    const words = firstSentence.split(/[\s,，;；:：!！?？()（）]+/);
    for (const word of words) {
      const w = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (w.length > 3 && !stopWords.has(w)) {
        keywords.add(w);
      }
    }
  }

  return [...keywords].slice(0, 8);
}

// --- 生成 summary（首句截断到 80 字符） ---
function generateSummary(description) {
  if (!description) return "";
  let text = description
    .replace(/^>\s*/, "")           // 去前导 blockquote
    .replace(/[""]/g, "")           // 去引号
    .trim();
  const firstSentence = text.split(/[.。]\s*/)[0].trim();
  if (firstSentence.length <= 80) return firstSentence;
  return firstSentence.substring(0, 77) + "...";
}

// --- 扫描技能 ---
function scanSkills() {
  const skills = [];

  for (const { base, source } of SEARCH_DIRS) {
    if (!fs.existsSync(base)) continue;

    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });

      for (const entry of entries) {
        let skillPath, name;

        if (entry.isDirectory()) {
          // 目录形式: skill-name/SKILL.md
          skillPath = path.join(base, entry.name, "SKILL.md");
          name = entry.name;
        } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
          // 扁平 .md 文件（用户级技能常见格式）
          skillPath = path.join(base, entry.name);
          name = entry.name.replace(/\.md$/, "");
        } else {
          continue;
        }

        if (!fs.existsSync(skillPath)) continue;

        try {
          const content = fs.readFileSync(skillPath, "utf-8");
          const fm = parseFrontmatter(content);

          const displayName = fm.name || name;
          const description = fm.description || "";
          const summary = generateSummary(description);
          const keywords = extractKeywords(description);
          const hasScripts = entry.isDirectory()
            ? fs.existsSync(path.join(base, entry.name, "scripts"))
            : false;

          skills.push({
            name: displayName,
            source,
            location: skillPath,
            summary,
            keywords,
            has_scripts: hasScripts,
            description_length: description.length,
          });
        } catch (err) {
          console.error(`[skillhub] 警告: 无法解析 ${skillPath}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[skillhub] 警告: 无法读取目录 ${base}: ${err.message}`);
    }
  }

  // 按 name 排序
  skills.sort((a, b) => a.name.localeCompare(b.name));

  return skills;
}

// --- 主流程 ---
function main() {
  console.error("[skillhub] 正在扫描技能...");

  const skills = scanSkills();

  if (skills.length === 0) {
    console.error("[skillhub] 未找到任何技能，仍将生成空 registry.json");
  } else {
    console.error(`[skillhub] 已找到 ${skills.length} 个技能`);
  }

  const registry = {
    version: 1,
    generated_at: new Date().toISOString(),
    skills,
  };

  // 确保输出目录存在
  const outDir = path.dirname(REGISTRY_OUTPUT);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 原子写入
  const tmpPath = REGISTRY_OUTPUT + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), "utf-8");
  fs.renameSync(tmpPath, REGISTRY_OUTPUT);

  console.error(`[skillhub] 已写入: ${REGISTRY_OUTPUT}`);
  console.error(`[skillhub] 技能数: ${skills.length}`);
  console.error(`[skillhub] 总描述字符: ${skills.reduce((s, sk) => s + sk.description_length, 0)}`);

  // 输出路径到 stdout，方便脚本调用
  console.log(REGISTRY_OUTPUT);
}

main();
