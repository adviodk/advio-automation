export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error("Telegram not configured");
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      // Loud, attention-grabbing delivery — leads should never be silent.
      disable_notification: false,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const sent = await res.json();
  const messageId = sent?.result?.message_id;

  // Pin the lead so it stays at the top of the chat and can't be missed
  // or scrolled past — this also fires its own notification.
  if (messageId) {
    await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, disable_notification: false }),
    }).catch(() => {});
  }
}
