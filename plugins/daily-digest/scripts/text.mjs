// Tiện ích xử lý chuỗi, URL và tải dữ liệu dùng chung cho các nguồn tin.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const hex = e[1] === 'x' || e[1] === 'X';
      const code = parseInt(e.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// Một số nguồn mã hóa entity hai lần (ví dụ &amp;amp;), nên giải mã tới khi ổn định
export function decodeDeep(s, rounds = 3) {
  let cur = String(s);
  for (let i = 0; i < rounds; i++) {
    const next = decodeEntities(cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

export function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, ' ');
}

export function oneLine(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

export function clip(s, max) {
  const t = oneLine(s);
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

// Nội dung của thẻ XML đầu tiên có tên `tag`, đã bỏ CDATA
export function tagText(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

const TRACKING = /^(utm_|ref$|ref_src$|fbclid$|gclid$)/i;

// Bỏ tham số theo dõi. Trả về '' nếu không phải link http(s) hợp lệ
export function cleanUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) u.searchParams.delete(key);
  }
  return u.toString();
}

// Khóa so sánh để nhận ra cùng một bài dù link khác nhau đôi chút
export function urlKey(raw) {
  const cleaned = cleanUrl(raw);
  if (!cleaned) return String(raw).trim().toLowerCase();
  const u = new URL(cleaned);
  u.searchParams.sort();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const pathname = u.pathname.replace(/\/+$/, '');
  return `${host}${pathname}${u.search}`;
}

const USER_AGENT = 'daily-digest/0.2 (Claude Code plugin)';

// Số giây máy chủ bảo chờ khi trả về 429, hoặc null nếu không nói rõ
export function retryDelaySeconds(headers) {
  const raw = headers.get('retry-after') ?? headers.get('x-ratelimit-reset');
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isFinite(n) && n >= 0 ? Math.ceil(n) : null;
}

const MAX_RETRY_WAIT = 60; // giây

export async function fetchText(url, { timeoutMs = 15_000, headers = {}, retryOn429 = false } = {}) {
  const get = () =>
    fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  let res = await get();
  if (res.status === 429 && retryOn429) {
    const wait = retryDelaySeconds(res.headers);
    if (wait != null && wait <= MAX_RETRY_WAIT) {
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      res = await get();
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} từ ${new URL(url).hostname}`);
  return res.text();
}

export async function fetchJson(url, opts) {
  return JSON.parse(await fetchText(url, opts));
}
