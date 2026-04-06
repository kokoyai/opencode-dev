import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

const app = "opencode"

const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

const CACHE_VERSION = "21"

let initPromise: Promise<void> | null = null
let initialized = false

function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await Promise.all([
        fs.mkdir(data, { recursive: true }),
        fs.mkdir(config, { recursive: true }),
        fs.mkdir(state, { recursive: true }),
        fs.mkdir(path.join(data, "log"), { recursive: true }),
        fs.mkdir(path.join(cache, "bin"), { recursive: true }),
      ])

      const version = await Filesystem.readText(path.join(cache, "version")).catch(() => "0")

      if (version !== CACHE_VERSION) {
        try {
          const contents = await fs.readdir(cache)
          await Promise.all(
            contents.map((item) =>
              fs.rm(path.join(cache, item), {
                recursive: true,
                force: true,
              }),
            ),
          )
        } catch (e) {}
        await Filesystem.write(path.join(cache, "version"), CACHE_VERSION)
      }
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

export namespace Global {
  export const Path = {
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    get data() {
      triggerInit()
      return data
    },
    get bin() {
      triggerInit()
      return path.join(cache, "bin")
    },
    get log() {
      triggerInit()
      return path.join(data, "log")
    },
    get cache() {
      triggerInit()
      return cache
    },
    get config() {
      triggerInit()
      return config
    },
    get state() {
      triggerInit()
      return state
    },
  }

  export const init = ensureInit
}
