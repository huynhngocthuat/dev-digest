// Lưu digest vào Notion: mỗi lần chạy tạo một trang con dưới trang người dùng chọn.
// Cần một internal integration (notion.so/my-integrations) và trang cha đã được chia sẻ với integration đó.
import { parseBlocks, parseInline } from './markdown.mjs';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
const TEXT_LIMIT = 2000; // giới hạn ký tự của một đoạn rich text
const BATCH = 100; // giới hạn số khối mỗi lần gọi

// Nhận link trang Notion hoặc ID (có hay không có gạch nối). Trả về ID 32 ký tự hex, hoặc ''.
export function parsePageId(input) {
  const lastSegment = String(input).trim().split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() || '';
  return /([0-9a-f]{32})$/i.exec(lastSegment.replace(/-/g, ''))?.[1].toLowerCase() || '';
}

function richText(text) {
  const out = [];
  for (const seg of parseInline(text)) {
    for (let i = 0; i < seg.text.length; i += TEXT_LIMIT) {
      out.push({
        type: 'text',
        text: { content: seg.text.slice(i, i + TEXT_LIMIT), ...(seg.url ? { link: { url: seg.url } } : {}) },
        ...(seg.bold ? { annotations: { bold: true } } : {}),
      });
    }
  }
  return out;
}

const TYPES = { h1: 'heading_1', h2: 'heading_2', h3: 'heading_3', li: 'bulleted_list_item', p: 'paragraph' };

export function toNotionBlocks(markdown) {
  const blocks = parseBlocks(markdown);
  if (blocks[0]?.type === 'h1') blocks.shift(); // dòng tiêu đề đã là tên trang
  return blocks.map((b) => {
    const type = TYPES[b.type];
    return { object: 'block', type, [type]: { rich_text: richText(b.text) } };
  });
}

export async function sendNotion({ token, parentPage }, { title, markdown }, { fetchImpl = fetch } = {}) {
  const pageId = parsePageId(parentPage);
  if (!pageId) throw new Error('notion.parentPage không phải link hay ID trang Notion hợp lệ');

  const call = async (method, pathname, body) => {
    const res = await fetchImpl(`${API}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = res.status === 404 ? ' (trang cha đã được chia sẻ với integration chưa?)' : '';
      throw new Error(`Notion trả về ${res.status}: ${String(data.message || '').slice(0, 200)}${hint}`);
    }
    return data;
  };

  const blocks = toNotionBlocks(markdown);
  const page = await call('POST', '/pages', {
    parent: { page_id: pageId },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: blocks.slice(0, BATCH),
  });
  for (let i = BATCH; i < blocks.length; i += BATCH) {
    await call('PATCH', `/blocks/${page.id}/children`, { children: blocks.slice(i, i + BATCH) });
  }
  return page.url || page.id;
}
