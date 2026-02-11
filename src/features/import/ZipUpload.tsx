import { useRef, useState } from "react";
import type { LabelCandidate } from "../../core/types";
import { MAX_ZIP_SIZE_BYTES } from "../../core/zip/limits";
import { scanZip } from "../../core/zip/scanZip";

type ZipUploadProps = {
  onLabelsDetected: (labels: LabelCandidate[]) => void;
};

export function ZipUpload({ onLabelsDetected }: ZipUploadProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = async (file?: File) => {
    if (!file) {
      return;
    }

    if (file.size > MAX_ZIP_SIZE_BYTES) {
      setMessage("ZIP is too large. Limit is 15 MB.");
      return;
    }

    setBusy(true);
    setMessage("Scanning ZIP...");
    try {
      const result = await scanZip(file);
      onLabelsDetected(result.labels);
      if (!result.labels.length) {
        setMessage("No ZPL labels found in archive.");
      } else {
        const warningPart = result.warnings.length
          ? ` (${result.warnings.length} warnings)`
          : "";
        setMessage(`Found ${result.labels.length} label(s)${warningPart}.`);
      }
    } catch {
      setMessage("Could not scan ZIP file.");
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="zip-upload">
      <label htmlFor="zip-input" className="zip-label">
        Import ZIP
      </label>
      <input
        ref={inputRef}
        id="zip-input"
        type="file"
        accept=".zip,application/zip"
        disabled={busy}
        onChange={(event) => onSelectFile(event.target.files?.[0])}
      />
      <p className="muted zip-status">{message}</p>
    </div>
  );
}

