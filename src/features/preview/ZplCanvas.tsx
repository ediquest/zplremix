import { useEffect, useRef } from "react";
import bwipjs from "bwip-js";
import type { PrinterSettings } from "../../core/types";

type ZplCanvasProps = {
  zpl: string;
  onCode128DebugChange?: (debug: Code128DebugInfo | null) => void;
  onWarningsChange?: (warnings: string[]) => void;
  onDiagnosticsChange?: (diagnostics: ZplDiagnostic[]) => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  printerSettings?: PrinterSettings;
  showNonPrintableZones?: boolean;
  respectZplGeometry?: boolean;
};

type Orientation = "N" | "R" | "I" | "B";
type PositionMode = "FO" | "FT";
type BarcodeKind = "none" | "code128" | "code39" | "qr" | "datamatrix" | "pdf417" | "maxicode";

type FontState = {
  width: number;
  height: number;
  bold: boolean;
  orientation: Orientation;
  family: string;
  sourceName: string;
};

type BarcodeState = {
  kind: BarcodeKind;
  orientation: Orientation;
  moduleWidth: number;
  wideRatio: number;
  height: number;
  showText: boolean;
  showTextAbove: boolean;
  withCheckDigit: boolean;
  code128Mode: "N" | "U" | "A";
  qrModel: 1 | 2;
  qrErrorCorrection: "L" | "M" | "Q" | "H";
  qrMagnification: number;
  dataMatrixQuality: number;
  dataMatrixColumns: number;
  dataMatrixRows: number;
  dataMatrixFormat: "square" | "rectangle";
  dataMatrixEscapeChar: string;
  pdf417SecurityLevel: number;
  pdf417Columns: number;
  pdf417Rows: number;
  pdf417Truncate: boolean;
  maxicodeMode: number;
};

type TextLayout = {
  lines: string[];
  offsets: number[];
  fontPx: number;
  lineHeight: number;
  width: number;
  height: number;
  baseline: number;
  stretch: number;
  fontWeight: "500" | "700";
  family: string;
};

type BarcodeLayout = {
  width: number;
  height: number;
  symbolWidth: number;
  symbolHeight: number;
  symbolOffsetY: number;
  textHeight: number;
  textGap: number;
  moduleWidth: number;
  barHeight: number;
  printedText: string;
};

type ZplToken = {
  prefix: "^" | "~";
  command: string;
  args: string;
  offset: number;
  line: number;
};

type GraphicField = {
  bytesPerRow: number;
  rowCount: number;
  bytes: Uint8Array;
};

type PrintOrientation = "N" | "I";
type FieldBlockAlign = "L" | "C" | "R" | "J";

type FieldBlockState = {
  width: number;
  maxLines: number;
  lineSpacing: number;
  align: FieldBlockAlign;
  hangingIndent: number;
};

type FieldTemplate = {
  x: number;
  y: number;
  positionMode: PositionMode;
  font: FontState;
  barcode: BarcodeState;
  reverse: boolean;
  fieldBlock: FieldBlockState | null;
};

type SerialState = {
  current: string;
  increment: number;
  pad: number;
};

type Code128Token = { type: "char"; value: string } | { type: "fnc1" };
type EncodingMode = "utf-8" | "cp1250" | "cp1252";
type Gs1FieldDebug = {
  ai: string;
  data: string;
  fixedLength: boolean;
  insertedFnc1After: boolean;
};

export type Code128DebugInfo = {
  mode: "N" | "U" | "A";
  rawValue: string;
  parsedAsGs1: boolean;
  fields: Gs1FieldDebug[];
  autoFnc1Count: number;
};

export type ZplDiagnosticSeverity = "info" | "warning" | "error";
export type ZplDiagnosticImpact = "low" | "medium" | "high";
export type ZplDiagnosticKind =
  | "unsupported_command"
  | "invalid_args"
  | "fallback_used"
  | "data_warning";

export type ZplDiagnostic = {
  line: number;
  command: string;
  severity: ZplDiagnosticSeverity;
  impact: ZplDiagnosticImpact;
  kind: ZplDiagnosticKind;
  message: string;
};

type DrawResult = {
  code128Debug: Code128DebugInfo | null;
  warnings: string[];
  diagnostics: ZplDiagnostic[];
};

type DrawRenderOptions = {
  withChrome: boolean;
  fitToCanvas: boolean;
  textScale: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const LABEL_WIDTH = 812;
const LABEL_HEIGHT = 1218;
const PADDING = 24;
const QR_DRAW_ADJUST = 0.50;
const QR_X_SHIFT_DOTS = 18;
const QR_Y_SHIFT_DOTS = 72;

const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  model: "Zebra GK420d",
  densityDpmm: 8,
  dpi: 203,
  quality: "grayscale",
  labelWidth: 4,
  labelHeight: 6,
  labelUnit: "in",
  showLabelIndex: 1,
  showLabelCount: 1
};

const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn"
};

const CODE39_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212",
  "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221",
  "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221",
  "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131",
  "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131",
  "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242",
  "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311",
  "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
] as const;

const CP1250_CHARS = new Set(
  Array.from(new TextDecoder("windows-1250").decode(Uint8Array.from(Array.from({ length: 256 }, (_, i) => i))))
);
const CP1252_CHARS = new Set(
  Array.from(new TextDecoder("windows-1252").decode(Uint8Array.from(Array.from({ length: 256 }, (_, i) => i))))
);

function decoderFor(encoding: EncodingMode): TextDecoder {
  if (encoding === "cp1250") {
    return new TextDecoder("windows-1250", { fatal: false });
  }
  if (encoding === "cp1252") {
    return new TextDecoder("windows-1252", { fatal: false });
  }
  return new TextDecoder("utf-8", { fatal: false });
}

function canEncodeChar(char: string, encoding: EncodingMode): boolean {
  if (encoding === "utf-8") {
    return true;
  }
  if (encoding === "cp1250") {
    return CP1250_CHARS.has(char);
  }
  return CP1252_CHARS.has(char);
}

function resolveEncoding(ciArg: string | undefined): EncodingMode | null {
  const value = (ciArg ?? "").trim().toLowerCase();
  if (!value) {
    return null;
  }

  if (value === "28" || value === "utf-8" || value === "utf8") {
    return "utf-8";
  }
  if (value === "29" || value === "1250" || value === "cp1250" || value === "windows-1250") {
    return "cp1250";
  }
  if (value === "27" || value === "1252" || value === "cp1252" || value === "windows-1252") {
    return "cp1252";
  }
  return null;
}

function isHexPair(value: string): boolean {
  return /^[0-9a-fA-F]{2}$/.test(value);
}

