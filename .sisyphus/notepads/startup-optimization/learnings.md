
## Task 6: Theme Lazy Loading (theme.tsx)

### Pattern: Dynamic JSON imports with Promise caching
- Remove all static `import` statements for JSON files except the default theme
- Create a `THEME_FILES` mapping from theme name to filename (without .json extension)
- Use a `Map<string, Promise<ThemeJson>>` to cache the loading promises
- Cache the Promise (not the result) to deduplicate concurrent loads

### Key Implementation Details
1. **Default theme (opencode) is loaded synchronously** - keeps the import for immediate availability
2. **Other themes are loaded on-demand** via `loadThemeJson(name)` function
3. **`ALL_THEME_NAMES` Set** - used for checking if a theme name is a built-in theme
4. **`set()` function triggers async loading** - when switching to a theme not yet in store
5. **`init()` function preloads saved theme** - ensures the user's saved theme is available on startup

### Code Structure
```typescript
const THEME_FILES: Record<string, string> = { aura: "aura", ... }
const themeCache = new Map<string, Promise<ThemeJson>>()

async function loadThemeJson(name: string): Promise<ThemeJson> {
  if (name === "opencode") return opencode
  const cached = themeCache.get(name)
  if (cached) return cached
  const filename = THEME_FILES[name]
  if (!filename) throw new Error(`Unknown theme: ${name}`)
  const promise = import(`./theme/${filename}.json`).then(m => m.default)
  themeCache.set(name, promise)
  return promise
}
```

### Async Loading in Theme Switching
- When `set(theme)` is called, it triggers async loading if theme not in store
- The `values` memo falls back to `opencode` while loading (graceful degradation)
- Once loaded, the theme is added to `store.themes` which triggers reactivity

### Startup Optimization
- 33 JSON theme files are no longer loaded at startup
- Only the default theme (`opencode`) is loaded immediately
- Other themes load asynchronously when user selects them
