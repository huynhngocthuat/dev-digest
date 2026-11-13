// Thư viện dùng chung cho daily-digest. Chỉ dùng module có sẵn của Node (>= 18).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HOME = os.homedir();
// DAILY_DIGEST_HOME cho phép chạy thử với thư mục dữ liệu khác mà không đụng tới dữ liệu thật
export const BASE_DIR = process.env.DAILY_DIGEST_HOME || path.join(HOME, '.daily-digest');
export const APP_DIR = path.join(BASE_DIR, 'app');
export const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
export const INTERESTS_PATH = path.join(BASE_DIR, 'interests.md');
export const DIGEST_DIR = path.join(BASE_DIR, 'digests');
export const SEEN_PATH = path.join(BASE_DIR, 'seen.json');
export const LOG_PATH = path.join(BASE_DIR, 'digest.log');
// Đánh dấu prompt của chính digest để không đọc ngược nó như "câu hỏi của người dùng"
export const MARKER = '[daily-digest]';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(HERE, '..');
const PROMPT_TEMPLATE = path.join(PLUGIN_ROOT, 'prompts', 'digest.md');
const TOPICS_TEMPLATE = path.join(PLUGIN_ROOT, 'prompts', 'topics.md');

export const DEFAULT_CONFIG = {
  repos: [],
  time: '08:00',
  weekdaysOnly: true,
  daysBack: 2,
  articleCount: 5, // số bài phần "Liên quan việc đang làm"
  trendingCount: 3, // số bài phần "Đáng chú ý hôm nay"
  language: 'tiếng Việt',
  includeClaudeSessions: true,
  claudePath: '',
  allowedTools: ['mcp__plugin_daily-digest_daily-dev', 'mcp__daily-dev'],
  timeoutMinutes: 10,
  maxCandidates: 150,
  sources: {
    dailydev: { enabled: true },
    hackernews: { enabled: true, limit: 30, minPoints: 50, topicSearch: true, topicSearchDays: 7 },
    reddit: { enabled: true, subreddits: ['programming', 'webdev', 'devops', 'MachineLearning'], limit: 25 },
    tldr: { enabled: true, newsletters: ['tech', 'dev', 'ai'] },
  },
  telegram: { botToken: '', chatId: '' },
  notion: { token: '', parentPage: '' },
};

export const DEFAULT_INTERESTS = `- (Chủ đề bạn luôn muốn theo dõi, ví dụ: Spring Boot, Vue 3, RAG)
- Không quan tâm: (ví dụ: crypto, tin tuyển dụng)
`;

export function ensureDirs() {
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
}

// Gộp cấu hình người dùng lên mặc định. Config cũ (chưa có sources, notion) vẫn dùng được.
export function mergeConfig(user = {}) {
  const sources = {};
  for (const [name, defaults] of Object.entries(DEFAULT_CONFIG.sources)) {
    sources[name] = { ...defaults, ...(user.sources?.[name] || {}) };
  }
  return {
    ...DEFAULT_CONFIG,
    ...user,
    sources,
    telegram: { ...DEFAULT_CONFIG.telegram, ...(user.telegram || {}) },
    notion: { ...DEFAULT_CONFIG.notion, ...(user.notion || {}) },
  };
}

export function loadConfig() {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    /* chưa có cấu hình thì dùng mặc định */
  }
  return mergeConfig(user);
}

// Bản cấu hình an toàn để in ra màn hình: không lộ token
export function maskSecrets(config) {
  const mark = (v) => (v ? '(đã đặt)' : '');
  return {
    ...config,
    telegram: { ...config.telegram, botToken: mark(config.telegram.botToken) },
    notion: { ...config.notion, token: mark(config.notion.token) },
  };
}

export function writeConfig(config) {
  ensureDirs();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  if (process.platform !== 'win32') fs.chmodSync(CONFIG_PATH, 0o600); // có thể chứa bot token
}

export function log(msg) {
  ensureDirs();
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
}

export function expandHome(p) {
  return p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(HOME, p.slice(1)) : p;
}

export function readInterests() {
  try {
    return fs.readFileSync(INTERESTS_PATH, 'utf8').trim();
  } catch {
    return '';
  }
}

