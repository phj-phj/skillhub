/**
 * Skillhub Indexer - scan SKILL.md files, build registry.json
 *
 * When to run (manual only):
 *   1. First install of skillhub
 *   2. User added/removed skills
 *   3. User explicitly asks to rebuild index
 *
 * Usage: node indexer.js [--project-path <path>]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const PROJECT_PATH = process.argv.includes("--project-path")
  ? process.argv[process.argv.indexOf("--project-path") + 1]
  : process.cwd();

const REGISTRY_OUTPUT = path.join(PROJECT_PATH, ".claude", "skillhub-registry.json");

const SEARCH_DIRS = [
  { base: path.join(PROJECT_PATH, ".claude", "commands"), source: "project" },
  { base: path.join(os.homedir(), ".claude", "commands"), source: "user" },
];

// --- YAML frontmatter parser ---
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

// --- Extract body after frontmatter ---
function getBody(content) {
  const match = content.match(/^---\s*\n[\s\S]*?---\n*/);
  if (!match) return content;
  return content.substring(match[0].length);
}

// --- Keyword extraction ---
function extractKeywords(description, bodyContent) {
  if (!description) return [];
  const keywords = new Set();

  // 1. "Use when" / "when user" trigger phrases (highest priority)
  // Split description on the trigger marker, take everything after it
  const useWhenMatch = description.match(/Use\s+when\s+(.+)/i);
  const whenUserMatch = description.match(/[Ww]hen\s+user\s+(?:says?\s+)?(.+)/i);
  const triggerText = useWhenMatch ? useWhenMatch[1] : (whenUserMatch ? whenUserMatch[1] : null);

  if (triggerText) {
    // Clean up and split by comma/or
    const cleaned = triggerText
      .replace(/^[""]|[""]$/g, "")
      .replace(/[""]/g, "")
      .replace(/^(the\s+)?user\s+(says?\s+|wants\s+to\s+|asks\s+for\s+|mentions\s+)/i, "")
      .trim();

    // Split by common delimiters
    const parts = cleaned.split(/[,，]|\s+or\s+|\s+and\s+/i);
    for (const part of parts) {
      let p = part.trim()
        .replace(/^or\s+/i, "")
        .replace(/invokes?\s+\//g, "")
        .toLowerCase()
        .trim();
      // Remove trailing period
      p = p.replace(/\.$/, "").trim();
      if (p.length >= 2 && p.length <= 80) {
        keywords.add(p);
      }
    }
  }

  // 1b. "Run before" / "or if" patterns (used by setup-matt-pocock-skills etc.)
  const runBeforeMatch = description.match(/Run\s+before\s+(?:first\s+)?use\s+of\s+(.+)/i);
  if (runBeforeMatch) {
    const skills = runBeforeMatch[1].replace(/`/g, "").trim().toLowerCase();
    keywords.add("setup skills for: " + skills.substring(0, 60));
  }
  const orIfMatch = description.match(/or\s+if\s+(those\s+)?skills\s+appear\s+to\s+be\s+(.+)/i);
  if (orIfMatch) {
    const context = orIfMatch[2].replace(/\.$/, "").trim().toLowerCase();
    if (context.length >= 5 && context.length <= 60) {
      keywords.add(context);
    }
  }

  // 2. Quoted trigger phrases
  const quoted = description.match(/[""]([^""]{2,40})[""]/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/[""""]/g, "").trim().toLowerCase();
      if (inner.length >= 2) keywords.add(inner);
    }
  }

  // 3. Skill name itself
  const skillNameMatch = description.match(/^(\w[\w-]*)/);
  if (skillNameMatch) {
    const name = skillNameMatch[1].toLowerCase();
    if (name.length > 2) keywords.add(name);
  }

  // 4. Extract meaningful phrases from body when keywords are sparse
  if (keywords.size < 4 && bodyContent) {
    // 4a. "TRIGGER when:" pattern
    const bodyTrigger = bodyContent.match(/TRIGGER\s+when:\s*(.+?)(?:\.|$)/im);
    if (bodyTrigger) {
      const parts = bodyTrigger[1].split(/[,，]|\s+or\s+/i);
      for (const part of parts) {
        const cleaned = part.trim().toLowerCase().replace(/[.;]$/g, "");
        if (cleaned.length >= 3 && cleaned.length <= 80) {
          keywords.add(cleaned);
        }
      }
    }

    // 4b. First ## heading
    const headingMatch = bodyContent.match(/^##\s+(.+)$/m);
    if (headingMatch) {
      const heading = headingMatch[1].trim().toLowerCase();
      if (heading.length >= 2 && heading.length <= 30) {
        keywords.add(heading);
      }
    }

    // 4c. Bigrams from first paragraph of body
    if (keywords.size < 4) {
      const firstPara = bodyContent.split(/\n\n|$/)[0].trim();
      const stopWords = new Set([
        "this", "that", "when", "with", "from", "your", "want", "need",
        "the", "and", "for", "what", "how", "does", "file", "files",
        "into", "its", "has", "been", "can", "all", "will", "not", "are",
        "you", "have", "had", "was", "were", "they", "them", "their",
        "our", "just", "also", "about", "than", "then", "each", "over",
        "under", "after", "before", "between", "through",
      ]);
      const words = firstPara
        .replace(/[#*>`\[\]()]/g, "")
        .split(/[\s,，;；:：!！?？.。]+/)
        .map(w => w.toLowerCase().replace(/[^a-z0-9-]/g, ""))
        .filter(w => w.length > 3 && !stopWords.has(w));

      for (let i = 0; i < words.length - 1 && keywords.size < 6; i++) {
        const bigram = words[i] + " " + words[i + 1];
        if (bigram.length >= 5 && bigram.length <= 60) {
          keywords.add(bigram);
        }
      }

      if (keywords.size < 4) {
        for (const w of words) {
          if (keywords.size >= 6) break;
          keywords.add(w);
        }
      }
    }
  }

  // 5. Final fallback: individual meaningful words from description
  if (keywords.size < 3) {
    const stopWords = new Set([
      "this", "that", "when", "with", "from", "your", "want", "need",
      "the", "and", "for", "what", "how", "does", "file", "files",
    ]);
    const words = description.split(/[\s,，;；:：!！?？()（）]+/);
    for (const word of words) {
      const w = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (w.length > 3 && !stopWords.has(w)) {
        keywords.add(w);
      }
    }
  }

  return [...keywords].slice(0, 8);
}

