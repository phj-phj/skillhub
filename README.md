# Skillhub — Claude Code 技能管理元技能

一键安装、跨平台兼容的技能索引系统。通过紧凑的索引表代替加载所有技能描述，减少 system prompt token 消耗。

## 快速安装

```bash
git clone https://github.com/phj-phj/skillhub.git
cd skillhub
node install.js
```

`install.js` 会自动完成：
1. 复制 skillhub 到用户级命令目录（所有项目可用）
2. 复制到当前项目命令目录
3. 扫描所有技能并构建索引
4. 配置 SessionStart Hook（自动跨平台适配路径）

## 支持平台

| 平台 | 状态 |
|------|------|
| Windows | 完全支持 |
| macOS | 完全支持 |
| Linux | 完全支持 |

依赖：仅需 Node.js（Claude Code 自带，无需额外安装）。

## 核心原理

```
日常使用:
  会话启动 → SessionStart Hook 运行 inject-hook.js
  → 智能查找 registry.json → 输出紧凑索引表
  → AI 看到索引 → 匹配关键词 → 调用对应 Skill

技能变更时:
  添加/删除技能 → 手动运行 indexer.js → 重建 registry.json
```

**registry.json 是静态快照，只在技能变更时才重建。日常使用纯读取，零扫描开销。**

## 使用

| 操作 | 命令 |
|------|------|
| 重新安装/更新 | `node install.js` |
| 更新索引 | `node .claude/commands/skillhub/scripts/indexer.js` |
| 查看索引表 | `node ~/.claude/commands/skillhub/scripts/inject-hook.js` |
| 对话中触发 | 说 "skillhub" / "管理技能" |

## 多技能并行匹配

一个请求可能匹配多个技能，AI 会并行调用所有匹配项：

- "调试 bug 并写测试" → `diagnose` + `test`
- "审查代码后提交" → `review` + `commit`

## 目录结构

```
.claude/commands/skillhub/
├── SKILL.md              # 元技能定义
├── scripts/
│   ├── indexer.js         # 扫描技能 → 生成 registry.json（手动运行）
│   └── inject-hook.js     # 读取 registry.json → 输出索引表（Hook 调用）
```

## Token 节省

以 19 个技能为例，优化后 system prompt 技能部分减少约 2,000 字符。

技能越多，节省越明显。
