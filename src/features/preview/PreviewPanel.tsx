import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import type { LabelCandidate, PrinterSettings, PrintDensityDpmm, PrintQuality, LabelUnit } from "../../core/types";
import { ZplCanvas, renderLabelForExport } from "./ZplCanvas";
import type { ZplDiagnostic } from "./ZplCanvas";

const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";

type PreviewPanelProps = {
  mode: string;
  labels: LabelCandidate[];
  selectedLabelId: string | null;
  onSelectLabel: (id: string) => void;
  persistCurrentZpl: boolean;
  onPersistCurrentZplChange: (enabled: boolean) => void;
};

type PersistedPreviewSettings = {
  showNonPrintableZones: boolean;
  respectZplGeometry: boolean;
  printerSettings: PrinterSettings;
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
        printerSettings: DEFAULT_PRINTER_SETTINGS
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
      printerSettings: DEFAULT_PRINTER_SETTINGS
    };
  }
}

export function PreviewPanel({
  mode,
  labels,
  selectedLabelId,
  onSelectLabel,
  persistCurrentZpl,
  onPersistCurrentZplChange
}: PreviewPanelProps) {
  const [persisted] = useState<PersistedPreviewSettings>(() => loadPersistedSettings());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<ZplDiagnostic[]>([]);
  const [showNonPrintableZones, setShowNonPrintableZones] = useState(persisted.showNonPrintableZones);
  const [respectZplGeometry, setRespectZplGeometry] = useState(persisted.respectZplGeometry);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(persisted.printerSettings);
  const selectedLabel =
    labels.find((label) => label.id === selectedLabelId) ?? labels[0] ?? null;

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
        printerSettings
      };
      window.localStorage.setItem(LS_PREVIEW_SETTINGS_KEY, JSON.stringify(payload));
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [printerSettings, respectZplGeometry, showNonPrintableZones]);

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

  const onShowLabelChange = (key: "showLabelIndex" | "showLabelCount", value: number) => {
    const safe = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
    setPrinterSettings((prev) => {
      if (key === "showLabelCount") {
        return {
          ...prev,
          showLabelCount: safe,
          showLabelIndex: Math.min(prev.showLabelIndex, safe)
        };
      }
      return { ...prev, showLabelIndex: Math.min(safe, prev.showLabelCount) };
    });
  };

  const sizeRange =
    printerSettings.labelUnit === "in"
      ? { min: 1, max: 12, step: 0.1 }
      : printerSettings.labelUnit === "cm"
        ? { min: 2, max: 30, step: 0.1 }
        : { min: 20, max: 300, step: 1 };

  const fileSafeName = (selectedLabel?.source ?? "label").replace(/[^a-z0-9_-]/gi, "_");
  const baseName = `${fileSafeName}_${selectedLabel?.index ?? 1}`;

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
    const exportCanvas = renderLabelForExport(selectedLabel.zpl, printerSettings, respectZplGeometry);
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      saveBlob(blob, `${baseName}.png`);
    }, "image/png");
  };

  const downloadPdf = () => {
    if (!selectedLabel) return;
    const exportCanvas = renderLabelForExport(selectedLabel.zpl, printerSettings, respectZplGeometry);
    const imageData = exportCanvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: exportCanvas.width >= exportCanvas.height ? "landscape" : "portrait",
      unit: "px",
      format: [exportCanvas.width, exportCanvas.height]
    });
    pdf.addImage(imageData, "PNG", 0, 0, exportCanvas.width, exportCanvas.height);
    pdf.save(`${baseName}.pdf`);
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

  return (
    <section className="panel preview-panel">
      <div className="panel-header">
        <h2>Preview</h2>
        <p className="muted">Detected mode: {mode}</p>
      </div>

      <div className="label-select-wrap">
        <label htmlFor="label-select">Label</label>
        <select
          id="label-select"
          value={selectedLabel?.id ?? ""}
          onChange={(e) => onSelectLabel(e.target.value)}
          disabled={!labels.length}
        >
          {!labels.length && <option value="">No labels detected</option>}
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.source} #{label.index}
            </option>
          ))}
        </select>
      </div>

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
              value={printerSettings.showLabelIndex}
              onChange={(e) => onShowLabelChange("showLabelIndex", Number(e.target.value))}
            />
            <span className="printer-of">of</span>
            <input
              type="number"
              min={1}
              value={printerSettings.showLabelCount}
              onChange={(e) => onShowLabelChange("showLabelCount", Number(e.target.value))}
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

      <div className="preview-wrap">
        {selectedLabel ? (
          <ZplCanvas
            zpl={selectedLabel.zpl}
            onWarningsChange={setWarnings}
            onDiagnosticsChange={setDiagnostics}
            printerSettings={printerSettings}
            showNonPrintableZones={showNonPrintableZones}
            respectZplGeometry={respectZplGeometry}
          />
        ) : (
          <div className="empty-state">
            Paste a valid ZPL payload containing <code>^XA</code> and{" "}
            <code>^XZ</code>.
          </div>
        )}
      </div>
      {selectedLabel && (
        <div className="download-panel">
          <h3>Download</h3>
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