// --- Summary: use full description + body fallback ---
function generateSummary(description, bodyContent) {
  if (!description && bodyContent) {
    const firstLine = bodyContent.split(/[.\n]/)[0].trim();
    if (!firstLine) return "";
    if (firstLine.length <= 100) return firstLine;
    return firstLine.substring(0, 97) + "...";
  }
  if (!description) return "";

  let text = description
    .replace(/^>\s*/, "")
    .replace(/[""]/g, "")
    .trim();

  // Take first 2 sentences, max 120 chars
  const sentences = text.split(/[.。]\s*/);
  let summary = sentences[0].trim();
  if (summary.length < 50 && sentences.length > 1) {
    const second = sentences[1].trim();
    if (summary.length + second.length + 2 <= 120) {
      summary += ". " + second;
    }
  }

  if (summary.length <= 120) return summary;

  const truncated = summary.substring(0, 117);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 60 ? truncated.substring(0, lastSpace) : truncated) + "...";
}

// --- Scan skills ---
function scanSkills() {
  const skills = [];

  for (const { base, source } of SEARCH_DIRS) {
    if (!fs.existsSync(base)) continue;

    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });

      for (const entry of entries) {
        let skillPath, name;

        if (entry.isDirectory()) {
          skillPath = path.join(base, entry.name, "SKILL.md");
          name = entry.name;
        } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
          skillPath = path.join(base, entry.name);
          name = entry.name.replace(/\.md$/, "");
        } else {
          continue;
        }

        if (!fs.existsSync(skillPath)) continue;

        try {
          const content = fs.readFileSync(skillPath, "utf-8");
          const fm = parseFrontmatter(content);
          const body = getBody(content);

          const displayName = fm.name || name;
          const description = fm.description || "";
          const summary = generateSummary(description, body);
          const keywords = extractKeywords(description, body);
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
          console.error(`[skillhub] warn: cannot parse ${skillPath}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[skillhub] warn: cannot read ${base}: ${err.message}`);
    }
  }

  // Deduplicate by name, prefer project-level over user-level
  const seen = {};
  for (const sk of skills) {
    const existing = seen[sk.name];
    if (!existing || (sk.source === "project" && existing.source !== "project")) {
      seen[sk.name] = sk;
    }
  }
  const deduped = Object.values(seen);

  deduped.sort((a, b) => a.name.localeCompare(b.name));
  return deduped;
}

// --- Main ---
function main() {
  console.error("[skillhub] scanning skills...");

  const skills = scanSkills();

  if (skills.length === 0) {
    console.error("[skillhub] no skills found, writing empty registry");
  } else {
    console.error(`[skillhub] found ${skills.length} skills`);
  }

  const registry = {
    version: 2,
    generated_at: new Date().toISOString(),
    skills,
  };

  const outDir = path.dirname(REGISTRY_OUTPUT);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const tmpPath = REGISTRY_OUTPUT + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), "utf-8");
  fs.renameSync(tmpPath, REGISTRY_OUTPUT);

  console.error(`[skillhub] written: ${REGISTRY_OUTPUT}`);
  console.error(`[skillhub] skills: ${skills.length}`);
  console.error(`[skillhub] total description chars: ${skills.reduce((s, sk) => s + sk.description_length, 0)}`);

  console.log(REGISTRY_OUTPUT);
}

main();
