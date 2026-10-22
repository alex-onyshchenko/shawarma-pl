export async function telegramRequest(token, method, body = {}, fetcher = fetch) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token || '')) throw new Error('Set TELEGRAM_BOT_TOKEN in your private env file');
  let response, result;
  try {
    response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    result = await response.json();
  } catch { throw new Error('Telegram API connection failed; check network access'); }
  // Avoid logging upstream URLs or errors: they can contain the private bot token.
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed (HTTP ${response.status}); check bot credentials and configuration`);
  return result.result;
}
