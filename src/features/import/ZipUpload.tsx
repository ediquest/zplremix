import { useMemo, useRef, useState } from "react";
import { detectAndDecode } from "../../core/encoding/detectAndDecode";
import type { InputMode, LabelCandidate } from "../../core/types";
import { MAX_ZIP_SIZE_BYTES } from "../../core/zip/limits";
import { scanZip } from "../../core/zip/scanZip";
import { extractLabels } from "../../core/zpl/extractLabels";

type ZipUploadProps = {
  onLabelsDetected: (labels: LabelCandidate[]) => void;
};

const ACCEPTED_EXTENSIONS = new Set(["zip", "xml", "zpl", "txt", "prn", "json"]);

function extensionFor(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1250", { fatal: false }).decode(bytes);
  }
}

export function ZipUpload({ onLabelsDetected }: ZipUploadProps) {
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState<string>("Drop a file or browse.");
  const [summaryLines, setSummaryLines] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelectFile = async (file?: File) => {
    if (!file) {
      return;
    }

    const ext = extensionFor(file.name);
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      setMessage("Unsupported file type. Use ZIP, XML, ZPL, TXT, PRN or JSON.");
      setSummaryLines([]);
      return;
    }

    if (file.size > MAX_ZIP_SIZE_BYTES) {
      setMessage("File is too large. Limit is 15 MB.");
      setSummaryLines([]);
      return;
    }

    setBusy(true);
    setSummaryLines([]);
    try {
      if (ext === "zip") {
        setMessage("Scanning ZIP...");
        const result = await scanZip(file);
        onLabelsDetected(result.labels);

        const nextSummary: string[] = [];
        nextSummary.push(
          `Scanned ${result.entriesScanned ?? 0} file(s), found labels in ${result.entriesWithLabels ?? 0}.`
        );
        if (result.modeCounts) {
          nextSummary.push(
            `Decode modes: plain ${result.modeCounts.plain}, base64 ${result.modeCounts.base64}, base64+gzip ${result.modeCounts.base64_gzip}.`
          );
        }
        const topFiles = (result.fileSummaries ?? [])
          .filter((item) => item.labels > 0)
          .slice(0, 5)
          .map((item) => {
            const suffix = item.mode === "plain" ? "plain" : item.mode === "base64" ? "base64" : "base64+gzip";
            return `${item.name}: ${item.labels} label(s), ${suffix}`;
          });
        nextSummary.push(...topFiles);
        if (result.warnings.length) {
          nextSummary.push(`${result.warnings.length} warning(s) while scanning ZIP.`);
        }
        setSummaryLines(nextSummary);

        if (!result.labels.length) {
          setMessage("No ZPL labels found in ZIP.");
        } else {
          setMessage(`Found ${result.labels.length} label(s) in ZIP.`);
        }
      } else {
        setMessage(`Scanning ${ext.toUpperCase()}...`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = decodeBytes(bytes);
        const decoded = detectAndDecode(text);
        const labels = extractLabels(decoded.text, file.name);
        onLabelsDetected(labels);

        const modeLabel =
          decoded.mode === "plain"
            ? "plain text"
            : decoded.mode === "base64"
              ? "base64"
              : "base64+gzip";
        const sourceLabel = ext === "xml" ? "XML" : ext.toUpperCase();
        const nextSummary = [
          `${sourceLabel} decoded as ${modeLabel}.`,
          labels.length ? `Found ${labels.length} label(s) in ${file.name}.` : `No ZPL labels in ${file.name}.`
        ];
        setSummaryLines(nextSummary);
        setMessage(labels.length ? `Found ${labels.length} label(s).` : "No ZPL labels found.");
      }
    } catch {
      setMessage("Could not scan selected file.");
      setSummaryLines([]);
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const acceptList = useMemo(
    () => ".zip,.xml,.zpl,.txt,.prn,.json,application/zip,text/xml,text/plain,application/json",
    []
  );

  return (
    <div className="zip-upload">
      <label htmlFor="zip-input" className="zip-label">Import Files</label>
      <input
        ref={inputRef}
        id="zip-input"
        type="file"
        accept={acceptList}
        disabled={busy}
        className="zip-hidden-input"
        onChange={(event) => onSelectFile(event.target.files?.[0])}
      />
      <div
        className={`zip-dropzone${dragActive ? " is-active" : ""}${busy ? " is-busy" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (busy) {
            return;
          }
          onSelectFile(event.dataTransfer.files?.[0]);
        }}
      >
        <p className="zip-drop-title">Drop ZIP/XML/ZPL/TXT/PRN here</p>
        <p className="zip-drop-subtitle">or click to browse</p>
        <button
          type="button"
          className="zip-browse"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Scanning..." : "Browse File"}
        </button>
      </div>
      <p className="muted zip-status">{message}</p>
      {!!summaryLines.length && (
        <div className="zip-summary">
          <h3>Import Summary</h3>
          <ul>
            {summaryLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
