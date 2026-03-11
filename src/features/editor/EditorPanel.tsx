import { useMemo, useRef, useState } from "react";

type EditorPanelProps = {
  rawInput: string;
  onInputChange: (next: string) => void;
  onSaveCurrent?: () => boolean;
};

function renderPlainWithNumbers(text: string, keyPrefix: string) {
  const parts: JSX.Element[] = [];
  const numberRegex = /\b\d+(?:\.\d+)?\b/g;
  let lastIndex = 0;
  let match = numberRegex.exec(text);
  let index = 0;
  while (match) {
    if (match.index > lastIndex) {
      parts.push(<span key={`${keyPrefix}-plain-${index}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={`${keyPrefix}-num-${index}`} className="zpl-token-number">
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
    index += 1;
    match = numberRegex.exec(text);
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`${keyPrefix}-plain-tail`}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

function renderHighlightedZpl(source: string) {
  const parts: JSX.Element[] = [];
  const commandRegex = /([\^~])([A-Z0-9]{1,3})/gi;
  let lastIndex = 0;
  let match = commandRegex.exec(source);
  let index = 0;

  while (match) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={`plain-${index}`}>
          {renderPlainWithNumbers(source.slice(lastIndex, match.index), `segment-${index}`)}
        </span>
      );
    }
    const marker = match[1];
    const command = match[2];
    const normalized = `${marker}${command.toUpperCase()}`;
    const isBlock = normalized === "^XA" || normalized === "^XZ";
    const isField = normalized === "^FD" || normalized === "^FS";
    parts.push(
      <span key={`cmd-${index}`}>
        <span className="zpl-token-marker">{marker}</span>
        <span className={isBlock ? "zpl-token-block" : isField ? "zpl-token-field" : "zpl-token-command"}>
          {command.toUpperCase()}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
    index += 1;
    match = commandRegex.exec(source);
  }

  if (lastIndex < source.length) {
    parts.push(
      <span key="plain-tail">
        {renderPlainWithNumbers(source.slice(lastIndex), "segment-tail")}
      </span>
    );
  }

  return parts;
}

function beautifyZpl(source: string) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const commandRegex = /[\^~][A-Z0-9]{1,3}/gi;
  const positions: number[] = [];
  let match = commandRegex.exec(normalized);

  while (match) {
    positions.push(match.index);
    match = commandRegex.exec(normalized);
  }

  if (!positions.length) {
    return normalized;
  }

  const lines: string[] = [];

  if (positions[0] > 0) {
    const prefix = normalized.slice(0, positions[0]).trim();
    if (prefix) {
      lines.push(prefix);
    }
  }

  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : normalized.length;
    const chunk = normalized.slice(start, end).replace(/^\n+|\n+$/g, "");
    if (chunk) {
      lines.push(chunk);
    }
  }

  return lines.join("\n");
}

export function EditorPanel({ rawInput, onInputChange, onSaveCurrent }: EditorPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [wrapEnabled, setWrapEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const highlighted = useMemo(() => renderHighlightedZpl(rawInput), [rawInput]);

  const syncScroll = () => {
    if (!inputRef.current || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollTop = inputRef.current.scrollTop;
    highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  const handleBeautify = () => {
    onInputChange(beautifyZpl(rawInput));
  };

  const handleSave = () => {
    const didSave = onSaveCurrent?.() ?? false;
    if (!didSave) {
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  const handleCopy = async () => {
    if (!rawInput) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(rawInput);
      } else if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        document.execCommand("copy");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-header editor-panel-header">
        <h2>ZPL Input</h2>
        <div className="editor-actions">
          <button type="button" className={`editor-action-btn${copied ? " is-active" : ""}`} onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className={`editor-action-btn${wrapEnabled ? " is-active" : ""}`}
            onClick={() => setWrapEnabled((prev) => !prev)}
            aria-pressed={wrapEnabled}
          >
            Wrap: {wrapEnabled ? "ON" : "OFF"}
          </button>
          <button type="button" className="editor-action-btn" onClick={handleBeautify}>
            Beautify
          </button>
          <button
            type="button"
            className={`editor-action-btn${saved ? " is-active" : ""}`}
            onClick={handleSave}
            disabled={!rawInput.trim()}
          >
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
      <div className="editor-shell">
        <pre className={`editor-highlight${wrapEnabled ? " is-wrapped" : ""}`} ref={highlightRef} aria-hidden>
          {highlighted}
          {"\n"}
        </pre>
        <textarea
          ref={inputRef}
          className={`editor-input${wrapEnabled ? " is-wrapped" : ""}`}
          value={rawInput}
          onChange={(e) => onInputChange(e.target.value)}
          onScroll={syncScroll}
          placeholder="Paste ZPL, base64, or base64+gzip payload..."
          spellCheck={false}
        />
      </div>
    </section>
  );
}
