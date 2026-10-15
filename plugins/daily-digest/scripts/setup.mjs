#!/usr/bin/env node
// Cách dùng: node setup.mjs <init|install|uninstall|status|test>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  APP_DIR, BASE_DIR, CONFIG_PATH, DEFAULT_INTERESTS, DIGEST_DIR, HOME, INTERESTS_PATH, LOG_PATH,
  PLUGIN_ROOT, ensureDirs, loadConfig, writeConfig,
} from './lib.mjs';

const TAG = 'daily-digest';
const MAC_LABEL = 'dev.daily-digest';
const MAC_PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);
const WIN_TASK = 'DailyDigest';
const RUNNER = path.join(APP_DIR, 'scripts', 'run.mjs');

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

function detectClaude() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const lines = sh(finder, ['claude']).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (process.platform === 'win32') return lines.find((l) => /\.exe$/i.test(l)) || lines[0] || '';
    if (lines[0]) return lines[0];
  } catch {}
  const candidates = [
    path.join(HOME, '.local', 'bin', 'claude'),
    path.join(HOME, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return candidates.find((p) => fs.existsSync(p)) || '';
}

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`Giờ không hợp lệ: "${t}" (dạng HH:MM)`);
  return { h: +m[1], m: +m[2] };
}

function copyApp() {
  // Thư mục plugin đổi chỗ khi plugin cập nhật, nên lịch chạy trỏ vào một bản sao cố định
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  for (const dir of ['scripts', 'prompts']) {
    fs.cpSync(path.join(PLUGIN_ROOT, dir), path.join(APP_DIR, dir), { recursive: true });
  }
}

// ---------- Linux & Unix khác: crontab ----------
function readCrontab() {
  try {
    return sh('crontab', ['-l']);
  } catch {
    return '';
  }
}
function writeCrontab(lines) {
  sh('crontab', ['-'], { input: lines.length ? lines.join('\n') + '\n' : '' });
}
function cronInstall(cfg, { h, m }) {
  const days = cfg.weekdaysOnly ? '1-5' : '*';
  const line = `${m} ${h} * * ${days} "${process.execPath}" "${RUNNER}" >> "${LOG_PATH}" 2>&1 # ${TAG}`;
  const kept = readCrontab().split('\n').filter((l) => l.trim() && !l.includes(`# ${TAG}`));
  writeCrontab([...kept, line]);
}
function cronUninstall() {
  writeCrontab(readCrontab().split('\n').filter((l) => l.trim() && !l.includes(`# ${TAG}`)));
}
function cronStatus() {
  return readCrontab().split('\n').find((l) => l.includes(`# ${TAG}`)) || null;
}

// ---------- macOS: launchd ----------
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function macInstall(cfg, { h, m }) {
  const days = cfg.weekdaysOnly ? [1, 2, 3, 4, 5] : [null];
  const intervals = days
    .map((d) =>
      `    <dict>${d === null ? '' : `<key>Weekday</key><integer>${d}</integer>`}` +
      `<key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>`)
    .join('\n');
  const envPath = [path.dirname(process.execPath), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'].join(':');
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(process.execPath)}</string><string>${xml(RUNNER)}</string></array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(envPath)}</string></dict>
  <key>StandardOutPath</key><string>${xml(LOG_PATH)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG_PATH)}</string>
</dict>
</plist>
`;
  fs.mkdirSync(path.dirname(MAC_PLIST), { recursive: true });
  macUninstall();
  fs.writeFileSync(MAC_PLIST, plist);
  const domain = `gui/${process.getuid()}`;
  try {
    sh('launchctl', ['bootstrap', domain, MAC_PLIST]);
  } catch {
    sh('launchctl', ['load', MAC_PLIST]); // macOS cũ
  }
}
function macUninstall() {
  if (!fs.existsSync(MAC_PLIST)) return;
  try {
    sh('launchctl', ['bootout', `gui/${process.getuid()}`, MAC_PLIST]);
  } catch {
    try { sh('launchctl', ['unload', MAC_PLIST]); } catch {}
  }
  fs.rmSync(MAC_PLIST, { force: true });
}
function macStatus() {
  return fs.existsSync(MAC_PLIST) ? MAC_PLIST : null;
}

// ---------- Windows: Task Scheduler ----------
function winInstall(cfg, { h, m }) {
  const wrapper = path.join(APP_DIR, 'run-digest.cmd');
  fs.writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${RUNNER}" >> "${LOG_PATH}" 2>&1\r\n`);
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const schedule = cfg.weekdaysOnly ? ['/SC', 'WEEKLY', '/D', 'MON,TUE,WED,THU,FRI'] : ['/SC', 'DAILY'];
  sh('schtasks', ['/Create', '/F', '/TN', WIN_TASK, '/TR', `"${wrapper}"`, ...schedule, '/ST', time]);
}
function winUninstall() {
  try { sh('schtasks', ['/Delete', '/F', '/TN', WIN_TASK]); } catch {}
}
function winStatus() {
  try {
    sh('schtasks', ['/Query', '/TN', WIN_TASK]);
    return WIN_TASK;
  } catch {
    return null;
  }
}

