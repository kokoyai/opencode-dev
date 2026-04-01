import { Effect } from "effect"
import { Config } from "../config/config"

export interface NotifyOptions {
  title: string
  message: string
  status: "success" | "error" | "warning" | "info"
}

export const Notify = {
  /**
   * 发送飞书机器人通知
   * 文档: https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN
   */
  feishu: (options: NotifyOptions): Effect.Effect<void, Error, Config.Service> =>
    Effect.gen(function* () {
      const config = yield* Config.Service
      const configData = yield* config.get()
      const webhookUrl = configData.notify?.feishu_webhook

      if (!webhookUrl) {
        // 未配置 webhook，静默跳过
        return
      }

      const { title, message, status } = options

      // 飞书消息卡片颜色
      const colorMap = {
        success: "green",
        error: "red",
        warning: "orange",
        info: "blue",
      }

      const body = {
        msg_type: "interactive",
        card: {
          config: {
            wide_screen_mode: true,
          },
          header: {
            title: {
              tag: "plain_text",
              content: title,
            },
            template: colorMap[status],
          },
          elements: [
            {
              tag: "markdown",
              content: message,
            },
            {
              tag: "note",
              elements: [
                {
                  tag: "plain_text",
                  content: `时间: ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
                },
              ],
            },
          ],
        },
      }

      yield* Effect.promise(async () => {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          throw new Error(`Feishu notification failed: ${response.status}`)
        }

        const result = await response.json()
        if (result.code !== 0) {
          throw new Error(`Feishu API error: ${result.msg}`)
        }
      })
    }),

  /**
   * 发送通知（支持多种渠道）
   */
  send: (options: NotifyOptions): Effect.Effect<void, Error, Config.Service> =>
    Effect.gen(function* () {
      // 目前只支持飞书，后续可扩展
      yield* Notify.feishu(options).pipe(
        Effect.catchAll((e) => {
          // 通知失败不影响主流程，只记录日志
          console.warn("[notify] failed to send notification:", e.message)
          return Effect.void
        }),
      )
    }),
}
