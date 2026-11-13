# Daily Digest cho Claude Code

Mỗi sáng nhận một bản tin công nghệ đúng với việc bạn đang làm. Plugin đọc commit gần đây, các câu bạn đã hỏi Claude Code và danh sách sở thích của bạn, lấy bài từ daily.dev, Hacker News, Reddit và TLDR, rồi để Claude chọn. Bản tin có hai phần: bài liên quan việc đang làm, và tin đáng chú ý trong ngày. Kết quả được lưu thành file Markdown và có thể gửi qua Telegram hoặc Notion.

Chạy được trên macOS (launchd), Linux (cron) và Windows (Task Scheduler).

## Yêu cầu

- Claude Code bản mới, đã cài và đăng nhập
- Node.js 18 trở lên
- Tài khoản daily.dev nếu dùng nguồn daily.dev (MCP của daily.dev đang beta)

## Cài đặt

Trong Claude Code:

```
/plugin marketplace add <github-user>/<repo>
/plugin install daily-digest@dev-digest
/mcp                       ← chọn "plugin:daily-digest:daily-dev" và đăng nhập daily.dev
/daily-digest:setup        ← trả lời vài câu hỏi, lịch chạy được cài tự động
```

Muốn xem digest ngay trong phiên làm việc: `/daily-digest:digest`.

## Cách hoạt động

1. Script đọc sở thích, commit và câu hỏi gần đây của bạn.
2. Claude rút ra 3–5 từ khóa từ ngữ cảnh đó (lượt một, không dùng tool).
3. Script lấy bài ứng viên: trang nhất Hacker News, bài Hacker News tìm theo từ khóa, bài nổi nhất trong ngày của các subreddit, và số mới nhất của các bản tin TLDR. Nguồn nào lỗi thì ghi vào log, các nguồn khác vẫn chạy.
4. Claude chọn bài từ danh sách ứng viên và từ daily.dev (lượt hai), rồi viết bản tin.
5. Script lưu file Markdown và gửi tới các kênh đã bật.

| Nguồn | Cách lấy | Ghi chú |
| --- | --- | --- |
| daily.dev | Claude gọi MCP của daily.dev | Cần đăng nhập qua `/mcp` |
| Hacker News | API tìm kiếm Algolia | Không cần tài khoản |
| Reddit | RSS công khai, gộp mọi subreddit vào một lần gọi | Reddit giới hạn chặt số lần gọi; bị chặn (429) thì script chờ rồi thử lại một lần |
| TLDR | RSS để tìm số mới nhất, rồi tách bài từ trang của số đó | Phụ thuộc giao diện tldr.tech; nếu họ đổi giao diện thì nguồn này báo lỗi |

## Dữ liệu nằm ở đâu

Mọi thứ nằm trong `~/.daily-digest/`:

| File | Nội dung |
| --- | --- |
| `config.json` | Repo theo dõi, giờ chạy, số bài, nguồn tin, kênh gửi |
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
| `articleCount` | `5` | Số bài tối đa của phần "Liên quan việc đang làm" |
| `trendingCount` | `3` | Số bài tối đa của phần "Đáng chú ý hôm nay" |
| `language` | `"tiếng Việt"` | Ngôn ngữ của digest |
| `includeClaudeSessions` | `true` | Có đọc câu hỏi từ `~/.claude/projects` không |
| `claudePath` | tự dò | Đường dẫn lệnh `claude` |
| `allowedTools` | tool daily.dev | Tool MCP Claude được dùng khi chạy không giám sát |
| `timeoutMinutes` | `10` | Thời gian tối đa mỗi lượt gọi Claude |
| `maxCandidates` | `150` | Số bài ứng viên tối đa đưa vào prompt |
| `sources` | xem dưới | Bật, tắt và chỉnh từng nguồn tin |
| `telegram` | trống | `botToken` và `chatId` |
| `notion` | trống | `token` và `parentPage` |

Khóa `sources`, mỗi nguồn đều có `enabled` (mặc định `true`):

| Khóa | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `sources.dailydev.enabled` | `true` | Cho Claude đọc daily.dev qua MCP |
| `sources.hackernews.limit` | `30` | Số bài lấy từ trang nhất |
| `sources.hackernews.minPoints` | `50` | Bỏ bài trang nhất dưới số điểm này |
| `sources.hackernews.topicSearch` | `true` | Tìm thêm bài theo từ khóa rút từ việc đang làm |
| `sources.hackernews.topicSearchDays` | `7` | Tìm trong bao nhiêu ngày gần đây |
| `sources.reddit.subreddits` | `programming`, `webdev`, `devops`, `MachineLearning` | Các subreddit theo dõi |
| `sources.reddit.limit` | `25` | Tổng số bài lấy từ các subreddit |
| `sources.tldr.newsletters` | `tech`, `dev`, `ai` | Bản tin TLDR theo dõi (còn có `devops`, `infosec`, `data`, `design`, `product`) |

Đổi sở thích, repo, nguồn tin hay kênh gửi: sửa file là xong. Đổi giờ hoặc ngày chạy: sửa `config.json` rồi chạy lại `install`. File `config.json` của bản 0.1 vẫn dùng được; các nguồn mới bật theo mặc định.

