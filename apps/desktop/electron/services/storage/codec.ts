// 책임: SQLite BLOB 컬럼에 저장할 데이터의 직렬화/역직렬화를 제공한다.

import { deserialize, serialize } from "node:v8";

type BlobLike = Buffer | Uint8Array | ArrayBuffer;

function toBuffer(value: BlobLike): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(new Uint8Array(value));
}

// 목적: 객체를 JSON이 아닌 바이너리 포맷으로 직렬화한다.
export function encodeStoredValue(value: unknown): Buffer {
  return serialize(value);
}

// 목적: SQLite에서 읽은 BLOB 값을 객체로 복원한다.
export function decodeStoredValue<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof ArrayBuffer) {
    try {
      return deserialize(toBuffer(value)) as T;
    } catch {
      return null;
    }
  }
  return null;
}
