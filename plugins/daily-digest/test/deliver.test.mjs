import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline } from '../scripts/deliver/markdown.mjs';
import { sendTelegram, toPlain, toTelegramMessages } from '../scripts/deliver/telegram.mjs';
import { parsePageId, sendNotion, toNotionBlocks } from '../scripts/deliver/notion.mjs';
import { channels, deliver } from '../scripts/deliver/index.mjs';

const DIGEST = `# Daily digest 2026-11-13

## Chủ đề hôm nay
Plugin Claude Code, RSS

## Liên quan việc đang làm
### [Bài <A> & B](https://a.dev/x?p=1&q=2)
Tóm tắt một câu.
**Liên quan:** giúp việc X.
**Nguồn:** Hacker News, [thảo luận](https://news.ycombinator.com/item?id=1)
- một gạch đầu dòng
`;

test('parseInline tách chữ đậm và link', () => {
  assert.deepEqual(parseInline('a **b** [c](https://d.dev) e'), [
    { text: 'a ' },
    { text: 'b', bold: true },
    { text: ' ' },
    { text: 'c', url: 'https://d.dev' },
    { text: ' e' },
  ]);
  assert.deepEqual(parseInline('**[c](https://d.dev)**'), [{ text: 'c', url: 'https://d.dev', bold: true }]);
  assert.deepEqual(parseInline('[c](javascript:x)'), [{ text: '[c](javascript:x)' }]);
});

test('parseBlocks nhận tiêu đề, gạch đầu dòng và đoạn văn', () => {
  assert.deepEqual(parseBlocks(DIGEST).map((b) => b.type), ['h1', 'h2', 'p', 'h2', 'h3', 'p', 'p', 'p', 'li']);
  assert.deepEqual(parseBlocks('a\n\n---\n*ghi chú: x*\n**đậm**\n* mục'), [
    { type: 'p', text: 'a' },
    { type: 'p', text: 'ghi chú: x' },
    { type: 'p', text: '**đậm**' },
    { type: 'li', text: 'mục' },
  ]);
});

test('toTelegramMessages tạo HTML đã escape', () => {
  const [msg, ...rest] = toTelegramMessages(DIGEST);
  assert.equal(rest.length, 0);
  assert.ok(msg.startsWith('<b>Daily digest 2026-11-13</b>'));
  assert.ok(msg.includes('<b><a href="https://a.dev/x?p=1&amp;q=2">Bài &lt;A&gt; &amp; B</a></b>'));
  assert.ok(msg.includes('<b>Liên quan:</b> giúp việc X.'));
  assert.ok(msg.includes('• một gạch đầu dòng'));
});

test('toTelegramMessages chia tin ở ranh giới khối, không vượt giới hạn', () => {
  const md = Array.from({ length: 40 }, (_, i) => `### [Bài ${i}](https://a.dev/${i})\n${'chữ '.repeat(30)}`).join('\n');
  const msgs = toTelegramMessages(md, 1000);
  assert.ok(msgs.length > 1);
  for (const m of msgs) {
    assert.ok(m.length <= 1000);
    assert.equal((m.match(/<b>/g) || []).length, (m.match(/<\/b>/g) || []).length);
    assert.equal((m.match(/<a /g) || []).length, (m.match(/<\/a>/g) || []).length);
  }
  assert.equal(msgs.join('\n').match(/Bài \d+</g).length, 40);
  const [huge] = toTelegramMessages('x'.repeat(5000), 1000);
  assert.equal(huge.length, 1000);
});

test('toPlain giữ lại link dưới dạng chữ', () => {
  assert.equal(toPlain('<b><a href="https://a.dev/?p=1&amp;q=2">A &amp; B</a></b>'), 'A & B (https://a.dev/?p=1&q=2)');
});

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status });

test('sendTelegram gửi HTML, lỗi 400 thì gửi lại dạng chữ thường', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    return body.parse_mode ? jsonRes(400, { description: "can't parse entities" }) : jsonRes(200, { ok: true });
  };
  const detail = await sendTelegram({ botToken: 'T', chatId: '9' }, DIGEST, { fetchImpl });
  assert.equal(detail, '1 tin');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.telegram.org/botT/sendMessage');
  assert.equal(calls[0].body.chat_id, '9');
  assert.equal(calls[0].body.parse_mode, 'HTML');
  assert.equal(calls[1].body.parse_mode, undefined);
  assert.ok(calls[1].body.text.includes('Bài <A> & B (https://a.dev/x?p=1&q=2)'));
});

