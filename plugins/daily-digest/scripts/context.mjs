#!/usr/bin/env node
// Dùng cho skill /daily-digest:digest trong phiên tương tác.
//   context.mjs                    in prompt đầy đủ: ngữ cảnh làm việc kèm bài ứng viên từ các nguồn
//   context.mjs --search "a" "b"   in thêm bài Hacker News tìm theo từng từ khóa
import { buildPrompt, loadConfig, loadSeen } from './lib.mjs';
import { collectCandidates, dedupe, formatCandidates } from './sources/index.mjs';
import { searchTopics } from './sources/hackernews.mjs';

const argv = process.argv.slice(2);
const config = loadConfig();

if (argv[0] === '--search') {
  const topics = argv.slice(1).filter(Boolean).slice(0, 5);
  if (!topics.length) {
    console.error('Cách dùng: context.mjs --search "từ khóa 1" "từ khóa 2"');
    process.exit(1);
  }
  const found = dedupe(await searchTopics(topics, { days: config.sources.hackernews.topicSearchDays }), loadSeen());
  process.stdout.write((formatCandidates(found) || '(không tìm thấy bài nào)') + '\n');
} else {
  const { candidates, stats } = await collectCandidates(config, { seenUrls: loadSeen() });
  for (const s of stats) if (s.error) console.error(`Nguồn ${s.name} lỗi: ${s.error}`);
  process.stdout.write(buildPrompt(config, { candidates: formatCandidates(candidates) }) + '\n');
}
