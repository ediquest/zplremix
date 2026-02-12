import { useEffect, useMemo, useState } from "react";
import { detectAndDecode } from "./core/encoding/detectAndDecode";
import type { LabelCandidate } from "./core/types";
import { extractLabels } from "./core/zpl/extractLabels";
import { LabelBuilderPage } from "./features/builder/LabelBuilderPage";
import { ZplCodecPage } from "./features/codec/ZplBase64Page";
import { EditorPanel } from "./features/editor/EditorPanel";
import { LabelTilesPanel } from "./features/import/LabelTilesPanel";
import { ZipUpload } from "./features/import/ZipUpload";
import { PreviewPanel } from "./features/preview/PreviewPanel";

const DEBOUNCE_MS = 250;
const LS_PERSIST_KEY = "zplremix.persist_current_zpl";
const LS_ZPL_KEY = "zplremix.current_zpl";
const LS_THEME_KEY = "zplremix.theme";
type ThemeMode = "light" | "dark" | "dark-plus" | "abyss";

const SAMPLE_ZPL = `^XA
^PW813
^LL1219
^LH0,0
^FO20,20^GB772,1178,4^FS
^FO40,40^A0N,42,42^FDLOGISTICS LABEL^FS
^FO40,90^A0N,22,22^FDCarrier: AS  Service: PARCEL^FS
^FO620,40^A0N,28,28^FDZONE^FS
^FO700,30^A0N,90,90^FD3^FS
^FO40,130^GFA,128,128,8,FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00^FS
^FO40,190^GB732,240,3^FS
^FO55,205^A0N,28,28^FDSHIP TO^FS
^FO55,240^A0N,28,28^FDACME Sp. z o.o.^FS
^FO55,275^A0N,24,24^FDul. Magazynowa 12^FS
^FO55,305^A0N,24,24^FD55-040 Bielany Wroclawskie^FS
^FO55,335^A0N,24,24^FDPOLAND^FS
^FO520,240^A0N,22,22^FDPhone:^FS
^FO520,265^A0N,24,24^FD+48 600 700 800^FS
^FO40,450^GB732,150,3^FS
^FO55,465^A0N,26,26^FDFROM^FS
^FO55,500^A0N,26,26^FDWarehouse PL01^FS
^FO55,530^A0N,22,22^FDul. Logistyczna 1, 59-225 Chojnow^FS
^FO40,620^GB732,120,3^FS
^FO55,635^A0N,24,24^FDROUTE:^FS
^FO155,635^A0N,28,28^FDWRO-LEG-CHO^FS
^FO55,670^A0N,24,24^FDSHIP DATE:^FS
^FO190,670^A0N,24,24^FD2026-02-11^FS
^FO55,705^A0N,24,24^FDPO:^FS
^FO120,705^A0N,24,24^FDPO-908771^FS
^FO320,705^A0N,24,24^FDORDER:^FS
^FO420,705^A0N,24,24^FDORD-00014521^FS
^FO620,705^A0N,24,24^FDPKG:^FS
^FO690,695^A0N,42,42^FD1/3^FS
^FO40,760^GB732,250,3^FS
^FO55,775^A0N,26,26^FDTRACKING / SSCC^FS
^FO70,810^BCN,120,N,N,N
^FD00359012345678901234^FS
^FO70,945^A0N,28,28^FD00359012345678901234^FS
^FO40,1030^GB400,150,3^FS
^FO55,1045^A0N,24,24^FDGTIN^FS
^FO72,1081^BY2,2,48^BCN,48,Y,N,N^FD059012345678^FS
^FO55,1145^A0N,24,24^FDQTY:^FS
^FO120,1142^A0N,32,32^FD24^FS
^FO460,1030^GB312,150,3^FS
^FO475,1045^A0N,24,24^FDQR DATA^FS
^FO545,995^BQN,2,3
^FDLA,{"order":"ORD-00014521","sscc":"00359012345678901234","gtin":"05901234567890","qty":24}^FS
^XZ`;

const VISUAL_ZPL_HINT_RE = /\^(FO|FT|FD|FV|GB|GC|GD|GE|GF|XG|BC|BE|B2|B3|BQ|BX|B7|BD|A0|A@|CF|FB)\b/i;

