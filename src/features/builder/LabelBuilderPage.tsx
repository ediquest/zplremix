import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";

type LabelBuilderPageProps = {
  seedZpl: string;
  onBack: (nextZpl?: string) => void;
};

type BuilderElementType = "text" | "barcode" | "line" | "box";

type BuilderItem = {
  id: string;
  type: BuilderElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
};

type PrintDensityDpmm = 8 | 12 | 24;
type LabelUnit = "in" | "mm" | "cm";

type BuilderCanvasSettings = {
  densityDpmm: PrintDensityDpmm;
  labelWidth: number;
  labelHeight: number;
  labelUnit: LabelUnit;
};

const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";
const DEFAULT_CANVAS_SETTINGS: BuilderCanvasSettings = {
  densityDpmm: 8,
  labelWidth: 4,
  labelHeight: 6,
  labelUnit: "in"
};

function isDensity(value: unknown): value is PrintDensityDpmm {
  return value === 8 || value === 12 || value === 24;
}

function isUnit(value: unknown): value is LabelUnit {
  return value === "in" || value === "mm" || value === "cm";
}

function loadCanvasSettings(): BuilderCanvasSettings {
  try {
    const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_CANVAS_SETTINGS;
    }
    const parsed = JSON.parse(raw) as {
      printerSettings?: {
        densityDpmm?: unknown;
        labelWidth?: unknown;
        labelHeight?: unknown;
        labelUnit?: unknown;
      };
    };
    const source = parsed.printerSettings ?? {};
    return {
      densityDpmm: isDensity(source.densityDpmm) ? source.densityDpmm : DEFAULT_CANVAS_SETTINGS.densityDpmm,
      labelWidth: Number.isFinite(source.labelWidth) ? Math.max(0.1, Number(source.labelWidth)) : DEFAULT_CANVAS_SETTINGS.labelWidth,
      labelHeight: Number.isFinite(source.labelHeight) ? Math.max(0.1, Number(source.labelHeight)) : DEFAULT_CANVAS_SETTINGS.labelHeight,
      labelUnit: isUnit(source.labelUnit) ? source.labelUnit : DEFAULT_CANVAS_SETTINGS.labelUnit
    };
  } catch {
    return DEFAULT_CANVAS_SETTINGS;
  }
}

function unitToMm(value: number, unit: LabelUnit): number {
  if (unit === "in") {
    return value * 25.4;
  }
  if (unit === "cm") {
    return value * 10;
  }
  return value;
}

