import { describe, it, expect } from "bun:test"

const MAX_CHECK_ATTEMPTS = 3

function parseCheckResponse(output: string): { decision: "CONTINUE" | "DONE"; reason: string } {
  const match = output.match(/(?:CONTINUE|DONE):\s*(.+)/i)
  if (!match) {
    return { decision: "DONE", reason: "Could not parse check agent response" }
  }
  const decision = output.toUpperCase().startsWith("CONTINUE") ? "CONTINUE" : "DONE"
  const reason = match[1].trim()
  return { decision, reason }
}

function buildCheckPrompt(
  userGoal: string,
  workOutput: { filesChanged: string[]; toolsUsed: string[]; hasActualWork: boolean },
): string {
  return `## Goal Verification Required

**User's Original Goal**:
${userGoal}

**Work Completed**:
- Files Changed: ${workOutput.filesChanged.join(", ") || "none"}
- Tools Used: ${workOutput.toolsUsed.join(", ") || "none"}
- Has Actual Work: ${workOutput.hasActualWork}

**Your Task**:
Analyze whether the user's goal has been fully achieved.

**Response Format**:
- If the goal is NOT fully achieved and more work is needed: "CONTINUE: {specific reason what still needs to be done}"
- If the goal IS fully achieved: "DONE: {brief summary of what was accomplished}"

Important: Be thorough and critical. Only respond with DONE if you are confident the goal is complete.`
}

function simulateCheckAgentResponse(
  userGoal: string,
  workOutput: { filesChanged: string[]; toolsUsed: string[]; hasActualWork: boolean },
  pageCount: { current: number; target: number },
): string {
  if (!workOutput.hasActualWork) {
    return `CONTINUE: No actual work has been performed yet. The goal requires creating ${pageCount.target} pages.`
  }
  if (userGoal.includes(`${pageCount.target} page`) && pageCount.current < pageCount.target) {
    return `CONTINUE: Only ${pageCount.current} pages created out of ${pageCount.target} required. Need to create ${pageCount.target - pageCount.current} more pages to complete the document.`
  }
  if (workOutput.hasActualWork && pageCount.current >= pageCount.target) {
    return `DONE: Successfully created ${pageCount.current} page LaTeX document as requested.`
  }
  return `DONE: Work completed.`
}

