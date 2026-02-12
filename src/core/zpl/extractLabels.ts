import type { LabelCandidate } from "../types";

const ZPL_LABEL_RE = /\^XA[\s\S]*?\^XZ/g;
const PRINTABLE_HINT_RE = /\^(?:FO|FT|FD|FS|FB|GB|GC|GD|GE|GF|XG|SN|B[0-9A-Z]|A[0-9@])/i;
const SETUP_HINT_RE = /(?:~DG|\^CW|\^CF|\^CI|\^LH|\^LT|\^LS|\^PW|\^LL|\^PR|\^MD|\^PO|\^J[MU]|~JS)/i;

type LabelChunk = {
  zpl: string;
  start: number;
};

function splitRawChunks(text: string): LabelChunk[] {
  const chunks: LabelChunk[] = [];
  const matches = Array.from(text.matchAll(ZPL_LABEL_RE));
  if (!matches.length) {
    return chunks;
  }

  let pendingSetup = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    const zpl = match[0];
    const start = match.index ?? 0;
    const gap = text.slice(cursor, start);
    if (SETUP_HINT_RE.test(gap)) {
      pendingSetup += `${pendingSetup ? "\n" : ""}${gap.trim()}`;
    }
    const withSetup = pendingSetup ? `${pendingSetup}\n${zpl}` : zpl;
    chunks.push({ zpl: withSetup, start });
    pendingSetup = "";
    cursor = start + zpl.length;

    const isLast = index === matches.length - 1;
    if (isLast) {
      const tail = text.slice(cursor);
      if (SETUP_HINT_RE.test(tail) && chunks.length) {
        const last = chunks[chunks.length - 1];
        chunks[chunks.length - 1] = { ...last, zpl: `${last.zpl}\n${tail.trim()}` };
      }
    }
  });

  return chunks;
}

function mergeSetupChunks(chunks: LabelChunk[]): string[] {
  if (!chunks.length) {
    return [];
  }

  const merged: string[] = [];
  let pendingSetup = "";

  chunks.forEach((chunk) => {
    const printable = PRINTABLE_HINT_RE.test(chunk.zpl);
    const setupLike = SETUP_HINT_RE.test(chunk.zpl);

    if (!printable && setupLike) {
      pendingSetup += `${pendingSetup ? "\n" : ""}${chunk.zpl}`;
      return;
    }

    if (pendingSetup) {
      merged.push(`${pendingSetup}\n${chunk.zpl}`);
      pendingSetup = "";
      return;
    }

    merged.push(chunk.zpl);
  });

  if (pendingSetup) {
    if (merged.length) {
      merged[merged.length - 1] = `${pendingSetup}\n${merged[merged.length - 1]}`;
    } else {
      merged.push(pendingSetup);
    }
  }

  return merged;
}

function collapseLikelyFragmentedLabels(labels: string[]): string[] {
  if (labels.length <= 1) {
    return labels;
  }

  const hasDg = labels.map((item) => /~DG/i.test(item));
  const hasXg = labels.map((item) => /\^XG/i.test(item));
  const hasVisualContent = labels.map((item) => /\^(?:FD|GB|GF|BC|B3|BQ|BX|A0|A@)/i.test(item));
  const lengths = labels.map((item) => item.length);

  const dgCount = hasDg.filter(Boolean).length;
  const xgCount = hasXg.filter(Boolean).length;
  const visualCount = hasVisualContent.filter(Boolean).length;
  const sortedLengths = [...lengths].sort((a, b) => b - a);
  const largest = sortedLengths[0] ?? 0;
  const second = sortedLengths[1] ?? 0;
  const hasTinySideBlocks = labels.some((item) => item.length < 120 && !/\^FD/i.test(item));

  const likelySplitByResources =
    dgCount > 0
    && xgCount > 0
    && (dgCount === 1 || xgCount === 1);

  const likelyDominantSingle =
    labels.length >= 3
    && visualCount >= 1
    && largest > 0
    && (second === 0 || largest >= second * 3)
    && hasTinySideBlocks;

  if (likelySplitByResources || likelyDominantSingle) {
    return [labels.join("\n")];
  }

  return labels;
}

export function extractLabels(text: string, source: string): LabelCandidate[] {
  const labels: LabelCandidate[] = [];
  const chunks = splitRawChunks(text);
  if (!chunks.length) {
    return labels;
  }
  const matches = collapseLikelyFragmentedLabels(mergeSetupChunks(chunks));

  matches.forEach((zpl, i) => {
    labels.push({
      id: `${source}:${i + 1}`,
      source,
      index: i + 1,
      zpl
    });
  });

  return labels;
}
