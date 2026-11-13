import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanUrl, decodeDeep, decodeEntities, retryDelaySeconds, urlKey } from '../scripts/text.mjs';
import { mapHit } from '../scripts/sources/hackernews.mjs';
import { feedUrl, parseAtom } from '../scripts/sources/reddit.mjs';
import { parseIssue, parseRssIssues } from '../scripts/sources/tldr.mjs';
import { dedupe, formatCandidate } from '../scripts/sources/index.mjs';

test('decodeEntities xử lý entity có tên, thập phân và hex', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &#8217;'), 'a & b <c> "d" \'e\' ’');
  assert.equal(decodeEntities('&khonghople; &#0;'), '&khonghople; &#0;');
  assert.equal(decodeDeep('x &amp;amp; y'), 'x & y');
});

test('cleanUrl bỏ tham số theo dõi và từ chối link không phải http', () => {
  assert.equal(cleanUrl('https://a.com/p?utm_source=tldr&id=1&utm_medium=x'), 'https://a.com/p?id=1');
  assert.equal(cleanUrl('https://a.com/p?ref=hn'), 'https://a.com/p');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('không phải link'), '');
});

test('urlKey coi các biến thể của cùng một link là một', () => {
  const key = urlKey('https://www.Example.com/post/?utm_source=x');
  assert.equal(key, urlKey('http://example.com/post'));
  assert.notEqual(key, urlKey('https://example.com/post?id=2'));
});

test('retryDelaySeconds đọc retry-after rồi tới x-ratelimit-reset', () => {
  assert.equal(retryDelaySeconds(new Headers({ 'x-ratelimit-reset': '24' })), 24);
  assert.equal(retryDelaySeconds(new Headers({ 'retry-after': '2.5', 'x-ratelimit-reset': '24' })), 3);
  assert.equal(retryDelaySeconds(new Headers({})), null);
  assert.equal(retryDelaySeconds(new Headers({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })), null);
});

test('mapHit: bài không có link ngoài dùng link thảo luận', () => {
  const c = mapHit({ objectID: '42', title: 'Ask HN: gì đó?', url: null, points: 12, num_comments: 3 });
  assert.equal(c.url, 'https://news.ycombinator.com/item?id=42');
  assert.equal(c.discussion, c.url);
  assert.equal(mapHit({ objectID: '1', title: '' }), null);
  assert.equal(mapHit({ objectID: '2', title: 'T', url: 'https://x.dev/a?utm_source=hn' }, 'rust').topic, 'rust');
  assert.equal(mapHit({ objectID: '2', title: 'T', url: 'https://x.dev/a?utm_source=hn' }).url, 'https://x.dev/a');
});

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><author><name>/u/a</name></author><category term="programming" label="r/programming"/>
<content type="html">&lt;span&gt;&lt;a href=&quot;https://blog.dev/post?a=1&amp;amp;utm_source=reddit&quot;&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;a href=&quot;https://www.reddit.com/r/programming/comments/abc/t/&quot;&gt;[comments]&lt;/a&gt;</content>
<id>t3_abc</id><link href="https://www.reddit.com/r/programming/comments/abc/t/" /><title>Rust &amp; Go: so sánh</title></entry>
<entry><category term="webdev" label="r/webdev"/>
<content type="html">&lt;div class=&quot;md&quot;&gt;bài tự viết&lt;/div&gt; &lt;a href=&quot;https://www.reddit.com/r/webdev/comments/def/s/&quot;&gt;[link]&lt;/a&gt;</content>
<link href="https://www.reddit.com/r/webdev/comments/def/s/" /><title>Bài tự viết</title></entry>
</feed>`;

test('parseAtom lấy link bài gốc, nhãn subreddit và link thảo luận', () => {
  const [a, b] = parseAtom(ATOM);
  assert.deepEqual(a, {
    source: 'reddit',
    label: 'r/programming',
    title: 'Rust & Go: so sánh',
    url: 'https://blog.dev/post?a=1',
    discussion: 'https://www.reddit.com/r/programming/comments/abc/t/',
  });
  assert.equal(b.label, 'r/webdev');
  assert.equal(b.url, 'https://www.reddit.com/r/webdev/comments/def/s/');
  assert.equal(b.discussion, undefined); // bài tự viết: link chính đã là trang thảo luận
});

test('feedUrl gộp subreddit vào một link và từ chối tên lạ', () => {
  assert.equal(feedUrl(['programming', 'r/webdev'], 10), 'https://www.reddit.com/r/programming+webdev/top/.rss?t=day&limit=10');
  assert.throws(() => feedUrl(['ok', 'a/../b']), /không hợp lệ/);
});

const RSS = `<rss><channel><link>https://tldr.tech</link>
<item><title><![CDATA[Số mới]]></title><link>https://tldr.tech/tech/2026-11-12</link><pubDate>Thu, 12 Nov 2026 00:00:00 GMT</pubDate></item>
<item><title><![CDATA[Số cũ]]></title><link>https://tldr.tech/tech/2026-11-11</link></item>
<item><link>https://evil.example/x</link></item></channel></rss>`;