function decodeFieldHex(value: string, indicator: string, encoding: EncodingMode): { text: string; invalidSequences: number } {
  const bytes: number[] = [];
  let output = "";
  let invalidSequences = 0;

  const flushBytes = () => {
    if (!bytes.length) {
      return;
    }
    output += decoderFor(encoding).decode(Uint8Array.from(bytes));
    bytes.length = 0;
  };

  for (let i = 0; i < value.length; i += 1) {
    const current = value[i];
    if (current === indicator) {
      const maybeHex = value.slice(i + 1, i + 3);
      if (isHexPair(maybeHex)) {
        bytes.push(parseInt(maybeHex, 16));
        i += 2;
        continue;
      }
      invalidSequences += 1;
    }

    flushBytes();
    output += current;
  }

  flushBytes();
  return { text: output, invalidSequences };
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isNumeric(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return Number.isFinite(Number(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function splitLeadingArgs(value: string, count: number): string[] {
  if (count <= 1) {
    return [value];
  }
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length && parts.length < count - 1; i += 1) {
    if (value[i] === ",") {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  while (parts.length < count) {
    parts.push("");
  }
  return parts;
}

function tokenizeZplCommands(zpl: string): ZplToken[] {
  const tokens: ZplToken[] = [];
  let line = 1;
  for (let i = 0; i < zpl.length; i += 1) {
    const prefix = zpl[i];
    if (prefix === "\n") {
      line += 1;
      continue;
    }
    if (prefix !== "^" && prefix !== "~") {
      continue;
    }
    const command = zpl.slice(i + 1, i + 3);
    if (command.length < 2) {
      continue;
    }
    const startLine = line;
    let end = i + 3;
    while (end < zpl.length && zpl[end] !== "^" && zpl[end] !== "~") {
      if (zpl[end] === "\n") {
        line += 1;
      }
      end += 1;
    }
    tokens.push({
      prefix,
      command: command.toUpperCase(),
      args: zpl.slice(i + 3, end),
      offset: i,
      line: startLine
    });
    i = end - 1;
  }
  return tokens;
}

function normalizeGraphicName(rawName: string): string {
  let normalized = rawName.trim().toUpperCase();
  if (!normalized) {
    return "";
  }
  if (!normalized.includes(":")) {
    normalized = `R:${normalized}`;
  }
  if (!normalized.includes(".")) {
    normalized = `${normalized}.GRF`;
  }
  return normalized;
}

function parseAsciiHexGraphic(
  hexData: string,
  bytesPerRow: number,
  rowCount: number,
  context: string,
  addWarning: (message: string) => void
): Uint8Array | null {
  const cleaned = hexData.replace(/\s+/g, "");
  if (!cleaned) {
    addWarning(`${context}: graphic data is empty.`);
    return null;
  }
  if (/[^0-9A-Fa-f]/.test(cleaned)) {
    addWarning(`${context}: compressed/non-hex graphic data is not supported yet.`);
    return null;
  }

  const expectedBytes = bytesPerRow * rowCount;
  if (expectedBytes <= 0) {
    addWarning(`${context}: invalid graphic dimensions.`);
    return null;
  }

  const usableHexLength = cleaned.length - (cleaned.length % 2);
  if (usableHexLength !== cleaned.length) {
    addWarning(`${context}: odd-length hex payload; the last nibble was ignored.`);
  }
  const decodedBytes = Math.floor(usableHexLength / 2);
  const bytes = new Uint8Array(expectedBytes);
  const copyBytes = Math.min(expectedBytes, decodedBytes);

  for (let i = 0; i < copyBytes; i += 1) {
    bytes[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }

  if (decodedBytes < expectedBytes) {
    addWarning(`${context}: graphic payload is shorter than declared size; missing bytes were padded.`);
  } else if (decodedBytes > expectedBytes) {
    addWarning(`${context}: graphic payload is longer than declared size; extra bytes were ignored.`);
  }

  return bytes;
}

function parseGraphicField(
  formatRaw: string,
  totalBytesRaw: string,
  bytesUsedRaw: string,
  bytesPerRowRaw: string,
  dataRaw: string,
  context: string,
  addWarning: (message: string) => void
): GraphicField | null {
  const format = (formatRaw || "A").trim().toUpperCase();
  if (format !== "A") {
    addWarning(`${context}: format "${format}" is not supported yet (supported: A).`);
    return null;
  }

  const bytesPerRow = Math.max(0, parseInteger(bytesPerRowRaw, 0));
  const declaredTotalBytes = Math.max(0, parseInteger(totalBytesRaw, 0));
  const declaredBytesUsed = Math.max(0, parseInteger(bytesUsedRaw, 0));
  if (bytesPerRow <= 0) {
    addWarning(`${context}: bytes-per-row must be greater than 0.`);
    return null;
  }

  let rowCount = 0;
  if (declaredBytesUsed > 0) {
    rowCount = Math.max(1, Math.ceil(declaredBytesUsed / bytesPerRow));
  } else if (declaredTotalBytes > 0) {
    rowCount = Math.max(1, Math.ceil(declaredTotalBytes / bytesPerRow));
  }
  if (rowCount <= 0) {
    addWarning(`${context}: row count cannot be resolved.`);
    return null;
  }

  const bytes = parseAsciiHexGraphic(dataRaw, bytesPerRow, rowCount, context, addWarning);
  if (!bytes) {
    return null;
  }

  return {
    bytesPerRow,
    rowCount,
    bytes
  };
}

function snapToPixel(value: number): number {
  return Math.round(value);
}

function invertRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const left = Math.max(0, snapToPixel(x));
  const top = Math.max(0, snapToPixel(y));
  const w = Math.max(0, snapToPixel(width));
  const h = Math.max(0, snapToPixel(height));
  if (!w || !h) {
    return;
  }

  const maxW = Math.max(0, ctx.canvas.width - left);
  const maxH = Math.max(0, ctx.canvas.height - top);
  const safeW = Math.min(w, maxW);
  const safeH = Math.min(h, maxH);
  if (!safeW || !safeH) {
    return;
  }

  const image = ctx.getImageData(left, top, safeW, safeH);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(image, left, top);
}

function parseDataMatrixEscapes(
  value: string,
  escapeChar: string,
  addWarning: (message: string) => void
): string {
  if (!escapeChar) {
    return value;
  }

  let output = "";
  for (let i = 0; i < value.length; i += 1) {
    const current = value[i];
    if (current !== escapeChar) {
      output += current;
      continue;
    }

    const next = value[i + 1];
    if (!next) {
      output += current;
      continue;
    }

    if (next === escapeChar) {
      output += escapeChar;
      i += 1;
      continue;
    }

    if (next === "1") {
      output += "^FNC1";
      i += 1;
      continue;
    }

    if (next === "d") {
      const digits = value.slice(i + 2, i + 5);
      if (/^\d{3}$/.test(digits)) {
        const decimal = Number.parseInt(digits, 10);
        output += String.fromCharCode(clamp(decimal, 0, 255));
        i += 4;
        continue;
      }
      addWarning(`Invalid DataMatrix escape sequence "${escapeChar}d".`);
      output += current;
      continue;
    }

    const code = next.charCodeAt(0);
    if (code >= 64 && code <= 95) {
      output += String.fromCharCode(code - 64);
      i += 1;
      continue;
    }

    if (next === "3") {
      output += "^PROG";
      i += 1;
      continue;
    }

    if (next === "2") {
      addWarning(
        `DataMatrix escape ${escapeChar}2 (FNC2) is not supported by the current renderer.`
      );
      i += 1;
      continue;
    }

    output += current;
  }

  return output;
}

function isOrientation(value: string | undefined): value is Orientation {
  if (!value) {
    return false;
  }
  return value === "N" || value === "R" || value === "I" || value === "B";
}

function parseOrientation(value: string | undefined, fallback: Orientation): Orientation {
  const next = value?.trim().toUpperCase();
  return isOrientation(next) ? next : fallback;
}

function parsePrintOrientation(
  value: string | undefined,
  fallback: PrintOrientation,
  addWarning?: (message: string) => void
): PrintOrientation {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "N" || normalized === "I") {
    return normalized;
  }
  if (addWarning) {
    addWarning(`Unsupported ^PO value "${value}". Supported values are N and I.`);
  }
  return fallback;
}

function parseFieldBlockAlign(value: string | undefined): FieldBlockAlign {
  const normalized = (value ?? "L").trim().toUpperCase();
  if (normalized === "C" || normalized === "R" || normalized === "J") {
    return normalized;
  }
  return "L";
}

function parseFieldNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function impactForCommand(command: string): ZplDiagnosticImpact {
  if (
    command === "PW"
    || command === "LL"
    || command === "LH"
    || command === "LT"
    || command === "LS"
    || command === "PO"
    || command === "GF"
    || command === "DG"
    || command === "XG"
  ) {
    return "high";
  }
  if (
    command === "B7"
    || command === "BD"
    || command === "BC"
    || command === "BX"
    || command === "BQ"
    || command === "FB"
    || command === "A@"
  ) {
    return "medium";
  }
  return "low";
}

function densityDpmmToDpi(density: number): number {
  if (density === 24) {
    return 600;
  }
  if (density === 12) {
    return 300;
  }
  return 203;
}

function nonPrintableMarginsDots(printerSettings: PrinterSettings): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const model = printerSettings.model.toUpperCase();
  const dpi = printerSettings.dpi;
  const base = Math.max(1, Math.round((dpi / 203) * 8));
  if (model.includes("GK")) {
    return { left: base + 2, right: base + 2, top: base, bottom: base };
  }
  if (model.includes("ZD")) {
    return { left: base + 1, right: base + 1, top: base, bottom: base };
  }
  if (model.includes("ZT")) {
    return { left: base, right: base, top: base, bottom: base };
  }
  return { left: base, right: base, top: base, bottom: base };
}

function isDecimalInteger(value: string): boolean {
  return /^-?\d+$/.test(value.trim());
}

function formatSerialValue(value: string, pad: number): string {
  const trimmed = value.trim();
  if (pad <= 0 || !isDecimalInteger(trimmed)) {
    return trimmed;
  }
  const negative = trimmed.startsWith("-");
  const digits = negative ? trimmed.slice(1) : trimmed;
  const padded = digits.padStart(pad, "0");
  return negative ? `-${padded}` : padded;
}

function incrementSerialValue(current: string, increment: number): string {
  const trimmed = current.trim();
  if (!isDecimalInteger(trimmed)) {
    return trimmed;
  }
  try {
    return (BigInt(trimmed) + BigInt(increment)).toString();
  } catch {
    return trimmed;
  }
}

function rotateOrientation180(orientation: Orientation): Orientation {
  if (orientation === "N") {
    return "I";
  }
  if (orientation === "I") {
    return "N";
  }
  if (orientation === "R") {
    return "B";
  }
  return "R";
}

function rotationFor(orientation: Orientation): number {
  if (orientation === "R") {
    return Math.PI / 2;
  }
  if (orientation === "I") {
    return Math.PI;
  }
  if (orientation === "B") {
    return -Math.PI / 2;
  }
  return 0;
}

function rotatePoint(x: number, y: number, orientation: Orientation): { x: number; y: number } {
  if (orientation === "R") {
    return { x: -y, y: x };
  }
  if (orientation === "I") {
    return { x: -x, y: -y };
  }
  if (orientation === "B") {
    return { x: y, y: -x };
  }
  return { x, y };
}

function drawAtAnchor(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  anchorY: number,
  orientation: Orientation,
  localAnchorX: number,
  localAnchorY: number,
  draw: () => void
) {
  const rotatedAnchor = rotatePoint(localAnchorX, localAnchorY, orientation);
  const tx = anchorX - rotatedAnchor.x;
  const ty = anchorY - rotatedAnchor.y;

  ctx.save();
  ctx.translate(tx, ty);
  const rotation = rotationFor(orientation);
  if (rotation !== 0) {
    ctx.rotate(rotation);
  }
  draw();
  ctx.restore();
}

function orientedAabb(
  anchorX: number,
  anchorY: number,
  orientation: Orientation,
  localAnchorX: number,
  localAnchorY: number,
  width: number,
  height: number
): Rect {
  const rotatedAnchor = rotatePoint(localAnchorX, localAnchorY, orientation);
  const tx = anchorX - rotatedAnchor.x;
  const ty = anchorY - rotatedAnchor.y;
  const corners = [
    rotatePoint(0, 0, orientation),
    rotatePoint(width, 0, orientation),
    rotatePoint(width, height, orientation),
    rotatePoint(0, height, orientation)
  ].map((point) => ({ x: tx + point.x, y: ty + point.y }));
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  };
}

function rectInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
  );
}

function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
  );
}

function normalizeZplText(value: string): string {
  return value.replace(/\\&/g, "\n").replace(/_0D_0A|_0A|_0D/g, "\n").trim();
}

function normalizeQrFieldData(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^([A-Za-z0-9]{2}),(.*)$/s);
  if (!match) {
    return trimmed;
  }
  return match[2];
}

function parseQrFieldData(value: string): {
  text: string;
  eclevel: "L" | "M" | "Q" | "H" | null;
} {
  const trimmed = value.trim();
  const match = trimmed.match(/^([LMQH])([ANMD]),(.*)$/s);
  if (!match) {
    return { text: normalizeQrFieldData(trimmed), eclevel: null };
  }
  const eclevel = match[1] as "L" | "M" | "Q" | "H";
  return { text: match[3], eclevel };
}

function resolveFontFamily(sourceName: string): string {
  const normalized = sourceName.trim().toUpperCase();
  if (!normalized) {
    return "'Segoe UI', Arial, sans-serif";
  }
  if (
    normalized.includes("OCR")
    || normalized.includes("MONO")
    || normalized.includes("COURIER")
    || normalized.startsWith("R:TT")
  ) {
    return "'Courier New', monospace";
  }
  if (normalized.includes("SWISS") || normalized.includes("HELV")) {
    return "Arial, 'Helvetica Neue', sans-serif";
  }
  if (normalized.includes("DUTCH") || normalized.includes("ROMAN") || normalized.includes("SERIF")) {
    return "'Times New Roman', Times, serif";
  }
  return "'Segoe UI', Arial, sans-serif";
}

