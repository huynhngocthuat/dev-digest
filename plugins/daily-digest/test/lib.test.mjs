import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Trỏ thư mục dữ liệu sang chỗ tạm trước khi nạp lib.mjs để không đụng ~/.daily-digest thật
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-digest-test-'));
process.env.DAILY_DIGEST_HOME = home;
const lib = await import('../scripts/lib.mjs');
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test('mergeConfig: config cũ chưa có sources và notion vẫn dùng được', () => {
  const cfg = lib.mergeConfig({ articleCount: 7, telegram: { botToken: 'abc' } });
  assert.equal(cfg.articleCount, 7);
  assert.equal(cfg.trendingCount, 3);
  assert.deepEqual(cfg.telegram, { botToken: 'abc', chatId: '' });
  assert.deepEqual(cfg.notion, { token: '', parentPage: '' });
  assert.equal(cfg.sources.hackernews.enabled, true);
});

test('mergeConfig: ghi đè từng nguồn mà không mất mặc định của nguồn đó', () => {
  const cfg = lib.mergeConfig({ sources: { reddit: { subreddits: ['rust'] }, tldr: { enabled: false } } });
  assert.deepEqual(cfg.sources.reddit, { enabled: true, subreddits: ['rust'], limit: 25 });
  assert.equal(cfg.sources.tldr.enabled, false);
  assert.deepEqual(cfg.sources.tldr.newsletters, ['tech', 'dev', 'ai']);
  assert.equal(cfg.sources.dailydev.enabled, true);
});

test('maskSecrets che token, giữ phần còn lại', () => {
  const cfg = lib.mergeConfig({ telegram: { botToken: 'abc', chatId: '1' }, notion: { token: 'xyz', parentPage: 'p' } });
  const shown = lib.maskSecrets(cfg);
  assert.ok(!JSON.stringify(shown).includes('abc') && !JSON.stringify(shown).includes('xyz'));
  assert.equal(shown.telegram.chatId, '1');
  assert.equal(shown.notion.parentPage, 'p');
  assert.equal(cfg.telegram.botToken, 'abc'); // không sửa bản gốc
});

test('parseTopics lấy mảng JSON trong câu trả lời', () => {
  assert.deepEqual(lib.parseTopics('["rust async", "postgres indexing"]'), ['rust async', 'postgres indexing']);
  assert.deepEqual(lib.parseTopics('Đây là kết quả:\n```json\n["a", "a", 3, " b  c "]\n```'), ['a', 'b c']);
  assert.deepEqual(lib.parseTopics('["1","2","3","4","5","6"]').length, 5);
  assert.deepEqual(lib.parseTopics('không có gì'), []);
  assert.deepEqual(lib.parseTopics('[hỏng'), []);
});

const context = { interests: '- Rust', gitlog: '', sessions: '- hỏi về RSS' };

test('buildPrompt điền ngữ cảnh, bài ứng viên và bước daily.dev', () => {
  const cfg = lib.mergeConfig({ repos: [], includeClaudeSessions: true });
  const prompt = lib.buildPrompt(cfg, { candidates: '- [Hacker News] T — https://a.dev', context });
  assert.ok(prompt.startsWith(lib.MARKER));
  assert.ok(prompt.includes('- Rust') && prompt.includes('- hỏi về RSS') && prompt.includes('(không có)'));
  assert.ok(prompt.includes('- [Hacker News] T — https://a.dev'));
  assert.ok(prompt.includes('tối đa 5 bài') && prompt.includes('tối đa 3 bài'));
  assert.ok(prompt.includes('Dùng các tool của daily.dev'));
  assert.ok(!/\{\{\w+\}\}/.test(prompt), 'còn placeholder chưa điền');
});

test('buildPrompt: tắt daily.dev thì bảo không dùng tool; không có bài thì ghi rõ', () => {
  const cfg = lib.mergeConfig({ sources: { dailydev: { enabled: false } } });
  const prompt = lib.buildPrompt(cfg, { context });
  assert.ok(prompt.includes('Không dùng tool nào'));
  assert.ok(!prompt.includes('Dùng các tool của daily.dev'));
  assert.ok(prompt.includes('(không lấy được bài nào)'));
});

test('buildPrompt không điền lại placeholder nằm trong dữ liệu', () => {
  const cfg = lib.mergeConfig({});
  const prompt = lib.buildPrompt(cfg, { candidates: '- [X] {{SEEN}} $& — https://a.dev', context });
  assert.ok(prompt.includes('- [X] {{SEEN}} $& — https://a.dev'));
});

test('buildTopicsPrompt có ngữ cảnh và đánh dấu của digest', () => {
  const prompt = lib.buildTopicsPrompt(lib.mergeConfig({}), context);
  assert.ok(prompt.startsWith(lib.MARKER));
  assert.ok(prompt.includes('- Rust') && prompt.includes('mảng JSON'));
  assert.ok(!/\{\{\w+\}\}/.test(prompt));
});

test('saveSeen gộp link cũ và mới trong thư mục dữ liệu tạm', () => {
  lib.saveSeen(['https://a.dev/1']);
  lib.saveSeen(['https://a.dev/1', 'https://a.dev/2']);
  assert.deepEqual(lib.loadSeen(), ['https://a.dev/1', 'https://a.dev/2']);
  assert.ok(lib.SEEN_PATH.startsWith(home));
});
