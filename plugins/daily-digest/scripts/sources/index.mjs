// Gom bài ứng viên từ các nguồn lấy bằng script (Hacker News, Reddit, TLDR).
// daily.dev không nằm ở đây: Claude đọc nó trực tiếp qua MCP.
import { urlKey } from '../text.mjs';
import * as hackernews from './hackernews.mjs';
import * as reddit from './reddit.mjs';
import * as tldr from './tldr.mjs';

// Bỏ bài trùng link (giữ bản xuất hiện trước) và bài đã gửi ở các digest trước
export function dedupe(candidates, seenUrls = []) {
  const seen = new Set(seenUrls.map(urlKey));
  const out = [];
  for (const c of candidates) {
    const key = urlKey(c.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function formatCandidate(c) {
  const meta = [c.label];
  if (c.topic) meta.push(`tìm theo "${c.topic}"`);
  if (c.points != null) meta.push(`${c.points} điểm`);
  if (c.comments != null) meta.push(`${c.comments} bình luận`);
  let line = `- [${meta.join(' · ')}] ${c.title} — ${c.url}`;
  if (c.discussion) line += ` (thảo luận: ${c.discussion})`;
  if (c.summary) line += `\n  Tóm tắt: ${c.summary}`;
  return line;
}

export function formatCandidates(list) {
  return list.map(formatCandidate).join('\n');
}

// Trả về { candidates, stats }. Nguồn nào lỗi thì ghi vào stats, các nguồn khác vẫn chạy.
export async function collectCandidates(config, { topics = [], seenUrls = [] } = {}) {
  const s = config.sources;
  const jobs = [];
  // Bài tìm theo chủ đề đứng trước để khi trùng link thì giữ bản có ghi chủ đề
  if (s.hackernews.enabled && s.hackernews.topicSearch && topics.length) {
    jobs.push(['Hacker News (theo chủ đề)', () => hackernews.searchTopics(topics, { days: s.hackernews.topicSearchDays })]);
  }
  if (s.hackernews.enabled) {
    jobs.push(['Hacker News', () => hackernews.frontPage({ limit: s.hackernews.limit, minPoints: s.hackernews.minPoints })]);
  }
  if (s.tldr.enabled && s.tldr.newsletters.length) {
    jobs.push(['TLDR', () => tldr.latestIssues(s.tldr.newsletters)]);
  }
  if (s.reddit.enabled && s.reddit.subreddits.length) {
    jobs.push(['Reddit', () => reddit.topOfDay(s.reddit.subreddits, { limit: s.reddit.limit })]);
  }

  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  const stats = [];
  const all = [];
  settled.forEach((r, i) => {
    const name = jobs[i][0];
    if (r.status === 'fulfilled') {
      stats.push({ name, count: r.value.length });
      all.push(...r.value);
    } else {
      stats.push({ name, count: 0, error: r.reason?.message || String(r.reason) });
    }
  });
  return { candidates: dedupe(all, seenUrls).slice(0, config.maxCandidates), stats };
}