function lineWidthWithStretch(ctx: CanvasRenderingContext2D, line: string, stretch: number): number {
  return ctx.measureText(line).width * stretch;
}

function wrapTextForFieldBlock(
  ctx: CanvasRenderingContext2D,
  rawLines: string[],
  maxWidth: number,
  stretch: number
): string[] {
  const wrapped: string[] = [];
  const safeWidth = Math.max(1, maxWidth);

  const breakLongWord = (word: string): string[] => {
    if (!word) {
      return [""];
    }
    const chunks: string[] = [];
    let current = "";
    for (const char of word) {
      const candidate = `${current}${char}`;
      if (!current || lineWidthWithStretch(ctx, candidate, stretch) <= safeWidth) {
        current = candidate;
      } else {
        chunks.push(current);
        current = char;
      }
    }
    if (current) {
      chunks.push(current);
    }
    return chunks.length ? chunks : [word];
  };

  rawLines.forEach((line) => {
    const source = line.trim();
    if (!source) {
      wrapped.push("");
      return;
    }

    const words = source.split(/\s+/);
    let currentLine = "";
    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (lineWidthWithStretch(ctx, candidate, stretch) <= safeWidth) {
        currentLine = candidate;
        return;
      }

      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = "";
      }

      if (lineWidthWithStretch(ctx, word, stretch) <= safeWidth) {
        currentLine = word;
        return;
      }

      const chunks = breakLongWord(word);
      chunks.forEach((chunk, index) => {
        if (index < chunks.length - 1) {
          wrapped.push(chunk);
        } else {
          currentLine = chunk;
        }
      });
    });

    wrapped.push(currentLine);
  });

  return wrapped;
}

function measureTextLayout(
  ctx: CanvasRenderingContext2D,
  value: string,
  font: FontState,
  scale: number,
  fieldBlock: FieldBlockState | null = null
): TextLayout {
  const fontPx = Math.max(9, font.height * scale);
  const baseLineHeight = fontPx * 1.2;
  const fontWeight: "500" | "700" = font.bold ? "700" : "500";
  const stretch = clamp(font.width / Math.max(1, font.height), 0.65, 1.6);
  const family = font.family || "'Segoe UI', Arial, sans-serif";

  ctx.save();
  ctx.font = `${fontWeight} ${fontPx}px ${family}`;
  const baseLines = value.split("\n");
  let lines = baseLines;
  let offsets = new Array(lines.length).fill(0);
  let width =
    lines.reduce((maxWidth, line) => Math.max(maxWidth, lineWidthWithStretch(ctx, line, stretch)), 0);
  let lineHeight = baseLineHeight;

  if (fieldBlock) {
    const blockWidth = Math.max(1, fieldBlock.width * scale);
    const hangingIndentPx = Math.max(0, fieldBlock.hangingIndent * scale);
    const wrappedWidth = Math.max(1, blockWidth - hangingIndentPx);
    lines = wrapTextForFieldBlock(ctx, baseLines, wrappedWidth, stretch);
    if (fieldBlock.maxLines > 0) {
      lines = lines.slice(0, fieldBlock.maxLines);
    }
    width = blockWidth;
    lineHeight = baseLineHeight + fieldBlock.lineSpacing * scale;
    offsets = lines.map((line, index) => {
      const baseIndent = index > 0 ? hangingIndentPx : 0;
      const availableWidth = Math.max(1, blockWidth - baseIndent);
      const lineWidth = lineWidthWithStretch(ctx, line, stretch);
      if (fieldBlock.align === "C") {
        return baseIndent + Math.max(0, (availableWidth - lineWidth) / 2);
      }
      if (fieldBlock.align === "R") {
        return baseIndent + Math.max(0, availableWidth - lineWidth);
      }
      return baseIndent;
    });
  }
  ctx.restore();

  return {
    lines,
    offsets,
    fontPx,
    lineHeight,
    width,
    height: Math.max(lineHeight, Math.max(1, lines.length) * lineHeight),
    baseline: fontPx * 0.8,
    stretch,
    fontWeight,
    family
  };
}

function drawTextLayout(ctx: CanvasRenderingContext2D, layout: TextLayout) {
  ctx.font = `${layout.fontWeight} ${layout.fontPx}px ${layout.family}`;
  ctx.textBaseline = "top";
  if (layout.stretch !== 1) {
    layout.lines.forEach((line, index) => {
      ctx.save();
      const offsetX = layout.offsets[index] ?? 0;
      ctx.translate(offsetX, index * layout.lineHeight);
      ctx.scale(layout.stretch, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    return;
  }

  layout.lines.forEach((line, index) => {
    const offsetX = layout.offsets[index] ?? 0;
    ctx.fillText(line, offsetX, index * layout.lineHeight);
  });
}

function code128PatternForChar(charCode: number): number[] {
  const normalized = clamp(charCode, 0, CODE128_PATTERNS.length - 1);
  return CODE128_PATTERNS[normalized].split("").map((item) => Number(item));
}

function code128ValueForChar(char: string): number {
  const charCode = char.charCodeAt(0);
  if (charCode >= 32 && charCode <= 127) {
    return charCode - 32;
  }
  return "?".charCodeAt(0) - 32;
}

function sanitizeCode128Char(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 127) {
    return char;
  }
  return "?";
}

function tokenizeCode128Segment(value: string): { tokens: Code128Token[]; printable: string } {
  const source = value || "0";
  const tokens: Code128Token[] = [];
  const printableChars: string[] = [];

  for (let i = 0; i < source.length; i += 1) {
    const current = source[i];
    const next = source[i + 1];
    // Zebra-style escape commonly used for FNC1 in ^FD for Code128.
    if (current === ">" && next === "8") {
      tokens.push({ type: "fnc1" });
      i += 1;
      continue;
    }
    if (current === "\u001d") {
      tokens.push({ type: "fnc1" });
      continue;
    }
    const sanitized = sanitizeCode128Char(current);
    tokens.push({ type: "char", value: sanitized });
    printableChars.push(sanitized);
  }

  return { tokens, printable: printableChars.join("") };
}

function gs1AiFixedLength(ai: string): number | undefined {
  if (ai.length === 4) {
    const family = ai.slice(0, 2);
    if (family === "31" || family === "32" || family === "33" || family === "34" || family === "35" || family === "36") {
      return 6;
    }
  }
  if (ai === "00") return 18;
  if (ai === "01") return 14;
  if (ai === "02") return 14;
  if (ai === "11" || ai === "12" || ai === "13" || ai === "15" || ai === "16" || ai === "17") return 6;
  if (ai === "20") return 2;
  if (ai === "402") return 17;
  if (ai === "410" || ai === "411" || ai === "412" || ai === "413" || ai === "414" || ai === "415" || ai === "416") return 13;
  if (ai === "422" || ai === "424" || ai === "425" || ai === "426") return 3;
  return undefined;
}

function parseGs1AiNotation(
  value: string
): { parsed: boolean; tokens: Code128Token[]; printable: string; fields: Gs1FieldDebug[]; autoFnc1Count: number } {
  const source = value || "";
  if (!source.includes("(")) {
    return { parsed: false, tokens: [], printable: "", fields: [], autoFnc1Count: 0 };
  }

  const aiMatches = Array.from(source.matchAll(/\((\d{2,4})\)/g));
  if (!aiMatches.length) {
    return { parsed: false, tokens: [], printable: "", fields: [], autoFnc1Count: 0 };
  }

  const fields = aiMatches.map((match, index) => {
    const ai = match[1];
    const aiStart = match.index ?? 0;
    const dataStart = aiStart + match[0].length;
    const nextStart = index + 1 < aiMatches.length ? (aiMatches[index + 1].index ?? source.length) : source.length;
    const data = source.slice(dataStart, nextStart);
    return { ai, data };
  });

  const tokens: Code128Token[] = [];
  const printableParts: string[] = [];
  const debugFields: Gs1FieldDebug[] = [];
  let autoFnc1Count = 0;
  fields.forEach((field, index) => {
    const aiTokenized = tokenizeCode128Segment(field.ai);
    const dataTokenized = tokenizeCode128Segment(field.data);
    tokens.push(...aiTokenized.tokens, ...dataTokenized.tokens);
    printableParts.push(`(${field.ai})${field.data}`);

    const currentAiFixedLength = gs1AiFixedLength(field.ai);
    const hasNextField = index < fields.length - 1;
    const insertedFnc1After = hasNextField && currentAiFixedLength === undefined;
    if (insertedFnc1After) {
      tokens.push({ type: "fnc1" });
      autoFnc1Count += 1;
    }
    debugFields.push({
      ai: field.ai,
      data: field.data,
      fixedLength: currentAiFixedLength !== undefined,
      insertedFnc1After
    });
  });

  return {
    parsed: true,
    tokens,
    printable: printableParts.join(""),
    fields: debugFields,
    autoFnc1Count
  };
}

function parseCode128Input(
  value: string,
  mode: "N" | "U" | "A"
): { tokens: Code128Token[]; printable: string; parsedAsGs1: boolean; fields: Gs1FieldDebug[]; autoFnc1Count: number } {
  if (mode === "A") {
    const gs1Parsed = parseGs1AiNotation(value);
    if (gs1Parsed.parsed) {
      if (!gs1Parsed.tokens.length) {
        return {
          tokens: [{ type: "char", value: "0" }],
          printable: "0",
          parsedAsGs1: true,
          fields: gs1Parsed.fields,
          autoFnc1Count: gs1Parsed.autoFnc1Count
        };
      }
      return {
        tokens: gs1Parsed.tokens,
        printable: gs1Parsed.printable,
        parsedAsGs1: true,
        fields: gs1Parsed.fields,
        autoFnc1Count: gs1Parsed.autoFnc1Count
      };
    }
  }

  const tokenized = tokenizeCode128Segment(value);
  const tokens = [...tokenized.tokens];
  if (!tokens.length) {
    tokens.push({ type: "char", value: "0" });
    return { tokens, printable: "0", parsedAsGs1: false, fields: [], autoFnc1Count: 0 };
  }

  return {
    tokens,
    printable: tokenized.printable,
    parsedAsGs1: false,
    fields: [],
    autoFnc1Count: 0
  };
}

function countDigitRun(
  tokens: Code128Token[],
  startIndex: number
): number {
  let length = 0;
  for (let i = startIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== "char" || token.value < "0" || token.value > "9") {
      break;
    }
    length += 1;
  }
  return length;
}

function encodeCode128(value: string, mode: "N" | "U" | "A"): { codes: number[]; printable: string } {
  const parsed = parseCode128Input(value, mode);
  const tokens = parsed.tokens;
  const startCodeB = 104;
  const codeSetB = 100;
  const codeSetC = 99;
  const fnc1 = 102;
  const dataCodes: number[] = [];
  let activeSet: "B" | "C" = "B";
  let index = 0;

  if (mode === "U" || mode === "A") {
    dataCodes.push(fnc1);
  }

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "fnc1") {
      dataCodes.push(fnc1);
      index += 1;
      continue;
    }

    const digitRun = countDigitRun(tokens, index);
    const canUseSetC = mode !== "N" && digitRun >= 4;
    if (canUseSetC) {
      if (activeSet !== "C") {
        dataCodes.push(codeSetC);
        activeSet = "C";
      }
      let pairCount = Math.floor(digitRun / 2);
      while (pairCount > 0) {
        const left = tokens[index];
        const right = tokens[index + 1];
        if (left?.type !== "char" || right?.type !== "char") {
          break;
        }
        dataCodes.push(Number(`${left.value}${right.value}`));
        index += 2;
        pairCount -= 1;
      }
      continue;
    }

    if (activeSet !== "B") {
      dataCodes.push(codeSetB);
      activeSet = "B";
    }
    dataCodes.push(code128ValueForChar(token.value));
    index += 1;
  }

  let checksum = startCodeB;
  dataCodes.forEach((code, position) => {
    checksum += code * (position + 1);
  });
  checksum %= 103;
  return {
    codes: [startCodeB, ...dataCodes, checksum, 106],
    printable: parsed.printable
  };
}

