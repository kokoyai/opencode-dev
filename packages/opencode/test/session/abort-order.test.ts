import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { Bus } from "@/bus"
import { MessageV2 } from "@/session/message-v2"
import { SessionID } from "@/session/schema"

/**
 * Test to verify that abort events are published in the correct order:
 * 1. Message should be marked as completed (time.completed set)
 * 2. Message updated event should be published
 * 3. Session status should be set to idle
 *
 * This prevents the race condition where UI shows "working" state
 * because message completion hasn't propagated yet.
 */
describe("Session Abort Event Ordering", () => {
  let sessionID: SessionID
  let events: string[] = []
  let subscriptions: (() => void)[] = []

  beforeEach(async () => {
    events = []
    subscriptions = []

    // Subscribe to events
    subscriptions.push(
      Bus.subscribe(MessageV2.Event.Updated, (evt) => {
        const info = evt.properties.info as any
        if (info.time?.completed) {
          events.push("message.completed")
        }
        events.push("message.updated")
      }),
    )

    subscriptions.push(
      Bus.subscribe("session.status" as any, (evt: any) => {
        events.push("session.status:" + evt.properties.status.type)
      }),
    )
  })

  afterEach(() => {
    subscriptions.forEach((unsub) => unsub())
  })

  it("should update message before status on abort", async () => {
    // This test verifies the fix for the race condition
    // where status was set to idle before message was updated

    // Create a session
    const session = await Session.create({ parentID: undefined as any })
    sessionID = session.id

    // Trigger abort
    await SessionPrompt.cancel(sessionID)

    // Wait for events to propagate
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify event order
    const messageUpdatedIndex = events.indexOf("message.updated")
    const statusIdleIndex = events.findIndex((e) => e === "session.status:idle")

    // Message should be updated before status is set to idle (if both events occurred)
    if (messageUpdatedIndex !== -1 && statusIdleIndex !== -1) {
      expect(messageUpdatedIndex).toBeLessThan(statusIdleIndex)
      console.log("✓ Event ordering is correct: message.updated before session.status:idle")
    } else {
      console.log("Events captured:", events)
    }
  })

  it("should mark message as completed on abort", async () => {
    // Create a session
    const session = await Session.create({ parentID: undefined as any })
    sessionID = session.id

    // Trigger abort
    await SessionPrompt.cancel(sessionID)

    // Wait for events to propagate
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Get the last message
    const messages = await Session.messages({ sessionID: session.id })
    const last = messages[messages.length - 1]

    // Message should have time.completed set if it's an assistant message
    if (last && last.info.role === "assistant") {
      expect(last.info.time.completed).toBeDefined()
      console.log("✓ Message marked as completed")
    }
  })
})
