# Daily Digest cho Claude Code

Mỗi sáng nhận 5 bài daily.dev đúng với việc bạn đang làm. Plugin đọc commit gần đây, các câu bạn đã hỏi Claude Code và danh sách sở thích của bạn, rồi để Claude chọn bài qua MCP của daily.dev. Kết quả được lưu thành file Markdown và có thể gửi qua Telegram.

Chạy được trên macOS (launchd), Linux (cron) và Windows (Task Scheduler).

## Yêu cầu

- Claude Code đã cài và đăng nhập
- Node.js 18 trở lên
- Tài khoản daily.dev (MCP của daily.dev đang beta)

## Cài đặt

Trong Claude Code:

```
/plugin marketplace add <github-user>/<repo>
/plugin install daily-digest@dev-digest
/mcp                       ← chọn "plugin:daily-digest:daily-dev" và đăng nhập daily.dev
/daily-digest:setup        ← trả lời vài câu hỏi, lịch chạy được cài tự động
```

Muốn xem digest ngay trong phiên làm việc: `/daily-digest:digest`.

## Dữ liệu nằm ở đâu

Mọi thứ nằm trong `~/.daily-digest/`:

| File | Nội dung |
| --- | --- |
| `config.json` | Repo theo dõi, giờ chạy, số bài, Telegram |
| `interests.md` | Chủ đề luôn muốn theo dõi và chủ đề bỏ qua |
| `digests/YYYY-MM-DD.md` | Digest từng ngày |
| `seen.json` | Link đã gửi, để không lặp lại |
| `digest.log` | Log mỗi lần chạy |
| `app/` | Bản sao script mà lịch chạy gọi tới |

Các khóa trong `config.json`:

| Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `repos` | `[]` | Đường dẫn repo để đọc git log |
| `time` | `"08:00"` | Giờ chạy (giờ máy) |
| `weekdaysOnly` | `true` | Chỉ chạy thứ 2 đến thứ 6 |
| `daysBack` | `2` | Số ngày lấy commit và câu hỏi |
| `articleCount` | `5` | Số bài mỗi digest |
| `language` | `"tiếng Việt"` | Ngôn ngữ của digest |
| `includeClaudeSessions` | `true` | Có đọc câu hỏi từ `~/.claude/projects` không |
| `claudePath` | tự dò | Đường dẫn lệnh `claude` |
| `allowedTools` | tool daily.dev | Tool Claude được dùng khi chạy không giám sát |
| `timeoutMinutes` | `10` | Thời gian tối đa mỗi lần chạy |
| `telegram` | trống | `botToken` và `chatId` |

Đổi sở thích hay repo: sửa file là xong. Đổi giờ hoặc ngày chạy: sửa `config.json` rồi chạy lại `install`.

## Lệnh quản lý

Chạy từ terminal (hoặc nhờ Claude chạy trong `/daily-digest:setup`):

```bash
node ~/.daily-digest/app/scripts/setup.mjs status      # trạng thái và log gần nhất
node ~/.daily-digest/app/scripts/setup.mjs test        # chạy thử một lần
node ~/.daily-digest/app/scripts/run.mjs --dry-run     # xem prompt sẽ gửi cho Claude
node ~/.daily-digest/app/scripts/setup.mjs uninstall   # gỡ lịch chạy
```

## Quyền riêng tư

- Từ transcript Claude Code, script chỉ lấy câu bạn gõ, mỗi câu tối đa 200 ký tự. Câu trả lời, code và output của tool đều bị bỏ qua.
- Ngữ cảnh chỉ được gửi cho Claude để chọn bài. Không gửi đi đâu khác, trừ digest cuối cùng nếu bạn bật Telegram.
- Khi chạy theo lịch, Claude chỉ được phép dùng các tool daily.dev trong `allowedTools`. Prompt cũng yêu cầu chỉ đọc, không bookmark hay follow.
- `config.json` được đặt quyền 600 trên macOS và Linux vì có thể chứa bot token.

## Xử lý sự cố

- **Không có digest:** xem `~/.daily-digest/digest.log`. Máy phải bật vào giờ chạy. macOS sẽ chạy bù khi máy thức dậy, cron trên Linux thì không.
- **Lỗi xác thực daily.dev:** mở Claude Code, chạy `/mcp` và đăng nhập lại.
- **macOS báo không có quyền đọc repo:** nếu repo nằm trong Desktop, Documents hoặc Downloads, hãy cấp Full Disk Access cho `node` trong System Settings → Privacy & Security.
- **Sau khi cập nhật plugin:** chạy lại `/daily-digest:setup` hoặc `setup.mjs install` để làm mới bản sao trong `app/`.

## Phát hành cho người khác

1. Sửa `"owner"` trong `.claude-plugin/marketplace.json` và `"author"` trong `plugins/daily-digest/.claude-plugin/plugin.json`.
2. Kiểm tra: `claude plugin validate .` và `claude plugin validate ./plugins/daily-digest`.
3. Đẩy lên một repo GitHub public, rồi gửi cho mọi người lệnh `/plugin marketplace add <github-user>/<repo>`.
4. Khi ra bản mới, tăng `version` trong `plugin.json`. Người dùng sẽ nhận bản cập nhật qua `/plugin`.

## Cấu trúc

```
.
├── .claude-plugin/marketplace.json
└── plugins/daily-digest/
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                  # MCP server daily.dev
    ├── prompts/digest.md          # Mẫu prompt, sửa để đổi cách chọn bài
    ├── skills/
    │   ├── digest/SKILL.md        # /daily-digest:digest
    │   └── setup/SKILL.md         # /daily-digest:setup
    └── scripts/
        ├── lib.mjs                # Gom ngữ cảnh, dựng prompt
        ├── context.mjs            # In prompt cho skill digest
        ├── run.mjs                # Chạy theo lịch
        └── setup.mjs              # init / install / uninstall / status / test
```
