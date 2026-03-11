import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";
import { ZplCanvas } from "../preview/ZplCanvas";

type ConvertedGraphic = {
  name: string;
  width: number;
  height: number;
  dgCommand: string;
  previewDataUrl: string;
};

type GraphicItem = {
  id: string;
  sourceDataUrl: string;
  x: number;
  y: number;
  mx: number;
  my: number;
  current: ConvertedGraphic;
  original: ConvertedGraphic;
};

type GraphicToZplPageProps = {
  onOpenBuilder?: (zpl?: string) => void;
  onOpenPreview?: (zpl?: string) => void;
  onSaveZpl?: (zpl: string) => boolean;
  initialState?: GraphicToZplStoredState | null;
  onStateChange?: (state: GraphicToZplStoredState) => void;
};

const LS_GRAPHIC_TO_ZPL_KEY = "zplremix.graphic_to_zpl.state";
const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";
const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];
const SUPPORTED_MIME_PREFIXES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/gif"
];

function isSupportedRasterFile(file: File): boolean {
  const lowerName = (file.name || "").toLowerCase();
  const byExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const mime = (file.type || "").toLowerCase();
  const byMime = SUPPORTED_MIME_PREFIXES.some((allowed) => mime === allowed);
  return byExt || byMime;
}

export type GraphicToZplStoredState = {
  items: GraphicItem[];
  selectedId: string | null;
  lockScale: boolean;
};

function loadShowNonPrintableZones(): boolean {
  try {
    const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw) as { showNonPrintableZones?: unknown };
    return typeof parsed.showNonPrintableZones === "boolean" ? parsed.showNonPrintableZones : true;
  } catch {
    return true;
  }
}

function loadStoredState(): GraphicToZplStoredState | null {
  try {
    const raw = window.localStorage.getItem(LS_GRAPHIC_TO_ZPL_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<GraphicToZplStoredState>;
    if (!Array.isArray(parsed.items)) {
      return null;
    }
    const items = parsed.items.filter((item): item is GraphicItem => {
      if (!item || typeof item !== "object") {
        return false;
      }
      if (typeof item.id !== "string" || !item.id) {
        return false;
      }
      if (typeof item.sourceDataUrl !== "string") {
        return false;
      }
      if (typeof item.x !== "number" || typeof item.y !== "number") {
        return false;
      }
      if (typeof item.mx !== "number" || typeof item.my !== "number") {
        return false;
      }
      const current = item.current as ConvertedGraphic | undefined;
      const original = item.original as ConvertedGraphic | undefined;
      const isGraphicLike = (g?: ConvertedGraphic) =>
        !!g
        && typeof g.name === "string"
        && typeof g.width === "number"
        && typeof g.height === "number"
        && typeof g.dgCommand === "string"
        && typeof g.previewDataUrl === "string";
      return isGraphicLike(current) && isGraphicLike(original);
    });
    const selectedId =
      typeof parsed.selectedId === "string" && items.some((item) => item.id === parsed.selectedId)
        ? parsed.selectedId
        : items.length
          ? items[items.length - 1].id
          : null;
    return {
      items,
      selectedId,
      lockScale: parsed.lockScale !== false
    };
  } catch {
    return null;
  }
}

function normalizeGraphicNameFromFilename(filename: string): string {
  const base = (filename ?? "LOGO")
    .replace(/\.[^.]+$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 32) || "LOGO";
  const withDevice = `R:${base}`;
  return withDevice.endsWith(".GRF") ? withDevice : `${withDevice}.GRF`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function pngToDg(file: File, name: string): Promise<ConvertedGraphic> {
  const dataUrl = await fileToDataUrl(file);
  return dataUrlToDg(dataUrl, name);
}

async function dataUrlToDg(
  dataUrl: string,
  name: string,
  targetWidth?: number,
  targetHeight?: number
): Promise<ConvertedGraphic> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth || image.width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight || image.height));
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    throw new Error("Canvas context is not available.");
  }
  sourceCtx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  const sourceData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;

  let minX = sourceWidth;
  let minY = sourceHeight;
  let maxX = -1;
  let maxY = -1;
  for (let yy = 0; yy < sourceHeight; yy += 1) {
    for (let xx = 0; xx < sourceWidth; xx += 1) {
      const offset = (yy * sourceWidth + xx) * 4;
      const alpha = sourceData[offset + 3];
      if (alpha > 16) {
        if (xx < minX) minX = xx;
        if (yy < minY) minY = yy;
        if (xx > maxX) maxX = xx;
        if (yy > maxY) maxY = yy;
      }
    }
  }

  const cropX = maxX >= 0 ? minX : 0;
  const cropY = maxY >= 0 ? minY : 0;
  const cropWidth = maxX >= 0 ? Math.max(1, maxX - minX + 1) : sourceWidth;
  const cropHeight = maxY >= 0 ? Math.max(1, maxY - minY + 1) : sourceHeight;

  const width = Math.max(1, Math.round(targetWidth ?? cropWidth));
  const height = Math.max(1, Math.round(targetHeight ?? cropHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context is not available.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  const chunks: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit;
        if (x >= width) {
          continue;
        }
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = data[offset + 3];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const dark = a > 20 && luminance < 170;
        if (dark) {
          value |= 1 << (7 - bit);
        }
      }
      chunks.push(value.toString(16).toUpperCase().padStart(2, "0"));
    }
  }
  return {
    name,
    width,
    height,
    dgCommand: `~DG${name},${totalBytes},${bytesPerRow},${chunks.join("")}`,
    previewDataUrl: canvas.toDataURL("image/png")
  };
}

