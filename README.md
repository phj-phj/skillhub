# Skillhub — Claude Code 技能管理元技能

一套管理本地技能库的元技能系统。通过**索引机制**让 AI 按需查找技能，而不是每次都把所有技能描述加载到 system prompt 中，从而减少 token 消耗。

## 核心原理

```
首次使用:
  运行 indexer.js → 扫描所有 SKILL.md → 生成 registry.json（静态快照）

日常使用:
  会话启动 → SessionStart Hook 运行 inject-hook.js
  → 纯读 registry.json → 输出紧凑索引表追加到 system prompt
  → AI 看到索引表 → 匹配关键词 → 调用对应 Skill

技能变更时:
  添加/删除技能 → 手动运行 indexer.js → 重建 registry.json
```

**核心设计：registry.json 是静态快照，只在技能变更时才重建。日常使用只读取已有 JSON。**

## 安装

### 1. 克隆仓库

```bash
git clone https://github.com/<你的用户名>/skillhub.git
```

### 2. 复制到 Claude Code 技能目录

```bash
# 项目级（仅当前项目可用）
cp -r skillhub/.claude/commands/skillhub/ .claude/commands/skillhub/

# 用户级（所有项目可用，推荐）
cp -r skillhub/.claude/commands/skillhub/ ~/.claude/commands/skillhub/
```

### 3. 运行索引器

```bash
node .claude/commands/skillhub/scripts/indexer.js
```

这会在 `.claude/` 下生成 `skillhub-registry.json`。

### 4. 配置 SessionStart Hook（可选，推荐）

在 `~/.claude/settings.json` 中添加：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/Users/<用户名>/.claude/commands/skillhub/scripts/inject-hook.js\""
          }
        ]
      }
    ]
  }
}
```

> Windows 用户注意路径用 `/`；macOS/Linux 用户路径为 `~/.claude/commands/skillhub/scripts/inject-hook.js`。

## 使用

| 操作 | 命令 |
|------|------|
| 更新索引 | `node .claude/commands/skillhub/scripts/indexer.js` |
| 查看所有技能 | `node .claude/commands/skillhub/scripts/inject-hook.js` |
| 在对话中触发 | 说 "skillhub" / "管理技能" / "有哪些技能" |

## 多技能匹配

一个用户请求可能同时匹配多个技能，skillhub 会告诉 AI 列出所有匹配的技能并并行调用。

例如："帮我调试这个 bug 并写测试" → 同时匹配 `diagnose` + `test`

## 目录结构

```
.claude/commands/skillhub/
├── SKILL.md              # 元技能定义
├── scripts/
│   ├── indexer.js         # 扫描技能 → 生成 registry.json（手动运行）
│   └── inject-hook.js     # 读取 registry.json → 输出索引表（Hook 调用）
```

生成产物（不入 git）：
- `.claude/skillhub-registry.json` — 技能注册表

## Token 节省

以 19 个技能为例：

| 指标 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 描述总字符 | ~4,200 | ~700 | ~3,500 |
| Hook 索引字符 | 0 | ~1,500 | -1,500 |
| **System prompt 净节省** | | | **~2,000 字符** |

技能越多，节省越明显。

## 兼容性

- Claude Code (所有平台)
- 需要 Node.js 运行脚本
