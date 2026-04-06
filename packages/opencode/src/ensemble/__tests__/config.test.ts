import { describe, it, expect, beforeEach } from "bun:test"
import { getEnsembleConfig, type EnsembleConfig } from "../config"
import { ModelID } from "@/provider/schema"

describe("Ensemble Config", () => {
  describe("getEnsembleConfig (sync)", () => {
    it("should return default config", () => {
      const config = getEnsembleConfig()

      expect(config.enabled).toBe(false)
      expect(config.models).toHaveLength(2)
      expect(config.models[0]).toBe("glm-5")
      expect(config.models[1]).toBe("kimi-k2.5")
      expect(config.judgeModel).toBe("kimi-k2.5")
    })
  })

  describe("Ensemble Config Types", () => {
    it("should have correct type structure", () => {
      const config: EnsembleConfig = {
        enabled: true,
        models: [ModelID.make("anthropic/claude-sonnet-4-5"), ModelID.make("openai/gpt-5")],
        judgeModel: ModelID.make("anthropic/claude-haiku-4-5"),
      }

      expect(typeof config.enabled).toBe("boolean")
      expect(Array.isArray(config.models)).toBe(true)
      expect(config.models).toHaveLength(2)
      expect(typeof config.judgeModel).toBe("string")
    })
  })
})
