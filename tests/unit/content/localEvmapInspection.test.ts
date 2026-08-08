import { describe, expect, it } from 'vitest';

import {
  inspectLocalEvmapFile,
  LOCAL_EVMAP_MAX_BYTES,
} from '../../../src/content/maps/localEvmapInspection';

function fileLike(name: string, content: string | Uint8Array) {
  const bytes = typeof content === 'string'
    ? new TextEncoder().encode(content)
    : content;
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
    },
  };
}

describe('local evmap inspection boundary', () => {
  it('fingerprints a JSON-shaped file without uploading or persisting it', async () => {
    const result = await inspectLocalEvmapFile(fileLike(
      'sample.evmap',
      '{"zones":[],"objects":[],"version":1}',
    ));
    expect(result).toMatchObject({
      fileName: 'sample.evmap',
      container: 'json',
      topLevelKeys: ['objects', 'version', 'zones'],
      compatibility: 'inspection-only',
      uploadPerformed: false,
      persisted: false,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('classifies opaque bytes without pretending to understand the format', async () => {
    await expect(inspectLocalEvmapFile(fileLike(
      'opaque.evmap',
      new Uint8Array([0x45, 0x56, 0x00, 0xff]),
    ))).resolves.toMatchObject({
      container: 'binary',
      topLevelKeys: [],
      compatibility: 'inspection-only',
    });
  });

  it('fails closed on the wrong extension, empty files, and oversized declarations', async () => {
    await expect(inspectLocalEvmapFile(fileLike('map.json', '{}')))
      .rejects.toThrow('LOCAL_EVMAP_EXTENSION_REQUIRED');
    await expect(inspectLocalEvmapFile(fileLike('empty.evmap', '')))
      .rejects.toThrow('LOCAL_EVMAP_EMPTY_FILE');
    await expect(inspectLocalEvmapFile({
      name: 'huge.evmap',
      size: LOCAL_EVMAP_MAX_BYTES + 1,
      async arrayBuffer() { return new ArrayBuffer(0); },
    })).rejects.toThrow('LOCAL_EVMAP_SIZE_LIMIT');
  });
});
