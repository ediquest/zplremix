import { useEffect, useMemo, useState } from "react";

type CodecMode = "base64" | "base64url" | "hex" | "url";
type EditSide = "zpl" | "encoded" | null;

const LIVE_DEBOUNCE_MS = 250;
const LIVE_MAX_CHARS = 500_000;

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function bytesToBinary(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return binary;
}

function binaryToBytes(binary: string): Uint8Array {
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Utf8(value: string): string {
  return window.btoa(bytesToBinary(encodeUtf8(value)));
}

function fromBase64Utf8(value: string): string {
  const compact = value.replace(/\s+/g, "");
  const padded = compact.length % 4 === 0 ? compact : compact + "=".repeat(4 - (compact.length % 4));
  return decodeUtf8(binaryToBytes(window.atob(padded)));
}

function toBase64UrlUtf8(value: string): string {
  return toBase64Utf8(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64UrlUtf8(value: string): string {
  const compact = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = compact.length % 4 === 0 ? compact : compact + "=".repeat(4 - (compact.length % 4));
  return decodeUtf8(binaryToBytes(window.atob(padded)));
}

function toHexUtf8(value: string): string {
  return Array.from(encodeUtf8(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHexUtf8(value: string): string {
  const compact = value.replace(/\s+/g, "").replace(/0x/gi, "");
  if (!compact.length) {
    return "";
  }
  if (compact.length % 2 !== 0 || /[^0-9a-f]/i.test(compact)) {
    throw new Error("invalid_hex");
  }
  const bytes = new Uint8Array(compact.length / 2);
  for (let index = 0; index < compact.length; index += 2) {
    bytes[index / 2] = Number.parseInt(compact.slice(index, index + 2), 16);
  }
  return decodeUtf8(bytes);
}

function toUrlEncoded(value: string): string {
  return encodeURIComponent(value);
}

function fromUrlEncoded(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, "%20"));
}

function encodeByMode(mode: CodecMode, value: string): string {
  if (mode === "base64") {
    return toBase64Utf8(value);
  }
  if (mode === "base64url") {
    return toBase64UrlUtf8(value);
  }
  if (mode === "hex") {
    return toHexUtf8(value);
  }
  return toUrlEncoded(value);
}

function decodeByMode(mode: CodecMode, value: string): string {
  if (mode === "base64") {
    return fromBase64Utf8(value);
  }
  if (mode === "base64url") {
    return fromBase64UrlUtf8(value);
  }
  if (mode === "hex") {
    return fromHexUtf8(value);
  }
  return fromUrlEncoded(value);
}

export function ZplCodecPage() {
  const [codecMode, setCodecMode] = useState<CodecMode>("base64");
  const [zplInput, setZplInput] = useState("^XA\n^FO30,30^A0N,40,40^FDZPL Remix^FS\n^XZ");
  const [encodedInput, setEncodedInput] = useState("");
  const [isSwapped, setIsSwapped] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [lastEdited, setLastEdited] = useState<EditSide>("zpl");
  const [error, setError] = useState<string | null>(null);
  const modeLabel =
    codecMode === "base64" ? "Base64" : codecMode === "base64url" ? "Base64url" : codecMode === "hex" ? "Hex" : "URL Encoded";
  const leftSide: Exclude<EditSide, null> = isSwapped ? "encoded" : "zpl";
  const rightSide: Exclude<EditSide, null> = isSwapped ? "zpl" : "encoded";
  const leftLabel = leftSide === "zpl" ? "ZPL Input" : `${modeLabel} Payload`;
  const rightLabel = rightSide === "zpl" ? "ZPL Input" : `${modeLabel} Payload`;
  const leftValue = leftSide === "zpl" ? zplInput : encodedInput;
  const rightValue = rightSide === "zpl" ? zplInput : encodedInput;
  const liveSourceLength = lastEdited === "encoded" ? encodedInput.length : zplInput.length;
  const liveSourceTooLarge = liveSourceLength > LIVE_MAX_CHARS;
  const liveHint = useMemo(() => {
    if (!liveEnabled) {
      return "Live mode OFF.";
    }
    if (liveSourceTooLarge) {
      return `Live mode paused for large payloads (> ${LIVE_MAX_CHARS.toLocaleString()} chars). Use buttons below.`;
    }
    return `Live mode ON (${LIVE_DEBOUNCE_MS} ms debounce).`;
  }, [liveEnabled, liveSourceTooLarge]);

  useEffect(() => {
    if (!liveEnabled || !lastEdited || liveSourceTooLarge) {
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        if (lastEdited === "zpl") {
          const next = encodeByMode(codecMode, zplInput);
          setEncodedInput((prev) => (prev === next ? prev : next));
        } else {
          const next = decodeByMode(codecMode, encodedInput);
          setZplInput((prev) => (prev === next ? prev : next));
        }
        setError(null);
      } catch {
        setError(`Invalid ${modeLabel} payload.`);
      }
    }, LIVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [codecMode, encodedInput, lastEdited, liveEnabled, liveSourceTooLarge, modeLabel, zplInput]);

  const handleEncode = () => {
    try {
      setError(null);
      setEncodedInput(encodeByMode(codecMode, zplInput));
      setLastEdited("zpl");
    } catch {
      setError(`Cannot encode with ${modeLabel}.`);
    }
  };

  const handleDecode = () => {
    try {
      setError(null);
      setZplInput(decodeByMode(codecMode, encodedInput));
      setLastEdited("encoded");
    } catch {
      setError(`Invalid ${modeLabel} payload.`);
    }
  };

  const handleSwap = () => {
    setError(null);
    setIsSwapped((prev) => !prev);
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setError(null);
    } catch {
      setError("Clipboard write failed.");
    }
  };

  const pasteTo = async (side: Exclude<EditSide, null>) => {
    try {
      const value = await navigator.clipboard.readText();
      if (side === "zpl") {
        setZplInput(value);
      } else {
        setEncodedInput(value);
      }
      setLastEdited(side);
      setError(null);
    } catch {
      setError("Clipboard read failed.");
    }
  };

  return (
    <section className="panel codec-panel">
      <div className="panel-header">
        <h2>ZPL Codec</h2>
        <p className="muted">Encode/decode ZPL using Base64, Base64url, Hex or URL encoding.</p>
      </div>
      <div className="codec-toolbar">
        <label htmlFor="codec-mode">Format</label>
        <select
          id="codec-mode"
          value={codecMode}
          onChange={(event) => {
            setCodecMode(event.target.value as CodecMode);
            setError(null);
          }}
        >
          <option value="base64">Base64</option>
          <option value="base64url">Base64url</option>
          <option value="hex">Hex</option>
          <option value="url">URL Encoded</option>
        </select>
        <label htmlFor="codec-live" className="codec-live-toggle">
          <input
            id="codec-live"
            type="checkbox"
            checked={liveEnabled}
            onChange={(event) => setLiveEnabled(event.target.checked)}
          />
          Live
        </label>
      </div>
      <p className="muted codec-live-hint">{liveHint}</p>
      <div className="codec-grid">
        <label className="codec-column">
          <span>{leftLabel}</span>
          <textarea
            value={leftValue}
            onChange={(event) => {
              if (leftSide === "zpl") {
                setZplInput(event.target.value);
                setLastEdited("zpl");
              } else {
                setEncodedInput(event.target.value);
                setLastEdited("encoded");
              }
            }}
            spellCheck={false}
          />
          <span className="codec-text-actions">
            <button type="button" className="codec-mini-btn" onClick={() => copyText(leftValue)}>
              Copy
            </button>
            <button type="button" className="codec-mini-btn" onClick={() => pasteTo(leftSide)}>
              Paste
            </button>
          </span>
        </label>
        <div className="codec-actions">
          <button type="button" className="download-btn" onClick={handleEncode}>
            {"Encode ->"}
          </button>
          <button type="button" className="download-btn" onClick={handleDecode}>
            {"<- Decode"}
          </button>
          <button type="button" className="download-btn" onClick={handleSwap}>
            Swap
          </button>
        </div>
        <label className="codec-column">
          <span>{rightLabel}</span>
          <textarea
            value={rightValue}
            onChange={(event) => {
              if (rightSide === "zpl") {
                setZplInput(event.target.value);
                setLastEdited("zpl");
              } else {
                setEncodedInput(event.target.value);
                setLastEdited("encoded");
              }
            }}
            spellCheck={false}
          />
          <span className="codec-text-actions">
            <button type="button" className="codec-mini-btn" onClick={() => copyText(rightValue)}>
              Copy
            </button>
            <button type="button" className="codec-mini-btn" onClick={() => pasteTo(rightSide)}>
              Paste
            </button>
          </span>
        </label>
      </div>
      {error && <div className="preview-warnings codec-error">{error}</div>}
    </section>
  );
}
