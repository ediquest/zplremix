import { useMemo, useState } from "react";
import { ZPL_EXAMPLES } from "./zplExamples";

type ZplExamplesPanelProps = {
  onLoadExample: (zpl: string) => void;
};

export function ZplExamplesPanel({ onLoadExample }: ZplExamplesPanelProps) {
  const [selectedId, setSelectedId] = useState<string>(ZPL_EXAMPLES[0]?.id ?? "");
  const selectedIndex = useMemo(
    () => Math.max(0, ZPL_EXAMPLES.findIndex((example) => example.id === selectedId)),
    [selectedId]
  );
  const selectedExample = ZPL_EXAMPLES[selectedIndex] ?? null;
  const atFirst = selectedIndex <= 0;
  const atLast = selectedIndex >= ZPL_EXAMPLES.length - 1;

  const selectIndex = (index: number) => {
    const bounded = Math.max(0, Math.min(ZPL_EXAMPLES.length - 1, index));
    const next = ZPL_EXAMPLES[bounded];
    if (!next) {
      return;
    }
    setSelectedId(next.id);
  };

  const loadCurrent = () => {
    if (!selectedExample) {
      return;
    }
    onLoadExample(selectedExample.zpl);
  };

  return (
    <section className="panel zpl-examples-panel">
      <div className="panel-header zpl-examples-header">
        <h2>ZPL Playground</h2>
        <p>
          Step {selectedIndex + 1}/{ZPL_EXAMPLES.length}
        </p>
      </div>
      <div className="zpl-examples-controls">
        <button type="button" className="editor-action-btn" disabled={atFirst} onClick={() => selectIndex(selectedIndex - 1)}>
          Previous
        </button>
        <button type="button" className="editor-action-btn" disabled={atLast} onClick={() => selectIndex(selectedIndex + 1)}>
          Next
        </button>
        <button type="button" className="editor-action-btn is-active" onClick={loadCurrent} disabled={!selectedExample}>
          Load To Editor
        </button>
      </div>
      <label className="zpl-examples-label" htmlFor="zpl-example-select">
        Example
      </label>
      <select
        id="zpl-example-select"
        className="zpl-examples-select"
        value={selectedExample?.id ?? ""}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        {ZPL_EXAMPLES.map((example, index) => (
          <option key={example.id} value={example.id}>
            {index + 1}. {example.title} ({example.command})
          </option>
        ))}
      </select>
      {selectedExample && (
        <article className="zpl-examples-card">
          <p className="zpl-examples-command">
            Command: <code>{selectedExample.command}</code>
          </p>
          <p className="zpl-examples-description">{selectedExample.description}</p>
          <pre className="zpl-examples-zpl">{selectedExample.zpl}</pre>
        </article>
      )}
    </section>
  );
}
