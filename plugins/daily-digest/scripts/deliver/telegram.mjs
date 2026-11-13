// Gửi digest qua Telegram Bot API, hiển thị bằng HTML (đậm và link bấm được).
import { decodeEntities } from '../text.mjs';
import { parseBlocks, parseInline } from './markdown.mjs';

const LIMIT = 3900; // Telegram giới hạn 4096 ký tự mỗi tin

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;');

function renderInline(text, { bold = false } = {}) {
  return parseInline(text)
    .map((seg) => {
      let html = esc(seg.text);
      if (seg.url) html = `<a href="${escAttr(seg.url)}">${html}</a>`;
      return seg.bold || bold ? `<b>${html}</b>` : html;
    })
    .join('');
}

function renderBlock(block) {
  switch (block.type) {
    case 'h1':
      return renderInline(block.text, { bold: true });
    case 'h2':
      return `\n◆ ${renderInline(block.text, { bold: true })}`;
    case 'h3':
      return `\n${renderInline(block.text, { bold: true })}`;
    case 'li':
      return `• ${renderInline(block.text)}`;
    default:
      return renderInline(block.text);
  }
}

// Chia thành các tin dưới giới hạn, cắt ở ranh giới khối để không làm vỡ thẻ HTML
export function toTelegramMessages(markdown, limit = LIMIT) {
  const messages = [];
  let current = '';
  const flush = () => {
    if (current.trim()) messages.push(current.trim());
    current = '';
  };
  for (const block of parseBlocks(markdown)) {
    let html = renderBlock(block);
    if (html.length > limit) html = esc(toPlain(html)).slice(0, limit); // khối quá dài: bỏ định dạng rồi cắt
    if (current && current.length + 1 + html.length > limit) flush();
    current = current ? `${current}\n${html}` : html;
  }
  flush();
  return messages;
}

export function toPlain(html) {
  return decodeEntities(
    String(html)
      .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, '$2 ($1)')
      .replace(/<[^>]*>/g, ''),
  );
}

export async function sendTelegram({ botToken, chatId }, markdown, { fetchImpl = fetch } = {}) {
  const post = (body) =>
    fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, disable_web_page_preview: true, ...body }),
      signal: AbortSignal.timeout(20_000),
    });
  const messages = toTelegramMessages(markdown);
  for (const html of messages) {
    let res = await post({ text: html, parse_mode: 'HTML' });
    // 400 thường là Telegram không đọc được HTML: gửi lại dạng chữ thường để không mất digest
    if (res.status === 400) res = await post({ text: toPlain(html) });
    if (!res.ok) throw new Error(`Telegram trả về ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return `${messages.length} tin`;
}
