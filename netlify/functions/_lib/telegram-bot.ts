type TelegramMessageInput = {
  chatId: string
  text: string
  webAppUrl?: string
  buttonText?: string
}

export async function sendTelegramMessage(
  botToken: string,
  input: TelegramMessageInput,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (botToken.length < 20 || !/^-?\d{1,20}$/.test(input.chatId)) throw new Error('TELEGRAM_DELIVERY_INVALID')
  const response = await fetcher(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      ...(input.webAppUrl ? {
        reply_markup: {
          inline_keyboard: [[{
            text: input.buttonText ?? 'Open VELORA',
            web_app: { url: input.webAppUrl },
          }]],
        },
      } : {}),
    }),
  })
  const result = await response.json().catch(() => ({})) as { ok?: boolean; result?: { message_id?: number } }
  if (!response.ok || result.ok !== true || !result.result?.message_id) throw new Error(`TELEGRAM_HTTP_${response.status}`)
  return String(result.result.message_id)
}
