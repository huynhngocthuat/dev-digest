// Các kênh gửi digest. Thêm kênh mới: viết module gửi rồi khai báo ở đây.
import { sendNotion } from './notion.mjs';
import { sendTelegram } from './telegram.mjs';

export function channels(config) {
  const { telegram, notion } = config;
  return [
    {
      name: 'Telegram',
      enabled: Boolean(telegram.botToken && telegram.chatId),
      send: (digest) => sendTelegram(telegram, digest.markdown),
    },
    {
      name: 'Notion',
      enabled: Boolean(notion.token && notion.parentPage),
      send: (digest) => sendNotion(notion, digest),
    },
  ];
}

// digest = { title, markdown }. Một kênh lỗi không chặn kênh khác.
export async function deliver(config, digest) {
  const results = [];
  for (const ch of channels(config).filter((c) => c.enabled)) {
    try {
      results.push({ name: ch.name, ok: true, detail: await ch.send(digest) });
    } catch (e) {
      results.push({ name: ch.name, ok: false, detail: e.message });
    }
  }
  return results;
}
