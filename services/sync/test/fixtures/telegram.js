import { createHmac } from 'node:crypto';
export const testBotToken = '12345:guardrails_test_token';
export function initData(token = testBotToken, id = 12345) {
  const params = new URLSearchParams({ user: JSON.stringify({ id, first_name: 'Test' }), auth_date: String(Math.floor(Date.now()/1000)) });
  const check = [...params.entries()].sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${k}=${v}`).join('\n');
  params.set('hash', createHmac('sha256', createHmac('sha256','WebAppData').update(token).digest()).update(check).digest('hex'));
  return params.toString();
}
export function contact(id = 12345, updateId = 1, phone = '+380501234567') {
  return {update_id:updateId,message:{date:Math.floor(Date.now()/1000),chat:{id,type:'private'},from:{id,is_bot:false},contact:{user_id:id,phone_number:phone}}};
}