function buildCode128DebugInfo(value: string, mode: "N" | "U" | "A"): Code128DebugInfo {
  const parsed = parseCode128Input(value, mode);
  return {
    mode,
    rawValue: value,
    parsedAsGs1: parsed.parsedAsGs1,
    fields: parsed.fields,
    autoFnc1Count: parsed.autoFnc1Count
  };
}

function code128Width(encoded: { codes: number[] }, moduleWidth: number): number {
  const quietZone = moduleWidth * 10;
  let units = 0; 
  encoded.codes.forEach((code) => {
    code128PatternForChar(code).forEach((part) => {
      units += part;
    });
  });

  return quietZone * 2 + units * moduleWidth;
}

function drawCode128(
  ctx: CanvasRenderingContext2D,
  encoded: { codes: number[] },
  moduleWidth: number,
  barHeight: number
) {
  let cursorX = moduleWidth * 10;
  const drawPattern = (pattern: number[]) => {
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] * moduleWidth;
      if (i % 2 === 0) {
        ctx.fillRect(cursorX, 0, Math.max(1, width), barHeight);
      }
      cursorX += width;
    }
  };

  encoded.codes.forEach((code) => {
    drawPattern(code128PatternForChar(code));
  });
}

function normalizeCode39Value(value: string): string {
  return value
    .toUpperCase()
    .split("")
    .map((char) => (CODE39_PATTERNS[char] ? char : "-"))
    .join("");
}

function code39ChecksumChar(value: string): string {
  let sum = 0;
  for (let i = 0; i < value.length; i += 1) {
    const index = CODE39_ALPHABET.indexOf(value[i]);
    if (index >= 0) {
      sum += index;
    }
  }
  return CODE39_ALPHABET[sum % CODE39_ALPHABET.length] ?? "0";
}

function prepareCode39(value: string, withCheckDigit: boolean): { payload: string; printedText: string } {
  let printedText = normalizeCode39Value(value || "0");
  if (withCheckDigit) {
    printedText = `${printedText}${code39ChecksumChar(printedText)}`;
  }
  return {
    payload: `*${printedText}*`,
    printedText
  };
}

function code39Width(payload: string, moduleWidth: number, wideRatio: number): number {
  let total = moduleWidth * 16;
  for (let charIndex = 0; charIndex < payload.length; charIndex += 1) {
    const pattern = CODE39_PATTERNS[payload[charIndex]] ?? CODE39_PATTERNS["-"];
    for (let i = 0; i < pattern.length; i += 1) {
      total += moduleWidth * (pattern[i] === "w" ? wideRatio : 1);
    }
    total += moduleWidth;
  }
  return total;
}

function drawCode39(
  ctx: CanvasRenderingContext2D,
  payload: string,
  moduleWidth: number,
  wideRatio: number,
  barHeight: number
) {
  let cursorX = moduleWidth * 8;
  for (let charIndex = 0; charIndex < payload.length; charIndex += 1) {
    const pattern = CODE39_PATTERNS[payload[charIndex]] ?? CODE39_PATTERNS["-"];
    for (let i = 0; i < pattern.length; i += 1) {
      const width = moduleWidth * (pattern[i] === "w" ? wideRatio : 1);
      if (i % 2 === 0) {
        ctx.fillRect(cursorX, 0, Math.max(1, width), barHeight);
      }
      cursorX += width;
    }
    cursorX += moduleWidth;
  }
}

function render2dBarcode(
  value: string,
  barcode: BarcodeState,
  scale: number,
  reverse: boolean,
  addWarning: (message: string) => void
): HTMLCanvasElement | null {
  const bcid =
    barcode.kind === "qr"
      ? "qrcode"
      : barcode.kind === "datamatrix"
        ? "datamatrix"
        : barcode.kind === "pdf417"
          ? "pdf417"
          : "maxicode";
  const symbolCanvas = document.createElement("canvas");
  const text = value || "0";
  const baseScale =
    barcode.kind === "qr"
      ? barcode.qrMagnification
      : barcode.kind === "maxicode"
        ? barcode.moduleWidth * barcode.qrMagnification * scale
        : barcode.moduleWidth * scale;
  const symbolScale = Math.max(1, Math.min(12, Math.round(baseScale)));

  try {
    const options: Record<string, string | number | boolean> = {
      bcid,
      text,
      scale: symbolScale,
      includetext: false,
      parse: true,
      parsefnc: true,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF",
      barcolor: reverse ? "FFFFFF" : "111827"
    };

    if (barcode.kind === "qr") {
      options.eclevel = barcode.qrErrorCorrection;
    } else if (barcode.kind === "datamatrix") {
      options.format = barcode.dataMatrixFormat;
      if (barcode.dataMatrixColumns > 0) {
        options.columns = barcode.dataMatrixColumns;
      }
      if (barcode.dataMatrixRows > 0) {
        options.rows = barcode.dataMatrixRows;
      }
    } else if (barcode.kind === "pdf417") {
      if (barcode.pdf417Columns > 0) {
        options.columns = barcode.pdf417Columns;
      }
      if (barcode.pdf417Rows > 0) {
        options.rows = barcode.pdf417Rows;
      }
      if (barcode.pdf417SecurityLevel >= 0) {
        options.securitylevel = barcode.pdf417SecurityLevel;
      }
      if (barcode.pdf417Truncate) {
        options.compact = true;
      }
    } else if (barcode.kind === "maxicode") {
      options.mode = barcode.maxicodeMode;
    }

    bwipjs.toCanvas(symbolCanvas, options as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
    return symbolCanvas;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown renderer error";
    addWarning(`Could not render ${bcid}: ${reason}`);
    return null;
  }
}

function buildBarcodeLayout(value: string, barcode: BarcodeState, scale: number): BarcodeLayout {
  const moduleWidth = Math.max(1, barcode.moduleWidth * scale);
  const barHeight = Math.max(24, barcode.height * scale);
  const textHeight = barcode.showText && barcode.kind !== "qr"
    ? Math.max(8, Math.min(11, barHeight * 0.16))
    : 0;
  const textGap = textHeight > 0 ? Math.max(2, 3 * scale) : 0;

  if (barcode.kind === "code39") {
    const prepared = prepareCode39(value, barcode.withCheckDigit);
    const symbolWidth = code39Width(
      prepared.payload,
      moduleWidth,
      Math.max(2, Math.round(barcode.wideRatio))
    );
    const symbolOffsetY = barcode.showTextAbove ? textHeight + textGap : 0;
    return {
      width: symbolWidth,
      height: symbolOffsetY + barHeight + (barcode.showTextAbove ? 0 : textHeight + textGap),
      symbolWidth,
      symbolHeight: barHeight,
      symbolOffsetY,
      textHeight,
      textGap,
      moduleWidth,
      barHeight,
      printedText: prepared.printedText
    };
  }

  const encoded = encodeCode128(value, barcode.code128Mode);
  const symbolWidth = code128Width(encoded, moduleWidth);
  const symbolOffsetY = barcode.showTextAbove ? textHeight + textGap : 0;
  return {
    width: symbolWidth,
    height: symbolOffsetY + barHeight + (barcode.showTextAbove ? 0 : textHeight + textGap),
    symbolWidth,
    symbolHeight: barHeight,
    symbolOffsetY,
    textHeight,
    textGap,
    moduleWidth,
    barHeight,
    printedText: encoded.printable
  };
}

function drawTextField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  font: FontState,
  positionMode: PositionMode,
  scale: number,
  reverse: boolean,
  fieldBlock: FieldBlockState | null
): Rect {
  const layout = measureTextLayout(ctx, value, font, scale, fieldBlock);
  const anchorY = positionMode === "FT" ? layout.baseline : 0;

  drawAtAnchor(ctx, x, y, font.orientation, 0, anchorY, () => {
    ctx.fillStyle = reverse ? "#ffffff" : "#111827";
    drawTextLayout(ctx, layout);
  });
  return orientedAabb(x, y, font.orientation, 0, anchorY, layout.width, layout.height);
}

