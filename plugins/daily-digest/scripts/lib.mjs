// Thư viện dùng chung cho daily-digest. Chỉ dùng module có sẵn của Node (>= 18).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HOME = os.homedir();
export const BASE_DIR = path.join(HOME, '.daily-digest');
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

export const DEFAULT_CONFIG = {
  repos: [],
  time: '08:00',
  weekdaysOnly: true,
  daysBack: 2,
  articleCount: 5,
  language: 'tiếng Việt',
  includeClaudeSessions: true,
  claudePath: '',
  allowedTools: ['mcp__plugin_daily-digest_daily-dev', 'mcp__daily-dev'],
  timeoutMinutes: 10,
  telegram: { botToken: '', chatId: '' },
};

export const DEFAULT_INTERESTS = `- (Chủ đề bạn luôn muốn theo dõi, ví dụ: Spring Boot, Vue 3, RAG)
- Không quan tâm: (ví dụ: crypto, tin tuyển dụng)
`;

export function ensureDirs() {
  fs.mkdirSync(DIGEST_DIR, { recursive: true });
}

export function loadConfig() {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    /* chưa có cấu hình thì dùng mặc định */
  }
  return {
    ...DEFAULT_CONFIG,
    ...user,
    telegram: { ...DEFAULT_CONFIG.telegram, ...(user.telegram || {}) },
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
      if (!clean || clean.startsWith('<') || clean.includes(MARKER)) continue;
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

export function buildPrompt(config = loadConfig()) {
  const template = fs.readFileSync(PROMPT_TEMPLATE, 'utf8');
  const seen = loadSeen().slice(-100);
  const values = {
    MARKER,
    DATE: new Date().toLocaleDateString('sv-SE'), // YYYY-MM-DD theo giờ máy
    COUNT: String(config.articleCount),
    LANGUAGE: config.language,
    INTERESTS: readInterests() || '(chưa khai báo)',
    GITLOG: gitActivity(config.repos, config.daysBack) || '(không có)',
    SESSIONS: config.includeClaudeSessions
      ? recentClaudeQuestions(config.daysBack) || '(không có)'
      : '(đã tắt)',
    SEEN: seen.length ? seen.map((u) => `- ${u}`).join('\n') : '(chưa có)',
  };
  return template.replace(/\{\{(\w+)\}\}/g, (m, key) => values[key] ?? m);
}
