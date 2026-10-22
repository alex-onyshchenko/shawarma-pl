import { telegramRequest } from '../src/telegram.js';
import { registerWebhook } from '../src/registration.js';

try {
  const action = process.argv[2];
  if (action === 'info') {
    const info = await telegramRequest(process.env.TELEGRAM_BOT_TOKEN, 'getWebhookInfo');
    console.log(JSON.stringify({ url: info.url, pendingUpdates: info.pending_update_count, lastErrorAt: info.last_error_date || null, hasDeliveryError: Boolean(info.last_error_message) }, null, 2));
  } else if (action === 'set') {
    const { username, webhookUrl } = await registerWebhook();
    console.log(`Webhook registered for @${username}: ${webhookUrl}`);
    console.log('Send /start to the bot in Telegram to test the menu button.');
  } else throw new Error('Use webhook:prod, webhook:dev or webhook:info');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