## Kênh gửi

**Telegram.** Tạo bot với @BotFather, điền `telegram.botToken` và `telegram.chatId`.

**Notion.** Mỗi digest là một trang con dưới trang bạn chọn.

1. Tạo một internal integration tại notion.so/my-integrations và chép token.
2. Mở trang muốn chứa digest → ⋯ → Connections → chọn integration vừa tạo.
3. Điền `notion.token` và `notion.parentPage` (link hoặc ID của trang đó).

Thử lại kênh gửi mà không tạo digest mới: `setup.mjs test --resend`.

## Lệnh quản lý

Chạy từ terminal (hoặc nhờ Claude chạy trong `/daily-digest:setup`):

```bash
node ~/.daily-digest/app/scripts/setup.mjs status          # trạng thái và log gần nhất
node ~/.daily-digest/app/scripts/setup.mjs test            # chạy thử một lần đầy đủ (có gọi Claude)
node ~/.daily-digest/app/scripts/setup.mjs test --sources  # chỉ thử các nguồn tin, không gọi Claude
node ~/.daily-digest/app/scripts/setup.mjs test --resend   # gửi lại digest mới nhất tới các kênh
node ~/.daily-digest/app/scripts/run.mjs --dry-run         # xem prompt sẽ gửi cho Claude
node ~/.daily-digest/app/scripts/setup.mjs uninstall       # gỡ lịch chạy
```

## Quyền riêng tư

- Từ transcript Claude Code, script chỉ lấy câu bạn gõ, mỗi câu tối đa 200 ký tự. Câu trả lời, code và output của tool đều bị bỏ qua.
- Ngữ cảnh làm việc chỉ được gửi cho Claude. Ngoại lệ duy nhất: 3–5 từ khóa Claude rút ra (ví dụ "postgres indexing") được gửi tới API tìm kiếm của Hacker News. Tắt bằng `sources.hackernews.topicSearch: false`.
- Các lần gọi Reddit và TLDR không mang thông tin gì về bạn.
- Digest cuối cùng chỉ rời máy khi bạn bật Telegram hoặc Notion.
- Tiêu đề bài lấy từ internet là dữ liệu không đáng tin, nên khi chạy theo lịch Claude bị tắt toàn bộ tool có sẵn (chạy lệnh, đọc file, truy cập web). Nó chỉ dùng được các tool daily.dev trong `allowedTools`, và prompt yêu cầu chỉ đọc, không bookmark hay follow.
- `config.json` được đặt quyền 600 trên macOS và Linux vì có thể chứa token.

## Xử lý sự cố

- **Không có digest:** xem `~/.daily-digest/digest.log`. Máy phải bật vào giờ chạy. macOS sẽ chạy bù khi máy thức dậy, cron trên Linux thì không.
- **Một nguồn báo lỗi:** chạy `setup.mjs test --sources` để xem nguồn nào hỏng. Reddit lỗi 429 thì chờ một phút rồi thử lại. Nguồn hỏng lâu dài thì tắt bằng `sources.<tên>.enabled: false`.
- **Digest ghi "không đọc được daily.dev":** mở Claude Code, chạy `/mcp` và đăng nhập lại. Kiểm tra thêm `claude plugin list` xem plugin có nạp được không.
- **Notion trả về 404:** trang cha chưa được chia sẻ với integration (bước 2 ở phần Kênh gửi).
- **macOS báo không có quyền đọc repo:** nếu repo nằm trong Desktop, Documents hoặc Downloads, hãy cấp Full Disk Access cho `node` trong System Settings → Privacy & Security.
- **Sau khi cập nhật plugin:** chạy lại `/daily-digest:setup` hoặc `setup.mjs install` để làm mới bản sao trong `app/`.

## Phát triển

```bash
cd plugins/daily-digest
node --test                                    # chạy test, không cần mạng
DAILY_DIGEST_HOME=/tmp/dd node scripts/run.mjs --sources   # thử với thư mục dữ liệu tạm
```

Thêm nguồn tin: viết module trong `scripts/sources/` trả về mảng `{ source, label, title, url, ... }` rồi khai báo trong `scripts/sources/index.mjs`. Thêm kênh gửi: viết module trong `scripts/deliver/` rồi khai báo trong `scripts/deliver/index.mjs`.

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
    ├── prompts/
    │   ├── digest.md              # Mẫu prompt chọn bài, sửa để đổi cách chọn
    │   └── topics.md              # Mẫu prompt rút từ khóa
    ├── skills/
    │   ├── digest/SKILL.md        # /daily-digest:digest
    │   └── setup/SKILL.md         # /daily-digest:setup
    ├── scripts/
    │   ├── lib.mjs                # Cấu hình, gom ngữ cảnh, dựng prompt
    │   ├── text.mjs               # Xử lý chuỗi, URL, tải dữ liệu
    │   ├── sources/               # hackernews, reddit, tldr và index gom bài
    │   ├── deliver/               # telegram, notion, markdown và index kênh gửi
    │   ├── context.mjs            # In prompt cho skill digest
    │   ├── run.mjs                # Chạy theo lịch
    │   └── setup.mjs              # init / install / uninstall / status / test
    └── test/                      # node --test
```
