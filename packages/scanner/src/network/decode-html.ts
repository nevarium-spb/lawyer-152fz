/** Сколько байт начала страницы смотреть в поисках `<meta charset>` — как браузеры. */
const SNIFF_BYTES = 4096;

const charsetIn = (text: string): string | undefined =>
  /charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(text)?.[1];

function sniffMetaCharset(body: Buffer): string | undefined {
  const head = body.subarray(0, SNIFF_BYTES).toString('latin1');
  for (const meta of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const charset = charsetIn(meta);
    if (charset) return charset;
  }
  return undefined;
}

function decoderFor(label: string | undefined): TextDecoder {
  try {
    return new TextDecoder(label ?? 'utf-8');
  } catch {
    return new TextDecoder('utf-8');
  }
}

/**
 * Текст страницы в правильной кодировке: BOM → `charset` в Content-Type → `<meta charset>` → UTF-8.
 * Русские сайты нередко отдают windows-1251.
 */
export function decodeHtml(body: Buffer, contentType: string | undefined): string {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(body);
  }
  const label = (contentType ? charsetIn(contentType) : undefined) ?? sniffMetaCharset(body);
  return decoderFor(label).decode(body);
}