function pickBestInitialLabel(labels: LabelCandidate[]): LabelCandidate | null {
  if (!labels.length) {
    return null;
  }
  return labels.find((item) => VISUAL_ZPL_HINT_RE.test(item.zpl)) ?? labels[0];
}

export default function App() {
  const [viewMode, setViewMode] = useState<"preview" | "builder" | "codec">("preview");
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const stored = window.localStorage.getItem(LS_THEME_KEY);
      if (stored === "light" || stored === "dark" || stored === "dark-plus" || stored === "abyss") {
        return stored;
      }
    } catch {
      // ignore
    }
    return "light";
  });
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(LS_THEME_KEY, theme);
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [theme]);

  const decoded = useMemo(() => detectAndDecode(debouncedInput), [debouncedInput]);
  const labels = useMemo(
    () => extractLabels(decoded.text, "editor"),
    [decoded.text]
  );
  const availableLabels = useMemo(
    () => [...labels, ...zipLabels],
    [labels, zipLabels]
  );
  const selectedLabel = useMemo(
    () => availableLabels.find((item) => item.id === selectedLabelId) ?? availableLabels[0] ?? null,
    [availableLabels, selectedLabelId]
  );
  const pageDescription =
    viewMode === "preview"
      ? "Paste ZPL, import files, and preview labels instantly."
      : viewMode === "builder"
        ? "Build, move, and adjust label elements visually."
        : "Encode and decode ZPL payloads across common transport formats.";

  useEffect(() => {
    if (!availableLabels.length) {
      setSelectedLabelId(null);
      return;
    }
    if (
      !selectedLabelId ||
      !availableLabels.some((item) => item.id === selectedLabelId)
    ) {
      const initial = pickBestInitialLabel(availableLabels);
      setSelectedLabelId(initial?.id ?? availableLabels[0].id);
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
    const initial = pickBestInitialLabel(detected);
    if (initial) {
      setSelectedLabelId(initial.id);
      setRawInput(initial.zpl);
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
    setViewMode("preview");
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <div className="app-brand">
            <h1>ZPLRemix</h1>
            <p>{pageDescription}</p>
          </div>
          <div className="app-nav" role="tablist" aria-label="Main sections">
            <button
              type="button"
              className={`app-nav-btn${viewMode === "preview" ? " is-active" : ""}`}
              onClick={() => setViewMode("preview")}
            >
              ZPL Preview
            </button>
            <button
              type="button"
              className={`app-nav-btn${viewMode === "builder" ? " is-active" : ""}`}
              onClick={() => openBuilder(selectedLabel?.zpl ?? rawInput)}
            >
              Label Builder
            </button>
            <button
              type="button"
              className={`app-nav-btn${viewMode === "codec" ? " is-active" : ""}`}
              onClick={() => setViewMode("codec")}
            >
              ZPL Codec
            </button>
            <div className="app-theme-picker">
              <label htmlFor="theme-select">Theme</label>
              <select
                id="theme-select"
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemeMode)}
              >
                <option value="light">Light</option>
                <option value="dark">Dark (Visual Studio)</option>
                <option value="dark-plus">Dark+</option>
                <option value="abyss">Abyss</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {viewMode === "preview" && (
        <section className="app-grid">
          <div className="left-column">
            <EditorPanel rawInput={rawInput} onInputChange={setRawInput} />
            <ZipUpload onLabelsDetected={onZipLabelsDetected} />
            <LabelTilesPanel
              labels={availableLabels}
              selectedLabelId={selectedLabelId}
              onSelectLabel={onSelectLabel}
            />
          </div>
          <PreviewPanel
            mode={decoded.mode}
            theme={theme}
            labels={availableLabels}
            selectedLabelId={selectedLabelId}
            onOpenBuilder={openBuilder}
            persistCurrentZpl={persistCurrentZpl}
            onPersistCurrentZplChange={setPersistCurrentZpl}
          />
        </section>
      )}
      {viewMode === "builder" && (
        <LabelBuilderPage seedZpl={builderSeedZpl} onBack={closeBuilder} />
      )}
      {viewMode === "codec" && <ZplCodecPage />}
      <footer className="app-footer">© 2026 Adrian Sarczyński</footer>
    </main>
  );
}
