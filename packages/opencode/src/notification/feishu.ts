import { Log } from "@/util/log"

export namespace Feishu {
  const log = Log.create({ service: "feishu" })

  let webhook = "https://open.feishu.cn/open-apis/bot/v2/hook/fbb7b3cc-afa2-41b6-b903-7a6d3d6393b9"
  let minInterval = 5000
  let lastSent = 0

  export interface Message {
    type: "question" | "todo"
    title: string
    content: string
  }

  function formatMessage(msg: Message): string {
    const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })

    switch (msg.type) {
      case "question":
        return `🔔 需要您的回复\n\n${msg.title}\n\n${msg.content}\n\n时间: ${time}`
      case "todo":
        return `📋 任务状态更新\n\n${msg.title}\n\n${msg.content}\n\n时间: ${time}`
      default:
        return `${msg.title}\n\n${msg.content}\n\n时间: ${time}`
    }
  }

  async function sendToFeishu(text: string): Promise<void> {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text },
      }),
    })

    const result = (await response.json()) as any
    if (result.code !== 0) {
      throw new Error(`Feishu API error: ${result.msg} (code: ${result.code})`)
    }
  }

  export async function notify(msg: Message): Promise<void> {
    const now = Date.now()
    const elapsed = now - lastSent

    if (elapsed < minInterval) {
      await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed))
    }

    try {
      const text = formatMessage(msg)
      await sendToFeishu(text)
      lastSent = Date.now()
      log.info("Feishu notification sent", { type: msg.type })
    } catch (error) {
      log.error("Failed to send Feishu notification", { error })
    }
  }
}
