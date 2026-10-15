#!/usr/bin/env node
// Chạy một lần: dựng prompt -> claude -p -> lưu ~/.daily-digest/digests/YYYY-MM-DD.md -> Telegram (nếu cấu hình)
// Tùy chọn: --dry-run (chỉ in prompt), --no-send (không gửi Telegram)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DIGEST_DIR, buildPrompt, ensureDirs, extractUrls, loadConfig, log, saveSeen,
} from './lib.mjs';

const args = new Set(process.argv.slice(2));

function runClaude(config, prompt) {
  return new Promise((resolve, reject) => {
    const claude = config.claudePath || 'claude';
    const claudeArgs = [
      '-p',
      'Thực hiện nhiệm vụ trong nội dung đầu vào.',
      '--allowedTools',
      ...config.allowedTools,
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
      reject(new Error(`Quá ${config.timeoutMinutes} phút, đã dừng`));
    }, config.timeoutMinutes * 60_000);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Không chạy được "${claude}": ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`claude thoát với mã ${code}: ${err.trim().slice(0, 500)}`));
    });

    child.stdin.end(prompt); // prompt dài đi qua stdin, tránh lỗi quoting trên từng hệ điều hành
  });
}

async function sendTelegram({ botToken, chatId }, text) {
  if (!botToken || !chatId) return false;
  const chunks = [];
  for (let i = 0; i < text.length; i += 3900) chunks.push(text.slice(i, i + 3900));
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    if (!res.ok) throw new Error(`Telegram trả về ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return true;
}

async function main() {
  const config = loadConfig();
  const prompt = buildPrompt(config);

  if (args.has('--dry-run')) {
    process.stdout.write(prompt + '\n');
    return;
  }

  ensureDirs();
  log('Bắt đầu tạo digest');
  const result = await runClaude(config, prompt);

  const today = new Date().toLocaleDateString('sv-SE');
  const file = path.join(DIGEST_DIR, `${today}.md`);
  const content = `# Daily digest ${today}\n\n${result}\n`;
  fs.writeFileSync(file, content);
  saveSeen(extractUrls(result));
  log(`Đã lưu ${file}`);
  console.log(content);

  if (!args.has('--no-send')) {
    try {
      if (await sendTelegram(config.telegram, content)) log('Đã gửi Telegram');
    } catch (e) {
      log(`Lỗi gửi Telegram: ${e.message}`);
    }
  }
}

main().catch((e) => {
  log(`LỖI: ${e.message}`);
  console.error(e.message);
  process.exit(1);
});
