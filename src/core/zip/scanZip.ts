import JSZip from "jszip";
import { detectAndDecode } from "../encoding/detectAndDecode";
import type { LabelCandidate, ScanResult } from "../types";
import { extractLabels } from "../zpl/extractLabels";
import { ALLOWED_EXTENSIONS, MAX_ZIP_ENTRIES } from "./limits";

function hasAllowedExtension(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250", { fatal: false }).decode(bytes);
  }
}

export async function scanZip(file: File): Promise<ScanResult> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((item) => !item.dir);
  const warnings: string[] = [];
  const labels: LabelCandidate[] = [];

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP contains too many files (${entries.length}).`);
  }

  for (const entry of entries) {
    if (!hasAllowedExtension(entry.name)) {
      continue;
    }

    try {
      const bytes = await entry.async("uint8array");
      const text = decodeBytes(bytes);
      const decoded = detectAndDecode(text);
      const found = extractLabels(decoded.text, entry.name);
      labels.push(...found);
    } catch {
      warnings.push(`Could not parse ${entry.name}`);
    }
  }

  return { labels, warnings };
}

