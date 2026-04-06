import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { SessionID } from "./schema"
import { Effect, Layer, Stream, ServiceMap } from "effect"
import z from "zod"
import { SessionStatus } from "./status"
import { Log } from "@/util/log"

const log = Log.create({ service: "idle-timeout" })

export namespace IdleTimeout {
  const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

  export const Event = {
    Timeout: BusEvent.define(
      "session.idle_timeout",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  export interface Interface {
    readonly start: (sessionID: SessionID, timeoutMs?: number) => Effect.Effect<void>
    readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/IdleTimeout") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const state = yield* InstanceState.make(
        Effect.fn("IdleTimeout.state")(function* () {
          const timers = new Map<SessionID, ReturnType<typeof setTimeout>>()

          // Safe publish helper that catches errors
          const safePublish = (sessionID: SessionID) => {
            Effect.runPromise(bus.publish(Event.Timeout, { sessionID })).catch((error) => {
              log.warn("failed to publish idle timeout event", {
                sessionID,
                error: error instanceof Error ? error.message : String(error),
              })
            })
          }

          // Subscribe to idle events and start timeouts automatically
          yield* bus.subscribe(SessionStatus.Event.Idle).pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                const sessionID = event.properties.sessionID
                const timer = setTimeout(() => {
                  safePublish(sessionID)
                }, DEFAULT_TIMEOUT_MS)
                timers.set(sessionID, timer)
              }),
            ),
            Effect.forkScoped,
          )

          // Subscribe to busy/retry events to cancel timeouts
          yield* bus.subscribe(SessionStatus.Event.Status).pipe(
            Stream.runForEach((event) =>
              Effect.sync(() => {
                const { sessionID, status } = event.properties
                if (status.type !== "idle") {
                  const timer = timers.get(sessionID)
                  if (timer) {
                    clearTimeout(timer)
                    timers.delete(sessionID)
                  }
                }
              }),
            ),
            Effect.forkScoped,
          )

          return timers
        }),
      )

      const cancel = Effect.fn("IdleTimeout.cancel")(function* (sessionID: SessionID) {
        const data = yield* InstanceState.get(state)
        const timer = data.get(sessionID)
        if (timer) {
          clearTimeout(timer)
          data.delete(sessionID)
        }
      })

      const start = Effect.fn("IdleTimeout.start")(function* (
        sessionID: SessionID,
        timeoutMs: number = DEFAULT_TIMEOUT_MS,
      ) {
        const data = yield* InstanceState.get(state)
        const existing = data.get(sessionID)
        if (existing) clearTimeout(existing)

        const timer = setTimeout(() => {
          Effect.runPromise(bus.publish(Event.Timeout, { sessionID })).catch((error) => {
            log.warn("failed to publish idle timeout event", {
              sessionID,
              error: error instanceof Error ? error.message : String(error),
            })
          })
        }, timeoutMs)

        data.set(sessionID, timer)
      })

      return Service.of({ start, cancel })
    }),
  )

  const defaultLayer = layer.pipe(
    Layer.provide(Bus.layer),
    Layer.provide(SessionStatus.layer.pipe(Layer.provide(Bus.layer))),
  )
  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function start(sessionID: SessionID, timeoutMs?: number) {
    return runPromise((svc) => svc.start(sessionID, timeoutMs))
  }

  export async function cancel(sessionID: SessionID) {
    return runPromise((svc) => svc.cancel(sessionID))
  }
}
