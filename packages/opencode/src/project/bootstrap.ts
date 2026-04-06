import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { File } from "../file"
import { FileWatcher } from "../file/watcher"
import { Snapshot } from "../snapshot"
import { Project } from "./project"
import { Vcs } from "./vcs"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Log } from "@/util/log"
import { ShareNext } from "@/share/share-next"

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })

  // Critical services - must initialize first
  await Plugin.init()

  // Non-critical services - can initialize in parallel
  const background = [ShareNext.init(), Format.init(), LSP.init()]

  // Critical services that need to complete before we're ready
  File.init()
  FileWatcher.init()
  Vcs.init()
  Snapshot.init()

  // Wait for background services (but don't block on them)
  await Promise.all(background).catch((error) => {
    Log.Default.warn("background initialization had errors", { error })
  })

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      Project.setInitialized(Instance.project.id)
    }
  })
}
