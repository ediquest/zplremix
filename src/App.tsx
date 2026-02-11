import { useEffect, useMemo, useState } from "react";
import { detectAndDecode } from "./core/encoding/detectAndDecode";
import type { LabelCandidate } from "./core/types";
import { extractLabels } from "./core/zpl/extractLabels";
import { LabelBuilderPage } from "./features/builder/LabelBuilderPage";
import { EditorPanel } from "./features/editor/EditorPanel";
import { ZipUpload } from "./features/import/ZipUpload";
import { PreviewPanel } from "./features/preview/PreviewPanel";

const DEBOUNCE_MS = 250;
const LS_PERSIST_KEY = "zplremix.persist_current_zpl";
const LS_ZPL_KEY = "zplremix.current_zpl";

const SAMPLE_ZPL = `^XA
^FO30,30^A0N,40,40^FDZPLRemix^FS
^FO30,90^GB740,3,3^FS
^FO30,120^A0N,28,28^FDLive preview foundation^FS
^FO30,170^BY2,2,80^BCN,80,Y,N,N^FD1234567890^FS
^XZ`;

export default function App() {
  const [viewMode, setViewMode] = useState<"main" | "builder">("main");
  const [builderSeedZpl, setBuilderSeedZpl] = useState<string>(SAMPLE_ZPL);
  const [persistCurrentZpl, setPersistCurrentZpl] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(LS_PERSIST_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [rawInput, setRawInput] = useState<string>(() => {
    try {
      const persist = window.localStorage.getItem(LS_PERSIST_KEY) === "1";
      if (!persist) {
        return SAMPLE_ZPL;
      }
      return window.localStorage.getItem(LS_ZPL_KEY) || SAMPLE_ZPL;
    } catch {
      return SAMPLE_ZPL;
    }
  });
  const [debouncedInput, setDebouncedInput] = useState<string>(rawInput);
  const [zipLabels, setZipLabels] = useState<LabelCandidate[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInput(rawInput), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [rawInput]);

  useEffect(() => {
    try {
      if (persistCurrentZpl) {
        window.localStorage.setItem(LS_PERSIST_KEY, "1");
        window.localStorage.setItem(LS_ZPL_KEY, rawInput);
        return;
      }
      window.localStorage.removeItem(LS_ZPL_KEY);
      window.localStorage.removeItem(LS_PERSIST_KEY);
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [persistCurrentZpl, rawInput]);

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

  const openBuilder = (zpl?: string) => {
    setBuilderSeedZpl(zpl || rawInput || SAMPLE_ZPL);
    setViewMode("builder");
  };

  const closeBuilder = (nextZpl?: string) => {
    if (typeof nextZpl === "string") {
      setRawInput(nextZpl);
    }
    setViewMode("main");
  };

  if (viewMode === "builder") {
    return <LabelBuilderPage seedZpl={builderSeedZpl} onBack={closeBuilder} />;
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>ZPLRemix</h1>
        <p>Paste ZPL or encoded payload and preview the label instantly.</p>
        <div className="builder-entry">
          <button type="button" className="download-btn" onClick={() => openBuilder()}>
            Open Builder
          </button>
        </div>
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
          onOpenBuilder={openBuilder}
          persistCurrentZpl={persistCurrentZpl}
          onPersistCurrentZplChange={setPersistCurrentZpl}
        />
      </section>
      <footer className="app-footer">© 2026 Adrian Sarczyński</footer>
    </main>
  );
}
