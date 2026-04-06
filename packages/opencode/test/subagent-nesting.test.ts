import { describe, it, expect } from "bun:test"
import path from "path"
import { Session } from "../src/session"
import { Instance } from "../src/project/instance"

const projectRoot = path.join(__dirname, "..")

describe("Subagent Nesting Restriction", () => {
  describe("Session parentID validation", () => {
    it("main session should have undefined parentID", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const session = await Session.create({ title: "main session" })
          try {
            expect(session.parentID).toBeUndefined()
          } finally {
            await Session.remove(session.id)
          }
        },
      })
    })

    it("subagent session should have parentID set", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const mainSession = await Session.create({ title: "main" })
          const subSession = await Session.create({
            parentID: mainSession.id,
            title: "sub",
          })

          try {
            expect(subSession.parentID).toBe(mainSession.id)
          } finally {
            await Session.remove(subSession.id)
            await Session.remove(mainSession.id)
          }
        },
      })
    })

    it("deeply nested session should have correct parentID chain", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const mainSession = await Session.create({ title: "main" })
          const subSession = await Session.create({
            parentID: mainSession.id,
            title: "sub",
          })
          const deepSubSession = await Session.create({
            parentID: subSession.id,
            title: "deep sub",
          })

          try {
            expect(deepSubSession.parentID).toBe(subSession.id)
            expect(subSession.parentID).toBe(mainSession.id)
            expect(mainSession.parentID).toBeUndefined()
          } finally {
            await Session.remove(deepSubSession.id)
            await Session.remove(subSession.id)
            await Session.remove(mainSession.id)
          }
        },
      })
    })
  })

  describe("Nested subagent prevention logic", () => {
    it("should detect if session has parentID (subagent session)", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const mainSession = await Session.create({ title: "main" })
          const subSession = await Session.create({
            parentID: mainSession.id,
            title: "sub",
          })

          try {
            const main = await Session.get(mainSession.id)
            const sub = await Session.get(subSession.id)

            expect(main.parentID).toBeUndefined()
            expect(sub.parentID).toBe(mainSession.id)

            const isSubagent = !!sub.parentID
            const isMain = !main.parentID

            expect(isSubagent).toBe(true)
            expect(isMain).toBe(true)
          } finally {
            await Session.remove(subSession.id)
            await Session.remove(mainSession.id)
          }
        },
      })
    })

    it("session creation should respect parentID parameter", async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          const parent = await Session.create({ title: "parent" })

          const child1 = await Session.create({
            parentID: parent.id,
            title: "child1",
          })

          const child2 = await Session.create({
            parentID: undefined,
            title: "child2",
          })

          try {
            expect(child1.parentID).toBe(parent.id)
            expect(child2.parentID).toBeUndefined()
          } finally {
            await Session.remove(child1.id)
            await Session.remove(child2.id)
            await Session.remove(parent.id)
          }
        },
      })
    })
  })
})