function createItem(type: BuilderElementType, x: number, y: number): BuilderItem {
  if (type === "text") {
    return { id: crypto.randomUUID(), type, x, y, width: 220, height: 36, text: "New text" };
  }
  if (type === "barcode") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 120, text: "1234567890" };
  }
  if (type === "line") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 4, text: "" };
  }
  return { id: crypto.randomUUID(), type, x, y, width: 240, height: 120, text: "" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildZplFromItems(items: BuilderItem[], canvasWidth: number, canvasHeight: number): string {
  const lines = ["^XA", `^PW${canvasWidth}`, `^LL${canvasHeight}`, "^LH0,0"];
  items.forEach((item) => {
    const x = Math.round(item.x);
    const y = Math.round(item.y);
    if (item.type === "text") {
      const textHeight = Math.max(14, Math.round(item.height * 0.8));
      const textWidth = Math.max(10, Math.round(textHeight * 0.6));
      lines.push(`^FO${x},${y}^A0N,${textHeight},${textWidth}^FD${item.text}^FS`);
      return;
    }
    if (item.type === "barcode") {
      const barHeight = Math.max(40, Math.round(item.height));
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^BCN,${barHeight},Y,N,N^FD${item.text}^FS`);
      return;
    }
    if (item.type === "line") {
      lines.push(`^FO${x},${y}^GB${Math.round(item.width)},${Math.max(1, Math.round(item.height))},1^FS`);
      return;
    }
    lines.push(`^FO${x},${y}^GB${Math.round(item.width)},${Math.round(item.height)},2^FS`);
  });
  lines.push("^XZ");
  return lines.join("\n");
}

function parseItemsFromZpl(zpl: string): BuilderItem[] {
  const items: BuilderItem[] = [];
  const fieldRegex = /(?:\^FO|\^FT)(-?\d+),(-?\d+)([\s\S]*?)\^FS/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(zpl)) !== null) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    const body = match[3] ?? "";
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const gb = /\^GB(\d+),(\d+)(?:,(\d+))?/i.exec(body);
    if (gb) {
      const width = Math.max(2, Number(gb[1]));
      const height = Math.max(2, Number(gb[2]));
      const border = Number(gb[3] ?? 1);
      items.push({
        id: crypto.randomUUID(),
        type: height <= 6 || width <= 6 || border <= 1 ? "line" : "box",
        x,
        y,
        width,
        height,
        text: ""
      });
      continue;
    }

    if (/\^BC/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const bc = /\^BC[^,]*,(\d+)/i.exec(body);
      const barHeight = Math.max(40, Number(bc?.[1] ?? 100));
      items.push({
        id: crypto.randomUUID(),
        type: "barcode",
        x,
        y,
        width: 280,
        height: barHeight,
        text: fd?.[1] ?? "1234567890"
      });
      continue;
    }

    const fd = /\^FD([^\\^]*)/i.exec(body);
    if (fd) {
      const a0 = /\^A0[A-Z]?,?(-?\d*)?,?(-?\d*)?/i.exec(body);
      const h = Number(a0?.[1] || 32);
      const w = Number(a0?.[2] || Math.round(Math.max(12, h * 0.6)));
      items.push({
        id: crypto.randomUUID(),
        type: "text",
        x,
        y,
        width: Math.max(120, Math.round((fd[1].length + 2) * Math.max(8, w))),
        height: Math.max(24, Math.round(h * 1.2)),
        text: fd[1]
      });
    }
  }
  return items;
}

export function LabelBuilderPage({ seedZpl, onBack }: LabelBuilderPageProps) {
  const [canvasSettings, setCanvasSettings] = useState<BuilderCanvasSettings>(() => loadCanvasSettings());
  const [items, setItems] = useState<BuilderItem[]>(() => parseItemsFromZpl(seedZpl));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasWidth = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelWidth, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelWidth, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const canvasHeight = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelHeight, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelHeight, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const viewScale = useMemo(() => {
    const maxSide = Math.max(canvasWidth, canvasHeight);
    const autoFit = 560 / maxSide;
    return clamp(autoFit, 0.22, 1);
  }, [canvasWidth, canvasHeight]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  );
  const generatedZpl = useMemo(
    () => buildZplFromItems(items, canvasWidth, canvasHeight),
    [items, canvasWidth, canvasHeight]
  );
  const sizeRange =
    canvasSettings.labelUnit === "in"
      ? { min: 1, max: 12, step: 0.1 }
      : canvasSettings.labelUnit === "cm"
        ? { min: 2, max: 30, step: 0.1 }
        : { min: 20, max: 300, step: 1 };

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        const maxX = canvasWidth - Math.max(12, item.width);
        const maxY = canvasHeight - Math.max(12, item.height);
        return {
          ...item,
          x: clamp(item.x, 0, maxX),
          y: clamp(item.y, 0, maxY)
        };
      })
    );
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    setItems(parseItemsFromZpl(seedZpl));
    setSelectedId(null);
    setDraggingId(null);
  }, [seedZpl]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next = {
        ...parsed,
        printerSettings: {
          ...(typeof parsed.printerSettings === "object" && parsed.printerSettings ? parsed.printerSettings : {}),
          densityDpmm: canvasSettings.densityDpmm,
          dpi: canvasSettings.densityDpmm === 24 ? 600 : canvasSettings.densityDpmm === 12 ? 300 : 203,
          labelWidth: canvasSettings.labelWidth,
          labelHeight: canvasSettings.labelHeight,
          labelUnit: canvasSettings.labelUnit
        }
      };
      window.localStorage.setItem(LS_PREVIEW_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [canvasSettings]);

  const addAt = (type: BuilderElementType, x: number, y: number) => {
    const item = createItem(type, x, y);
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
  };

  const onPaletteDragStart = (e: DragEvent<HTMLButtonElement>, type: BuilderElementType) => {
    e.dataTransfer.setData("application/x-zplremix-builder-item", type);
  };

  const onCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-zplremix-builder-item") as BuilderElementType;
    if (!type) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / viewScale, 0, canvasWidth - 20);
    const y = clamp((e.clientY - rect.top) / viewScale, 0, canvasHeight - 20);
    addAt(type, x, y);
  };

  const onItemMouseDown = (e: MouseEvent, item: BuilderItem) => {
    if (!canvasRef.current) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewScale;
    const y = (e.clientY - rect.top) / viewScale;
    setSelectedId(item.id);
    setDraggingId(item.id);
    setDragOffset({ x: x - item.x, y: y - item.y });
  };

  const onCanvasMouseMove = (e: MouseEvent) => {
    if (!draggingId || !canvasRef.current) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewScale;
    const y = (e.clientY - rect.top) / viewScale;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== draggingId) {
          return item;
        }
        const maxX = canvasWidth - Math.max(12, item.width);
        const maxY = canvasHeight - Math.max(12, item.height);
        return {
          ...item,
          x: clamp(x - dragOffset.x, 0, maxX),
          y: clamp(y - dragOffset.y, 0, maxY)
        };
      })
    );
  };

  const stopDrag = () => setDraggingId(null);

  const updateSelected = (patch: Partial<BuilderItem>) => {
    if (!selectedId) {
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) {
          return item;
        }
        const next = { ...item, ...patch };
        return {
          ...next,
          width: Math.max(2, next.width),
          height: Math.max(2, next.height),
          x: clamp(next.x, 0, canvasWidth - Math.max(12, next.width)),
          y: clamp(next.y, 0, canvasHeight - Math.max(12, next.height))
        };
      })
    );
  };

  const removeSelected = () => {
    if (!selectedId) {
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || !selectedId) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      setItems((prev) => prev.filter((item) => item.id !== selectedId));
      setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  return (
    <main className="app-shell">
      <header className="app-header builder-header">
        <h1>ZPLRemix Builder</h1>
        <div className="builder-header-actions">
          <button type="button" className="download-btn" onClick={() => onBack()}>
            Back
          </button>
          <button type="button" className="download-btn" onClick={() => onBack(generatedZpl)}>
            Apply To Main View
          </button>
        </div>
      </header>

      <section className="builder-grid">
        <aside className="builder-sidebar">
          <h2>Canvas Settings</h2>
          <div className="printer-profile">
            <div className="printer-row">
              <label htmlFor="builder-density">DPI / Density:</label>
              <div className="printer-controls">
                <select
                  id="builder-density"
                  value={canvasSettings.densityDpmm}
                  onChange={(e) =>
                    setCanvasSettings((prev) => ({
                      ...prev,
                      densityDpmm: Number(e.target.value) as PrintDensityDpmm
                    }))
                  }
                >
                  <option value={8}>8 dpmm (203 dpi)</option>
                  <option value={12}>12 dpmm (300 dpi)</option>
                  <option value={24}>24 dpmm (600 dpi)</option>
                </select>
              </div>
            </div>
            <div className="printer-row printer-row-size">
              <label>Label Size:</label>
              <div className="printer-controls size-controls">
                <div className="size-line">
                  <span>W</span>
                  <input
                    type="range"
                    min={sizeRange.min}
                    max={sizeRange.max}
                    step={sizeRange.step}
                    value={canvasSettings.labelWidth}
                    onChange={(e) =>
                      setCanvasSettings((prev) => ({
                        ...prev,
                        labelWidth: Math.max(0.1, Number(e.target.value))
                      }))
                    }
                  />
                  <input
                    type="number"
                    min={sizeRange.min}
                    max={sizeRange.max}
                    step={sizeRange.step}
                    value={canvasSettings.labelWidth}
                    onChange={(e) =>
                      setCanvasSettings((prev) => ({
                        ...prev,
                        labelWidth: Math.max(0.1, Number(e.target.value))
                      }))
                    }
                  />
                </div>
                <div className="size-line">
                  <span>H</span>
                  <input
                    type="range"
                    min={sizeRange.min}
                    max={sizeRange.max}
                    step={sizeRange.step}
                    value={canvasSettings.labelHeight}
                    onChange={(e) =>
                      setCanvasSettings((prev) => ({
                        ...prev,
                        labelHeight: Math.max(0.1, Number(e.target.value))
                      }))
                    }
                  />
                  <input
                    type="number"
                    min={sizeRange.min}
                    max={sizeRange.max}
                    step={sizeRange.step}
                    value={canvasSettings.labelHeight}
                    onChange={(e) =>
                      setCanvasSettings((prev) => ({
                        ...prev,
                        labelHeight: Math.max(0.1, Number(e.target.value))
                      }))
                    }
                  />
                </div>
                <select
                  value={canvasSettings.labelUnit}
                  onChange={(e) =>
                    setCanvasSettings((prev) => ({ ...prev, labelUnit: e.target.value as LabelUnit }))
                  }
                >
                  <option value="in">inches</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                </select>
              </div>
            </div>
          </div>
          <p className="muted">
            Canvas dots: {canvasWidth} x {canvasHeight}
          </p>

          <h2>Elements</h2>
          <div className="builder-palette">
            <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "text")}>
              Text
            </button>
            <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "barcode")}>
              Barcode
            </button>
            <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "line")}>
              Separator
            </button>
            <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "box")}>
              Box
            </button>
          </div>
          <p className="muted">Drag element and drop it on canvas.</p>

          <h3>Selected</h3>
          {selectedItem ? (
            <div className="builder-form">
              <label>
                X
                <input
                  type="number"
                  value={Math.round(selectedItem.x)}
                  onChange={(e) => updateSelected({ x: Number(e.target.value) })}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={Math.round(selectedItem.y)}
                  onChange={(e) => updateSelected({ y: Number(e.target.value) })}
                />
              </label>
              <label>
                W
                <input
                  type="number"
                  value={Math.round(selectedItem.width)}
                  onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                />
              </label>
              <label>
                H
                <input
                  type="number"
                  value={Math.round(selectedItem.height)}
                  onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                />
              </label>
              {(selectedItem.type === "text" || selectedItem.type === "barcode") && (
                <label>
                  Content
                  <input
                    type="text"
                    value={selectedItem.text}
                    onChange={(e) => updateSelected({ text: e.target.value })}
                  />
                </label>
              )}
              <button type="button" className="download-btn" onClick={removeSelected}>
                Delete Element
              </button>
            </div>
          ) : (
            <p className="muted">Click an element on canvas to edit.</p>
          )}
        </aside>

        <section className="builder-canvas-wrap">
          <h2>Canvas</h2>
          <div
            ref={canvasRef}
            className="builder-canvas"
            style={{ width: `${canvasWidth * viewScale}px`, height: `${canvasHeight * viewScale}px` }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onCanvasDrop}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className={`builder-item builder-item-${item.type}${selectedId === item.id ? " is-selected" : ""}`}
                style={{
                  left: `${item.x * viewScale}px`,
                  top: `${item.y * viewScale}px`,
                  width: `${Math.max(6, item.width) * viewScale}px`,
                  height: `${Math.max(6, item.height) * viewScale}px`
                }}
                onMouseDown={(e) => onItemMouseDown(e, item)}
              >
                {item.type === "text" && <span>{item.text}</span>}
                {item.type === "barcode" && <span>{item.text}</span>}
              </div>
            ))}
          </div>
        </section>

        <aside className="builder-zpl">
          <h2>Generated ZPL</h2>
          <textarea value={generatedZpl} readOnly />
          <h3>Loaded Source ZPL</h3>
          <textarea value={seedZpl} readOnly />
          <button type="button" className="download-btn" onClick={() => onBack(seedZpl)}>
            Use Source ZPL And Back
          </button>
        </aside>
      </section>
    </main>
  );
}
