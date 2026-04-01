#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
const root = fileURLToPath(new URL("../../..", import.meta.url))

// Clean dist directory
await $`rm -rf ${path.join(dir, "dist")}`.nothrow()

// Generate OpenAPI client code
await $`bun --bun npx @hey-api/openapi-ts --input ${path.join(root, "packages/sdk/openapi.json")} --output ${path.join(dir, "dist/v2/gen/client")} --client fetch --plugins @hey-api/sdk/client`.cwd(dir)

// Generate index file for v2 client
const v2ClientIndex = `export * from "./gen/client/index.js"
export * from "./gen/client/types.gen.js"

export { Api } from "./gen/client/index.js"
export type { OpenAPI } from "./gen/client/types.gen.js"
`

await Bun.file(path.join(dir, "dist/v2/client.js")).write(v2ClientIndex)

// Generate TypeScript definitions
const v2ClientDTS = `export * from "./gen/client/index.d.ts"
export * from "./gen/client/types.gen.d.ts"
`

await Bun.file(path.join(dir, "dist/v2/client.d.ts")).write(v2ClientDTS)

// Create v2 index file
const v2Index = `export * from "./client.js"
export * from "./server.js"
`

await Bun.file(path.join(dir, "dist/v2/index.js")).write(v2Index)

// Create v2 index d.ts
const v2IndexDTS = `export * from "./client.d.ts"
export * from "./server.d.ts"
`

await Bun.file(path.join(dir, "dist/v2/index.d.ts")).write(v2IndexDTS)

// Create server stub
const serverStub = `import type { Server } from "hono"

export async function createOpencodeServer(options?: {
  url?: string
}): Promise<{ url: string }> {
  return {
    url: options?.url || "http://localhost:3000",
  }
}

export { createOpencodeServer as default }
`

await Bun.file(path.join(dir, "dist/v2/server.js")).write(serverStub)

const serverStubDTS = `import type { Server } from "hono"

export declare function createOpencodeServer(options?: {
  url?: string
}): Promise<{ url: string }>

export default createOpencodeServer
`

await Bun.file(path.join(dir, "dist/v2/server.d.ts")).write(serverStubDTS)

// Create main index files
const mainIndex = `export * from "./client.js"
export * from "./server.js"
import { createOpencodeClient } from "./client.js"
import { createOpencodeServer } from "./server.js"

export async function createOpencode(options?: {
  baseUrl?: string
  url?: string
}) {
  const server = await createOpencodeServer({
    url: options?.url,
  })
  const client = createOpencodeClient({
    baseUrl: options?.baseUrl || server.url,
  })
  return {
    client,
    server,
  }
}
`

await Bun.file(path.join(dir, "dist/index.js")).write(mainIndex)

const mainIndexDTS = `export * from "./client.d.ts"
export * from "./server.d.ts"
import type { Api } from "./client.d.ts"

export declare function createOpencode(options?: {
  baseUrl?: string
  url?: string
}): Promise<{
  client: Api
  server: { url: string }
}>
`

await Bun.file(path.join(dir, "dist/index.d.ts")).write(mainIndexDTS)

// Create basic client and server exports for v1 compatibility
const clientIndex = `export { Api as Client } from "./v2/client.js"
export { createOpencodeClient } from "./v2/client.js"
`

await Bun.file(path.join(dir, "dist/client.js")).write(clientIndex)

const clientIndexDTS = `export type { Api as Client } from "./v2/client.d.ts"
export declare function createOpencodeClient(options?: {
  baseUrl?: string
}): any
`

await Bun.file(path.join(dir, "dist/client.d.ts")).write(clientIndexDTS)

const serverIndex = `export { createOpencodeServer } from "./v2/server.js"
`

await Bun.file(path.join(dir, "dist/server.js")).write(serverIndex)

const serverIndexDTS = `export { createOpencodeServer } from "./v2/server.d.ts"
`

await Bun.file(path.join(dir, "dist/server.d.ts")).write(serverIndexDTS)

console.log("✓ SDK generated successfully")
