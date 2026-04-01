# OpenCode（简体中文）

开源的 AI Coding Agent，聚焦终端体验与本地开发流程。

## 安装

```bash
# 直接安装（推荐）
curl -fsSL https://opencode.ai/install | bash

# 本地开发依赖
bun install
```

## 本地编译与运行示例

```bash
# 假设项目目录在 ~/mwcode
cd ~/mwcode

# 创建便捷函数（可加入 ~/.bashrc 或 ~/.zshrc）
myopencode() {
  (cd ~/mwcode || exit 1;
  bun run dev -- "$@")
}

# 检查函数定义
type myopencode
# 输出示例：
# myopencode is a function
# myopencode ()
# {
#   ( cd ~/mwcode || exit 1;
#   bun run dev -- "$@" )
# }

# 安装依赖
bun install

# 终端后台运行示例
myopencode -p "描述" &
```

## 说明

- 这里的 README 仅保留中文版本，其他语言提交到原始仓库分支。大多数文档与功能在 `README.md` 与 `README.zh.md` 之间保持同步。
- 如需更稳定守护进程，建议使用 `nohup`、`screen`  或 `systemd`。