describe("Goal Verification - 85/300 Pages Scenario", () => {
  describe("Prompt construction", () => {
    it("should construct check prompt with user goal", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: ["/doc/chapter1.tex"], toolsUsed: ["write"], hasActualWork: true }

      const prompt = buildCheckPrompt(userGoal, workOutput)

      expect(prompt).toContain("create 300 page LaTeX document")
      expect(prompt).toContain("/doc/chapter1.tex")
      expect(prompt).toContain("Files Changed:")
      expect(prompt).toContain("Tools Used:")
    })

    it("should show 'none' when no files changed", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: [], toolsUsed: ["read"], hasActualWork: false }

      const prompt = buildCheckPrompt(userGoal, workOutput)

      expect(prompt).toContain("Files Changed: none")
    })

    it("should include hasActualWork flag", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: [], toolsUsed: [], hasActualWork: false }

      const prompt = buildCheckPrompt(userGoal, workOutput)

      expect(prompt).toContain("Has Actual Work: false")
    })
  })

  describe("85/300 pages scenario - incomplete work", () => {
    it("should return CONTINUE when only 85 of 300 pages created", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = {
        filesChanged: ["/doc/page1.tex", "/doc/page2.tex"],
        toolsUsed: ["write", "edit"],
        hasActualWork: true,
      }
      const pageCount = { current: 85, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toContain("85")
      expect(result.reason).toContain("300")
      expect(result.reason).toContain("215")
    })

    it("should specify what needs to be done in CONTINUE reason", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: ["/doc/page1.tex"], toolsUsed: ["write"], hasActualWork: true }
      const pageCount = { current: 85, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toMatch(/need.*create.*more pages/i)
    })

    it("should prevent early stop when goal not met", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: ["/doc/chapter1.tex"], toolsUsed: ["write"], hasActualWork: true }
      const pageCount = { current: 85, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      const shouldContinueLoop = result.decision === "CONTINUE"
      expect(shouldContinueLoop).toBe(true)
    })
  })

  describe("Complete scenario - goal met", () => {
    it("should return DONE when all 300 pages created", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = {
        filesChanged: ["/doc/page1.tex", "/doc/page2.tex"],
        toolsUsed: ["write"],
        hasActualWork: true,
      }
      const pageCount = { current: 300, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("DONE")
      expect(result.reason).toContain("300")
    })

    it("should return DONE when more than target pages created", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: ["/doc/page1.tex"], toolsUsed: ["write"], hasActualWork: true }
      const pageCount = { current: 310, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("DONE")
    })
  })

  describe("No work scenario", () => {
    it("should return CONTINUE when no work performed", () => {
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: [], toolsUsed: [], hasActualWork: false }
      const pageCount = { current: 0, target: 300 }

      const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toMatch(/no actual work/i)
    })
  })

  describe("Retry mechanism with max attempts", () => {
    it("should track attempts during 85/300 scenario", () => {
      let attempts = 0
      const userGoal = "create 300 page LaTeX document"
      const workOutput = { filesChanged: ["/doc/page1.tex"], toolsUsed: ["write"], hasActualWork: true }
      const pageCount = { current: 85, target: 300 }

      const simulateCheckLoop = () => {
        while (attempts < MAX_CHECK_ATTEMPTS) {
          const response = simulateCheckAgentResponse(userGoal, workOutput, pageCount)
          const result = parseCheckResponse(response)

          if (result.decision === "DONE") break
          attempts++
        }
        return { attempts, stopped: attempts >= MAX_CHECK_ATTEMPTS }
      }

      const outcome = simulateCheckLoop()
      expect(outcome.attempts).toBe(MAX_CHECK_ATTEMPTS)
      expect(outcome.stopped).toBe(true)
    })

    it("should stop at max attempts even with CONTINUE decision", () => {
      const response = simulateCheckAgentResponse(
        "create 300 page LaTeX document",
        { filesChanged: ["/doc/page1.tex"], toolsUsed: ["write"], hasActualWork: true },
        { current: 85, target: 300 },
      )
      const result = parseCheckResponse(response)
      const attempts = 3

      const shouldBreak = result.decision === "DONE" || attempts >= MAX_CHECK_ATTEMPTS

      expect(shouldBreak).toBe(true)
    })
  })

  describe("Full scenario simulation", () => {
    it("should simulate the complete 85/300 early stop prevention", () => {
      const scenario = {
        userGoal: "create 300 page LaTeX document",
        workCompleted: {
          filesChanged: ["/doc/chapter1.tex", "/doc/chapter2.tex"],
          toolsUsed: ["write", "edit"],
          hasActualWork: true,
        },
        progress: { current: 85, target: 300 },
      }

      const prompt = buildCheckPrompt(scenario.userGoal, scenario.workCompleted)
      expect(prompt).toContain("300 page")
      expect(prompt).toContain("Has Actual Work: true")

      const response = simulateCheckAgentResponse(scenario.userGoal, scenario.workCompleted, scenario.progress)
      const result = parseCheckResponse(response)

      expect(result.decision).toBe("CONTINUE")
      expect(result.reason).toMatch(/85.*300|215/)

      const shouldPreventEarlyStop = result.decision === "CONTINUE"
      expect(shouldPreventEarlyStop).toBe(true)
    })

    it("should correctly calculate remaining pages in reason", () => {
      const pageCount = { current: 85, target: 300 }
      const remaining = pageCount.target - pageCount.current

      const response = simulateCheckAgentResponse(
        "create 300 page LaTeX document",
        { filesChanged: ["/doc/page1.tex"], toolsUsed: ["write"], hasActualWork: true },
        pageCount,
      )

      expect(response).toContain(`${remaining}`)
      expect(response).toContain(`${pageCount.current}`)
      expect(response).toContain(`${pageCount.target}`)
    })
  })
})
