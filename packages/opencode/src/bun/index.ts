import z from "zod"
import { Global } from "../global"
import { Log } from "../util/log"
import path from "path"
import { Filesystem } from "../util/filesystem"
import { NamedError } from "@opencode-ai/util/error"
import { Lock } from "../util/lock"
import { PackageRegistry } from "./registry"
import { online, proxied } from "@/util/network"
import { Process } from "../util/process"

export namespace BunProc {
  const log = Log.create({ service: "bun" })

  // Timeout for network operations
  const INSTALL_TIMEOUT = 60000 // 60 seconds for package installation
  const VERSION_CHECK_TIMEOUT = 3000 // 3 seconds for version check

  // File to persist pending updates across restarts
  const pendingUpdatesPath = () => path.join(Global.Path.cache, "pending-updates.json")

  async function getPendingUpdates(): Promise<Map<string, string>> {
    const data = await Filesystem.readJson<Record<string, string>>(pendingUpdatesPath()).catch(() => ({}))
    return new Map(Object.entries(data))
  }

  async function savePendingUpdates(updates: Map<string, string>): Promise<void> {
    const data = Object.fromEntries(updates)
    await Filesystem.writeJson(pendingUpdatesPath(), data).catch(() => {})
  }

  export async function run(cmd: string[], options?: Process.RunOptions) {
    const full = [which(), ...cmd]
    log.info("running", {
      cmd: full,
      ...options,
    })
    const result = await Process.run(full, {
      cwd: options?.cwd,
      abort: options?.abort,
      kill: options?.kill,
      timeout: options?.timeout,
      nothrow: options?.nothrow,
      env: {
        ...process.env,
        ...options?.env,
        BUN_BE_BUN: "1",
      },
    })
    log.info("done", {
      code: result.code,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    return result
  }

  export function which() {
    return process.execPath
  }

  export const InstallFailedError = NamedError.create(
    "BunInstallFailedError",
    z.object({
      pkg: z.string(),
      version: z.string(),
    }),
  )

  /**
   * Check for updates in background. If an update is available,
   * it will be installed on the next startup.
   */
  async function checkForUpdateInBackground(pkg: string, cachedVersion: string) {
    // Use longer timeout for background check (10s)
    const latestVersion = await PackageRegistry.info(pkg, "version", Global.Path.cache, 10000)
    if (latestVersion && latestVersion !== cachedVersion) {
      log.info("New version available, will update on next startup", {
        pkg,
        cachedVersion,
        latestVersion,
      })
      const pending = await getPendingUpdates()
      pending.set(pkg, latestVersion)
      await savePendingUpdates(pending)
    }
  }

  export async function install(pkg: string, version = "latest", opts?: { ignoreScripts?: boolean }) {
    // Use lock to ensure only one install at a time
    using _ = await Lock.write("bun-install")

    const mod = path.join(Global.Path.cache, "node_modules", pkg)
    const pkgjsonPath = path.join(Global.Path.cache, "package.json")
    const parsed = await Filesystem.readJson<{ dependencies: Record<string, string> }>(pkgjsonPath).catch(async () => {
      const result = { dependencies: {} as Record<string, string> }
      await Filesystem.writeJson(pkgjsonPath, result)
      return result
    })
    if (!parsed.dependencies) parsed.dependencies = {} as Record<string, string>
    const dependencies = parsed.dependencies
    const modExists = await Filesystem.exists(mod)
    const cachedVersion = dependencies[pkg]

    // Check if there's a pending update from previous background check
    const pendingUpdates = await getPendingUpdates()
    const pendingVersion = pendingUpdates.get(pkg)
    if (pendingVersion && version === "latest") {
      log.info("Installing pending update", { pkg, pendingVersion })
      pendingUpdates.delete(pkg)
      await savePendingUpdates(pendingUpdates)
      // Proceed to install the pending update
    } else if (!modExists || !cachedVersion) {
      // No cache, must install
    } else if (version === "latest") {
      // Has cache, check for update
      if (!online()) {
        // Offline - use cache, skip background check
        return mod
      }

      // Try quick version check (3s timeout)
      const latestVersion = await PackageRegistry.info(pkg, "version", Global.Path.cache, VERSION_CHECK_TIMEOUT)
      if (!latestVersion) {
        // Network failed or timeout - use cache, check in background later
        log.info("Version check failed or timed out, using cached version", { pkg, cachedVersion })
        // Don't await - run in background
        checkForUpdateInBackground(pkg, cachedVersion).catch(() => {})
        return mod
      }

      // Compare versions
      const semver = await import("semver")
      if (!semver.lt(cachedVersion, latestVersion)) {
        // Cache is up to date
        return mod
      }

      log.info("Cached version is outdated, proceeding with install", { pkg, cachedVersion, latestVersion })
    } else if (cachedVersion === version) {
      return mod
    }

    // Build command arguments
    const args = [
      "add",
      "--force",
      "--exact",
      ...(opts?.ignoreScripts ? ["--ignore-scripts"] : []),
      // TODO: get rid of this case (see: https://github.com/oven-sh/bun/issues/19936)
      ...(proxied() || process.env.CI ? ["--no-cache"] : []),
      "--cwd",
      Global.Path.cache,
      pkg + "@" + version,
    ]

    // Let Bun handle registry resolution:
    // - If .npmrc files exist, Bun will use them automatically
    // - If no .npmrc files exist, Bun will default to https://registry.npmjs.org
    // - No need to pass --registry flag
    log.info("installing package using Bun's default registry resolution", {
      pkg,
      version,
    })

    await BunProc.run(args, {
      cwd: Global.Path.cache,
      timeout: INSTALL_TIMEOUT,
    }).catch((e) => {
      throw new InstallFailedError(
        { pkg, version },
        {
          cause: e,
        },
      )
    })

    // Resolve actual version from installed package when using "latest"
    // This ensures subsequent starts use the cached version until explicitly updated
    let resolvedVersion = version
    if (version === "latest") {
      const installedPkg = await Filesystem.readJson<{ version?: string }>(path.join(mod, "package.json")).catch(
        () => null,
      )
      if (installedPkg?.version) {
        resolvedVersion = installedPkg.version
      }
    }

    parsed.dependencies[pkg] = resolvedVersion
    await Filesystem.writeJson(pkgjsonPath, parsed)
    return mod
  }
}
