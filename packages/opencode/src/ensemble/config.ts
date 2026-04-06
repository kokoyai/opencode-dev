import { Effect } from "effect"
import { Config } from "../config/config"
import { ModelID } from "../provider/schema"
import { Log } from "../util/log"

const log = Log.create({ service: "ensemble.config" })

export interface EnsembleConfig {
  enabled: boolean
  models: [ModelID, ModelID]
  judgeModel: ModelID
}

// Default configuration when ensemble is not configured
const DEFAULT_CONFIG: EnsembleConfig = {
  enabled: false,
  models: [ModelID.make("glm-5"), ModelID.make("kimi-k2.5")],
  judgeModel: ModelID.make("kimi-k2.5"),
}

/**
 * Get ensemble configuration from the config service
 */
export function getEnsembleConfigEffect(): Effect.Effect<EnsembleConfig, never, Config.Service> {
  return Effect.gen(function* () {
    const cfg = yield* Config.Service
    const config = yield* cfg.get()

    const experimental = config.experimental?.ensemble

    if (!experimental) {
      log.debug("No ensemble config found, using defaults")
      return DEFAULT_CONFIG
    }

    const result: EnsembleConfig = {
      enabled: experimental.enabled ?? false,
      models: experimental.models?.length === 2
        ? [ModelID.make(experimental.models[0]), ModelID.make(experimental.models[1])]
        : DEFAULT_CONFIG.models,
      judgeModel: experimental.judgeModel
        ? ModelID.make(experimental.judgeModel)
        : DEFAULT_CONFIG.judgeModel,
    }

    log.info("Ensemble config loaded", {
      enabled: result.enabled,
      models: result.models,
      judgeModel: result.judgeModel
    })

    return result
  })
}

/**
 * Synchronous config getter for backward compatibility
 * Note: This returns defaults, use getEnsembleConfigEffect() for actual config
 */
export function getEnsembleConfig(): EnsembleConfig {
  return DEFAULT_CONFIG
}
