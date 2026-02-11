import pako from "pako";
import type { DetectedInput } from "../types";

const BASE64_BODY = /^[A-Za-z0-9+/=\r\n\t\s_-]+$/;

function normalizeBase64(input: string): string {
  return input.replace(/[\r\n\t\s]/g, "").replace(/-/g, "+").replace(/_/g, "/");
}

function decodeBase64ToBytes(input: string): Uint8Array {
  const decoded = atob(input);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function looksLikeZpl(text: string): boolean {
  return text.includes("^XA") && text.includes("^XZ");
}

export function detectAndDecode(raw: string): DetectedInput {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { mode: "plain", text: "" };
  }

  if (looksLikeZpl(trimmed)) {
    return { mode: "plain", text: trimmed };
  }

  const normalized = normalizeBase64(trimmed);
  if (!BASE64_BODY.test(trimmed) || normalized.length < 12) {
    return { mode: "plain", text: raw };
  }

  try {
    const decodedBytes = decodeBase64ToBytes(normalized);
    const decodedText = utf8Decode(decodedBytes);
    if (looksLikeZpl(decodedText)) {
      return { mode: "base64", text: decodedText };
    }

    try {
      const inflated = pako.ungzip(decodedBytes);
      const inflatedText = utf8Decode(inflated);
      if (looksLikeZpl(inflatedText)) {
        return { mode: "base64_gzip", text: inflatedText };
      }
    } catch {
      // Not gzipped; ignore and continue fallback.
    }

    return { mode: "plain", text: raw };
  } catch {
    return { mode: "plain", text: raw };
  }
}

