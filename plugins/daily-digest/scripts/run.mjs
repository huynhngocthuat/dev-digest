#!/usr/bin/env node
// Chạy một lần: lấy bài từ các nguồn -> claude -p chọn bài -> lưu ~/.daily-digest/digests/YYYY-MM-DD.md -> gửi các kênh đã bật
// Tùy chọn:
//   --dry-run   chỉ in prompt sẽ gửi cho Claude (không gọi Claude, không tìm theo chủ đề)
//   --sources   chỉ thử các nguồn tin và in số bài lấy được
//   --resend    gửi lại digest mới nhất tới các kênh (không gọi Claude)
//   --no-send   tạo digest nhưng không gửi
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DIGEST_DIR, MARKER, buildPrompt, buildTopicsPrompt, ensureDirs, extractUrls, loadConfig, loadSeen, log,
  parseTopics, saveSeen, workContext,
} from './lib.mjs';
import { collectCandidates, formatCandidates } from './sources/index.mjs';
import { channels, deliver } from './deliver/index.mjs';

const args = new Set(process.argv.slice(2));

function runClaude(config, prompt, { allowedTools = [], timeoutMinutes = config.timeoutMinutes } = {}) {
  return new Promise((resolve, reject) => {
    const claude = config.claudePath || 'claude';
    const claudeArgs = [
      '-p',
      `${MARKER} Thực hiện nhiệm vụ trong nội dung đầu vào.`,
      // Prompt chứa tiêu đề bài lấy từ internet, nên tắt hết tool có sẵn (Bash, Read, WebFetch...).
      // Chỉ còn tool MCP được liệt kê trong --allowedTools.
      '--tools',
      '',
      ...(allowedTools.length ? ['--allowedTools', ...allowedTools] : []),
    ];
    // Đảm bảo `node` có trong PATH khi chạy từ cron/launchd/Task Scheduler
    const env = {
      ...process.env,
      PATH: [path.dirname(process.execPath), process.env.PATH || ''].join(path.delimiter),
    };

    let child;
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(claude)) {
      const line = [claude, ...claudeArgs].map((a) => `"${a}"`).join(' ');
      child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { env, windowsVerbatimArguments: true });
    } else {
      child = spawn(claude, claudeArgs, { env });
    }

    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Quá ${timeoutMinutes} phút, đã dừng`));
    }, timeoutMinutes * 60_000);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Không chạy được "${claude}": ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`claude thoát với mã ${code}: ${(err.trim() || out.trim()).slice(0, 500)}`));
    });

    child.stdin.end(prompt); // prompt dài đi qua stdin, tránh lỗi quoting trên từng hệ điều hành
  });
}

// Lượt một: nhờ Claude rút từ khóa từ ngữ cảnh làm việc. Lỗi ở đây không chặn digest.
async function extractTopics(config, context) {
  const hn = config.sources.hackernews;
  if (!hn.enabled || !hn.topicSearch) return [];
  if (!context.interests && !context.gitlog && !context.sessions) return [];
  try {
    const out = await runClaude(config, buildTopicsPrompt(config, context), {
      timeoutMinutes: Math.min(3, config.timeoutMinutes),
    });
    const topics = parseTopics(out);
    log(topics.length ? `Chủ đề tìm kiếm: ${topics.join(', ')}` : 'Không rút được chủ đề nào');
    return topics;
  } catch (e) {
    log(`Bỏ qua tìm theo chủ đề: ${e.message}`);
    return [];
  }
}

function describeStats(stats) {
  return stats.map((s) => (s.error ? `${s.name}: LỖI ${s.error}` : `${s.name}: ${s.count} bài`)).join('; ');
}

function reportDelivery(results) {
  for (const r of results) {
    const line = r.ok ? `Đã gửi ${r.name} (${r.detail})` : `Lỗi gửi ${r.name}: ${r.detail}`;
    log(line);
    console.error(line);
  }
  return results.every((r) => r.ok);
}

function latestDigest() {
  let files = [];
  try {
    files = fs.readdirSync(DIGEST_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  } catch {}
  if (!files.length) throw new Error(`Chưa có digest nào trong ${DIGEST_DIR}`);
  const file = files[files.length - 1];
  return { title: `Daily digest ${file.slice(0, 10)}`, markdown: fs.readFileSync(path.join(DIGEST_DIR, file), 'utf8') };
}

async function main() {
  const config = loadConfig();

  if (args.has('--resend')) {
    if (!channels(config).some((c) => c.enabled)) throw new Error('Chưa bật kênh gửi nào trong config.json');
    if (!reportDelivery(await deliver(config, latestDigest()))) process.exitCode = 1;
    return;
  }

  if (args.has('--sources')) {
    const { candidates, stats } = await collectCandidates(config, { seenUrls: loadSeen() });
    for (const s of stats) console.log(s.error ? `${s.name}: LỖI ${s.error}` : `${s.name}: ${s.count} bài`);
    console.log(`Tổng sau khi bỏ trùng và bỏ bài đã gửi: ${candidates.length} bài`);
    if (!stats.length) console.log('Không bật nguồn nào ngoài daily.dev.');
    if (stats.some((s) => s.error)) process.exitCode = 1;
    return;
  }

  const context = workContext(config);

  if (args.has('--dry-run')) {
    const { candidates } = await collectCandidates(config, { seenUrls: loadSeen() });
    process.stdout.write(buildPrompt(config, { candidates: formatCandidates(candidates), context }) + '\n');
    return;
  }

  ensureDirs();
  log('Bắt đầu tạo digest');
  const topics = await extractTopics(config, context);
  const { candidates, stats } = await collectCandidates(config, { topics, seenUrls: loadSeen() });
  if (stats.length) log(`Nguồn tin: ${describeStats(stats)}. Còn ${candidates.length} bài ứng viên`);

  const useDailyDev = config.sources.dailydev.enabled;
  if (!candidates.length && !useDailyDev) throw new Error('Không nguồn nào trả về bài, không tạo được digest');

  const prompt = buildPrompt(config, { candidates: formatCandidates(candidates), context });
  const result = await runClaude(config, prompt, { allowedTools: useDailyDev ? config.allowedTools : [] });

  const today = new Date().toLocaleDateString('sv-SE');
  const file = path.join(DIGEST_DIR, `${today}.md`);
  const title = `Daily digest ${today}`;
  const content = `# ${title}\n\n${result}\n`;
  fs.writeFileSync(file, content);
  saveSeen(extractUrls(result));
  log(`Đã lưu ${file}`);
  console.log(content);

  if (!args.has('--no-send')) reportDelivery(await deliver(config, { title, markdown: content }));
}

main().catch((e) => {
  log(`LỖI: ${e.message}`);
  console.error(e.message);
  process.exit(1);
});
