const GZIP_PREFIX = "gz.";
const RAW_PREFIX = "raw.";

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, index + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function transformBytes(bytes, mode) {
  const streamConstructor =
    mode === "gzip" ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (typeof streamConstructor !== "function") return null;

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new streamConstructor("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeInlineShare(value) {
  const bytes = new TextEncoder().encode(value);
  const compressed = await transformBytes(bytes, "gzip");
  return `${compressed ? GZIP_PREFIX : RAW_PREFIX}${bytesToBase64(
    compressed ?? bytes,
  )}`;
}

export async function decodeInlineShare(payload) {
  if (typeof payload !== "string") {
    throw new TypeError("Inline share payload must be a string");
  }

  const isGzip = payload.startsWith(GZIP_PREFIX);
  const isRaw = payload.startsWith(RAW_PREFIX);
  if (!isGzip && !isRaw) {
    throw new Error("Unknown inline share payload format");
  }

  const prefixLength = isGzip ? GZIP_PREFIX.length : RAW_PREFIX.length;
  const bytes = base64ToBytes(payload.slice(prefixLength));
  const decoded = isGzip ? await transformBytes(bytes, "ungzip") : bytes;
  if (!decoded) {
    throw new Error("This browser cannot decompress shared diagrams");
  }
  return new TextDecoder().decode(decoded);
}

export function getInlineSharePayload(hash = globalThis.location?.hash) {
  const prefix = "#shareData=";
  if (!hash?.startsWith(prefix)) return null;
  return decodeURIComponent(hash.slice(prefix.length));
}
