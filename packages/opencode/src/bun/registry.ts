import semver from "semver"
import { Log } from "../util/log"
import { Process } from "../util/process"
import { online } from "@/util/network"

export namespace PackageRegistry {
  const log = Log.create({ service: "bun" })

  // Default timeout for version checks (quick check during startup)
  const DEFAULT_TIMEOUT = 3000 // 3 seconds

  function which() {
    return process.execPath
  }

  export async function info(pkg: string, field: string, cwd?: string, timeout?: number): Promise<string | null> {
    if (!online()) {
      log.debug("offline, skipping bun info", { pkg, field })
      return null
    }

    const { code, stdout, stderr } = await Process.run([which(), "info", pkg, field], {
      cwd,
      env: {
        ...process.env,
        BUN_BE_BUN: "1",
      },
      nothrow: true,
      timeout: timeout ?? DEFAULT_TIMEOUT,
    })

    if (code !== 0) {
      log.warn("bun info failed or timed out", { pkg, field, code, stderr: stderr.toString() })
      return null
    }

    const value = stdout.toString().trim()
    if (!value) return null
    return value
  }

  export async function isOutdated(pkg: string, cachedVersion: string, cwd?: string): Promise<boolean> {
    const latestVersion = await info(pkg, "version", cwd)
    if (!latestVersion) {
      log.warn("Failed to resolve latest version, using cached", { pkg, cachedVersion })
      return false
    }

    const isRange = /[\s^~*xX<>|=]/.test(cachedVersion)
    if (isRange) return !semver.satisfies(latestVersion, cachedVersion)

    return semver.lt(cachedVersion, latestVersion)
  }
}
