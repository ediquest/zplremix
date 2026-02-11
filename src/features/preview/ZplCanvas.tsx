import { useEffect, useRef } from "react";
import bwipjs from "bwip-js";

type ZplCanvasProps = {
  zpl: string;
  onCode128DebugChange?: (debug: Code128DebugInfo | null) => void;
  onWarningsChange?: (warnings: string[]) => void;
};

type Orientation = "N" | "R" | "I" | "B";
type PositionMode = "FO" | "FT";
type BarcodeKind = "none" | "code128" | "code39" | "qr" | "datamatrix";

type FontState = {
  width: number;
  height: number;
  bold: boolean;
  orientation: Orientation;
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
  qrMagnification: number;
  dataMatrixQuality: number;
  dataMatrixColumns: number;
  dataMatrixRows: number;
  dataMatrixFormat: "square" | "rectangle";
  dataMatrixEscapeChar: string;
};

type TextLayout = {
  lines: string[];
  fontPx: number;
  lineHeight: number;
  width: number;
  height: number;
  baseline: number;
  stretch: number;
  fontWeight: "500" | "700";
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

type DrawResult = {
  code128Debug: Code128DebugInfo | null;
  warnings: string[];
};

const LABEL_WIDTH = 812;
const LABEL_HEIGHT = 1218;
const PADDING = 24;

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

function normalizeZplText(value: string): string {
  return value.replace(/\\&/g, "\n").replace(/_0D_0A|_0A|_0D/g, "\n").trim();
}

function measureTextLayout(
  ctx: CanvasRenderingContext2D,
  value: string,
  font: FontState,
  scale: number
): TextLayout {
  const fontPx = Math.max(9, font.height * scale);
  const lineHeight = fontPx * 1.2;
  const lines = value.split("\n");
  const fontWeight: "500" | "700" = font.bold ? "700" : "500";
  const stretch = clamp(font.width / Math.max(1, font.height), 0.65, 1.6);

  ctx.save();
  ctx.font = `${fontWeight} ${fontPx}px 'Segoe UI', Arial, sans-serif`;
  const width =
    lines.reduce((maxWidth, line) => Math.max(maxWidth, ctx.measureText(line).width), 0) * stretch;
  ctx.restore();

  return {
    lines,
    fontPx,
    lineHeight,
    width,
    height: Math.max(lineHeight, lines.length * lineHeight),
    baseline: fontPx * 0.8,
    stretch,
    fontWeight
  };
}

function drawTextLayout(ctx: CanvasRenderingContext2D, layout: TextLayout) {
  ctx.font = `${layout.fontWeight} ${layout.fontPx}px 'Segoe UI', Arial, sans-serif`;
  ctx.textBaseline = "top";
  if (layout.stretch !== 1) {
    layout.lines.forEach((line, index) => {
      ctx.save();
      ctx.translate(0, index * layout.lineHeight);
      ctx.scale(layout.stretch, 1);
      ctx.fillText(line, 0, 0);
      ctx.restore();
    });
    return;
  }

  layout.lines.forEach((line, index) => {
    ctx.fillText(line, 0, index * layout.lineHeight);
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
    const canUseSetC = digitRun >= 4;
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
  const bcid = barcode.kind === "qr" ? "qrcode" : "datamatrix";
  const symbolCanvas = document.createElement("canvas");
  const text = value || "0";
  const baseScale =
    barcode.kind === "qr"
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

    if (barcode.kind === "datamatrix") {
      options.format = barcode.dataMatrixFormat;
      if (barcode.dataMatrixColumns > 0) {
        options.columns = barcode.dataMatrixColumns;
      }
      if (barcode.dataMatrixRows > 0) {
        options.rows = barcode.dataMatrixRows;
      }
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
  const textHeight = barcode.showText && barcode.kind !== "qr" ? Math.max(10, 12 * scale) : 0;
  const textGap = textHeight > 0 ? Math.max(2, 4 * scale) : 0;

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
  reverse: boolean
) {
  const layout = measureTextLayout(ctx, value, font, scale);
  const anchorY = positionMode === "FT" ? layout.baseline : 0;

  drawAtAnchor(ctx, x, y, font.orientation, 0, anchorY, () => {
    ctx.fillStyle = reverse ? "#ffffff" : "#111827";
    drawTextLayout(ctx, layout);
  });
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
) {
  if (barcode.kind === "qr" || barcode.kind === "datamatrix") {
    const symbolCanvas = render2dBarcode(value, barcode, scale, reverse, addWarning);
    if (!symbolCanvas) {
      return;
    }
    const symbolWidth = symbolCanvas.width;
    const symbolHeight = symbolCanvas.height;
    const anchorY = positionMode === "FT" ? symbolHeight : 0;

    drawAtAnchor(ctx, x, y, barcode.orientation, 0, anchorY, () => {
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
    return;
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
      ctx.font = `${layout.textHeight}px 'Courier New', monospace`;
      ctx.textBaseline = "top";
      const textWidth = ctx.measureText(layout.printedText).width;
      const textX = Math.max(0, (layout.symbolWidth - textWidth) / 2);
      ctx.fillText(layout.printedText, textX, textY);
    }
  });
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
) {
  const pxThickness = Math.max(1, snapToPixel(thickness * scale));
  const pxWidth = Math.max(1, snapToPixel(width * scale));
  const pxHeight = Math.max(1, snapToPixel(height * scale));
  const pxX = snapToPixel(x);
  const pxY = snapToPixel(y);
  if (reverse) {
    // Zebra-like ^FR behavior for ^GB: invert pixels inside the field box.
    invertRect(ctx, pxX, pxY, pxWidth, pxHeight);
    return;
  }

  ctx.fillStyle = "#111827";

  if (pxHeight <= pxThickness || pxWidth <= pxThickness) {
    ctx.fillRect(pxX, pxY, pxWidth, pxHeight);
    return;
  }

  ctx.fillRect(pxX, pxY, pxWidth, pxThickness);
  ctx.fillRect(pxX, pxY + pxHeight - pxThickness, pxWidth, pxThickness);
  ctx.fillRect(pxX, pxY, pxThickness, pxHeight);
  ctx.fillRect(pxX + pxWidth - pxThickness, pxY, pxThickness, pxHeight);
}

function drawZplPreview(canvas: HTMLCanvasElement, zpl: string): DrawResult {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      code128Debug: null,
      warnings: ["Canvas context is unavailable."]
    };
  }

  const width = canvas.width;
  const height = canvas.height;
  const scaleX = (width - PADDING * 2) / LABEL_WIDTH;
  const scaleY = (height - PADDING * 2) / LABEL_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const renderLabelWidth = snapToPixel(LABEL_WIDTH * scale);
  const renderLabelHeight = snapToPixel(LABEL_HEIGHT * scale);
  const originX = snapToPixel((width - renderLabelWidth) / 2);
  const originY = snapToPixel((height - renderLabelHeight) / 2);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#e6effb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(originX, originY, renderLabelWidth, renderLabelHeight);
  ctx.strokeStyle = "#9caec9";
  ctx.strokeRect(originX, originY, renderLabelWidth, renderLabelHeight);

  const tokens = zpl.match(/\^[A-Z~][^^~]*/g) ?? [];
  let cursorX = 0;
  let cursorY = 0;
  let positionMode: PositionMode = "FO";
  let defaultOrientation: Orientation = "N";
  let fieldReverse = false;
  let latestCode128Debug: Code128DebugInfo | null = null;
  let encoding: EncodingMode = "cp1252";
  let fieldHexIndicator: string | null = null;
  const warningSet = new Set<string>();
  const addWarning = (message: string) => {
    warningSet.add(message);
  };
  let font: FontState = { width: 24, height: 24, bold: false, orientation: "N" };
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
    qrMagnification: 3,
    dataMatrixQuality: 200,
    dataMatrixColumns: 0,
    dataMatrixRows: 0,
    dataMatrixFormat: "square",
    dataMatrixEscapeChar: "_"
  };

  tokens.forEach((token) => {
    const command = token.slice(1, 3).toUpperCase();
    const args = token.slice(3);
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

    if (command === "GB") {
      const boxWidth = parseNumber(parts[0], 0);
      const boxHeight = parseNumber(parts[1], 0);
      const thickness = Math.max(1, parseNumber(parts[2], 1));
      drawGraphicBox(
        ctx,
        originX + cursorX * scale,
        originY + cursorY * scale,
        boxWidth,
        boxHeight,
        thickness,
        scale,
        fieldReverse
      );
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
      font = {
        ...font,
        width,
        height,
        bold: height >= 40,
        orientation: defaultOrientation
      };
      return;
    }

    if (command === "A0") {
      font = {
        width: parseNumber(parts[2], font.width),
        height: parseNumber(parts[1], font.height),
        bold: parseNumber(parts[1], font.height) >= 40,
        orientation: parseOrientation(parts[0], defaultOrientation)
      };
      return;
    }

    if (command.startsWith("A") && command !== "A0") {
      addWarning(`Command ^${command} is not supported yet. Using A0 fallback where possible.`);
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

    if (command === "BY") {
      barcode.moduleWidth = parseNumber(parts[0], barcode.moduleWidth);
      barcode.wideRatio = Math.max(2, parseNumber(parts[1], barcode.wideRatio));
      barcode.height = parseNumber(parts[2], barcode.height);
      return;
    }

    if (command === "FR") {
      fieldReverse = (parts[0] ?? "Y").trim().toUpperCase() !== "N";
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
      barcode = {
        ...barcode,
        kind: "qr",
        orientation: parseOrientation(parts[0], defaultOrientation),
        moduleWidth: Math.max(1, parseNumber(parts[1], barcode.moduleWidth)),
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

    if (command === "FD") {
      const normalized = normalizeZplText(args);
      if (!normalized) {
        return;
      }
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

      const x = originX + cursorX * scale;
      const y = originY + cursorY * scale;
      if (barcode.kind === "none") {
        drawTextField(ctx, x, y, value, font, positionMode, scale, fieldReverse);
      } else {
        const renderedValue =
          barcode.kind === "datamatrix"
            ? parseDataMatrixEscapes(value, barcode.dataMatrixEscapeChar, addWarning)
            : value;
        if (barcode.kind === "code128" && barcode.code128Mode === "A") {
          latestCode128Debug = buildCode128DebugInfo(renderedValue, barcode.code128Mode);
        }
        drawBarcodeField(
          ctx,
          x,
          y,
          renderedValue,
          barcode,
          positionMode,
          scale,
          fieldReverse,
          addWarning
        );
      }
      return;
    }

    if (command === "FS") {
      barcode.kind = "none";
      barcode.showText = true;
      barcode.showTextAbove = false;
      barcode.withCheckDigit = false;
      barcode.orientation = defaultOrientation;
      fieldReverse = false;
      fieldHexIndicator = null;
    }
  });

  return {
    code128Debug: latestCode128Debug,
    warnings: Array.from(warningSet)
  };
}

export function ZplCanvas({ zpl, onCode128DebugChange, onWarningsChange }: ZplCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const result = drawZplPreview(canvas, zpl);
    if (onCode128DebugChange) {
      onCode128DebugChange(result.code128Debug);
    }
    if (onWarningsChange) {
      onWarningsChange(result.warnings);
    }
  }, [onCode128DebugChange, onWarningsChange, zpl]);

  return (
    <canvas
      ref={canvasRef}
      width={700}
      height={500}
      className="preview-canvas"
      aria-label="ZPL preview canvas"
    />
  );
}
