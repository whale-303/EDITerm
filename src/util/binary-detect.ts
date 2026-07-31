/**
 * Binary file detection — checks whether a Buffer contains binary (non-text) content.
 *
 * Heuristic:
 *   1. Null byte (\x00) anywhere in the sample → binary (text files never contain null)
 *   2. Decode sample as UTF-8 — if > 5 % of decoded characters are U+FFFD
 *      replacement chars (invalid UTF-8 sequences), treat as binary
 *
 * Reads are capped to the first 8192 bytes for performance.
 */

const SAMPLE_SIZE = 8192;

/**
 * Returns true if the buffer looks like binary content.
 */
export function isBinaryContent(buf: Buffer): boolean {
  if (buf.length === 0) return false;

  const sample = buf.subarray(0, Math.min(buf.length, SAMPLE_SIZE));

  // Null byte → binary (definitive)
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0x00) return true;
  }

  // Decode as UTF-8 — invalid sequences become U+FFFD replacement characters
  const text = sample.toString('utf-8');
  if (text.length === 0) return false;

  let replacementCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 0xfffd) replacementCount++;
  }

  // If > 5 % of decoded characters are replacements, treat as binary
  return replacementCount / text.length > 0.05;
}
