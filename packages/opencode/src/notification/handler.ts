import { GlobalBus } from "@/bus/global"
import { Question } from "@/question"
import { Todo } from "@/session/todo"
import { Feishu } from "../notification"

type QuestionAsked = { questions: Array<{ question: string }> }
type TodoUpdated = { todos: Array<{ content: string; status: string }> }

export namespace NotificationHandler {
  export function start() {
    // Use GlobalBus instead of Effect-based Bus.subscribe,
    // because this is called at module init time before any
    // Instance ALS context exists.
    GlobalBus.on("event", ({ payload }) => {
      if (payload.type === Question.Event.Asked.type) {
        const props = payload.properties as QuestionAsked
        const questionText = props.questions.map((q) => q.question).join("\n- ")

        Feishu.notify({
          type: "question",
          title: "AI 助手需要您的回复",
          content: `- ${questionText}`,
        }).catch((err) => {
          console.error("Failed to send question notification:", err)
        })
      }

      if (payload.type === Todo.Event.Updated.type) {
        const props = payload.properties as TodoUpdated
        const started = props.todos.filter((t) => t.status === "in_progress")
        const completed = props.todos.filter((t) => t.status === "completed")

        if (started.length > 0) {
          const startedText = started.map((t) => t.content).join("\n- ")
          Feishu.notify({
            type: "todo",
            title: "任务开始执行",
            content: `- ${startedText}`,
          }).catch((err) => {
            console.error("Failed to send todo notification:", err)
          })
        }

        if (completed.length > 0) {
          const completedText = completed.map((t) => t.content).join("\n- ")
          Feishu.notify({
            type: "todo",
            title: "任务已完成",
            content: `- ${completedText}`,
          }).catch((err) => {
            console.error("Failed to send todo notification:", err)
          })
        }
      }
    })
  }
}