const ISSUE = `<section><article class="mt-3"><a class="font-bold" href="https://ads.example/x?utm_source=tldr" target="_blank"><h3>Mua hàng đi (Sponsor)</h3></a><div class="newsletter-html">Quảng cáo</div></article></section>
<section><header><h3 class="text-center font-bold">Big Tech</h3></header>
<article class="mt-3"><a class="font-bold" href="https://news.example/a?id=7&amp;amp;utm_source=tldrnewsletter" target="_blank"><h3>Engineer&#x27;s job &amp; agents (9 minute read)</h3></a><div class="newsletter-html">Dòng một <a href="https://x.example">link</a>.<div>Dòng hai</div></div></article>
<article class="mt-3"><h3>Không có link</h3></article></section>`;

test('parseRssIssues chỉ nhận link tldr.tech, số mới nhất đứng đầu', () => {
  const issues = parseRssIssues(RSS);
  assert.deepEqual(issues.map((i) => i.link), ['https://tldr.tech/tech/2026-11-12', 'https://tldr.tech/tech/2026-11-11']);
});

test('parseIssue bỏ bài tài trợ, bỏ thời lượng đọc và tham số theo dõi', () => {
  assert.deepEqual(parseIssue(ISSUE, 'TLDR Tech'), [
    {
      source: 'tldr',
      label: 'TLDR Tech',
      title: "Engineer's job & agents",
      url: 'https://news.example/a?id=7',
      summary: 'Dòng một link . Dòng hai',
    },
  ]);
});

test('dedupe bỏ link trùng và link đã gửi, giữ bản xuất hiện trước', () => {
  const list = [
    { url: 'https://a.dev/x', title: '1', topic: 'rust' },
    { url: 'https://www.a.dev/x/?utm_source=hn', title: '2' },
    { url: 'https://b.dev/đã-gửi', title: '3' },
    { url: 'https://c.dev/', title: '4' },
  ];
  assert.deepEqual(dedupe(list, ['https://b.dev/đã-gửi']).map((c) => c.title), ['1', '4']);
});

test('formatCandidate ghi nguồn, điểm, link thảo luận và tóm tắt', () => {
  assert.equal(
    formatCandidate({ label: 'Hacker News', topic: 'rust', title: 'T', url: 'https://a.dev', discussion: 'https://hn/1', points: 5, comments: 0 }),
    '- [Hacker News · tìm theo "rust" · 5 điểm · 0 bình luận] T — https://a.dev (thảo luận: https://hn/1)',
  );
  assert.equal(
    formatCandidate({ label: 'TLDR AI', title: 'T', url: 'https://a.dev', summary: 'S' }),
    '- [TLDR AI] T — https://a.dev\n  Tóm tắt: S',
  );
});
