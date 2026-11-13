// Reddit qua RSS công khai. Endpoint .json chặn truy cập không đăng nhập nên không dùng.
// Reddit giới hạn rất chặt số lần gọi không đăng nhập, nên gộp mọi subreddit vào một lần gọi (r/a+b+c).
import { cleanUrl, clip, decodeEntities, fetchText, tagText } from '../text.mjs';

export function parseAtom(xml) {
  const items = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1];
    const title = clip(decodeEntities(tagText(entry, 'title')), 200);
    const post = decodeEntities(/<link\s+href="([^"]+)"/.exec(entry)?.[1] || '');
    if (!title || !post) continue;
    const subreddit = /<category\s+term="([^"]+)"/.exec(entry)?.[1] || /\/r\/([^/]+)\//.exec(post)?.[1];
    // <content> là HTML đã mã hóa entity; link bài gốc nằm ở thẻ <a> có chữ [link]
    const html = decodeEntities(tagText(entry, 'content'));
    const external = decodeEntities(/<a href="([^"]+)">\[link\]<\/a>/.exec(html)?.[1] || '');
    const url = cleanUrl(external) || cleanUrl(post);
    if (!url) continue;
    const discussion = cleanUrl(post);
    items.push({
      source: 'reddit',
      label: subreddit ? `r/${subreddit}` : 'Reddit',
      title,
      url,
      ...(discussion && discussion !== url ? { discussion } : {}),
    });
  }
  return items;
}

export function feedUrl(subreddits, limit = 25) {
  const names = subreddits.map((s) => String(s).replace(/^\/?r\//i, '').trim());
  const bad = names.find((n) => !/^[A-Za-z0-9_]+$/.test(n));
  if (bad !== undefined) throw new Error(`tên subreddit không hợp lệ: "${bad}"`);
  return `https://www.reddit.com/r/${names.join('+')}/top/.rss?t=day&limit=${limit}`;
}

export async function topOfDay(subreddits, { limit = 25 } = {}) {
  // Bị giới hạn tần suất (429) thì chờ theo thời gian Reddit báo rồi thử lại một lần
  return parseAtom(await fetchText(feedUrl(subreddits, limit), { retryOn429: true }));
}
