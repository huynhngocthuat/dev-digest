---
name: digest
description: Chọn bài đáng đọc trên daily.dev dựa trên việc người dùng đang làm (commit gần đây, câu hỏi Claude Code gần đây, sở thích trong interests.md). Dùng khi người dùng hỏi hôm nay nên đọc gì, muốn xem digest, hoặc gõ /daily-digest:digest.
---

# Daily digest

1. Chạy lệnh sau để lấy hướng dẫn kèm ngữ cảnh làm việc của người dùng:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/context.mjs"
   ```

2. Làm đúng nhiệm vụ và định dạng trong kết quả in ra. Dùng các tool của MCP server `daily-dev` để đọc feed và tìm bài.
3. Nếu tool daily-dev báo chưa xác thực, bảo người dùng chạy `/mcp`, chọn `daily-dev` và đăng nhập, rồi dừng lại.
4. Nếu người dùng chưa từng cấu hình (kết quả ghi "(chưa khai báo)" ở phần sở thích và không có commit), vẫn làm digest, rồi gợi ý một câu chạy `/daily-digest:setup` để kết quả sát hơn và nhận tự động mỗi ngày.
