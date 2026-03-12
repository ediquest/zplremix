import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { jsPDF } from "jspdf";
import type { LabelCandidate, PrinterSettings, PrintDensityDpmm, PrintQuality, LabelUnit } from "../../core/types";
import { ZplCanvas, renderLabelForExport } from "./ZplCanvas";
import type { ZplDiagnostic } from "./ZplCanvas";

const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";

type PreviewPanelProps = {
  mode: string;
  theme: "light" | "dark" | "dark-plus" | "abyss";
  labels: LabelCandidate[];
  selectedLabelId: string | null;
  sectionRef?: Ref<HTMLElement>;
  onSelectLabelByIndex?: (index: number) => void;
  onOpenBuilder: (zpl?: string) => void;
  onReplaceSelectedZpl: (nextZpl: string) => void;
  persistCurrentZpl: boolean;
  onPersistCurrentZplChange: (enabled: boolean) => void;
};

type PersistedPreviewSettings = {
  showNonPrintableZones: boolean;
  respectZplGeometry: boolean;
  qrLegacyOffset: boolean;
  printMethod: "direct-thermal" | "thermal-transfer";
  printerSettings: PrinterSettings;
  printEngineOverrideEnabled: boolean;
  printEngineDarkness: number;
  printEngineSpeedIps: number;
  printHeadPressure: number;
};

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
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

function isDensity(value: unknown): value is PrintDensityDpmm {
  return value === 8 || value === 12 || value === 24;
}

function isQuality(value: unknown): value is PrintQuality {
  return value === "binary" || value === "grayscale";
}

function isUnit(value: unknown): value is LabelUnit {
  return value === "in" || value === "mm" || value === "cm";
}

