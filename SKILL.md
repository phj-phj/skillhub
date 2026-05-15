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

skillhub 通过索引表让你快速发现和调用技能，无需在 system prompt 中加载所有技能的完整描述。

索引表通过以下任一方式呈现给你：

1. **SessionStart Hook（推荐）** — 会话启动时自动注入 `## Skill Index` 表格到 system prompt
2. **手动调用** — 当用户说 "skillhub" / "管理技能" / "有哪些技能" 时，读取 `.claude/skillhub-registry.json`

即使 Hook 未配置，你仍然可以通过方式 2 使用 skillhub。

## 核心行为

**每次回复前**（如果 system prompt 中有索引表）：
1. 扫描 `## Skill Index` 表格
2. 将用户请求与所有技能的触发词进行匹配
3. **匹配了多个技能** → 列出所有匹配项，并行调用
4. **匹配了一个技能** → 调用该技能
5. **没有匹配** → 正常回复

**首次使用 / registry.json 不存在时**：
- 自动运行 `node .claude/commands/skillhub/scripts/indexer.js` 创建索引
- 这是**一次性操作**，后续会话直接读取已有文件

**多技能匹配示例**：
- "帮我调试这个 bug 并写测试" → 匹配 `diagnose` + `test`，两个都调用
- "审查代码后提交" → 匹配 `review` + `commit`，两个都调用

## 命令

| 用户说 | 你做什么 |
|--------|----------|
| "更新索引" / "重建索引" | 运行 `node .claude/commands/skillhub/scripts/indexer.js` |
| "列出技能" / "有哪些技能" | 读取并展示 `.claude/skillhub-registry.json` |
| "分析 token" | 计算各技能 description_length 总和 |

## 索引更新规则

`registry.json` 是静态快照，**仅在以下情况更新**：
1. 添加了新技能
2. 用户明确要求"更新索引"

**不要**在每次会话时重建索引。日常使用只需读取已有 registry.json。

## 兼容性

- 支持 Windows / macOS / Linux
- 需要 Node.js（Claude Code 自带，无需额外安装）
- Hook 可选——即使不配置 Hook，手动调用仍然有效
