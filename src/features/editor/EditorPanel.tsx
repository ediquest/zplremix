import { useMemo, useRef } from "react";

type EditorPanelProps = {
  rawInput: string;
  onInputChange: (next: string) => void;
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

export function EditorPanel({ rawInput, onInputChange }: EditorPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const highlighted = useMemo(() => renderHighlightedZpl(rawInput), [rawInput]);

  const syncScroll = () => {
    if (!inputRef.current || !highlightRef.current) {
      return;
    }
    highlightRef.current.scrollTop = inputRef.current.scrollTop;
    highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>ZPL Input</h2>
      </div>
      <div className="editor-shell">
        <pre className="editor-highlight" ref={highlightRef} aria-hidden>
          {highlighted}
          {"\n"}
        </pre>
        <textarea
          ref={inputRef}
          className="editor-input"
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
