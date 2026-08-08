export const LOCAL_EVMAP_MAX_BYTES = 32 * 1024 * 1024;

export interface LocalEvmapFileLike {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface LocalEvmapInspection {
  readonly fileName: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly container: 'json' | 'text' | 'binary';
  readonly topLevelKeys: readonly string[];
  readonly compatibility: 'inspection-only';
  readonly uploadPerformed: false;
  readonly persisted: false;
}

function safeBaseName(value: string): string {
  return value.split(/[\\/]/u).at(-1)?.trim() ?? '';
}

function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.digest('SHA-256', buffer).then((digest) => (
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ));
}

function classifyContainer(bytes: Uint8Array): Readonly<{
  container: LocalEvmapInspection['container'];
  topLevelKeys: readonly string[];
}> {
  if (bytes.includes(0)) {
    return Object.freeze({ container: 'binary', topLevelKeys: Object.freeze([]) });
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
  if (text.length === 0) {
    return Object.freeze({ container: 'text', topLevelKeys: Object.freeze([]) });
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    const topLevelKeys = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>).slice(0, 32).sort()
      : [];
    return Object.freeze({
      container: 'json',
      topLevelKeys: Object.freeze(topLevelKeys),
    });
  } catch {
    return Object.freeze({ container: 'text', topLevelKeys: Object.freeze([]) });
  }
}

export async function inspectLocalEvmapFile(
  file: LocalEvmapFileLike,
): Promise<LocalEvmapInspection> {
  const fileName = safeBaseName(file.name);
  if (!fileName.toLocaleLowerCase().endsWith('.evmap')) {
    throw new Error('LOCAL_EVMAP_EXTENSION_REQUIRED');
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new Error('LOCAL_EVMAP_EMPTY_FILE');
  }
  if (file.size > LOCAL_EVMAP_MAX_BYTES) {
    throw new Error(
      `LOCAL_EVMAP_SIZE_LIMIT bytes=${file.size} max=${LOCAL_EVMAP_MAX_BYTES}`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size) {
    throw new Error(
      `LOCAL_EVMAP_SIZE_MISMATCH declared=${file.size} actual=${bytes.byteLength}`,
    );
  }
  const classification = classifyContainer(bytes);
  return Object.freeze({
    fileName,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    container: classification.container,
    topLevelKeys: classification.topLevelKeys,
    compatibility: 'inspection-only',
    uploadPerformed: false,
    persisted: false,
  });
}
