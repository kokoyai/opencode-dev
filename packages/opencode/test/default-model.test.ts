import { describe, it, expect, beforeAll } from "bun:test"
import path from "path"
import { Agent } from "../src/agent/agent"
import { ProviderID, ModelID } from "../src/provider/schema"
import { Instance } from "../src/project/instance"

const projectRoot = path.join(__dirname, "..")

describe("Default Model Configuration", () => {
  const BUILTIN_AGENTS = ["build", "plan", "general", "explore", "compaction", "title", "summary"]

  describe("Configuration validation", () => {
    it("all builtin agents should have model configured", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          for (const agentName of BUILTIN_AGENTS) {
            const agent = await Agent.get(agentName)
            expect(agent).toBeDefined()
            expect(agent.model).toBeDefined()
            if (agent.model) {
              expect(agent.model.providerID).toBeDefined()
              expect(agent.model.modelID).toBeDefined()
            }
          }
        },
      })
    })

    it("all builtin agents should use baiduqianfancodingplan provider", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          for (const agentName of BUILTIN_AGENTS) {
            const agent = await Agent.get(agentName)
            expect(agent.model).toBeDefined()
            if (agent.model) {
              expect(agent.model.providerID).toBe(ProviderID.baiduqianfancodingplan)
            }
          }
        },
      })
    })

    it("all builtin agents should use glm-5 model", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          for (const agentName of BUILTIN_AGENTS) {
            const agent = await Agent.get(agentName)
            expect(agent.model).toBeDefined()
            if (agent.model) {
              expect(agent.model.modelID).toBe(ModelID.make("glm-5"))
            }
          }
        },
      })
    })

    it("ProviderID.baiduqianfancodingplan should exist", () => {
      expect(ProviderID.baiduqianfancodingplan).toBeDefined()
      const providerId: string = ProviderID.baiduqianfancodingplan
      expect(providerId).toBe("baiduqianfancodingplan")
    })
  })

  describe("Runtime validation", () => {
    it("Agent.list() should return all builtin agents with correct config", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const agents = await Agent.list()
          const builtins = agents.filter((a) => a.native === true)

          for (const agent of builtins) {
            expect(agent.model).toBeDefined()
            if (agent.model) {
              const providerId: string = agent.model.providerID
              const modelId: string = agent.model.modelID
              expect(providerId).toBe("baiduqianfancodingplan")
              expect(modelId).toBe("glm-5")
            }
          }
        },
      })
    })
  })

  describe("ModelID validation", () => {
    it("ModelID.make('glm-5') should return correct branded type", () => {
      const modelId: ModelID = ModelID.make("glm-5")
      const modelIdStr: string = modelId
      expect(modelIdStr).toBe("glm-5")
      expect(typeof modelIdStr).toBe("string")
    })
  })
})
