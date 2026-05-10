import { expect, test } from "bun:test"

const shouldRunSmoke = process.env.TELEGRAM_SMOKE === "1" && Boolean(process.env.TELEGRAM_BOT_TOKEN)
const smokeTest = shouldRunSmoke ? test : test.skip

smokeTest("communicates with the Telegram Bot API", async () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  expect(botToken).toBeTruthy()

  const getMeResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
  const getMeBody = await getMeResponse.json() as { ok?: boolean }

  expect(getMeResponse.ok).toBe(true)
  expect(getMeBody.ok).toBe(true)

  const chatId = process.env.TELEGRAM_SMOKE_CHAT_ID
  if (!chatId) {
    return
  }

  const sendMessageResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: "opencode-telegram-notifications smoke test",
    }),
  })
  const sendMessageBody = await sendMessageResponse.json() as { ok?: boolean }

  expect(sendMessageResponse.ok).toBe(true)
  expect(sendMessageBody.ok).toBe(true)
})
