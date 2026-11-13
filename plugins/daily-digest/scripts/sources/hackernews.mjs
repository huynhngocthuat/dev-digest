// Hacker News qua API tìm kiếm Algolia (công khai, không cần đăng nhập).
import { cleanUrl, clip, fetchJson } from '../text.mjs';

const API = 'https://hn.algolia.com/api/v1/search';
const LABEL = 'Hacker News';

export function mapHit(hit, topic) {
  const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  const title = clip(hit.title || '', 200);
  if (!title) return null;
  return {
    source: 'hackernews',
    label: LABEL,
    title,
    url: cleanUrl(hit.url || '') || discussion, // Ask HN, Show HN không có link ngoài
    discussion,
    points: hit.points ?? 0,
    comments: hit.num_comments ?? 0,
    ...(topic ? { topic } : {}),
  };
}

export async function frontPage({ limit = 30, minPoints = 0 } = {}) {
  const data = await fetchJson(`${API}?tags=front_page&hitsPerPage=${limit}`);
  return (data.hits || [])
    .map((h) => mapHit(h))
    .filter((c) => c && c.points >= minPoints);
}

// Tìm bài trong `days` ngày gần đây cho từng chủ đề. Một chủ đề lỗi không làm hỏng các chủ đề khác.
export async function searchTopics(topics, { days = 7, perTopic = 5, minPoints = 10 } = {}) {
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  const results = await Promise.allSettled(
    topics.map(async (topic) => {
      const params = new URLSearchParams({
        query: topic,
        tags: 'story',
        numericFilters: `created_at_i>${since},points>${minPoints}`,
        hitsPerPage: String(perTopic),
      });
      const data = await fetchJson(`${API}?${params}`);
      return (data.hits || []).map((h) => mapHit(h, topic)).filter(Boolean);
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled');
  if (topics.length && !ok.length) throw results[0].reason;
  return ok.flatMap((r) => r.value);
}
