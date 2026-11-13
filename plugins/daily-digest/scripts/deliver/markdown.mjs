// Đọc Markdown của digest thành cấu trúc đơn giản để từng kênh gửi tự hiển thị theo cách của mình.
// Chỉ hỗ trợ phần Markdown mà digest dùng: tiêu đề #/##/###, gạch đầu dòng, **đậm** và [chữ](link).

const INLINE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Trả về mảng đoạn { text, bold?, url? }
export function parseInline(text) {
  const out = [];
  const push = (seg) => {
    if (seg.text) out.push(seg);
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      for (const seg of parseInline(m[1])) push({ ...seg, bold: true });
    } else {
      push({ text: m[2], url: m[3] });
    }
    last = m.index + m[0].length;
  }
  push({ text: text.slice(last) });
  return out;
}

// Trả về mảng khối { type: 'h1' | 'h2' | 'h3' | 'li' | 'p', text }
export function parseBlocks(markdown) {
  const blocks = [];
  for (const line of String(markdown).split('\n')) {
    let t = line.trim();
    if (!t || /^([-*_])\1{2,}$/.test(t)) continue; // dòng trống, đường kẻ ngang
    const italic = /^([*_])([^*_].*[^*_])\1$/.exec(t); // cả dòng in nghiêng: bỏ dấu, giữ chữ
    if (italic) t = italic[2];
    const heading = /^(#{1,3})\s+(.*)$/.exec(t);
    const bullet = /^[-*]\s+(.*)$/.exec(t);
    if (heading) blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
    else if (bullet) blocks.push({ type: 'li', text: bullet[1] });
    else blocks.push({ type: 'p', text: t });
  }
  return blocks;
}
