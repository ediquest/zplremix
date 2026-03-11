import { useEffect, useMemo, useState } from "react";
import type { PrinterSettings } from "../../core/types";
import { renderLabelForExport } from "../preview/ZplCanvas";

export type SavedZplEntry = {
  id: string;
  name: string;
  zpl: string;
  createdAt: string;
  updatedAt: string;
};

type SavedZplPageProps = {
  items: SavedZplEntry[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, nextName: string) => void;
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

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function SavedZplPage({ items, onOpen, onDelete, onRename }: SavedZplPageProps) {
  const [thumbMap, setThumbMap] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const signature = useMemo(
    () => items.map((item) => `${item.id}:${item.updatedAt}:${item.zpl.length}`).join("|"),
    [items]
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    items.forEach((item) => {
      next[item.id] = item.name;
    });
    setNameDrafts(next);
  }, [items]);

  useEffect(() => {
    if (!items.length) {
      setThumbMap({});
      return;
    }
    const next: Record<string, string> = {};
    items.forEach((item) => {
      next[item.id] = buildThumbnailDataUrl(item.zpl);
    });
    setThumbMap(next);
  }, [items, signature]);

  return (
    <section className="panel saved-zpl-panel">
      <div className="panel-header">
        <h2>Saved ZPL</h2>
        <p className="muted">{items.length ? `${items.length} saved` : "No saved labels yet"}</p>
      </div>
      {!items.length ? (
        <div className="empty-state">Use Save in ZPL Input to store labels here.</div>
      ) : (
        <div className="saved-zpl-grid">
          {items.map((item) => (
            <article key={item.id} className="saved-zpl-card">
              {thumbMap[item.id] ? (
                <img className="saved-zpl-image" src={thumbMap[item.id]} alt={item.name} />
              ) : (
                <div className="saved-zpl-image is-placeholder">Preview</div>
              )}
              <label className="saved-zpl-name">
                Name
                <input
                  type="text"
                  value={nameDrafts[item.id] ?? item.name}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setNameDrafts((prev) => ({ ...prev, [item.id]: nextName }));
                  }}
                />
              </label>
              <p className="saved-zpl-meta">Updated: {formatTimestamp(item.updatedAt)}</p>
              <div className="saved-zpl-actions">
                <button type="button" className="download-btn" onClick={() => onOpen(item.id)}>
                  Open
                </button>
                <button
                  type="button"
                  className="download-btn"
                  onClick={() => onRename(item.id, nameDrafts[item.id] ?? item.name)}
                >
                  Rename
                </button>
                <button type="button" className="download-btn" onClick={() => onDelete(item.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
