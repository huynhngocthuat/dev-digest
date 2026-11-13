// TLDR: RSS chỉ liệt kê các số báo, nên phải tải trang của số mới nhất rồi tách từng bài từ HTML.
// Phần tách HTML phụ thuộc giao diện tldr.tech; nếu họ đổi giao diện thì nguồn này trả về rỗng.
import { cleanUrl, clip, decodeDeep, fetchText, stripTags, tagText } from '../text.mjs';

export function parseRssIssues(xml) {
  const issues = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const link = tagText(m[1], 'link');
    if (/^https:\/\/tldr\.tech\//.test(link)) issues.push({ link, date: tagText(m[1], 'pubDate') });
  }
  return issues;
}

export function parseIssue(html, label) {
  const items = [];
  for (const m of html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/g)) {
    const article = m[1];
    const href = /<a[^>]*\shref="([^"]+)"[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/.exec(article);
    if (!href) continue;
    const rawTitle = decodeDeep(stripTags(href[2]));
    if (/\(sponsor\)/i.test(rawTitle)) continue;
    const title = clip(rawTitle.replace(/\s*\(\d+\s+minute\s+read\)\s*$/i, ''), 200);
    const url = cleanUrl(decodeDeep(href[1]));
    if (!title || !url) continue;
    const body = /<div class="newsletter-html">([\s\S]*)<\/div>/.exec(article)?.[1] || '';
    const summary = clip(decodeDeep(stripTags(body)), 240);
    items.push({ source: 'tldr', label, title, url, ...(summary ? { summary } : {}) });
  }
  return items;
}

function labelFor(name) {
  return `TLDR ${name.length <= 2 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1)}`;
}

export async function latestIssues(newsletters) {
  const results = await Promise.allSettled(
    newsletters.map(async (raw) => {
      const name = String(raw).trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`tên bản tin không hợp lệ: "${raw}"`);
      const rss = await fetchText(`https://tldr.tech/api/rss/${name}`);
      const [latest] = parseRssIssues(rss);
      if (!latest) throw new Error(`TLDR ${name}: RSS không có số báo nào`);
      const items = parseIssue(await fetchText(latest.link, { timeoutMs: 20_000 }), labelFor(name));
      if (!items.length) throw new Error(`TLDR ${name}: không tách được bài nào từ ${latest.link}`);
      return items;
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (newsletters.length && !ok.length) throw results[0].reason;
  return ok.flatMap((r) => r.value);
}