export function GraphicToZplPage({ onOpenBuilder, onOpenPreview, onSaveZpl, initialState, onStateChange }: GraphicToZplPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GraphicItem[]>(() => initialState?.items ?? loadStoredState()?.items ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialState?.selectedId ?? loadStoredState()?.selectedId ?? null);
  const [error, setError] = useState<string>("");
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [lockScale, setLockScale] = useState<boolean>(() => initialState?.lockScale ?? loadStoredState()?.lockScale ?? true);
  const [showNonPrintableZones] = useState<boolean>(() => loadShowNonPrintableZones());
  const dragRef = useRef<{
    itemId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const labelWidth = 813;
  const labelHeight = 1219;
  const editorScale = 0.34;
  const scaledLabelWidth = Math.round(labelWidth * editorScale);
  const scaledLabelHeight = Math.round(labelHeight * editorScale);

  const selectedItem = useMemo(
    () => items.find((entry) => entry.id === selectedId) ?? null,
    [items, selectedId]
  );

  const clampPlacement = (nextX: number, nextY: number, width: number, height: number) => {
    const maxX = Math.max(0, labelWidth - width);
    const maxY = Math.max(0, labelHeight - height);
    return {
      x: Math.max(0, Math.min(maxX, Math.round(nextX))),
      y: Math.max(0, Math.min(maxY, Math.round(nextY)))
    };
  };

  const zplWithUsage = useMemo(() => {
    if (!items.length) {
      return "";
    }
    const dgLines = Array.from(new Set(items.map((item) => item.current.dgCommand)));
    const drawLines = items.map((item) => `^FO${item.x},${item.y}^XG${item.current.name},${item.mx},${item.my}^FS`);
    return `^XA
^PW813
^LL1219
^LH0,0
${dgLines.join("\n")}
${drawLines.join("\n")}
^XZ`;
  }, [items]);

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    if (!isSupportedRasterFile(file)) {
      setError("Supported files: PNG, JPG, JPEG, WEBP, BMP, GIF.");
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const existingNames = new Set(items.map((item) => item.current.name));
      let name = normalizeGraphicNameFromFilename(file.name);
      if (existingNames.has(name)) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let index = 2;
        while (existingNames.has(`${base}_${index}${ext}`)) {
          index += 1;
        }
        name = `${base}_${index}${ext}`;
      }
      const next = await pngToDg(file, name);
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const offset = items.length * 24;
      const initialPlacement = clampPlacement(40 + offset, 40 + offset, next.width, next.height);
      const nextItem: GraphicItem = {
        id,
        sourceDataUrl: dataUrl,
        x: initialPlacement.x,
        y: initialPlacement.y,
        mx: 1,
        my: 1,
        current: next,
        original: next
      };
      setItems((prev) => [...prev, nextItem]);
      setSelectedId(id);
      setError("");
      setCopied(false);
    } catch {
      setError("Could not convert image to ZPL graphic.");
    }
  };

  const deleteGraphicById = (id: string) => {
    if (!id) {
      return;
    }
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    setSelectedId(remaining.length ? remaining[remaining.length - 1].id : null);
    setCopied(false);
    setError("");
  };

  const deleteSelectedGraphic = () => {
    if (!selectedId) {
      return;
    }
    deleteGraphicById(selectedId);
  };

  const resetSelectedToOriginal = () => {
    if (!selectedItem || isConverting) {
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              current: item.original,
              x: 40,
              y: 40,
              mx: 1,
              my: 1
            }
          : item
      )
    );
    setError("");
  };

  const adjustScale = async (delta: number) => {
    if (!selectedItem || isConverting) {
      return;
    }
    if (delta < 0 && selectedItem.mx <= 1 && selectedItem.my <= 1) {
      try {
        setIsConverting(true);
        const targetWidth = Math.max(1, Math.floor(selectedItem.current.width * 0.85));
        const targetHeight = Math.max(1, Math.floor(selectedItem.current.height * 0.85));
        if (targetWidth === selectedItem.current.width && targetHeight === selectedItem.current.height) {
          return;
        }
        const downscaled = await dataUrlToDg(
          selectedItem.sourceDataUrl,
          selectedItem.current.name,
          targetWidth,
          targetHeight
        );
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedItem.id) {
              return item;
            }
            const clamped = clampPlacement(item.x, item.y, downscaled.width, downscaled.height);
            return {
              ...item,
              current: downscaled,
              x: clamped.x,
              y: clamped.y,
              mx: 1,
              my: 1
            };
          })
        );
        return;
      } catch {
        setError("Could not downscale graphic. Try a smaller source image.");
        return;
      } finally {
        setIsConverting(false);
      }
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== selectedItem.id) {
          return item;
        }
        const nextMx = Math.max(1, Math.min(20, item.mx + delta));
        const nextMy = lockScale ? nextMx : Math.max(1, Math.min(20, item.my + delta));
        const nextWidth = Math.max(1, item.current.width * nextMx);
        const nextHeight = Math.max(1, item.current.height * nextMy);
        const clamped = clampPlacement(item.x, item.y, nextWidth, nextHeight);
        return {
          ...item,
          mx: nextMx,
          my: nextMy,
          x: clamped.x,
          y: clamped.y
        };
      })
    );
  };

  const onGraphicMouseDown = (event: ReactMouseEvent<HTMLDivElement>, itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(itemId);
    dragRef.current = {
      itemId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: item.x,
      startY: item.y
    };
  };

  const copyZpl = async () => {
    if (!zplWithUsage) {
      return;
    }
    try {
      await navigator.clipboard.writeText(zplWithUsage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setError("Could not copy ZPL to clipboard.");
    }
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      const dx = (event.clientX - dragRef.current.startClientX) / editorScale;
      const dy = (event.clientY - dragRef.current.startClientY) / editorScale;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== dragRef.current?.itemId) {
            return item;
          }
          const placedWidth = Math.max(1, item.current.width * item.mx);
          const placedHeight = Math.max(1, item.current.height * item.my);
          const clamped = clampPlacement(
            dragRef.current.startX + dx,
            dragRef.current.startY + dy,
            placedWidth,
            placedHeight
          );
          return { ...item, x: clamped.x, y: clamped.y };
        })
      );
    };
    const onMouseUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [editorScale]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) {
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        deleteSelectedGraphic();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, items]);

  useEffect(() => {
    const payload: GraphicToZplStoredState = {
      items,
      selectedId,
      lockScale
    };
    if (onStateChange) {
      onStateChange(payload);
    }
    try {
      window.localStorage.setItem(LS_GRAPHIC_TO_ZPL_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage write failures
    }
  }, [items, selectedId, lockScale, onStateChange]);

  return (
    <section className="gfx-grid">
      <section className="panel gfx-upload-panel">
        <div className="panel-header">
          <h2>Graphic To ZPL</h2>
        </div>
        <label className="zip-label" htmlFor="graphic-upload-input">Upload image</label>
        <input
          ref={fileInputRef}
          className="zip-hidden-input"
          id="graphic-upload-input"
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,image/png,image/jpeg,image/webp,image/bmp,image/gif"
          onChange={onFileChange}
        />
        <button
          type="button"
          className="editor-action-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose Image
        </button>
        {!!error && <p className="muted">{error}</p>}
        {!!selectedItem && (
          <p className="muted">
            Selected: <code>{selectedItem.current.name}</code> | Size: {selectedItem.current.width} x {selectedItem.current.height} | Items: {items.length}
          </p>
        )}
        {!!selectedItem && (
          <div className="gfx-controls">
            <div className="gfx-size-buttons">
              <button type="button" className="editor-action-btn" onClick={() => { void adjustScale(-1); }} disabled={isConverting}>
                -
              </button>
              <button type="button" className="editor-action-btn" onClick={() => { void adjustScale(1); }} disabled={isConverting}>
                +
              </button>
              <button type="button" className="editor-action-btn" onClick={resetSelectedToOriginal} disabled={isConverting}>
                Reset
              </button>
              <span className="muted">
                Scale: {selectedItem.mx} x {selectedItem.my}{isConverting ? " (converting...)" : ""}
              </span>
            </div>
            <label className="gfx-control gfx-control-inline">
              Lock X/Y scale
              <input
                type="checkbox"
                checked={lockScale}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setLockScale(checked);
                  if (checked && selectedItem) {
                    setItems((prev) =>
                      prev.map((item) => (item.id === selectedItem.id ? { ...item, my: item.mx } : item))
                    );
                  }
                }}
              />
            </label>
            <p className="muted">Click item on canvas, drag to move. Resize with "-" and "+".</p>
            <p className="muted">At scale 1, "-" creates smaller ~DG automatically.</p>
          </div>
        )}
        <div className="gfx-preview-wrap">
          {!!items.length ? (
            <div
              className="gfx-editor-canvas"
              style={{ width: `${scaledLabelWidth}px`, height: `${scaledLabelHeight}px` }}
              onMouseDown={() => setSelectedId(null)}
            >
              {items.map((item) => {
                const placedWidth = Math.max(1, item.current.width * item.mx);
                const placedHeight = Math.max(1, item.current.height * item.my);
                const isSelected = selectedId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`gfx-editor-item${isSelected ? " is-selected" : ""}`}
                    style={{
                      left: `${item.x * editorScale}px`,
                      top: `${item.y * editorScale}px`,
                      width: `${placedWidth * editorScale}px`,
                      height: `${placedHeight * editorScale}px`
                    }}
                    onMouseDown={(event) => onGraphicMouseDown(event, item.id)}
                  >
                    {isSelected && (
                      <button
                        type="button"
                        className="gfx-item-delete"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteGraphicById(item.id);
                        }}
                        aria-label="Delete selected graphic"
                        title="Delete"
                      >
                        x
                      </button>
                    )}
                    <img src={item.current.previewDataUrl} alt="Graphic preview" className="gfx-preview-image" />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">Upload image to start. You can add multiple graphics.</p>
          )}
        </div>
      </section>

      <section className="panel gfx-zpl-panel">
        <div className="panel-header">
          <h2>ZPL Output</h2>
        </div>
        <div className="gfx-zpl-main">
          <div className="gfx-zpl-preview-col">
            <div className="gfx-zpl-canvas-wrap">
              {zplWithUsage ? (
                <ZplCanvas zpl={zplWithUsage} showNonPrintableZones={showNonPrintableZones} />
              ) : (
                <p className="muted">Upload image to preview rendered ZPL.</p>
              )}
            </div>
          </div>
          <div className="gfx-zpl-output-col">
            <div className="gfx-zpl-actions">
              <button
                type="button"
                className="editor-action-btn"
                onClick={() => { void copyZpl(); }}
                disabled={!zplWithUsage}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="editor-action-btn"
                onClick={() => onOpenPreview?.(zplWithUsage)}
                disabled={!zplWithUsage}
              >
                Open in ZPL Preview
              </button>
              <button
                type="button"
                className="editor-action-btn"
                onClick={() => onOpenBuilder?.(zplWithUsage)}
                disabled={!zplWithUsage}
              >
                Open in Builder
              </button>
              <button
                type="button"
                className={`editor-action-btn${saved ? " is-active" : ""}`}
                onClick={() => {
                  if (!zplWithUsage) {
                    return;
                  }
                  const didSave = onSaveZpl?.(zplWithUsage) ?? false;
                  if (!didSave) {
                    return;
                  }
                  setSaved(true);
                  window.setTimeout(() => setSaved(false), 1200);
                }}
                disabled={!zplWithUsage}
              >
                {saved ? "Saved" : "Save"}
              </button>
            </div>
            <textarea
              className="gfx-zpl-output"
              value={zplWithUsage}
              readOnly
              placeholder="~DG command and usage snippet will appear here..."
            />
          </div>
        </div>
      </section>
    </section>
  );
}