function loadPersistedSettings(): PersistedPreviewSettings {
  try {
    const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
    if (!raw) {
      return {
        showNonPrintableZones: true,
        respectZplGeometry: true,
        qrLegacyOffset: false,
        printMethod: "direct-thermal",
        printerSettings: DEFAULT_PRINTER_SETTINGS,
        printEngineOverrideEnabled: false,
        printEngineDarkness: 0,
        printEngineSpeedIps: 4,
        printHeadPressure: 0
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedPreviewSettings>;
    const source: Partial<PrinterSettings> = parsed.printerSettings ?? {};
    const density = isDensity(source.densityDpmm) ? source.densityDpmm : DEFAULT_PRINTER_SETTINGS.densityDpmm;
    const dpi = density === 24 ? 600 : density === 12 ? 300 : 203;
    const showLabelCount = Number.isFinite(source.showLabelCount)
      ? Math.max(1, Math.round(Number(source.showLabelCount)))
      : DEFAULT_PRINTER_SETTINGS.showLabelCount;
    const showLabelIndex = Number.isFinite(source.showLabelIndex)
      ? Math.max(1, Math.min(showLabelCount, Math.round(Number(source.showLabelIndex))))
      : DEFAULT_PRINTER_SETTINGS.showLabelIndex;

    return {
      showNonPrintableZones: parsed.showNonPrintableZones ?? true,
      respectZplGeometry: parsed.respectZplGeometry ?? true,
      qrLegacyOffset: parsed.qrLegacyOffset ?? false,
      printMethod: parsed.printMethod === "thermal-transfer" ? "thermal-transfer" : "direct-thermal",
      printEngineOverrideEnabled: parsed.printEngineOverrideEnabled ?? false,
      printEngineDarkness: Number.isFinite(parsed.printEngineDarkness)
        ? Math.max(-30, Math.min(30, Number(parsed.printEngineDarkness)))
        : 0,
      printEngineSpeedIps: Number.isFinite(parsed.printEngineSpeedIps)
        ? Math.max(1, Math.min(14, Number(parsed.printEngineSpeedIps)))
        : 4,
      printHeadPressure: Number.isFinite(parsed.printHeadPressure)
        ? Math.max(-10, Math.min(10, Number(parsed.printHeadPressure)))
        : 0,
      printerSettings: {
        model: typeof source.model === "string" ? source.model : DEFAULT_PRINTER_SETTINGS.model,
        densityDpmm: density,
        dpi,
        quality: isQuality(source.quality) ? source.quality : DEFAULT_PRINTER_SETTINGS.quality,
        labelWidth: Number.isFinite(source.labelWidth) ? Math.max(0.1, Number(source.labelWidth)) : DEFAULT_PRINTER_SETTINGS.labelWidth,
        labelHeight: Number.isFinite(source.labelHeight) ? Math.max(0.1, Number(source.labelHeight)) : DEFAULT_PRINTER_SETTINGS.labelHeight,
        labelUnit: isUnit(source.labelUnit) ? source.labelUnit : DEFAULT_PRINTER_SETTINGS.labelUnit,
        showLabelIndex,
        showLabelCount
      }
    };
  } catch {
    return {
      showNonPrintableZones: true,
      respectZplGeometry: true,
      qrLegacyOffset: false,
      printMethod: "direct-thermal",
      printerSettings: DEFAULT_PRINTER_SETTINGS,
      printEngineOverrideEnabled: false,
      printEngineDarkness: 0,
      printEngineSpeedIps: 4,
      printHeadPressure: 0
    };
  }
}

function stripEngineCommands(zpl: string): string {
  return (zpl ?? "")
    .replace(/\^MD[^^~\r\n]*/gi, "")
    .replace(/\^PR[^^~\r\n]*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatPrValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function withEngineCommands(zpl: string, darkness: number, speedIps: number): string {
  const cleaned = stripEngineCommands(zpl);
  const md = `^MD${Math.round(darkness)}`;
  const pr = `^PR${formatPrValue(speedIps)}`;
  const xaMatch = /\^XA/i.exec(cleaned);
  if (!xaMatch) {
    return `^XA\n${md}\n${pr}\n${cleaned}\n^XZ`;
  }
  const insertAt = xaMatch.index + xaMatch[0].length;
  return `${cleaned.slice(0, insertAt)}\n${md}\n${pr}${cleaned.slice(insertAt)}`;
}

export function PreviewPanel({
  mode,
  theme,
  labels,
  selectedLabelId,
  sectionRef,
  onSelectLabelByIndex,
  onOpenBuilder,
  onReplaceSelectedZpl,
  persistCurrentZpl,
  onPersistCurrentZplChange
}: PreviewPanelProps) {
  const [persisted] = useState<PersistedPreviewSettings>(() => loadPersistedSettings());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<ZplDiagnostic[]>([]);
  const [showNonPrintableZones, setShowNonPrintableZones] = useState(persisted.showNonPrintableZones);
  const [respectZplGeometry, setRespectZplGeometry] = useState(persisted.respectZplGeometry);
  const [qrLegacyOffset, setQrLegacyOffset] = useState(persisted.qrLegacyOffset);
  const [printMethod, setPrintMethod] = useState<"direct-thermal" | "thermal-transfer">(persisted.printMethod);
  const [printEngineOverrideEnabled, setPrintEngineOverrideEnabled] = useState(persisted.printEngineOverrideEnabled);
  const [printEngineDarkness, setPrintEngineDarkness] = useState(persisted.printEngineDarkness);
  const [printEngineSpeedIps, setPrintEngineSpeedIps] = useState(persisted.printEngineSpeedIps);
  const [printHeadPressure, setPrintHeadPressure] = useState(persisted.printHeadPressure);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(persisted.printerSettings);
  const [canvasRotationDeg, setCanvasRotationDeg] = useState(0);
  const [baseCanvasSize, setBaseCanvasSize] = useState({ width: 0, height: 0 });
  const [previewViewportWidth, setPreviewViewportWidth] = useState(0);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    labels.find((label) => label.id === selectedLabelId) ?? labels[0] ?? null;
  const totalLabelCount = Math.max(1, labels.length);
  const selectedLabelPosition = selectedLabel
    ? Math.max(1, labels.findIndex((label) => label.id === selectedLabel.id) + 1)
    : 1;

  useEffect(() => {
    if (!selectedLabel) {
      setWarnings([]);
      setDiagnostics([]);
    }
  }, [selectedLabel]);

  useEffect(() => {
    try {
      const payload: PersistedPreviewSettings = {
        showNonPrintableZones,
        respectZplGeometry,
        qrLegacyOffset,
        printMethod,
        printEngineOverrideEnabled,
        printEngineDarkness,
        printEngineSpeedIps,
        printHeadPressure,
        printerSettings
      };
      window.localStorage.setItem(LS_PREVIEW_SETTINGS_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [
    printerSettings,
    respectZplGeometry,
    qrLegacyOffset,
    printMethod,
    showNonPrintableZones,
    printEngineOverrideEnabled,
    printEngineDarkness,
    printEngineSpeedIps,
    printHeadPressure
  ]);

  const onDensityChange = (density: PrintDensityDpmm) => {
    const dpi = density === 24 ? 600 : density === 12 ? 300 : 203;
    setPrinterSettings((prev) => ({ ...prev, densityDpmm: density, dpi }));
  };

  const onModelChange = (model: string) => {
    setPrinterSettings((prev) => ({ ...prev, model }));
  };

  const onQualityChange = (quality: PrintQuality) => {
    setPrinterSettings((prev) => ({ ...prev, quality }));
  };

  const onSizeChange = (key: "labelWidth" | "labelHeight", value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0.1, value) : 0.1;
    setPrinterSettings((prev) => ({ ...prev, [key]: safe }));
  };

  const onUnitChange = (unit: LabelUnit) => {
    setPrinterSettings((prev) => ({ ...prev, labelUnit: unit }));
  };

  const onShowLabelIndexInput = (value: number) => {
    if (!Number.isFinite(value) || !onSelectLabelByIndex) {
      return;
    }
    const safe = Math.max(1, Math.min(totalLabelCount, Math.round(value)));
    onSelectLabelByIndex(safe);
  };

  const sizeRange =
    printerSettings.labelUnit === "in"
      ? { min: 1, max: 12, step: 0.1 }
      : printerSettings.labelUnit === "cm"
        ? { min: 2, max: 30, step: 0.1 }
        : { min: 20, max: 300, step: 1 };

  const fileSafeName = (selectedLabel?.source ?? "label").replace(/[^a-z0-9_-]/gi, "_");
  const baseName = `${fileSafeName}_${selectedLabel?.index ?? 1}`;
  const printEngineOverride = useMemo(
    () => ({
      enabled: printEngineOverrideEnabled,
      darkness: printEngineDarkness,
      speedIps: printEngineSpeedIps,
      headPressure: printHeadPressure,
      printMethod
    }),
    [printEngineOverrideEnabled, printEngineDarkness, printEngineSpeedIps, printHeadPressure, printMethod]
  );
  const labelPaperColor = theme === "light" ? "#ffffff" : theme === "dark" ? "#e3e6eb" : theme === "dark-plus" ? "#d9dde3" : "#d3d8df";

  const saveBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadZpl = () => {
    if (!selectedLabel) return;
    saveBlob(new Blob([selectedLabel.zpl], { type: "text/plain;charset=utf-8" }), `${baseName}.zpl`);
  };

  const downloadPrn = () => {
    if (!selectedLabel) return;
    saveBlob(new Blob([selectedLabel.zpl], { type: "application/octet-stream" }), `${baseName}.prn`);
  };

  const downloadPng = () => {
    if (!selectedLabel) return;
    const exportCanvas = renderLabelForExport(
      selectedLabel.zpl,
      printerSettings,
      respectZplGeometry,
      printEngineOverride,
      qrLegacyOffset
    );
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      saveBlob(blob, `${baseName}.png`);
    }, "image/png");
  };

  const downloadPdf = () => {
    if (!selectedLabel) return;
    const exportCanvas = renderLabelForExport(
      selectedLabel.zpl,
      printerSettings,
      respectZplGeometry,
      printEngineOverride,
      qrLegacyOffset
    );
    const imageData = exportCanvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: exportCanvas.width >= exportCanvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [exportCanvas.width, exportCanvas.height]
    });
    pdf.addImage(imageData, "PNG", 0, 0, exportCanvas.width, exportCanvas.height);
    pdf.save(`${baseName}.pdf`);
  };

  const applyEngineCommandsToZpl = () => {
    if (!selectedLabel) {
      return;
    }
    onReplaceSelectedZpl(withEngineCommands(selectedLabel.zpl, printEngineDarkness, printEngineSpeedIps));
  };

  const removeEngineCommandsFromZpl = () => {
    if (!selectedLabel) {
      return;
    }
    onReplaceSelectedZpl(stripEngineCommands(selectedLabel.zpl));
  };

  const downloadJson = () => {
    if (!selectedLabel) return;
    const payload = {
      source: selectedLabel.source,
      index: selectedLabel.index,
      id: selectedLabel.id,
      zpl: selectedLabel.zpl,
      printerSettings
    };
    saveBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }),
      `${baseName}.json`
    );
  };

  const rotatePreviewLeft = () => {
    setCanvasRotationDeg((prev) => (prev + 270) % 360);
  };

  const rotatePreviewRight = () => {
    setCanvasRotationDeg((prev) => (prev + 90) % 360);
  };
  const isQuarterTurn = canvasRotationDeg % 180 !== 0;
  const stageWidth = isQuarterTurn ? baseCanvasSize.height : baseCanvasSize.width;
  const stageHeight = isQuarterTurn ? baseCanvasSize.width : baseCanvasSize.height;
  const widthScale =
    stageWidth > 0 && previewViewportWidth > 0
      ? previewViewportWidth / stageWidth
      : 1;
  const heightScale =
    stageHeight > 0 && previewViewportHeight > 0
      ? previewViewportHeight / stageHeight
      : 1;
  const fitScale =
    stageWidth > 0 && stageHeight > 0
      ? Math.min(1, widthScale, heightScale)
      : 1;
  const scaledStageWidth = stageWidth > 0 ? Math.max(1, Math.round(stageWidth * fitScale)) : 0;
  const scaledStageHeight = stageHeight > 0 ? Math.max(1, Math.round(stageHeight * fitScale)) : 0;
  const previewStageStyle =
    scaledStageWidth > 0 && scaledStageHeight > 0
      ? { width: `${scaledStageWidth}px`, height: `${scaledStageHeight}px` }
      : undefined;

  useEffect(() => {
    const node = previewWrapRef.current;
    if (!node) {
      return;
    }
    const update = () => {
      const computed = window.getComputedStyle(node);
      const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
      const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
      const innerWidth = Math.max(0, node.clientWidth - paddingLeft - paddingRight);
      const maxHeight = Math.max(320, Math.floor(window.innerHeight * 0.7));
      setPreviewViewportWidth((prev) => (Math.abs(prev - innerWidth) < 0.5 ? prev : innerWidth));
      setPreviewViewportHeight((prev) => (Math.abs(prev - maxHeight) < 0.5 ? prev : maxHeight));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      setBaseCanvasSize({ width: 0, height: 0 });
      return;
    }
    const nextWidth = Math.max(1, Math.round(canvas.width));
    const nextHeight = Math.max(1, Math.round(canvas.height));
    setBaseCanvasSize((prev) =>
      prev.width === nextWidth && prev.height === nextHeight
        ? prev
        : { width: nextWidth, height: nextHeight }
    );
  }, []);

  return (
    <section ref={sectionRef} className="panel preview-panel">
      <div className="panel-header preview-header">
        <h2>Preview</h2>
        <p className="preview-mode">Detected mode: {mode}</p>
      </div>

      <div className="preview-wrap" ref={previewWrapRef}>
        {selectedLabel ? (
          <div className="preview-stage" style={previewStageStyle}>
            <div className="preview-rotator" style={{ transform: `rotate(${canvasRotationDeg}deg) scale(${fitScale})` }}>
              <ZplCanvas
                zpl={selectedLabel.zpl}
                onWarningsChange={setWarnings}
                onDiagnosticsChange={setDiagnostics}
                onCanvasReady={handleCanvasReady}
                labelPaperColor={labelPaperColor}
                printerSettings={printerSettings}
                showNonPrintableZones={showNonPrintableZones}
                respectZplGeometry={respectZplGeometry}
                printEngineOverride={printEngineOverride}
                qrLegacyOffset={qrLegacyOffset}
              />
            </div>
          </div>
        ) : (
          <div className="empty-state">
            Paste a valid ZPL payload containing <code>^XA</code> and{" "}
            <code>^XZ</code>.
          </div>
        )}
      </div>
      {selectedLabel && (
        <div className="preview-toolbar">
          <div className="preview-rotate-actions">
            <button
              type="button"
              className="rotate-btn rotate-btn-icon"
              onClick={rotatePreviewLeft}
              title="Rotate Left"
              aria-label="Rotate Left"
            >
              ↺
            </button>
            <button
              type="button"
              className="rotate-btn rotate-btn-icon"
              onClick={rotatePreviewRight}
              title="Rotate Right"
              aria-label="Rotate Right"
            >
              ↻
            </button>
            <button type="button" className="rotate-btn" onClick={() => onOpenBuilder()}>
              Open In Builder
            </button>
          </div>
          <div className="download-actions">
            <button type="button" className="download-btn" onClick={downloadZpl}>
              <span className="download-icon" aria-hidden>↓</span> ZPL
            </button>
            <button type="button" className="download-btn" onClick={downloadPrn}>
              <span className="download-icon" aria-hidden>↓</span> PRN
            </button>
            <button type="button" className="download-btn" onClick={downloadPng}>
              <span className="download-icon" aria-hidden>↓</span> PNG
            </button>
            <button type="button" className="download-btn" onClick={downloadPdf}>
              <span className="download-icon" aria-hidden>↓</span> PDF
            </button>
            <button type="button" className="download-btn" onClick={downloadJson}>
              <span className="download-icon" aria-hidden>↓</span> JSON
            </button>
          </div>
        </div>
      )}
      <section className={`preview-settings-accordion${settingsOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="preview-settings-toggle"
          onClick={() => setSettingsOpen((prev) => !prev)}
          aria-expanded={settingsOpen}
        >
          <span>Preview Settings</span>
          <span className="preview-settings-icon" aria-hidden>{settingsOpen ? "-" : "+"}</span>
        </button>
        <div className="preview-settings-body">
      <div className="printer-profile">
        <div className="printer-row">
          <label htmlFor="printer-model">Printer Model:</label>
          <div className="printer-controls">
            <select
              id="printer-model"
              value={printerSettings.model}
              onChange={(e) => onModelChange(e.target.value)}
            >
              <option value="Zebra GK420d">Zebra GK420d</option>
              <option value="Zebra ZD421">Zebra ZD421</option>
              <option value="Zebra ZT230">Zebra ZT230</option>
              <option value="Zebra ZT410">Zebra ZT410</option>
              <option value="Zebra ZT610">Zebra ZT610</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
        </div>

        <div className="printer-row">
          <label htmlFor="print-density">Print Density:</label>
          <div className="printer-controls">
            <select
              id="print-density"
              value={printerSettings.densityDpmm}
              onChange={(e) => onDensityChange(Number(e.target.value) as PrintDensityDpmm)}
            >
              <option value={8}>8 dpmm (203 dpi)</option>
              <option value={12}>12 dpmm (300 dpi)</option>
              <option value={24}>24 dpmm (600 dpi)</option>
            </select>
          </div>
        </div>

        <div className="printer-row">
          <label htmlFor="print-quality">Print Quality:</label>
          <div className="printer-controls">
            <select
              id="print-quality"
              value={printerSettings.quality}
              onChange={(e) => onQualityChange(e.target.value as PrintQuality)}
            >
              <option value="grayscale">Grayscale</option>
              <option value="binary">Binary</option>
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
                value={printerSettings.labelWidth}
                onChange={(e) => onSizeChange("labelWidth", Number(e.target.value))}
              />
              <input
                type="number"
                min={sizeRange.min}
                max={sizeRange.max}
                step={sizeRange.step}
                value={printerSettings.labelWidth}
                onChange={(e) => onSizeChange("labelWidth", Number(e.target.value))}
              />
            </div>
            <div className="size-line">
              <span>H</span>
              <input
                type="range"
                min={sizeRange.min}
                max={sizeRange.max}
                step={sizeRange.step}
                value={printerSettings.labelHeight}
                onChange={(e) => onSizeChange("labelHeight", Number(e.target.value))}
              />
              <input
                type="number"
                min={sizeRange.min}
                max={sizeRange.max}
                step={sizeRange.step}
                value={printerSettings.labelHeight}
                onChange={(e) => onSizeChange("labelHeight", Number(e.target.value))}
              />
            </div>
            <select
              value={printerSettings.labelUnit}
              onChange={(e) => onUnitChange(e.target.value as LabelUnit)}
            >
              <option value="in">inches</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          </div>
        </div>

        <div className="printer-row">
          <label>Show Label:</label>
          <div className="printer-controls show-label-controls">
            <input
              type="number"
              min={1}
              max={totalLabelCount}
              value={selectedLabelPosition}
              onChange={(e) => onShowLabelIndexInput(Number(e.target.value))}
            />
            <span className="printer-of">of</span>
            <input
              type="number"
              min={1}
              value={totalLabelCount}
              disabled
              readOnly
              aria-label="Total label count"
            />
          </div>
        </div>

        <div className="printer-row printer-row-toggle">
          <label htmlFor="show-non-printable">Show Non-printable Zones</label>
          <div className="printer-controls">
            <input
              id="show-non-printable"
              type="checkbox"
              checked={showNonPrintableZones}
              onChange={(e) => setShowNonPrintableZones(e.target.checked)}
            />
          </div>
        </div>

        <div className="printer-row printer-row-toggle">
          <label htmlFor="respect-zpl-geometry">Respect ZPL ^PW/^LL</label>
          <div className="printer-controls">
            <input
              id="respect-zpl-geometry"
              type="checkbox"
              checked={respectZplGeometry}
              onChange={(e) => setRespectZplGeometry(e.target.checked)}
            />
          </div>
        </div>

        <div className="printer-row printer-row-toggle">
          <label htmlFor="qr-legacy-offset">QR Legacy Offset</label>
          <div className="printer-controls">
            <input
              id="qr-legacy-offset"
              type="checkbox"
              checked={qrLegacyOffset}
              onChange={(e) => setQrLegacyOffset(e.target.checked)}
            />
          </div>
        </div>

        <div className="printer-row printer-row-toggle">
          <label htmlFor="engine-override">Override ^MD/^PR for preview</label>
          <div className="printer-controls">
            <input
              id="engine-override"
              type="checkbox"
              checked={printEngineOverrideEnabled}
              onChange={(e) => setPrintEngineOverrideEnabled(e.target.checked)}
            />
          </div>
        </div>

        <div className="printer-row printer-row-size">
          <label>Print Engine:</label>
          <div className="printer-controls size-controls">
            <div className="size-line">
              <span>M</span>
              <select
                value={printMethod}
                onChange={(e) => setPrintMethod(e.target.value as "direct-thermal" | "thermal-transfer")}
              >
                <option value="direct-thermal">Direct Thermal</option>
                <option value="thermal-transfer">Thermal Transfer</option>
              </select>
              <input
                type="text"
                value={printMethod === "direct-thermal" ? "DT" : "TT"}
                readOnly
                disabled
              />
            </div>
            <div className="size-line">
              <span>MD</span>
              <input
                type="range"
                min={-30}
                max={30}
                step={1}
                value={printEngineDarkness}
                onChange={(e) => setPrintEngineDarkness(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
              <input
                type="number"
                min={-30}
                max={30}
                step={1}
                value={printEngineDarkness}
                onChange={(e) => setPrintEngineDarkness(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
            </div>
            <div className="size-line">
              <span>PR</span>
              <input
                type="range"
                min={1}
                max={14}
                step={0.5}
                value={printEngineSpeedIps}
                onChange={(e) => setPrintEngineSpeedIps(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
              <input
                type="number"
                min={1}
                max={14}
                step={0.5}
                value={printEngineSpeedIps}
                onChange={(e) => setPrintEngineSpeedIps(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
            </div>
            <div className="size-line">
              <span>HP</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                value={printHeadPressure}
                onChange={(e) => setPrintHeadPressure(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
              <input
                type="number"
                min={-10}
                max={10}
                step={1}
                value={printHeadPressure}
                onChange={(e) => setPrintHeadPressure(Number(e.target.value))}
                disabled={!printEngineOverrideEnabled}
              />
            </div>
            <p className="muted">
              Note: option 3 (HP) is preview-only head pressure simulation, not a real ZPL command.
            </p>
            <div className="codec-text-actions">
              <button
                type="button"
                className="editor-action-btn"
                onClick={applyEngineCommandsToZpl}
                disabled={!selectedLabel}
              >
                Apply MD/PR to ZPL
              </button>
              <button
                type="button"
                className="editor-action-btn"
                onClick={removeEngineCommandsFromZpl}
                disabled={!selectedLabel}
              >
                Remove MD/PR
              </button>
            </div>
          </div>
        </div>

        <div className="printer-row printer-row-toggle">
          <label htmlFor="persist-current-zpl">Remember Current ZPL (localStorage)</label>
          <div className="printer-controls">
            <input
              id="persist-current-zpl"
              type="checkbox"
              checked={persistCurrentZpl}
              onChange={(e) => onPersistCurrentZplChange(e.target.checked)}
            />
          </div>
        </div>
      </div>
        </div>
      </section>
      {!!warnings.length && (
        <div className="preview-warnings">
          <h3>Warnings</h3>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {!!diagnostics.length && (
        <div className="preview-diagnostics">
          <h3>Diagnostics</h3>
          <ul>
            {diagnostics.map((item, index) => (
              <li key={`${item.line}-${item.command}-${item.message}-${index}`}>
                <strong>L{item.line}</strong> <code>^{item.command}</code> [{item.severity}/
                {item.impact}] {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