test('sendTelegram báo lỗi khi Telegram từ chối', async () => {
  const fetchImpl = async () => jsonRes(401, { description: 'Unauthorized' });
  await assert.rejects(sendTelegram({ botToken: 'T', chatId: '9' }, DIGEST, { fetchImpl }), /Telegram trả về 401/);
});

test('parsePageId nhận link Notion và ID', () => {
  const id = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
  assert.equal(parsePageId(id), id);
  assert.equal(parsePageId('1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'), id);
  assert.equal(parsePageId(`https://www.notion.so/team/Daily-digest-cafe-${id}?pvs=4`), id);
  assert.equal(parsePageId(`https://www.notion.so/${id.toUpperCase()}/`), id);
  assert.equal(parsePageId('https://www.notion.so/team/khong-co-id'), '');
  assert.equal(parsePageId(''), '');
});

test('toNotionBlocks bỏ dòng tiêu đề trang, giữ đậm và link', () => {
  const blocks = toNotionBlocks(DIGEST);
  assert.deepEqual(blocks.map((b) => b.type), [
    'heading_2', 'paragraph', 'heading_2', 'heading_3', 'paragraph', 'paragraph', 'paragraph', 'bulleted_list_item',
  ]);
  assert.deepEqual(blocks[3].heading_3.rich_text, [
    { type: 'text', text: { content: 'Bài <A> & B', link: { url: 'https://a.dev/x?p=1&q=2' } } },
  ]);
  assert.deepEqual(blocks[5].paragraph.rich_text[0], {
    type: 'text', text: { content: 'Liên quan:' }, annotations: { bold: true },
  });
  const long = toNotionBlocks('y'.repeat(4500));
  assert.deepEqual(long[0].paragraph.rich_text.map((r) => r.text.content.length), [2000, 2000, 500]);
});

test('sendNotion tạo trang con rồi thêm khối theo lô 100', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    return jsonRes(200, { id: 'page-1', url: 'https://www.notion.so/page-1' });
  };
  const markdown = '# Tiêu đề\n' + Array.from({ length: 230 }, (_, i) => `dòng ${i}`).join('\n');
  const parentPage = 'https://www.notion.so/Tin-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
  const url = await sendNotion({ token: 'secret', parentPage }, { title: 'Daily digest 2026-11-13', markdown }, { fetchImpl });

  assert.equal(url, 'https://www.notion.so/page-1');
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
    'POST https://api.notion.com/v1/pages',
    'PATCH https://api.notion.com/v1/blocks/page-1/children',
    'PATCH https://api.notion.com/v1/blocks/page-1/children',
  ]);
  assert.equal(calls[0].headers.Authorization, 'Bearer secret');
  assert.deepEqual(calls[0].body.parent, { page_id: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d' });
  assert.equal(calls[0].body.properties.title.title[0].text.content, 'Daily digest 2026-11-13');
  assert.deepEqual(calls.map((c) => c.body.children.length), [100, 100, 30]);
});

test('sendNotion báo lỗi rõ khi trang cha sai hoặc chưa chia sẻ', async () => {
  await assert.rejects(sendNotion({ token: 't', parentPage: 'abc' }, { title: 'T', markdown: 'x' }), /parentPage/);
  const fetchImpl = async () => jsonRes(404, { message: 'Could not find page' });
  await assert.rejects(
    sendNotion({ token: 't', parentPage: '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d' }, { title: 'T', markdown: 'x' }, { fetchImpl }),
    /Notion trả về 404: Could not find page.*chia sẻ/,
  );
});

test('channels chỉ bật kênh có đủ cấu hình; deliver bỏ qua kênh tắt', async () => {
  const off = { telegram: { botToken: '', chatId: '' }, notion: { token: 'x', parentPage: '' } };
  assert.deepEqual(channels(off).map((c) => c.enabled), [false, false]);
  assert.deepEqual(await deliver(off, { title: 'T', markdown: 'x' }), []);
  const on = { telegram: { botToken: 'a', chatId: 'b' }, notion: { token: 'x', parentPage: 'y' } };
  assert.deepEqual(channels(on).map((c) => c.enabled), [true, true]);
});
