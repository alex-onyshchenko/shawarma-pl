const form = document.querySelector('#setup-form');
const input = document.querySelector('#token');
const button = document.querySelector('#submit');
const status = document.querySelector('#status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  let token = input.value.trim();
  if (!token) return;
  input.value = '';
  button.disabled = true;
  status.textContent = 'Підключаємо бота…';
  try {
    const payload = JSON.stringify({ token });
    token = '';
    const response = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, signal: AbortSignal.timeout(75000) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Не вдалося підключити бота.');
    form.hidden = true;
    document.querySelector('#success').hidden = false;
    status.textContent = 'Готово! Відкрий бота в Telegram і надішли /start — він покаже кнопку меню.';
  } catch (error) {
    status.textContent = error.name === 'TimeoutError' ? 'Час очікування минув. Перевір /start у Telegram; якщо відповіді немає — спробуй підключення ще раз.' : error instanceof SyntaxError ? 'Сервіс ще не готовий. Онови сторінку та спробуй ще раз.' : error.message;
  } finally {
    token = '';
    button.disabled = false;
  }
});
