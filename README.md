# OpenCode-Dev 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by OpenAI Codex](https://img.shields.io/badge/Powered%20by-OpenAI%20Codex-00a67e?logo=openai)](https://openai.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

**OpenCode-Dev** is an open-source, multi-platform AI-native development environment. It seamlessly integrates advanced Large Language Models—with a specialized focus on **OpenAI Codex**—directly into the developer's workflow via TUI, Desktop (Electron), and Web interfaces.

## 🌟 Our Contribution to OpenAI Codex

While many tools simply wrap LLM APIs, `opencode-dev` is engineered from the ground up to act as a **structural amplifier for OpenAI Codex**, pushing the boundaries of what the model can achieve in real-world engineering:

1. **Deterministic Agentic Execution:** We don't just ask Codex to write code; we provide a sandboxed, multi-agent environment (planning, execution, and review subagents) where Codex can safely iterate, execute terminal commands, and validate its own logic.
2. **Deep Contextual Awareness (MCP & LSP):** By integrating the Model Context Protocol (MCP) and Language Server Protocol (LSP), `opencode-dev` translates complex, unstructured repository states into precise, schema-driven prompts. We help Codex "see" the codebase exactly as a compiler does.
3. **Standardizing AI-Human Collaboration:** We are building the open-source UI/UX standards for AI coding. From our TUI (Terminal UI) to our rich Electron client, we generate high-quality, structured interaction patterns that prove Codex's viability as a primary copilot across all operating systems.

## 📦 Ecosystem Architecture

This repository is managed as a monorepo powered by Turborepo and Bun, encompassing a full suite of AI development tools:

- **`packages/opencode`**: The core CLI and TUI (Terminal UI) experience.
- **`packages/desktop` & `desktop-electron`**: The rich graphical client for deep codebase analysis.
- **`packages/console` & `web`**: Cloud management and remote workspace interfaces.
- **`packages/plugin` & `extensions`**: Extensible architecture, including support for IDEs like VS Code and Zed.
- **`packages/ui`**: A unified, accessible design system for AI tooling.

## 🛠️ Core Features

- **Multi-Modal Workspaces:** Instantly switch between Terminal (TUI) and Desktop GUI without losing your AI session context.
- **Advanced Context Management:** Smart context eviction, truncation, and dependency resolution to keep Codex's token usage highly optimized.
- **Real-time File Synchronization:** Bi-directional sync between the AI's virtual workspace and your local file system.
- **Extensible Provider API:** While optimized for Codex, the architecture supports seamless fallback and benchmarking against other major providers.

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (v1.0+)
- Node.js

### Installation & Development

```bash
# Clone the repository
git clone [https://github.com/kokoyai/opencode-dev.git](https://github.com/kokoyai/opencode-dev.git)
cd opencode-dev

# Install dependencies via Bun
bun install

# Start the core CLI / TUI development server
bun run dev --filter opencode

# Start the desktop application
bun run dev --filter desktop-electron