const platform =
  process.platform === 'darwin'
    ? { name: 'launchd', install: macInstall, uninstall: macUninstall, status: macStatus }
    : process.platform === 'win32'
      ? { name: 'Task Scheduler', install: winInstall, uninstall: winUninstall, status: winStatus }
      : { name: 'cron', install: cronInstall, uninstall: cronUninstall, status: cronStatus };

// ---------- Lệnh ----------
const commands = {
  init() {
    ensureDirs();
    const cfg = loadConfig();
    if (!cfg.claudePath) cfg.claudePath = detectClaude();
    if (!fs.existsSync(CONFIG_PATH) || !loadConfig().claudePath) writeConfig(cfg);
    if (!fs.existsSync(INTERESTS_PATH)) fs.writeFileSync(INTERESTS_PATH, DEFAULT_INTERESTS);
    const shown = { ...cfg, telegram: { chatId: cfg.telegram.chatId, botToken: cfg.telegram.botToken ? '(đã đặt)' : '' } };
    console.log(JSON.stringify({
      baseDir: BASE_DIR, configPath: CONFIG_PATH, interestsPath: INTERESTS_PATH,
      digestDir: DIGEST_DIR, scheduler: platform.name, nodeVersion: process.version, config: shown,
    }, null, 2));
    if (!cfg.claudePath) console.warn('CẢNH BÁO: không tìm thấy lệnh claude. Hãy điền "claudePath" trong config.json.');
  },

  install() {
    const [major] = process.versions.node.split('.').map(Number);
    if (major < 18) throw new Error(`Cần Node 18 trở lên (đang là ${process.version})`);
    ensureDirs();
    const cfg = loadConfig();
    if (!cfg.claudePath) {
      cfg.claudePath = detectClaude();
      if (!cfg.claudePath) throw new Error('Không tìm thấy lệnh claude. Hãy điền "claudePath" trong config.json.');
      writeConfig(cfg);
    }
    const time = parseTime(cfg.time);
    copyApp();
    platform.install(cfg, time);
    console.log(`Đã cài lịch (${platform.name}): ${cfg.time} ${cfg.weekdaysOnly ? 'thứ 2 đến thứ 6' : 'mỗi ngày'}.`);
    console.log(`Digest sẽ lưu tại ${DIGEST_DIR}, log tại ${LOG_PATH}`);
  },

  uninstall() {
    platform.uninstall();
    fs.rmSync(APP_DIR, { recursive: true, force: true });
    console.log(`Đã gỡ lịch chạy. Dữ liệu và cấu hình vẫn còn ở ${BASE_DIR} (xóa tay nếu muốn).`);
  },

  status() {
    const cfg = loadConfig();
    console.log(`Lịch (${platform.name}): ${platform.status() || 'chưa cài'}`);
    console.log(`Giờ chạy: ${cfg.time} ${cfg.weekdaysOnly ? '(thứ 2 - thứ 6)' : '(mỗi ngày)'}`);
    console.log(`Claude: ${cfg.claudePath || '(chưa tìm thấy)'}`);
    console.log(`Repo theo dõi: ${cfg.repos.length ? cfg.repos.join(', ') : '(không có)'}`);
    console.log(`Telegram: ${cfg.telegram.botToken && cfg.telegram.chatId ? 'bật' : 'tắt'}`);
    try {
      const tail = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').slice(-5).join('\n');
      console.log(`\nLog gần nhất:\n${tail}`);
    } catch {}
  },

  test() {
    const runner = fs.existsSync(RUNNER) ? RUNNER : path.join(PLUGIN_ROOT, 'scripts', 'run.mjs');
    const r = spawnSync(process.execPath, [runner, ...process.argv.slice(3)], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },
};

const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error('Cách dùng: node setup.mjs <init|install|uninstall|status|test>');
  process.exit(1);
}
try {
  commands[cmd]();
} catch (e) {
  console.error(`LỖI: ${e.message}`);
  process.exit(1);
}