function drawBarcodeField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  barcode: BarcodeState,
  positionMode: PositionMode,
  scale: number,
  reverse: boolean,
  addWarning: (message: string) => void
): Rect | null {
  if (
    barcode.kind === "qr"
    || barcode.kind === "datamatrix"
    || barcode.kind === "pdf417"
    || barcode.kind === "maxicode"
  ) {
    const symbolCanvas = render2dBarcode(value, barcode, scale, reverse, addWarning);
    if (!symbolCanvas) {
      return null;
    }
    let symbolWidth = symbolCanvas.width;
    let symbolHeight = symbolCanvas.height;
    let drawX = x;
    let drawY = y;
    if (barcode.kind === "qr") {
      symbolWidth = Math.max(1, snapToPixel(symbolCanvas.width * scale * QR_DRAW_ADJUST));
      symbolHeight = Math.max(1, snapToPixel(symbolCanvas.height * scale * QR_DRAW_ADJUST));
      drawX += QR_X_SHIFT_DOTS * scale;
      drawY += QR_Y_SHIFT_DOTS * scale;
    }
    const anchorY = positionMode === "FT" ? symbolHeight : 0;

    drawAtAnchor(ctx, drawX, drawY, barcode.orientation, 0, anchorY, () => {
      if (reverse) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, symbolWidth, symbolHeight);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(symbolCanvas, 0, 0, symbolWidth, symbolHeight);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(0, 0, symbolWidth, symbolHeight);
    });
    return orientedAabb(drawX, drawY, barcode.orientation, 0, anchorY, symbolWidth, symbolHeight);
  }

  const layout = buildBarcodeLayout(value, barcode, scale);
  const anchorY = positionMode === "FT" ? layout.height : 0;

  drawAtAnchor(ctx, x, y, barcode.orientation, 0, anchorY, () => {
    ctx.fillStyle = reverse ? "#ffffff" : "#111827";

    if (barcode.kind === "code39") {
      const prepared = prepareCode39(value, barcode.withCheckDigit);
      ctx.save();
      ctx.translate(0, layout.symbolOffsetY);
      drawCode39(
        ctx,
        prepared.payload,
        layout.moduleWidth,
        Math.max(2, Math.round(barcode.wideRatio)),
        layout.barHeight
      );
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(0, layout.symbolOffsetY);
      drawCode128(ctx, encodeCode128(value, barcode.code128Mode), layout.moduleWidth, layout.barHeight);
      ctx.restore();
    }

    if (barcode.showText) {
      const textY = barcode.showTextAbove
        ? 0
        : layout.symbolOffsetY + layout.symbolHeight + layout.textGap;
      const isSmallCode128 = barcode.kind === "code128" && layout.barHeight <= 90;
      ctx.font = `${layout.textHeight}px 'Courier New', monospace`;
      ctx.textBaseline = "top";
      const textWidth = ctx.measureText(layout.printedText).width;
      const baseTextX = Math.max(0, (layout.symbolWidth - textWidth) / 2);
      const smallCode128Nudge = isSmallCode128 ? layout.moduleWidth * 24 : 0;
      const textX = isSmallCode128
        ? Math.max(0, baseTextX + smallCode128Nudge)
        : Math.min(
          Math.max(0, layout.symbolWidth - textWidth),
          baseTextX + smallCode128Nudge
        );
      ctx.fillText(layout.printedText, textX, textY);
    }
  });
  return orientedAabb(x, y, barcode.orientation, 0, anchorY, layout.width, layout.height);
}

function drawGraphicBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number,
  scale: number,
  reverse: boolean
): Rect {
  const pxThickness = Math.max(1, snapToPixel(thickness * scale));
  const pxWidth = Math.max(1, snapToPixel(width * scale));
  const pxHeight = Math.max(1, snapToPixel(height * scale));
  const pxX = snapToPixel(x);
  const pxY = snapToPixel(y);
  if (reverse) {
    // Zebra-like ^FR behavior for ^GB: invert pixels inside the field box.
    invertRect(ctx, pxX, pxY, pxWidth, pxHeight);
    return { x: pxX, y: pxY, width: pxWidth, height: pxHeight };
  }

  ctx.fillStyle = "#111827";

  if (pxHeight <= pxThickness || pxWidth <= pxThickness) {
    ctx.fillRect(pxX, pxY, pxWidth, pxHeight);
    return { x: pxX, y: pxY, width: pxWidth, height: pxHeight };
  }

  ctx.fillRect(pxX, pxY, pxWidth, pxThickness);
  ctx.fillRect(pxX, pxY + pxHeight - pxThickness, pxWidth, pxThickness);
  ctx.fillRect(pxX, pxY, pxThickness, pxHeight);
  ctx.fillRect(pxX + pxWidth - pxThickness, pxY, pxThickness, pxHeight);
  return { x: pxX, y: pxY, width: pxWidth, height: pxHeight };
}

function labelSizeToDots(size: number, unit: "in" | "mm" | "cm", dpi: number): number {
  const safeSize = Math.max(0.1, size);
  if (unit === "cm") {
    return Math.max(1, Math.round((safeSize / 2.54) * dpi));
  }
  if (unit === "mm") {
    return Math.max(1, Math.round((safeSize / 25.4) * dpi));
  }
  return Math.max(1, Math.round(safeSize * dpi));
}

function resolveLabelGeometryWithProfile(
  tokens: ZplToken[],
  printerSettings: PrinterSettings,
  respectZplGeometry: boolean
): { printWidth: number; labelLength: number } {
  const defaultPrintWidth = labelSizeToDots(
    printerSettings.labelWidth,
    printerSettings.labelUnit,
    printerSettings.dpi
  );
  const defaultLabelLength = labelSizeToDots(
    printerSettings.labelHeight,
    printerSettings.labelUnit,
    printerSettings.dpi
  );
  let printWidth = defaultPrintWidth;
  let labelLength = defaultLabelLength;

  if (!respectZplGeometry) {
    return { printWidth, labelLength };
  }

  tokens.forEach((token) => {
    if (token.prefix !== "^") {
      return;
    }
    const parts = token.args.split(",");
    if (token.command === "PW") {
      printWidth = clamp(parseInteger(parts[0], printWidth), 1, 32000);
      return;
    }
    if (token.command === "LL") {
      labelLength = clamp(parseInteger(parts[0], labelLength), 1, 32000);
    }
  });

  return { printWidth, labelLength };
}

function createGraphicCanvas(
  graphic: GraphicField,
  color: { r: number; g: number; b: number } = { r: 17, g: 24, b: 39 }
): HTMLCanvasElement {
  const width = Math.max(1, graphic.bytesPerRow * 8);
  const height = Math.max(1, graphic.rowCount);
  const graphicCanvas = document.createElement("canvas");
  graphicCanvas.width = width;
  graphicCanvas.height = height;
  const graphicCtx = graphicCanvas.getContext("2d");
  if (!graphicCtx) {
    return graphicCanvas;
  }

  const imageData = graphicCtx.createImageData(width, height);
  const pixelData = imageData.data;
  for (let y = 0; y < graphic.rowCount; y += 1) {
    const rowOffset = y * graphic.bytesPerRow;
    for (let byteIndex = 0; byteIndex < graphic.bytesPerRow; byteIndex += 1) {
      const byte = graphic.bytes[rowOffset + byteIndex] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        if (((byte >> (7 - bit)) & 1) === 0) {
          continue;
        }
        const x = byteIndex * 8 + bit;
        const pixelOffset = (y * width + x) * 4;
        pixelData[pixelOffset] = color.r;
        pixelData[pixelOffset + 1] = color.g;
        pixelData[pixelOffset + 2] = color.b;
        pixelData[pixelOffset + 3] = 255;
      }
    }
  }
  graphicCtx.putImageData(imageData, 0, 0);
  return graphicCanvas;
}

function drawGraphicField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  graphic: GraphicField,
  orientation: Orientation,
  positionMode: PositionMode,
  scale: number,
  reverse: boolean,
  magnificationX = 1,
  magnificationY = 1
): Rect {
  const bitmapCanvas = createGraphicCanvas(
    graphic,
    reverse ? { r: 255, g: 255, b: 255 } : { r: 17, g: 24, b: 39 }
  );
  const drawWidth = Math.max(1, snapToPixel(bitmapCanvas.width * scale * Math.max(1, magnificationX)));
  const drawHeight = Math.max(1, snapToPixel(bitmapCanvas.height * scale * Math.max(1, magnificationY)));
  const anchorY = positionMode === "FT" ? drawHeight : 0;

  drawAtAnchor(ctx, x, y, orientation, 0, anchorY, () => {
    if (reverse) {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, drawWidth, drawHeight);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmapCanvas, 0, 0, drawWidth, drawHeight);
  });
  return orientedAabb(x, y, orientation, 0, anchorY, drawWidth, drawHeight);
}