export function gitActivity(repos, daysBack) {
  const parts = [];
  for (const raw of repos || []) {
    const repo = expandHome(raw);
    try {
      const out = execFileSync(
        'git',
        ['-C', repo, 'log', `--since=${daysBack} days ago`, '--oneline', '--no-merges', '-n', '30'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (out) parts.push(`## ${path.basename(repo)}\n${out}`);
    } catch {
      /* không phải repo git, hoặc git chưa cài */
    }
  }
  return parts.join('\n\n');
}

function findRecentJsonl(dir, sinceMs, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findRecentJsonl(p, sinceMs, acc);
    else if (e.name.endsWith('.jsonl')) {
      try {
        if (fs.statSync(p).mtimeMs >= sinceMs) acc.push(p);
      } catch {}
    }
  }
  return acc;
}

// Chỉ lấy câu người dùng gõ (không lấy code, output tool hay câu trả lời), cắt ngắn mỗi câu
export function recentClaudeQuestions(daysBack, limit = 40) {
  const root = path.join(HOME, '.claude', 'projects');
  const since = Date.now() - daysBack * 86_400_000;
  const items = [];
  for (const file of findRecentJsonl(root, since)) {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      continue;
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type !== 'user' || !rec.message) continue;
      const ts = Date.parse(rec.timestamp || '') || 0;
      if (ts && ts < since) continue;
      const c = rec.message.content;
      const text =
        typeof c === 'string'
          ? c
          : Array.isArray(c)
            ? c.filter((x) => x && x.type === 'text').map((x) => x.text).join(' ')
            : '';
      const clean = text.replace(/\s+/g, ' ').trim();
      // Bỏ thẻ hệ thống, ghi chú ảnh đính kèm và prompt của chính digest
      if (!clean || clean.startsWith('<') || clean.startsWith('[Image') || clean.includes(MARKER)) continue;
      items.push({ ts, text: clean.slice(0, 200) });
    }
  }
  items.sort((a, b) => a.ts - b.ts);
  const unique = [...new Set(items.map((i) => i.text))];
  return unique.slice(-limit).map((t) => `- ${t}`).join('\n');
}

export function loadSeen() {
  try {
    return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function saveSeen(urls) {
  ensureDirs();
  const merged = [...new Set([...loadSeen(), ...urls])].slice(-300);
  fs.writeFileSync(SEEN_PATH, JSON.stringify(merged, null, 2) + '\n');
}

export function extractUrls(markdown) {
  return [...new Set(markdown.match(/https?:\/\/[^\s)>\]]+/g) || [])];
}

const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD theo giờ máy

// Sở thích, commit và câu hỏi gần đây: phần ngữ cảnh chung của cả hai prompt
export function workContext(config) {
  return {
    interests: readInterests(),
    gitlog: gitActivity(config.repos, config.daysBack),
    sessions: config.includeClaudeSessions ? recentClaudeQuestions(config.daysBack) : '',
  };
}

function contextValues(config, ctx) {
  return {
    MARKER,
    DATE: today(),
    INTERESTS: ctx.interests || '(chưa khai báo)',
    GITLOG: ctx.gitlog || '(không có)',
    SESSIONS: config.includeClaudeSessions ? ctx.sessions || '(không có)' : '(đã tắt)',
  };
}

const DAILYDEV_STEP =
  'Dùng các tool của daily.dev: xem feed cá nhân hóa (For You) và tìm bài theo từng chủ đề. ' +
  'Bài tìm được ở đây cũng là ứng viên, ngang hàng với danh sách ở trên. ' +
  'Chỉ đọc: không bookmark, không follow, không thay đổi gì trên tài khoản daily.dev. ' +
  'Nếu không có tool daily.dev hoặc tool báo lỗi, vẫn soạn bản tin từ danh sách ứng viên và thêm đúng một dòng ở cuối: ' +
  '"**Ghi chú:** không đọc được daily.dev."';
const NO_DAILYDEV_STEP = 'Không dùng tool nào. Chỉ chọn bài từ danh sách ứng viên ở trên.';

// `candidates` là chuỗi đã định dạng từ sources/index.mjs (formatCandidates)
export function buildPrompt(config = loadConfig(), { candidates = '', context = workContext(config) } = {}) {
  const seen = loadSeen().slice(-100);
  return fill(fs.readFileSync(PROMPT_TEMPLATE, 'utf8'), {
    ...contextValues(config, context),
    COUNT: String(config.articleCount),
    TRENDING_COUNT: String(config.trendingCount),
    LANGUAGE: config.language,
    CANDIDATES: candidates || '(không lấy được bài nào)',
    DAILYDEV_STEP: config.sources.dailydev.enabled ? DAILYDEV_STEP : NO_DAILYDEV_STEP,
    SEEN: seen.length ? seen.map((u) => `- ${u}`).join('\n') : '(chưa có)',
  });
}

// Prompt lượt một: rút từ khóa để tìm bài theo chủ đề
export function buildTopicsPrompt(config = loadConfig(), context = workContext(config)) {
  return fill(fs.readFileSync(TOPICS_TEMPLATE, 'utf8'), contextValues(config, context));
}

// Lấy mảng JSON đầu tiên trong câu trả lời; trả về [] nếu không đọc được
export function parseTopics(text) {
  const m = /\[[\s\S]*?\]/.exec(String(text));
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    const topics = arr
      .filter((t) => typeof t === 'string')
      .map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 60))
      .filter(Boolean);
    return [...new Set(topics)].slice(0, 5);
  } catch {
    return [];
  }
}
