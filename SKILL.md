---
name: skillhub
description: >
  Skill management hub. Discovers, indexes, and recommends skills
  from the local skill library. Use when you need to find the right
  skill for a task, list available skills, or when user says "skills",
  "skillhub", "manage skills", "install skill".
---

# Skillhub — 技能管理中心

## 工作方式

每个会话启动时，SystemPrompt Hook 会自动将技能索引表注入到 system prompt 中。
你可以在 system prompt 开头找到 `## Skill Index (skillhub)` 部分。

## 核心行为

**每次回复前**：
1. 快速扫描 system prompt 中的 `## Skill Index` 表格
2. 将用户请求与所有技能的触发词进行匹配
3. **如果匹配了多个技能** → 列出所有匹配的技能，逐一调用（Skill 工具支持并行调用多个技能）
4. **如果只匹配了一个技能** → 调用该技能
5. **如果没有匹配** → 正常回复

**多技能匹配示例**：
- 用户说"帮我调试这个 bug 并写测试" → 匹配 `diagnose` + `test`，两个都要调用
- 用户说"审查代码后提交" → 匹配 `review` + `commit`，两个都要调用

**用户直接调用 skillhub 时**（如 "/skillhub" 或 "管理技能"）：

| 命令 | 操作 |
|------|------|
| "更新索引" / "重建索引" | 运行 `node .claude/commands/skillhub/scripts/indexer.js` |
| "列出技能" / "有哪些技能" | 读取并展示 `.claude/skillhub-registry.json` |
| "分析 token" / "节省了多少" | 计算各技能 description_length 总和 |

## 索引更新规则

`registry.json` 是静态快照，**仅在以下情况更新**：
1. 添加了新技能到 `.claude/commands/`
2. 用户明确要求"更新索引"
3. 用户修改了某个技能的 description

**不要**在每次会话时重建索引。日常使用只需读取已有 registry.json。

## Token 优化说明

各技能 `SKILL.md` 的 `description` 字段应精简为关键词格式（30-50 字符），
完整说明由本索引表提供。这避免了 system prompt 中加载所有技能的完整描述。