function drawZplPreview(
  canvas: HTMLCanvasElement,
  zpl: string,
  printerSettings: PrinterSettings = DEFAULT_PRINTER_SETTINGS,
  showNonPrintableZones = true,
  respectZplGeometry = true,
  renderOptions: DrawRenderOptions = { withChrome: true, fitToCanvas: true, textScale: 1 }
): DrawResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      code128Debug: null,
      warnings: ["Canvas context is unavailable."],
      diagnostics: [
        {
          line: 1,
          command: "CANVAS",
          severity: "error",
          impact: "high",
          kind: "data_warning",
          message: "Canvas context is unavailable."
        }
      ]
    };
  }

  const width = canvas.width;
  const height = canvas.height;
  const tokens = tokenizeZplCommands(zpl);
  const geometry = resolveLabelGeometryWithProfile(tokens, printerSettings, respectZplGeometry);
  const scale = renderOptions.fitToCanvas
    ? Math.min((width - PADDING * 2) / geometry.printWidth, (height - PADDING * 2) / geometry.labelLength)
    : 1;
  const textScale = Math.max(0.5, renderOptions.textScale || 1);
  const renderLabelWidth = snapToPixel(geometry.printWidth * scale);
  const renderLabelHeight = snapToPixel(geometry.labelLength * scale);
  const originX = renderOptions.fitToCanvas ? snapToPixel((width - renderLabelWidth) / 2) : 0;
  const originY = renderOptions.fitToCanvas ? snapToPixel((height - renderLabelHeight) / 2) : 0;
  const labelRect: Rect = {
    x: originX,
    y: originY,
    width: renderLabelWidth,
    height: renderLabelHeight
  };
  const marginsDots = nonPrintableMarginsDots(printerSettings);
  const printableRect: Rect = {
    x: originX + marginsDots.left * scale,
    y: originY + marginsDots.top * scale,
    width: Math.max(0, renderLabelWidth - (marginsDots.left + marginsDots.right) * scale),
    height: Math.max(0, renderLabelHeight - (marginsDots.top + marginsDots.bottom) * scale)
  };

  ctx.clearRect(0, 0, width, height);
  if (renderOptions.withChrome) {
    ctx.fillStyle = "#e6effb";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(originX, originY, renderLabelWidth, renderLabelHeight);
    ctx.strokeStyle = "#9caec9";
    ctx.strokeRect(originX, originY, renderLabelWidth, renderLabelHeight);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  if (
    renderOptions.withChrome
    && showNonPrintableZones
    && marginsDots.left + marginsDots.right + marginsDots.top + marginsDots.bottom > 0
  ) {
    ctx.save();
    ctx.fillStyle = "rgba(239, 68, 68, 0.08)";
    if (printableRect.y > labelRect.y) {
      ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, printableRect.y - labelRect.y);
    }
    const printableBottom = printableRect.y + printableRect.height;
    const labelBottom = labelRect.y + labelRect.height;
    if (printableBottom < labelBottom) {
      ctx.fillRect(labelRect.x, printableBottom, labelRect.width, labelBottom - printableBottom);
    }
    if (printableRect.x > labelRect.x) {
      ctx.fillRect(labelRect.x, printableRect.y, printableRect.x - labelRect.x, printableRect.height);
    }
    const printableRight = printableRect.x + printableRect.width;
    const labelRight = labelRect.x + labelRect.width;
    if (printableRight < labelRight) {
      ctx.fillRect(printableRight, printableRect.y, labelRight - printableRight, printableRect.height);
    }
    ctx.restore();
  }

  let cursorX = 0;
  let cursorY = 0;
  let positionMode: PositionMode = "FO";
  let defaultOrientation: Orientation = "N";
  let printOrientation: PrintOrientation = "N";
  let labelHomeX = 0;
  let labelHomeY = 0;
  let labelTop = 0;
  let labelShift = 0;
  let printWidth = geometry.printWidth;
  let labelLength = geometry.labelLength;
  let fieldReverse = false;
  let latestCode128Debug: Code128DebugInfo | null = null;
  let encoding: EncodingMode = "cp1252";
  let fieldHexIndicator: string | null = null;
  let fieldBlock: FieldBlockState | null = null;
  let currentFieldNumber: number | null = null;
  let currentFieldHadData = false;
  const downloadedGraphics = new Map<string, GraphicField>();
  const fieldTemplates = new Map<number, FieldTemplate>();
  const fieldValues = new Map<number, string>();
  const fieldSerials = new Map<number, SerialState>();
  const diagnostics: ZplDiagnostic[] = [];
  const diagnosticKeys = new Set<string>();
  const warningSet = new Set<string>();
  let activeToken: ZplToken | null = null;
  const addDiagnostic = (
    message: string,
    options: {
      severity?: ZplDiagnosticSeverity;
      impact?: ZplDiagnosticImpact;
      kind?: ZplDiagnosticKind;
      command?: string;
      line?: number;
    } = {}
  ) => {
    const line = options.line ?? activeToken?.line ?? 1;
    const command = (options.command ?? activeToken?.command ?? "UNKNOWN").toUpperCase();
    const severity = options.severity ?? "warning";
    const impact = options.impact ?? impactForCommand(command);
    const kind = options.kind ?? "data_warning";
    const key = `${line}|${command}|${severity}|${impact}|${kind}|${message}`;
    if (!diagnosticKeys.has(key)) {
      diagnostics.push({
        line,
        command,
        severity,
        impact,
        kind,
        message
      });
      diagnosticKeys.add(key);
    }
    if (severity !== "info") {
      warningSet.add(`L${line} ^${command}: ${message}`);
    }
  };
  const addWarning = (message: string) => {
    addDiagnostic(message, { severity: "warning", kind: "data_warning" });
  };
  const expectedDpi = densityDpmmToDpi(printerSettings.densityDpmm);
  if (expectedDpi !== printerSettings.dpi) {
    addDiagnostic(
      `Printer profile has inconsistent density (${printerSettings.densityDpmm} dpmm) and dpi (${printerSettings.dpi}).`,
      {
        line: 1,
        command: "PROFILE",
        severity: "warning",
        impact: "low",
        kind: "invalid_args"
      }
    );
  }
  if (printerSettings.quality === "binary") {
    addDiagnostic("Binary print quality enabled (preview remains anti-aliased).", {
      line: 1,
      command: "PROFILE",
      severity: "info",
      impact: "low",
      kind: "fallback_used"
    });
  }
  let font: FontState = {
    width: 24,
    height: 24,
    bold: false,
    orientation: "N",
    family: "'Segoe UI', Arial, sans-serif",
    sourceName: "A0"
  };
  let barcode: BarcodeState = {
    kind: "none",
    orientation: "N",
    moduleWidth: 2,
    wideRatio: 3,
    height: 80,
    showText: true,
    showTextAbove: false,
    withCheckDigit: false,
    code128Mode: "N",
    qrModel: 2,
    qrErrorCorrection: "M",
    qrMagnification: 3,
    dataMatrixQuality: 200,
    dataMatrixColumns: 0,
    dataMatrixRows: 0,
    dataMatrixFormat: "square",
    dataMatrixEscapeChar: "_",
    pdf417SecurityLevel: -1,
    pdf417Columns: 0,
    pdf417Rows: 0,
    pdf417Truncate: false,
    maxicodeMode: 4
  };
  const orientWithPrint = (orientation: Orientation): Orientation =>
    printOrientation === "I" ? rotateOrientation180(orientation) : orientation;
  const projectToCanvas = (x: number, y: number): { x: number; y: number } => {
    let resolvedX = x + labelHomeX + labelShift;
    let resolvedY = y + labelHomeY + labelTop;
    if (printOrientation === "I") {
      resolvedX = printWidth - resolvedX;
      resolvedY = labelLength - resolvedY;
    }
    return {
      x: originX + resolvedX * scale,
      y: originY + resolvedY * scale
    };
  };
  const decodeFieldValue = (raw: string): string => {
    const normalized = normalizeZplText(raw);
    const maybeHexDecoded = fieldHexIndicator
      ? decodeFieldHex(normalized, fieldHexIndicator, encoding)
      : { text: normalized, invalidSequences: 0 };
    if (maybeHexDecoded.invalidSequences > 0 && fieldHexIndicator) {
      addWarning(`^FH contains ${maybeHexDecoded.invalidSequences} invalid hex sequence(s).`);
    }
    const value = maybeHexDecoded.text
      .split("")
      .map((char) => (canEncodeChar(char, encoding) ? char : "?"))
      .join("");
    if (value !== maybeHexDecoded.text) {
      addWarning(`Some characters cannot be encoded as ${encoding}. They were replaced with "?".`);
    }
    return value;
  };
  const resolveFieldTemplate = (): FieldTemplate | null => {
    if (currentFieldNumber === null) {
      return null;
    }
    return fieldTemplates.get(currentFieldNumber) ?? null;
  };
  const drawResolvedValue = (resolvedValue: string) => {
    const template = resolveFieldTemplate();
    const drawX = template?.x ?? cursorX;
    const drawY = template?.y ?? cursorY;
    const drawPositionMode = template?.positionMode ?? positionMode;
    const drawFont = template?.font ?? font;
    const drawBarcode = template?.barcode ?? barcode;
    const drawReverse = template?.reverse ?? fieldReverse;
    const drawFieldBlock = template?.fieldBlock ?? fieldBlock;
    const point = projectToCanvas(drawX, drawY);
    const checkPlacement = (bounds: Rect | null) => {
      if (!bounds) {
        return;
      }
      if (!rectInside(bounds, labelRect)) {
        addDiagnostic("Element is outside printable label bounds.", {
          kind: "data_warning",
          severity: "warning",
          impact: "high"
        });
      } else if (!rectInside(bounds, printableRect)) {
        addDiagnostic("Element touches non-printable printer margin.", {
          kind: "data_warning",
          severity: "warning",
          impact: "medium"
        });
      }
    };
    if (drawBarcode.kind === "none") {
      const compactNumericValue = /^\d{1,3}$/.test(resolvedValue);
      const qtyLikeNumberShiftX = compactNumericValue
        && !drawFieldBlock
        && drawPositionMode === "FO"
        && drawFont.height >= 28
        && drawFont.height <= 42
        ? -Math.max(6, drawFont.width * scale * 0.3)
        : 0;
      const bounds = drawTextField(
        ctx,
        point.x + qtyLikeNumberShiftX,
        point.y,
        resolvedValue,
        { ...drawFont, orientation: orientWithPrint(drawFont.orientation) },
        drawPositionMode,
        scale * textScale,
        drawReverse,
        drawFieldBlock
      );
      checkPlacement(bounds);
      return;
    }
    const barcodeValue =
      drawBarcode.kind === "datamatrix"
        ? parseDataMatrixEscapes(resolvedValue, drawBarcode.dataMatrixEscapeChar, addWarning)
        : drawBarcode.kind === "qr"
          ? parseQrFieldData(resolvedValue).text
        : resolvedValue;
    const qrData = drawBarcode.kind === "qr" ? parseQrFieldData(resolvedValue) : null;
    const barcodeForDraw =
      drawBarcode.kind === "qr" && qrData?.eclevel
        ? { ...drawBarcode, qrErrorCorrection: qrData.eclevel }
        : drawBarcode;
    if (drawBarcode.kind === "code128" && drawBarcode.code128Mode === "A") {
      latestCode128Debug = buildCode128DebugInfo(barcodeValue, drawBarcode.code128Mode);
    }
    const bounds = drawBarcodeField(
      ctx,
      point.x,
      point.y,
      barcodeValue,
      { ...barcodeForDraw, orientation: orientWithPrint(barcodeForDraw.orientation) },
      drawPositionMode,
      scale,
      drawReverse,
      addWarning
    );
    checkPlacement(bounds);
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(originX, originY, renderLabelWidth, renderLabelHeight);
  ctx.clip();

  tokens.forEach((token) => {
    activeToken = token;
    const command = token.command;
    const args = token.args;
    const parts = args.split(",");

    if (command === "FO") {
      cursorX = parseNumber(parts[0], cursorX);
      cursorY = parseNumber(parts[1], cursorY);
      positionMode = "FO";
      return;
    }

    if (command === "FT") {
      cursorX = parseNumber(parts[0], cursorX);
      cursorY = parseNumber(parts[1], cursorY);
      positionMode = "FT";
      return;
    }

    if (command === "FW") {
      defaultOrientation = parseOrientation(parts[0], defaultOrientation);
      font.orientation = defaultOrientation;
      barcode.orientation = defaultOrientation;
      return;
    }

    if (command === "PW") {
      printWidth = clamp(parseInteger(parts[0], printWidth), 1, 32000);
      return;
    }

    if (command === "LL") {
      labelLength = clamp(parseInteger(parts[0], labelLength), 1, 32000);
      return;
    }

    if (command === "LH") {
      labelHomeX = parseNumber(parts[0], labelHomeX);
      labelHomeY = parseNumber(parts[1], labelHomeY);
      return;
    }

    if (command === "LT") {
      labelTop = parseNumber(parts[0], labelTop);
      return;
    }

    if (command === "LS") {
      labelShift = parseNumber(parts[0], labelShift);
      return;
    }

    if (command === "PO") {
      printOrientation = parsePrintOrientation(parts[0], printOrientation, addWarning);
      return;
    }

    if (command === "GB") {
      const boxWidth = parseNumber(parts[0], 0);
      const boxHeight = parseNumber(parts[1], 0);
      const thickness = Math.max(1, parseNumber(parts[2], 1));
      const point = projectToCanvas(cursorX, cursorY);
      const bounds = drawGraphicBox(
        ctx,
        point.x,
        point.y,
        boxWidth,
        boxHeight,
        thickness,
        scale,
        fieldReverse
      );
      if (!rectInside(bounds, labelRect)) {
        addDiagnostic("Graphic box exceeds label bounds.", {
          kind: "data_warning",
          severity: "warning",
          impact: "high"
        });
      } else if (!rectInside(bounds, printableRect)) {
        addDiagnostic("Graphic box touches non-printable printer margin.", {
          kind: "data_warning",
          severity: "warning",
          impact: "medium"
        });
      }
      return;
    }

    if (command === "DG" && token.prefix === "~") {
      const [nameRaw, totalRaw, bytesPerRowRaw, dataRaw] = splitLeadingArgs(args, 4);
      const normalizedName = normalizeGraphicName(nameRaw);
      if (!normalizedName) {
        addWarning("~DG command without a valid graphic name was ignored.");
        return;
      }
      const bytesPerRow = Math.max(0, parseInteger(bytesPerRowRaw, 0));
      const totalBytes = Math.max(0, parseInteger(totalRaw, 0));
      if (bytesPerRow <= 0 || totalBytes <= 0) {
        addWarning(`~DG ${normalizedName}: invalid dimensions (total=${totalRaw}, row=${bytesPerRowRaw}).`);
        return;
      }
      const rowCount = Math.max(1, Math.ceil(totalBytes / bytesPerRow));
      const bytes = parseAsciiHexGraphic(
        dataRaw,
        bytesPerRow,
        rowCount,
        `~DG ${normalizedName}`,
        addWarning
      );
      if (!bytes) {
        return;
      }
      downloadedGraphics.set(normalizedName, {
        bytesPerRow,
        rowCount,
        bytes
      });
      return;
    }

    if (command === "CF") {
      // Supports both ^CFf,h,w and ^CFA,h,w (arrives as command CF with args A,h,w).
      const cfHeight = parseNumber(parts[1], font.height);
      const cfWidth = parseNumber(parts[2], cfHeight);
      const cfaHeight = parseNumber(parts[1], font.height);
      const cfaWidth = parseNumber(parts[2], cfaHeight);
      const firstArg = parts[0]?.trim().toUpperCase();
      const isLikelyCfa = firstArg?.length === 1 && !isNumeric(firstArg) && isNumeric(parts[1]);
      const height = isLikelyCfa ? cfaHeight : cfHeight;
      const width = isLikelyCfa ? cfaWidth : cfWidth;
      if (!isLikelyCfa && firstArg && firstArg !== "0" && firstArg !== "A") {
        addWarning(`Font "${firstArg}" is not available in preview. Falling back to A0.`);
      }
      const sourceName = (firstArg && firstArg.length === 1 ? `A${firstArg}` : "A0").toUpperCase();
      font = {
        ...font,
        width,
        height,
        bold: height >= 40,
        orientation: defaultOrientation,
        sourceName,
        family: resolveFontFamily(sourceName)
      };
      return;
    }

    if (command === "A0") {
      const sourceName = `A0${(parts[0] ?? "").trim().toUpperCase()}`;
      font = {
        width: parseNumber(parts[2], font.width),
        height: parseNumber(parts[1], font.height),
        bold: parseNumber(parts[1], font.height) >= 40,
        orientation: parseOrientation(parts[0], defaultOrientation),
        sourceName,
        family: resolveFontFamily(sourceName)
      };
      return;
    }

    if (command === "A@") {
      const sourceName = (parts[3] ?? "").trim();
      if (!sourceName) {
        addWarning("^A@ is missing font reference. Keeping current font.");
        return;
      }
      const nextHeight = parseNumber(parts[1], font.height);
      const nextWidth = parseNumber(parts[2], nextHeight || font.width);
      font = {
        width: nextWidth,
        height: nextHeight,
        bold: nextHeight >= 40,
        orientation: parseOrientation(parts[0], defaultOrientation),
        sourceName,
        family: resolveFontFamily(sourceName)
      };
      return;
    }

    if (command.startsWith("A") && command !== "A0") {
      addDiagnostic(`Command ^${command} is not supported yet. Using A0 fallback where possible.`, {
        kind: "fallback_used",
        severity: "warning",
        impact: "medium"
      });
      return;
    }

    if (command === "CI") {
      const nextEncoding = resolveEncoding(parts[0]);
      if (!nextEncoding) {
        addWarning(`Unsupported ^CI value "${parts[0] ?? ""}". Keeping current encoding.`);
        return;
      }
      encoding = nextEncoding;
      return;
    }

    if (command === "FH") {
      const indicator = (parts[0] ?? "_").trim();
      fieldHexIndicator = indicator ? indicator[0] : "_";
      return;
    }

    if (command === "FN") {
      const fieldNumber = parseFieldNumber(parts[0]);
      if (fieldNumber === null) {
        addWarning(`Invalid ^FN value "${parts[0] ?? ""}".`);
        currentFieldNumber = null;
        currentFieldHadData = false;
        return;
      }
      currentFieldNumber = fieldNumber;
      currentFieldHadData = false;
      return;
    }

    if (command === "BY") {
      barcode.moduleWidth = parseNumber(parts[0], barcode.moduleWidth);
      barcode.wideRatio = Math.max(2, parseNumber(parts[1], barcode.wideRatio));
      barcode.height = parseNumber(parts[2], barcode.height);
      return;
    }

    if (command === "GF") {
      const [formatRaw, totalRaw, bytesUsedRaw, bytesPerRowRaw, dataRaw] = splitLeadingArgs(args, 5);
      const graphic = parseGraphicField(
        formatRaw,
        totalRaw,
        bytesUsedRaw,
        bytesPerRowRaw,
        dataRaw,
        "^GF",
        addWarning
      );
      if (!graphic) {
        return;
      }
      const point = projectToCanvas(cursorX, cursorY);
      const bounds = drawGraphicField(
        ctx,
        point.x,
        point.y,
        graphic,
        orientWithPrint(defaultOrientation),
        positionMode,
        scale,
        fieldReverse
      );
      if (!rectInside(bounds, labelRect)) {
        addDiagnostic("Graphic field exceeds label bounds.", {
          kind: "data_warning",
          severity: "warning",
          impact: "high"
        });
      } else if (!rectInside(bounds, printableRect)) {
        addDiagnostic("Graphic field touches non-printable printer margin.", {
          kind: "data_warning",
          severity: "warning",
          impact: "medium"
        });
      }
      return;
    }

    if (command === "XG") {
      const [nameRaw, magnificationXRaw, magnificationYRaw] = splitLeadingArgs(args, 3);
      const normalizedName = normalizeGraphicName(nameRaw);
      if (!normalizedName) {
        addWarning("^XG command without a valid graphic name was ignored.");
        return;
      }
      const graphic = downloadedGraphics.get(normalizedName);
      if (!graphic) {
        addWarning(`^XG could not find graphic "${normalizedName}".`);
        return;
      }
      const magnificationX = Math.max(1, parseInteger(magnificationXRaw, 1));
      const magnificationY = Math.max(1, parseInteger(magnificationYRaw, 1));
      const point = projectToCanvas(cursorX, cursorY);
      const bounds = drawGraphicField(
        ctx,
        point.x,
        point.y,
        graphic,
        orientWithPrint(defaultOrientation),
        positionMode,
        scale,
        fieldReverse,
        magnificationX,
        magnificationY
      );
      if (!rectInside(bounds, labelRect)) {
        addDiagnostic("Referenced graphic exceeds label bounds.", {
          kind: "data_warning",
          severity: "warning",
          impact: "high"
        });
      } else if (!rectInside(bounds, printableRect)) {
        addDiagnostic("Referenced graphic touches non-printable printer margin.", {
          kind: "data_warning",
          severity: "warning",
          impact: "medium"
        });
      }
      return;
    }

    if (command === "FR") {
      fieldReverse = (parts[0] ?? "Y").trim().toUpperCase() !== "N";
      return;
    }

    if (command === "FB") {
      const widthDots = Math.max(1, parseNumber(parts[0], 1));
      const maxLines = Math.max(0, parseInteger(parts[1], 0));
      const lineSpacing = parseNumber(parts[2], 0);
      const align = parseFieldBlockAlign(parts[3]);
      const hangingIndent = Math.max(0, parseNumber(parts[4], 0));
      if (align === "J") {
        addWarning("^FB justification 'J' is approximated in preview.");
      }
      fieldBlock = {
        width: widthDots,
        maxLines,
        lineSpacing,
        align,
        hangingIndent
      };
      return;
    }

    if (command === "FV") {
      if (currentFieldNumber === null) {
        addWarning("^FV used without active ^FN field number.");
      }
      const decoded = decodeFieldValue(args);
      if (!decoded && decoded !== "") {
        return;
      }
      if (currentFieldNumber !== null) {
        fieldValues.set(currentFieldNumber, decoded);
      }
      drawResolvedValue(decoded);
      currentFieldHadData = true;
      return;
    }

    if (command === "SN") {
      const startRaw = (parts[0] ?? "0").trim();
      const increment = parseInteger(parts[1], 1);
      const pad = Math.max(0, parseInteger(parts[2], 0));
      const serialKey = currentFieldNumber;
      const existing = serialKey !== null ? fieldSerials.get(serialKey) : null;
      const state: SerialState =
        existing && !(parts[0] ?? "").trim()
          ? existing
          : {
              current: startRaw || "0",
              increment,
              pad
            };
      const displayValue = formatSerialValue(state.current, state.pad);
      drawResolvedValue(displayValue);
      if (serialKey !== null) {
        fieldValues.set(serialKey, displayValue);
        fieldSerials.set(serialKey, {
          ...state,
          current: incrementSerialValue(state.current, state.increment)
        });
      }
      if (!isDecimalInteger(state.current) && state.increment !== 0) {
        addWarning("^SN increment works only for numeric values in preview.");
      }
      currentFieldHadData = true;
      return;
    }

    if (command === "BC") {
      const mode = (parts[5] ?? "N").trim().toUpperCase();
      barcode = {
        ...barcode,
        kind: "code128",
        orientation: parseOrientation(parts[0], defaultOrientation),
        height: parseNumber(parts[1], barcode.height),
        showText: (parts[2] ?? "Y").toUpperCase() === "Y",
        showTextAbove: (parts[3] ?? "N").toUpperCase() === "Y",
        withCheckDigit: (parts[4] ?? "N").toUpperCase() === "Y",
        code128Mode: mode === "U" || mode === "A" ? mode : "N"
      };
      return;
    }

    if (command === "B3") {
      barcode = {
        ...barcode,
        kind: "code39",
        orientation: parseOrientation(parts[0], defaultOrientation),
        withCheckDigit: (parts[1] ?? "N").toUpperCase() === "Y",
        height: parseNumber(parts[2], barcode.height),
        showText: (parts[3] ?? "Y").toUpperCase() === "Y",
        showTextAbove: (parts[4] ?? "N").toUpperCase() === "Y"
      };
      return;
    }

    if (command === "BQ") {
      const modelRaw = parseInteger(parts[1], barcode.qrModel);
      const model = modelRaw === 1 || modelRaw === 2 ? modelRaw : 2;
      if (modelRaw !== 1 && modelRaw !== 2) {
        addWarning(`^BQ model "${modelRaw}" is not supported. Using model 2.`);
      }
      barcode = {
        ...barcode,
        kind: "qr",
        orientation: parseOrientation(parts[0], defaultOrientation),
        qrModel: model,
        qrErrorCorrection: barcode.qrErrorCorrection,
        qrMagnification: Math.max(1, parseNumber(parts[2], barcode.qrMagnification)),
        showText: false
      };
      return;
    }

    if (command === "BX") {
      const rawQuality = parseInteger(parts[2], barcode.dataMatrixQuality);
      const quality = [0, 50, 80, 100, 140, 200].includes(rawQuality) ? rawQuality : 200;
      const columns = Math.max(0, parseInteger(parts[3], 0));
      const rows = Math.max(0, parseInteger(parts[4], 0));
      const formatId = parseInteger(parts[5], 6);
      const escapeCharRaw = (parts[6] ?? "").trim();
      const escapeChar = escapeCharRaw ? escapeCharRaw[0] : "_";
      const aspectRatio = parseInteger(parts[7], 1);
      const dataMatrixFormat = aspectRatio === 2 ? "rectangle" : "square";

      if (rawQuality !== quality) {
        addWarning(`Unsupported ^BX quality "${rawQuality}". Using ECC 200.`);
      }
      if (quality !== 200) {
        addWarning("^BX quality 0/50/80/100/140 is not supported in preview. Using ECC 200.");
      }
      if (columns > 0 && (columns < 9 || columns > 49)) {
        addWarning("^BX columns should be in range 9-49.");
      }
      if (rows > 0 && (rows < 9 || rows > 49)) {
        addWarning("^BX rows should be in range 9-49.");
      }
      if (aspectRatio !== 1 && aspectRatio !== 2) {
        addWarning(`Unsupported ^BX aspect ratio "${aspectRatio}". Using square.`);
      }
      if (formatId !== 6) {
        addWarning("^BX format id is not fully mapped in preview. Using default ECC 200 behavior.");
      }
      barcode = {
        ...barcode,
        kind: "datamatrix",
        orientation: parseOrientation(parts[0], defaultOrientation),
        moduleWidth: Math.max(1, parseNumber(parts[1], barcode.moduleWidth)),
        showText: false,
        dataMatrixQuality: quality,
        dataMatrixColumns: columns,
        dataMatrixRows: rows,
        dataMatrixFormat,
        dataMatrixEscapeChar: escapeChar
      };
      return;
    }

    if (command === "B7") {
      const rawSecurity = parseInteger(parts[2], barcode.pdf417SecurityLevel);
      const securityLevel = clamp(rawSecurity, -1, 8);
      const columns = Math.max(0, parseInteger(parts[3], 0));
      const rows = Math.max(0, parseInteger(parts[4], 0));
      const truncate = (parts[5] ?? "N").trim().toUpperCase() === "Y";

      if (rawSecurity !== securityLevel) {
        addWarning(`^B7 security level "${rawSecurity}" is out of range; using ${securityLevel}.`);
      }
      if (columns > 30) {
        addWarning("^B7 columns above 30 may not be supported by all printers.");
      }
      if (rows > 90) {
        addWarning("^B7 rows above 90 may not be supported by all printers.");
      }

      barcode = {
        ...barcode,
        kind: "pdf417",
        orientation: parseOrientation(parts[0], defaultOrientation),
        showText: false,
        pdf417SecurityLevel: securityLevel,
        pdf417Columns: columns,
        pdf417Rows: rows,
        pdf417Truncate: truncate
      };
      return;
    }

    if (command === "BD") {
      const first = (parts[0] ?? "").trim();
      const orientation = /^\d+$/.test(first)
        ? defaultOrientation
        : parseOrientation(parts[0], defaultOrientation);
      const modeRaw = /^\d+$/.test(first) ? first : (parts[1] ?? "");
      const parsedMode = parseInteger(modeRaw, barcode.maxicodeMode);
      const mode = clamp(parsedMode, 2, 6);

      if (parsedMode !== mode) {
        addWarning(`^BD mode "${parsedMode}" is out of range; using ${mode}.`);
      }
      if (mode === 2 || mode === 3) {
        addWarning("^BD mode 2/3 requires structured primary data; invalid input may fail in preview.");
      }

      barcode = {
        ...barcode,
        kind: "maxicode",
        orientation,
        showText: false,
        maxicodeMode: mode
      };
      return;
    }

    if (command === "FD") {
      const decoded = decodeFieldValue(args);
      if (!decoded && decoded !== "") {
        return;
      }
      if (currentFieldNumber !== null) {
        fieldValues.set(currentFieldNumber, decoded);
      }
      drawResolvedValue(decoded);
      currentFieldHadData = true;
      return;
    }

    if (command === "FS") {
      if (currentFieldNumber !== null && !currentFieldHadData) {
        if (!fieldTemplates.has(currentFieldNumber)) {
          fieldTemplates.set(currentFieldNumber, {
            x: cursorX,
            y: cursorY,
            positionMode,
            font: { ...font },
            barcode: { ...barcode },
            reverse: fieldReverse,
            fieldBlock: fieldBlock ? { ...fieldBlock } : null
          });
        }
        const presetValue = fieldValues.get(currentFieldNumber);
        if (presetValue !== undefined) {
          drawResolvedValue(presetValue);
        }
      }
      barcode.kind = "none";
      barcode.showText = true;
      barcode.showTextAbove = false;
      barcode.withCheckDigit = false;
      barcode.orientation = defaultOrientation;
      fieldReverse = false;
      fieldHexIndicator = null;
      fieldBlock = null;
      currentFieldNumber = null;
      currentFieldHadData = false;
      return;
    }

    if (
      command === "XA"
      || command === "XZ"
      || command === "FX"
      || command === "CI"
      || command === "BY"
      || command === "FW"
    ) {
      return;
    }

    addDiagnostic(`Command ${token.prefix}${command} is not supported by preview renderer.`, {
      kind: "unsupported_command",
      severity: "warning",
      impact: impactForCommand(command)
    });
  });

  ctx.restore();

  return {
    code128Debug: latestCode128Debug,
    warnings: Array.from(warningSet),
    diagnostics
  };
}

