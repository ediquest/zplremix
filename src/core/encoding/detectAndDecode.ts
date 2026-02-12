import pako from "pako";
import type { DetectedInput } from "../types";

const BASE64_BODY = /^[A-Za-z0-9+/=\r\n\t\s_-]+$/;
const XML_PAYLOAD_TAG_HINTS = ["zplbase64", "base64", "payload", "zpl", "printdata"];

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

function tryDecodeAsBase64OrGzip(input: string): DetectedInput | null {
  const normalized = normalizeBase64(input);
  if (!BASE64_BODY.test(input) || normalized.length < 12) {
    return null;
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

    return null;
  } catch {
    return null;
  }
}

function stripCdata(text: string): string {
  const trimmed = text.trim();
  const cdataMatch = trimmed.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdataMatch ? cdataMatch[1] : trimmed;
}

function extractXmlPayloadCandidates(raw: string): string[] {
  if (!raw.includes("<") || !raw.includes(">")) {
    return [];
  }

  // Prefer explicit LABEL.* shipping parameters from API responses (e.g. PrintParcelResponse).
  const labeledPayloads: string[] = [];
  const shippingParamRe =
    /<ShippingParameter\b[^>]*>[\s\S]*?<Name>([\s\S]*?)<\/Name>[\s\S]*?<Value>([\s\S]*?)<\/Value>[\s\S]*?<\/ShippingParameter>/gi;
  let shippingMatch = shippingParamRe.exec(raw);
  while (shippingMatch) {
    const name = (shippingMatch[1] ?? "").trim();
    const value = stripCdata((shippingMatch[2] ?? "").trim());
    if (/^LABEL\./i.test(name)) {
      const normalized = normalizeBase64(value);
      if (BASE64_BODY.test(value) && normalized.length >= 12) {
        labeledPayloads.push(value);
      } else if (looksLikeZpl(value)) {
        labeledPayloads.push(value);
      }
    }
    shippingMatch = shippingParamRe.exec(raw);
  }
  if (labeledPayloads.length) {
    return labeledPayloads;
  }

  const candidates: string[] = [];
  const pushCandidate = (value: string) => {
    if (!value) {
      return;
    }
    candidates.push(value);
  };
  try {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(raw, "application/xml");
      const parserError = doc.getElementsByTagName("parsererror")[0];
      if (!parserError) {
        const elements = Array.from(doc.getElementsByTagName("*"));
        elements.forEach((element) => {
          if (element.children.length > 0) {
            return;
          }
          const localName = (element.localName || element.nodeName || "").toLowerCase();
          const looksLikePayloadTag = XML_PAYLOAD_TAG_HINTS.some((hint) => localName.includes(hint));
          if (!looksLikePayloadTag) {
            return;
          }
          const value = stripCdata(element.textContent ?? "").trim();
          if (!value) {
            return;
          }
          if (looksLikeZpl(value)) {
            pushCandidate(value);
            return;
          }
          const normalized = normalizeBase64(value);
          if (BASE64_BODY.test(value) && normalized.length >= 12) {
            pushCandidate(value);
          }
        });
      }
    }
  } catch {
    // Ignore XML parser failures and continue with regex fallback.
  }

  if (!candidates.length) {
    const hintTagRe = /<([A-Za-z_][A-Za-z0-9:._-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match = hintTagRe.exec(raw);
    while (match) {
      const tagName = match[1].toLowerCase();
      const looksLikePayloadTag = XML_PAYLOAD_TAG_HINTS.some((hint) => tagName.includes(hint));
      if (!looksLikePayloadTag) {
        match = hintTagRe.exec(raw);
        continue;
      }
      const value = stripCdata(match[2]).trim();
      if (!value) {
        match = hintTagRe.exec(raw);
        continue;
      }
      if (!value.includes("<")) {
        if (looksLikeZpl(value)) {
          pushCandidate(value);
        } else {
          const normalized = normalizeBase64(value);
          if (BASE64_BODY.test(value) && normalized.length >= 12) {
            pushCandidate(value);
          }
        }
      } else {
        const nestedBlobRe = />([A-Za-z0-9+/=\r\n\t\s_-]{120,})</g;
        let nested = nestedBlobRe.exec(value);
        while (nested) {
          const nestedValue = nested[1].trim();
          const normalized = normalizeBase64(nestedValue);
          if (BASE64_BODY.test(nestedValue) && normalized.length >= 12) {
            pushCandidate(nestedValue);
          }
          nested = nestedBlobRe.exec(value);
        }
      }
      match = hintTagRe.exec(raw);
    }
  }

  if (!candidates.length) {
    const blobRe = />([A-Za-z0-9+/=\r\n\t\s_-]{120,})</g;
    let blob = blobRe.exec(raw);
    while (blob) {
      const value = blob[1].trim();
      const normalized = normalizeBase64(value);
      if (BASE64_BODY.test(value) && normalized.length >= 12) {
        pushCandidate(value);
      }
      blob = blobRe.exec(raw);
    }
  }

  return candidates;
}

function scoreDecodedZpl(text: string): number {
  const xaCount = (text.match(/\^XA/g) ?? []).length;
  const xzCount = (text.match(/\^XZ/g) ?? []).length;
  const pairs = Math.min(xaCount, xzCount);
  const graphicsRefs = (text.match(/\^XG/g) ?? []).length;
  const downloads = (text.match(/~DG/g) ?? []).length;
  return pairs * 1_000_000 + graphicsRefs * 10_000 + downloads * 10_000 + text.length;
}

function pickBestDecodedInput(items: DetectedInput[]): DetectedInput {
  return [...items].sort((a, b) => scoreDecodedZpl(b.text) - scoreDecodedZpl(a.text))[0];
}

export function detectAndDecode(raw: string): DetectedInput {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { mode: "plain", text: "" };
  }

  if (looksLikeZpl(trimmed)) {
    return { mode: "plain", text: trimmed };
  }

  const directDecoded = tryDecodeAsBase64OrGzip(trimmed);
  if (directDecoded) {
    return directDecoded;
  }

  const xmlPayloads = extractXmlPayloadCandidates(raw);
  const xmlDecoded: DetectedInput[] = [];
  for (const payload of xmlPayloads) {
    if (looksLikeZpl(payload)) {
      xmlDecoded.push({ mode: "plain", text: payload });
      continue;
    }
    const decoded = tryDecodeAsBase64OrGzip(payload);
    if (decoded) {
      xmlDecoded.push(decoded);
    }
  }
  if (xmlDecoded.length === 1) {
    return xmlDecoded[0];
  }
  if (xmlDecoded.length > 1) {
    return pickBestDecodedInput(xmlDecoded);
  }

  return { mode: "plain", text: raw };
}
