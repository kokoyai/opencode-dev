# Startup Optimization Learnings

## 2025-04-05: Lazy Initialization Pattern for Global Module

### Problem

Top-level await in `src/global/index.ts` blocked all module loading during startup.

### Solution

Implemented lazy initialization pattern:

1. Path values are static strings (computed at module load, no I/O)
2. Directory creation and cache cleanup moved to async `ensureInit()` function
3. Getters on `Global.Path` properties trigger init (fire-and-forget)
4. `initPromise` caches the promise to prevent duplicate initialization
5. `initialized` flag prevents re-triggering `ensureInit().catch(() => {})`

### Key Pattern

```typescript
let initPromise: Promise<void> | null = null
let initialized = false

function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      // async initialization logic
    })()
  }
  return initPromise
}

function triggerInit() {
  if (!initialized) {
    initialized = true
    ensureInit().catch(() => {})
  }
}

export const Path = {
  get data() {
    triggerInit()
    return data
  },
  // ...
}
```

### Why This Works

- Path construction is sync and doesn't need directories
- `Filesystem.write` creates parent directories automatically
- Cache cleanup is idempotent and safe to run asynchronously
- First access to any path property triggers background initialization

## 2025-04-05: Dynamic Imports for AI SDKs in provider.ts

### Problem

20+ AI SDK packages were statically imported at module initialization, blocking startup with heavy dependency loading.

### Solution

1. **Created `loadSDKFactory(pkg)` function** with promise caching:
   ```typescript
   const sdkLoaderCache = new Map<string, Promise<any>>()
   
   async function loadSDKFactory(pkg: string) {
     let cached = sdkLoaderCache.get(pkg)
     if (!cached) {
       cached = (async () => {
         const mod = await import(pkg)
         return mod[Object.keys(mod).find((k: string) => k.startsWith("create"))!]
       })()
       sdkLoaderCache.set(pkg, cached)
     }
     return cached
   }
   ```

2. **Converted `BUNDLED_PROVIDERS` from function map to package name map**:
   - Old: `"@ai-sdk/anthropic": createAnthropic`
   - New: `"@ai-sdk/anthropic": "@ai-sdk/anthropic"`

3. **Created `LOCAL_PROVIDERS` for local SDKs** (like GitHub Copilot from `./sdk/copilot`)

4. **Updated `resolveSDK` to use dynamic loading**:
   - First check `LOCAL_PROVIDERS` for local SDKs
   - Then check `BUNDLED_PROVIDERS` and use `loadSDKFactory`
   - Fall back to installing external packages

5. **Dynamic imports in `CUSTOM_LOADERS`**:
   - `amazon-bedrock`: `await import("@aws-sdk/credential-providers")`
   - `google-vertex`: `await import("google-auth-library")`
   - `gitlab`: `await import("gitlab-ai-provider")`

### Key Patterns

- **Promise caching**: Cache the import promise, not the result
- **Factory function pattern**: Import returns factory function, called with options
- **Local vs bundled separation**: Local SDKs use synchronous import, bundled use dynamic

### Removed Static Imports

- `createAmazonBedrock`, `createAnthropic`, `createAzure`, etc. (20+ SDK factories)
- `fromNodeProviderChain` from `@aws-sdk/credential-providers`
- `GoogleAuth` from `google-auth-library`
- `createGitLab`, `VERSION`, `isWorkflowModel`, `discoverWorkflowModels` from `gitlab-ai-provider`

### Why This Works

- SDKs are only loaded when `resolveSDK` is called (when a model is actually used)
- Promise caching ensures each SDK is only imported once
- TypeScript types are preserved through type inference
- All provider functionality remains intact
