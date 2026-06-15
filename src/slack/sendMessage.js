export async function sendSlackMessage(webhookUrl, text) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack: не удалось отправить сообщение (${response.status}) — ${body}`);
  }
}
