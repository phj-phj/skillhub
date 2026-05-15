# Skillhub — AI 编码工具技能索引系统

一键安装、跨平台兼容的技能索引系统。通过紧凑的索引表代替加载所有技能描述，减少 AI 编码工具 system prompt 的 token 消耗。

## 支持的 AI 工具

| 工具 | 支持方式 | 状态 |
|------|----------|------|
| **Claude Code** | SessionStart Hook 自动注入 | 完全支持 |
| **Cursor** | `.cursorrules` 静态注入 | 完全支持 |
| **WindSurf** | `.windsurfrules` 静态注入 | 完全支持 |
| **GitHub Copilot** | `.github/copilot-instructions.md` 静态注入 | 完全支持 |

## 快速安装

```bash
git clone https://github.com/phj-phj/skillhub.git
cd skillhub
node install.js
```

`install.js` 会自动完成：
1. 复制 skillhub 到用户级命令目录（所有项目可用）
2. 复制到当前项目命令目录
3. 扫描所有技能并构建注册表
4. **检测并同步到 Cursor / WindSurf / Copilot**（自动检测已有项目文件）
5. 配置 Claude Code SessionStart Hook（自动跨平台适配路径）

## 平台兼容性

| 操作系统 | 状态 |
|----------|------|
| Windows | 完全支持 |
| macOS | 完全支持 |
| Linux | 完全支持 |

依赖：仅需 Node.js（所有 AI 编码工具自带，无需额外安装）。

## 核心原理

```
日常使用:
  Claude Code:  会话启动 → Hook 运行 inject-hook.js → 输出索引表 → AI 看到
  Cursor 等:    索引表写入规则文件 → 加载上下文时自动包含 → AI 看到

技能变更时:
  添加/删除技能 → 手动运行 indexer.js → 重建 registry.json
  添加技能后    → 运行 sync-rules.js --all → 更新各平台规则文件
```

**registry.json 是静态快照，只在技能变更时才重建。日常使用纯读取，零扫描开销。**

## 使用

| 操作 | 命令 |
|------|------|
| 重新安装/更新 | `node install.js` |
| 更新索引 | `node .claude/commands/skillhub/scripts/indexer.js` |
| 同步各平台规则 | `node .claude/commands/skillhub/scripts/sync-rules.js --all` |
| 检测可用平台 | `node .claude/commands/skillhub/scripts/sync-rules.js --detect` |
| 查看索引表 | `node ~/.claude/commands/skillhub/scripts/inject-hook.js` |
| 对话中触发 (Claude Code) | 说 "skillhub" / "管理技能" |

### 单独同步指定平台

```bash
# 仅同步 Cursor
node scripts/sync-rules.js --cursor

# 仅同步 WindSurf
node scripts/sync-rules.js --windsurf

# 仅同步 Copilot
node scripts/sync-rules.js --copilot

# 同步所有（自动检测）
node scripts/sync-rules.js --all
```

## 多技能并行匹配

一个请求可能匹配多个技能，AI 会并行调用所有匹配项：

- "调试 bug 并写测试" → `diagnose` + `test`
- "审查代码后提交" → `review` + `commit`

## 目录结构

```
skillhub/
├── SKILL.md              # 元技能定义
├── install.js            # 一键安装脚本
├── scripts/
│   ├── indexer.js         # 扫描技能 → 生成 registry.json（手动运行）
│   ├── inject-hook.js     # 读取 registry.json → stdout 索引表（Hook 调用）
│   └── sync-rules.js      # 写入各 AI 平台规则文件（手动运行）
```

## Token 节省

以 19 个技能为例，优化后 system prompt 技能部分减少约 2,000 字符。

技能越多，节省越明显。