export function renderLabelForExport(
  zpl: string,
  printerSettings: PrinterSettings = DEFAULT_PRINTER_SETTINGS,
  respectZplGeometry = true
): HTMLCanvasElement {
  const tokens = tokenizeZplCommands(zpl);
  const geometry = resolveLabelGeometryWithProfile(tokens, printerSettings, respectZplGeometry);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, geometry.printWidth);
  canvas.height = Math.max(1, geometry.labelLength);
  drawZplPreview(
    canvas,
    zpl,
    printerSettings,
    false,
    respectZplGeometry,
    { withChrome: false, fitToCanvas: false, textScale: 1 }
  );
  return canvas;
}

export function ZplCanvas({
  zpl,
  onCode128DebugChange,
  onWarningsChange,
  onDiagnosticsChange,
  onCanvasReady,
  printerSettings = DEFAULT_PRINTER_SETTINGS,
  showNonPrintableZones = true,
  respectZplGeometry = true
}: ZplCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const result = drawZplPreview(
      canvas,
      zpl,
      printerSettings,
      showNonPrintableZones,
      respectZplGeometry
    );
    if (onCode128DebugChange) {
      onCode128DebugChange(result.code128Debug);
    }
    if (onWarningsChange) {
      onWarningsChange(result.warnings);
    }
    if (onDiagnosticsChange) {
      onDiagnosticsChange(result.diagnostics);
    }
  }, [
    onCode128DebugChange,
    onCanvasReady,
    onDiagnosticsChange,
    onWarningsChange,
    printerSettings,
    respectZplGeometry,
    showNonPrintableZones,
    zpl
  ]);

  useEffect(() => {
    if (!onCanvasReady) {
      return;
    }
    onCanvasReady(canvasRef.current);
    return () => onCanvasReady(null);
  }, [onCanvasReady]);

  return (
    <canvas
      ref={canvasRef}
      width={1120}
      height={820}
      className="preview-canvas"
      aria-label="ZPL preview canvas"
    />
  );
}
