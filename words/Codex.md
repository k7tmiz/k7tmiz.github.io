# Codex 开发规范

本文件是 Codex 使用本仓库时的本地入口文件，属于 AI 工具上下文，不进入公开仓库。完整项目事实以 `AGENTS.md` 为准；如果发现本文件过期，主动同步维护。

## 先读什么

1. 先读 `AGENTS.md`，确认开源/闭源边界、文档同步规则、部署规则和发布规则。
2. 再按任务读取 `README.md`、`docs/README.en.md`、`docs/FRONTEND_CONTEXT.md`、`docs/API.md`。
3. 只有在本地存在 `backend/` 且任务涉及后端时，才读取后端私有文档。

## Codex 行为约束

- 先检查工作区状态，尊重用户已有改动，不回滚无关文件。
- 不懂就问；尤其不要猜私有模块、服务器、密钥、账号、发布策略。
- 用 `rg` / `rg --files` 搜索，编辑文件优先用 `apply_patch`。
- 不在公开 README、docs 或源码注释中暴露 `cloud.js`、`backend/` 的私有实现。
- 不把 `AGENTS.md`、`CLAUDE.md`、`Codex.md` 当公开文档链接出去；它们只约束 AI 工具。
- 修改功能、发布流程或安全策略后，主动维护公开文档和 AI 规范文件。

## 当前关键事实

- A4 Memory 是纯静态前端 + Tauri v2 桌面/Android 应用。
- `js/cloud.js` 和 `backend/` 是闭源部分，公开仓库不能包含实现细节。
- Android 发音只走系统 TextToSpeech 桥接，不内置离线语音包，不提供第三方 TTS APK 安装流程。
- 版本 1.0.16 的发布说明应强调：移除第三方离线 TTS 介入、保留系统 TextToSpeech、完成导入/复习/查词/设置/记录导出冒烟测试、完成依赖和漏洞检查。

## 验证基线

- JS 改动：`npm run lint`。
- 发布构建：`npm run build`。
- Rust/Tauri 改动：`cargo check`。
- Android 桥接改动：`cargo check --target aarch64-linux-android`。
- 安全：`npm audit --audit-level=moderate`；Rust 依赖审计输出需要人工判断 Tauri/Linux GTK 传递告警。
- 前端冒烟：TXT/CSV/JSON 词书导入、自动/手动复习、查词、设置备份、记录导出、恶意 HTML 不执行。

## 发版顺序

1. 确认版本号是否需要更新。
2. 运行必要检查和冒烟测试。
3. 更新 Release workflow 的发布说明。
4. commit。
5. 用户明确要求推送/发版时，先运行 `./deploy-hexo.sh`。
6. 推送主分支。
7. 移动并推送 `v*` tag 触发 Release workflow。
8. 查询 GitHub Actions，确认构建已开始；能等到完成就等到完成。
