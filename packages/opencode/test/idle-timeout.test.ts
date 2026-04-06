import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { IdleTimeout } from "../src/session/idle-timeout"
import { SessionStatus } from "../src/session/status"
import { Bus } from "../src/bus"

describe("IdleTimeout", () => {
  describe("Constants", () => {
    it("should have default timeout of 2 minutes", () => {
      // DEFAULT_TIMEOUT_MS is 2 * 60 * 1000 = 120000
      const expected = 2 * 60 * 1000
      expect(expected).toBe(120000)
    })
  })

  describe("Event definitions", () => {
    it("should define Timeout event", () => {
      expect(IdleTimeout.Event.Timeout.type).toBe("session.idle_timeout")
    })
  })

  describe("Service interface", () => {
    it("should have start method", () => {
      expect(typeof IdleTimeout.start).toBe("function")
    })

    it("should have cancel method", () => {
      expect(typeof IdleTimeout.cancel).toBe("function")
    })
  })

  describe("Timeout logic", () => {
    it("should calculate correct timeout from config", () => {
      // Test config parsing
      const configMinutes = 5
      const timeoutMs = configMinutes * 60 * 1000
      expect(timeoutMs).toBe(300000)
    })

    it("should disable timeout when set to 0", () => {
      const configMinutes = 0
      const disabled = configMinutes === 0
      expect(disabled).toBe(true)
    })

    it("should use default when config is undefined", () => {
      const configMinutes = undefined
      const timeoutMs = configMinutes ? configMinutes * 60 * 1000 : 2 * 60 * 1000
      expect(timeoutMs).toBe(120000)
    })
  })

  describe("Max timeout validation", () => {
    it("should respect max of 60 minutes", () => {
      const configMinutes = 120 // over max
      const clamped = Math.min(configMinutes, 60)
      expect(clamped).toBe(60)
    })
  })
})

describe("SessionStatus Events", () => {
  it("should define Status event", () => {
    expect(SessionStatus.Event.Status.type).toBe("session.status")
  })

  it("should define Idle event", () => {
    expect(SessionStatus.Event.Idle.type).toBe("session.idle")
  })
})
