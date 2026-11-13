---
name: setup
description: Cài đặt daily digest — hỏi sở thích, repo theo dõi, nguồn tin (daily.dev, Hacker News, Reddit, TLDR), giờ nhận, kênh gửi (Telegram, Notion), rồi cài lịch chạy tự động trên macOS, Linux hoặc Windows. Dùng khi người dùng gõ /daily-digest:setup hoặc muốn đổi cấu hình, đổi giờ, gỡ lịch.
disable-model-invocation: true
---

# Cài đặt daily digest

Script cài đặt: `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" <lệnh>`, với lệnh là `init`, `install`, `uninstall`, `status` hoặc `test`.

## Các bước

1. Kiểm tra `node --version` ≥ 18. Nếu thấp hơn, dừng và báo người dùng nâng cấp Node.
2. Chạy `setup.mjs init`. Lệnh này tạo `~/.daily-digest/`, file `config.json`, `interests.md` mẫu, tự dò đường dẫn `claude`, rồi in đường dẫn và cấu hình hiện tại (token đã được che).
3. Hỏi người dùng trong **một** tin nhắn, đưa sẵn giá trị mặc định để họ chỉ cần sửa chỗ cần:
   - Chủ đề luôn muốn theo dõi, và chủ đề không quan tâm.
   - Đường dẫn các repo đang làm. Nếu thư mục hiện tại là git repo, đề xuất luôn nó.
   - Nguồn tin: mặc định bật cả daily.dev, Hacker News, Reddit, TLDR. Hỏi muốn tắt nguồn nào, muốn theo dõi subreddit nào (mặc định programming, webdev, devops, MachineLearning) và bản tin TLDR nào (mặc định tech, dev, ai; còn có devops, infosec, data, design, product...).
   - Giờ nhận (mặc định 08:00), chỉ ngày làm việc hay mỗi ngày, số bài liên quan việc đang làm (mặc định 5) và số tin đáng chú ý (mặc định 3).
   - Kênh gửi ngoài file Markdown, có thể chọn cả hai:
     - Telegram: cần bot token (tạo với @BotFather) và chat id.
     - Notion: cần token của một internal integration (tạo tại notion.so/my-integrations) và link trang cha. Trang cha phải được chia sẻ với integration: mở trang → ⋯ → Connections → chọn integration. Mỗi digest là một trang con của trang này.
   - Nói rõ: nếu không muốn dán token vào chat, người dùng có thể tự điền vào `~/.daily-digest/config.json` sau.
4. Ghi câu trả lời:
   - `interests.md`: danh sách gạch đầu dòng gọn, mỗi dòng một mảng; dòng cuối "Không quan tâm: ...".
   - `config.json`: cập nhật `repos` (đường dẫn tuyệt đối), `time`, `weekdaysOnly`, `articleCount`, `trendingCount`, `sources` (`enabled` của từng nguồn, `reddit.subreddits`, `tldr.newsletters`), `telegram` (`botToken`, `chatId`), `notion` (`token`, `parentPage`). Giữ nguyên các khóa khác. Không in lại token ra màn hình.
5. Chạy `setup.mjs test --sources` để thử các nguồn tin (không gọi Claude, không tốn hạn mức). Nếu nguồn nào lỗi, báo cho người dùng và hỏi có muốn tắt nguồn đó không.
6. Nếu bật daily.dev: kiểm tra MCP `daily-dev` đã đăng nhập chưa bằng cách gọi thử một tool đọc feed. Nếu chưa, bảo người dùng chạy `/mcp`, chọn `daily-dev`, đăng nhập, rồi quay lại bước này.
7. Chạy `setup.mjs install` và báo lại kết quả.
8. Hỏi người dùng có muốn chạy thử ngay không (`setup.mjs test`, mất 2–5 phút, gọi Claude hai lượt nên tính vào hạn mức, và sẽ gửi tới các kênh đã bật). Chỉ chạy khi họ đồng ý.
9. Kết thúc bằng tóm tắt ngắn: giờ chạy, nguồn tin và kênh gửi đang bật, nơi lưu digest (`~/.daily-digest/digests/`), cách xem trạng thái (`setup.mjs status`), cách gỡ (`setup.mjs uninstall`).

## Lưu ý

- Đổi giờ hoặc ngày chạy: sửa `config.json` rồi chạy lại `install`. Đổi sở thích, repo, nguồn tin hay kênh gửi thì không cần cài lại.
- Sau khi cập nhật plugin, chạy lại `install` để làm mới bản sao script trong `~/.daily-digest/app`.
- Thử lại kênh gửi mà không tạo digest mới: `setup.mjs test --resend` gửi lại digest mới nhất.
- Reddit giới hạn chặt số lần gọi không đăng nhập. Nếu `test --sources` báo Reddit lỗi 429, chờ một phút rồi thử lại.
- macOS: nếu repo nằm trong Desktop, Documents hoặc Downloads, launchd có thể bị chặn đọc. Nhắc người dùng cấp Full Disk Access cho `node` trong System Settings → Privacy & Security nếu log báo lỗi quyền.
- Máy phải bật vào giờ chạy. macOS sẽ chạy bù khi máy thức dậy; cron trên Linux thì không.
