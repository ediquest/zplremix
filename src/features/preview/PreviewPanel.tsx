import { useEffect, useState } from "react";
import type { LabelCandidate } from "../../core/types";
import { ZplCanvas } from "./ZplCanvas";

type PreviewPanelProps = {
  mode: string;
  labels: LabelCandidate[];
  selectedLabelId: string | null;
  onSelectLabel: (id: string) => void;
};

export function PreviewPanel({
  mode,
  labels,
  selectedLabelId,
  onSelectLabel
}: PreviewPanelProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const selectedLabel =
    labels.find((label) => label.id === selectedLabelId) ?? labels[0] ?? null;

  useEffect(() => {
    if (!selectedLabel) {
      setWarnings([]);
    }
  }, [selectedLabel]);

  return (
    <section className="panel">
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

      <div className="preview-wrap">
        {selectedLabel ? (
          <ZplCanvas zpl={selectedLabel.zpl} onWarningsChange={setWarnings} />
        ) : (
          <div className="empty-state">
            Paste a valid ZPL payload containing <code>^XA</code> and{" "}
            <code>^XZ</code>.
          </div>
        )}
      </div>
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
    </section>
  );
}
