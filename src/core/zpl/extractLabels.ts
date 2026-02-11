import type { LabelCandidate } from "../types";

const ZPL_LABEL_RE = /\^XA[\s\S]*?\^XZ/g;

export function extractLabels(text: string, source: string): LabelCandidate[] {
  const labels: LabelCandidate[] = [];
  const matches = text.match(ZPL_LABEL_RE);

  if (!matches) {
    return labels;
  }

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

