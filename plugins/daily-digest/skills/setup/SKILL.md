---
name: setup
description: Cài đặt daily digest — hỏi sở thích, repo theo dõi, giờ nhận, Telegram (tùy chọn), rồi cài lịch chạy tự động trên macOS, Linux hoặc Windows. Dùng khi người dùng gõ /daily-digest:setup hoặc muốn đổi cấu hình, đổi giờ, gỡ lịch.
disable-model-invocation: true
---

# Cài đặt daily digest

Script cài đặt: `node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" <lệnh>`, với lệnh là `init`, `install`, `uninstall`, `status` hoặc `test`.

## Các bước

1. Kiểm tra `node --version` ≥ 18. Nếu thấp hơn, dừng và báo người dùng nâng cấp Node.
2. Chạy `setup.mjs init`. Lệnh này tạo `~/.daily-digest/`, file `config.json`, `interests.md` mẫu, tự dò đường dẫn `claude`, rồi in đường dẫn và cấu hình hiện tại.
3. Hỏi người dùng trong **một** tin nhắn, đưa sẵn giá trị mặc định để họ chỉ cần sửa chỗ cần:
   - Chủ đề luôn muốn theo dõi, và chủ đề không quan tâm.
   - Đường dẫn các repo đang làm. Nếu thư mục hiện tại là git repo, đề xuất luôn nó.
   - Giờ nhận (mặc định 08:00), chỉ ngày làm việc hay mỗi ngày, số bài (mặc định 5).
   - Có muốn nhận qua Telegram không. Nếu có: bot token (tạo với @BotFather) và chat id.
4. Ghi câu trả lời:
   - `interests.md`: danh sách gạch đầu dòng gọn, mỗi dòng một mảng; dòng cuối "Không quan tâm: ...".
   - `config.json`: cập nhật `repos` (đường dẫn tuyệt đối), `time`, `weekdaysOnly`, `articleCount`, `telegram`. Giữ nguyên các khóa khác. Không in lại bot token ra màn hình.
5. Kiểm tra MCP `daily-dev` đã đăng nhập chưa bằng cách gọi thử một tool đọc feed. Nếu chưa, bảo người dùng chạy `/mcp`, chọn `daily-dev`, đăng nhập, rồi quay lại bước này.
6. Chạy `setup.mjs install` và báo lại kết quả.
7. Hỏi người dùng có muốn chạy thử ngay không (`setup.mjs test`, mất 1–3 phút, tính vào hạn mức Claude). Chỉ chạy khi họ đồng ý.
8. Kết thúc bằng tóm tắt ngắn: giờ chạy, nơi lưu digest (`~/.daily-digest/digests/`), cách xem trạng thái (`setup.mjs status`), cách gỡ (`setup.mjs uninstall`).

## Lưu ý

- Đổi giờ hoặc ngày chạy: sửa `config.json` rồi chạy lại `install`. Đổi sở thích hay repo thì không cần cài lại.
- Sau khi cập nhật plugin, chạy lại `install` để làm mới bản sao script trong `~/.daily-digest/app`.
- macOS: nếu repo nằm trong Desktop, Documents hoặc Downloads, launchd có thể bị chặn đọc. Nhắc người dùng cấp Full Disk Access cho `node` trong System Settings → Privacy & Security nếu log báo lỗi quyền.
- Máy phải bật vào giờ chạy. macOS sẽ chạy bù khi máy thức dậy; cron trên Linux thì không.
