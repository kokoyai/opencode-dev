#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))

console.log("Publishing SDK to npm...")

// Read package.json to get version
const pkg = await Bun.file(path.join(dir, "package.json")).json() as { version: string }

console.log(`Publishing @opencode-ai/sdk@${pkg.version}...`)

// Publish to npm
await $`npm publish --access public`.cwd(dir)

console.log("✓ SDK published successfully")
