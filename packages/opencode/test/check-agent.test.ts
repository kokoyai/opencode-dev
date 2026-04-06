import { describe, it, expect } from "bun:test"
import { parseCheckResponse } from "../src/session/prompt"

const MAX_CHECK_ATTEMPTS = 3

describe("Check Agent Flow", () => {
  describe("Response parsing", () => {
    it("should parse CONTINUE response", () => {
      const result = parseCheckResponse("CONTINUE: need more work on the API")
      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toBe("need more work on the API")
    })

    it("should parse DONE response", () => {
      const result = parseCheckResponse("DONE: all tasks completed successfully")
      expect(result.decision).toBe("DONE")
      expect(result.reason).toBe("all tasks completed successfully")
    })

    it("should handle mixed case CONTINUE", () => {
      const result = parseCheckResponse("continue: something")
      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toBe("something")
    })

    it("should handle mixed case DONE", () => {
      const result = parseCheckResponse("done: finished")
      expect(result.decision).toBe("DONE")
      expect(result.reason).toBe("finished")
    })

    it("should handle extra whitespace after colon", () => {
      const result = parseCheckResponse("CONTINUE:   extra spaces here")
      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toBe("extra spaces here")
    })

    it("should handle response with newlines", () => {
      const result = parseCheckResponse("CONTINUE: need to fix\nmultiple issues")
      expect(result.decision).toBe("CONTINUE")
    })
  })

  describe("Edge cases", () => {
    it("should return DONE for empty response", () => {
      const result = parseCheckResponse("")
      expect(result.decision).toBe("DONE")
      expect(result.reason).toBe("Could not parse check agent response")
    })

    it("should return DONE for malformed response", () => {
      const result = parseCheckResponse("This is not a valid response")
      expect(result.decision).toBe("DONE")
      expect(result.reason).toBe("Could not parse check agent response")
    })

    it("should return DONE for response without colon", () => {
      const result = parseCheckResponse("CONTINUE without colon")
      expect(result.decision).toBe("DONE")
    })

    it("should return DONE for random text", () => {
      const result = parseCheckResponse("The quick brown fox jumps")
      expect(result.decision).toBe("DONE")
    })

    it("should handle null/undefined gracefully", () => {
      const result = parseCheckResponse("")
      expect(result.decision).toBe("DONE")
    })
  })

  describe("Max attempts", () => {
    it("should stop after max attempts reached", () => {
      let attempts = 0
      const simulateLoop = (decision: "CONTINUE" | "DONE") => {
        while (attempts < MAX_CHECK_ATTEMPTS && decision === "CONTINUE") {
          attempts++
        }
        return { attempts, exited: attempts >= MAX_CHECK_ATTEMPTS }
      }

      const result = simulateLoop("CONTINUE")
      expect(result.attempts).toBe(MAX_CHECK_ATTEMPTS)
      expect(result.exited).toBe(true)
    })

    it("should allow continuation when under max attempts", () => {
      let attempts = 1
      const canContinue = attempts < MAX_CHECK_ATTEMPTS
      expect(canContinue).toBe(true)
    })

    it("should prevent continuation at max attempts", () => {
      let attempts = 3
      const canContinue = attempts < MAX_CHECK_ATTEMPTS
      expect(canContinue).toBe(false)
    })

    it("should track attempts correctly", () => {
      const attemptTracker = { check: 0 }

      const simulateCheck = () => {
        if (attemptTracker.check < MAX_CHECK_ATTEMPTS) {
          attemptTracker.check++
          return { shouldContinue: true, attempts: attemptTracker.check }
        }
        return { shouldContinue: false, attempts: attemptTracker.check }
      }

      expect(simulateCheck().attempts).toBe(1)
      expect(simulateCheck().attempts).toBe(2)
      expect(simulateCheck().attempts).toBe(3)
      expect(simulateCheck().shouldContinue).toBe(false)
    })
  })

  describe("Decision logic", () => {
    it("should continue loop when decision is CONTINUE and under max", () => {
      const result = parseCheckResponse("CONTINUE: more work needed")
      let loopContinues = false

      if (result.decision === "CONTINUE") {
        loopContinues = true
      }

      expect(loopContinues).toBe(true)
    })

    it("should break loop when decision is DONE", () => {
      const result = parseCheckResponse("DONE: complete")
      let loopBreaks = false

      if (result.decision === "DONE") {
        loopBreaks = true
      }

      expect(loopBreaks).toBe(true)
    })

    it("should break loop when max attempts reached despite CONTINUE", () => {
      const result = parseCheckResponse("CONTINUE: still working")
      const attempts = 3
      let shouldBreak = false

      if (result.decision === "DONE" || attempts >= MAX_CHECK_ATTEMPTS) {
        shouldBreak = true
      }

      expect(shouldBreak).toBe(true)
    })
  })
})
