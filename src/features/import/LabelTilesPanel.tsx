import { useEffect, useMemo, useState } from "react";
import type { LabelCandidate, PrinterSettings } from "../../core/types";
import { renderLabelForExport } from "../preview/ZplCanvas";

type LabelTilesPanelProps = {
  labels: LabelCandidate[];
  selectedLabelId: string | null;
  onSelectLabel: (id: string) => void;
  showDuplicates: boolean;
  onShowDuplicatesChange: (enabled: boolean) => void;
};

const THUMB_WIDTH = 210;
const THUMB_HEIGHT = 132;

const THUMBNAIL_PRINTER_SETTINGS: PrinterSettings = {
  model: "Zebra GK420d",
  densityDpmm: 8,
  dpi: 203,
  quality: "grayscale",
  labelWidth: 4,
  labelHeight: 6,
  labelUnit: "in",
  showLabelIndex: 1,
  showLabelCount: 1
};

function buildThumbnailDataUrl(zpl: string): string {
  const sourceCanvas = renderLabelForExport(zpl, THUMBNAIL_PRINTER_SETTINGS, true);
  const thumbCanvas = document.createElement("canvas");
  thumbCanvas.width = THUMB_WIDTH;
  thumbCanvas.height = THUMB_HEIGHT;
  const ctx = thumbCanvas.getContext("2d");
  if (!ctx) {
    return "";
  }
  ctx.fillStyle = "#f7f9fd";
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  const innerWidth = THUMB_WIDTH - 16;
  const innerHeight = THUMB_HEIGHT - 16;
  const scale = Math.min(innerWidth / Math.max(1, sourceCanvas.width), innerHeight / Math.max(1, sourceCanvas.height));
  const drawWidth = Math.max(1, Math.round(sourceCanvas.width * scale));
  const drawHeight = Math.max(1, Math.round(sourceCanvas.height * scale));
  const drawX = Math.round((THUMB_WIDTH - drawWidth) / 2);
  const drawY = Math.round((THUMB_HEIGHT - drawHeight) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(drawX - 2, drawY - 2, drawWidth + 4, drawHeight + 4);
  ctx.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
  return thumbCanvas.toDataURL("image/png");
}

export function LabelTilesPanel({
  labels,
  selectedLabelId,
  onSelectLabel,
  showDuplicates,
  onShowDuplicatesChange
}: LabelTilesPanelProps) {
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  const signature = useMemo(
    () => labels.map((item) => `${item.id}:${item.zpl.length}`).join("|"),
    [labels]
  );

  useEffect(() => {
    if (!labels.length) {
      setThumbMap({});
      return;
    }
    const next: Record<string, string> = {};
    labels.forEach((item) => {
      next[item.id] = buildThumbnailDataUrl(item.zpl);
    });
    setThumbMap(next);
  }, [labels, signature]);

  return (
    <section className="panel label-tiles-panel">
      <div className="panel-header">
        <h2>Labels</h2>
        <p className="muted">{labels.length ? `${labels.length} detected` : "No labels detected yet"}</p>
        <label className="label-tiles-toggle">
          <input
            type="checkbox"
            checked={showDuplicates}
            onChange={(event) => onShowDuplicatesChange(event.target.checked)}
          />
          Show duplicates
        </label>
      </div>
      {!labels.length ? (
        <div className="empty-state">Import a file or paste multi-label ZPL to see label cards here.</div>
      ) : (
        <div className="label-tiles-grid">
          {labels.map((item, index) => {
            const tileKey = `${item.id}:${index}`;
            return (
            <button
              key={tileKey}
              type="button"
              className={`label-tile${selectedLabelId === item.id ? " is-active" : ""}`}
              onClick={() => onSelectLabel(item.id)}
            >
              {thumbMap[item.id] ? (
                <img className="label-tile-image" src={thumbMap[item.id]} alt={`${item.source} ${item.index}`} />
              ) : (
                <div className="label-tile-image is-placeholder">Preview</div>
              )}
              <span className="label-tile-meta">{item.source} #{item.index}{labels.length > 1 ? ` (${index + 1})` : ""}</span>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
