type EditorPanelProps = {
  rawInput: string;
  onInputChange: (next: string) => void;
};

export function EditorPanel({ rawInput, onInputChange }: EditorPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>ZPL Input</h2>
      </div>
      <textarea
        className="editor"
        value={rawInput}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Paste ZPL, base64, or base64+gzip payload..."
        spellCheck={false}
      />
    </section>
  );
}

