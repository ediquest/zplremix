import { useEffect, useMemo, useState } from "react";
import { detectAndDecode } from "./core/encoding/detectAndDecode";
import type { LabelCandidate } from "./core/types";
import { extractLabels } from "./core/zpl/extractLabels";
import { EditorPanel } from "./features/editor/EditorPanel";
import { ZipUpload } from "./features/import/ZipUpload";
import { PreviewPanel } from "./features/preview/PreviewPanel";

const DEBOUNCE_MS = 250;

const SAMPLE_ZPL = `^XA
^FO30,30^A0N,40,40^FDZPLRemix^FS
^FO30,90^GB740,3,3^FS
^FO30,120^A0N,28,28^FDLive preview foundation^FS
^FO30,170^BY2,2,80^BCN,80,Y,N,N^FD1234567890^FS
^XZ`;

export default function App() {
  const [rawInput, setRawInput] = useState<string>(SAMPLE_ZPL);
  const [debouncedInput, setDebouncedInput] = useState<string>(SAMPLE_ZPL);
  const [zipLabels, setZipLabels] = useState<LabelCandidate[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInput(rawInput), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [rawInput]);

  const decoded = useMemo(() => detectAndDecode(debouncedInput), [debouncedInput]);
  const labels = useMemo(
    () => extractLabels(decoded.text, "editor"),
    [decoded.text]
  );
  const availableLabels = useMemo(
    () => [...labels, ...zipLabels],
    [labels, zipLabels]
  );

  useEffect(() => {
    if (!availableLabels.length) {
      setSelectedLabelId(null);
      return;
    }
    if (
      !selectedLabelId ||
      !availableLabels.some((item) => item.id === selectedLabelId)
    ) {
      setSelectedLabelId(availableLabels[0].id);
    }
  }, [availableLabels, selectedLabelId]);

  const onSelectLabel = (id: string) => {
    setSelectedLabelId(id);
    const picked = availableLabels.find((label) => label.id === id);
    if (picked && picked.source !== "editor") {
      setRawInput(picked.zpl);
    }
  };

  const onZipLabelsDetected = (detected: LabelCandidate[]) => {
    setZipLabels(detected);
    if (detected.length) {
      setSelectedLabelId(detected[0].id);
      setRawInput(detected[0].zpl);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>ZPLRemix</h1>
        <p>Paste ZPL or encoded payload and preview the label instantly.</p>
      </header>

      <section className="app-grid">
        <div className="left-column">
          <EditorPanel rawInput={rawInput} onInputChange={setRawInput} />
          <ZipUpload onLabelsDetected={onZipLabelsDetected} />
        </div>
        <PreviewPanel
          mode={decoded.mode}
          labels={availableLabels}
          selectedLabelId={selectedLabelId}
          onSelectLabel={onSelectLabel}
        />
      </section>
    </main>
  );
}
