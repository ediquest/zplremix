import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import bwipjs from "bwip-js";

type LabelBuilderPageProps = {
  seedZpl: string;
  onBack: (nextZpl?: string) => void;
};

type BuilderElementType =
  | "passthrough"
  | "text"
  | "code128"
  | "gs1128"
  | "itf14"
  | "code39"
  | "pdf417"
  | "qr"
  | "datamatrix"
  | "ean13"
  | "line"
  | "line-v"
  | "line-d"
  | "box"
  | "circle"
  | "ellipse";
type BarcodeElementType = "code128" | "gs1128" | "itf14" | "code39" | "pdf417" | "qr" | "datamatrix" | "ean13";
type DragMode = "smooth" | "step";
type BuilderAccordionKey = "canvas" | "grid" | "elements" | "selected" | "barcodes" | "text" | "separators" | "shapes";
type BuilderZplAccordionKey = "generated" | "loaded";
type ZplOrientation = "N" | "R" | "I" | "B";
type ZplFont = "0" | "A" | "B" | "D" | "E" | "F" | "G" | "H";

type BuilderItem = {
  id: string;
  type: BuilderElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  filled: boolean;
  zIndex: number;
  font: ZplFont;
  orientation: ZplOrientation;
  sourceCommand?: "FO" | "FT";
  sourceBody?: string;
  sourceAnchorX?: number;
  sourceAnchorY?: number;
  sourceViewX?: number;
  sourceViewY?: number;
  sourceFingerprint?: string;
};

type ResizeState = {
  id: string;
  axis: "right" | "bottom" | "corner";
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
};

type SelectionBoxState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type DragSnapshot = {
  id: string;
  x: number;
  y: number;
};

type PrintDensityDpmm = 8 | 12 | 24;
type LabelUnit = "in" | "mm" | "cm";

type BuilderCanvasSettings = {
  densityDpmm: PrintDensityDpmm;
  labelWidth: number;
  labelHeight: number;
  labelUnit: LabelUnit;
};

const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";
const QR_COMPAT_OFFSET_X = 18;
const QR_COMPAT_OFFSET_Y = 72;
const QR_PREVIEW_DRAW_ADJUST = 0.5;
const DEFAULT_CANVAS_SETTINGS: BuilderCanvasSettings = {
  densityDpmm: 8,
  labelWidth: 4,
  labelHeight: 6,
  labelUnit: "in"
};

function isDensity(value: unknown): value is PrintDensityDpmm {
  return value === 8 || value === 12 || value === 24;
}

function isUnit(value: unknown): value is LabelUnit {
  return value === "in" || value === "mm" || value === "cm";
}

function loadCanvasSettings(): BuilderCanvasSettings {
  try {
    const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_CANVAS_SETTINGS;
    }
    const parsed = JSON.parse(raw) as {
      printerSettings?: {
        densityDpmm?: unknown;
        labelWidth?: unknown;
        labelHeight?: unknown;
        labelUnit?: unknown;
      };
    };
    const source = parsed.printerSettings ?? {};
    return {
      densityDpmm: isDensity(source.densityDpmm) ? source.densityDpmm : DEFAULT_CANVAS_SETTINGS.densityDpmm,
      labelWidth: Number.isFinite(source.labelWidth) ? Math.max(0.1, Number(source.labelWidth)) : DEFAULT_CANVAS_SETTINGS.labelWidth,
      labelHeight: Number.isFinite(source.labelHeight) ? Math.max(0.1, Number(source.labelHeight)) : DEFAULT_CANVAS_SETTINGS.labelHeight,
      labelUnit: isUnit(source.labelUnit) ? source.labelUnit : DEFAULT_CANVAS_SETTINGS.labelUnit
    };
  } catch {
    return DEFAULT_CANVAS_SETTINGS;
  }
}

function unitToMm(value: number, unit: LabelUnit): number {
  if (unit === "in") {
    return value * 25.4;
  }
  if (unit === "cm") {
    return value * 10;
  }
  return value;
}

function estimateTextBoxWidth(text: string, fontHeight: number): number {
  const safeHeight = Math.max(12, fontHeight);
  const perChar = Math.max(5, Math.round(safeHeight * 0.42));
  const padding = Math.max(8, Math.round(safeHeight * 0.45));
  return Math.max(22, Math.round(text.length * perChar + padding));
}

function createItem(type: BuilderElementType, x: number, y: number, zIndex: number): BuilderItem {
  if (type === "text") {
    const text = "New text";
    const height = 32;
    return {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width: estimateTextBoxWidth(text, height),
      height,
      text,
      filled: false,
      zIndex,
      font: "0",
      orientation: "N"
    };
  }
  if (type === "code128") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 120, text: "1234567890", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "gs1128") {
    return { id: crypto.randomUUID(), type, x, y, width: 300, height: 120, text: "(00)012345678901234567", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "itf14") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 110, text: "01234567890123", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "code39") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 110, text: "CODE39-123", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "pdf417") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 140, text: "PDF417 SAMPLE DATA", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "qr") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "https://zplremix.local", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "datamatrix") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "DMX-123456", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "ean13") {
    return { id: crypto.randomUUID(), type, x, y, width: 260, height: 110, text: "5901234123457", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 4, text: "", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line-v") {
    return { id: crypto.randomUUID(), type, x, y, width: 4, height: 220, text: "", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line-d") {
    return { id: crypto.randomUUID(), type, x, y, width: 220, height: 120, text: "R", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "circle") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "", filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "ellipse") {
    return { id: crypto.randomUUID(), type, x, y, width: 180, height: 120, text: "", filled: false, zIndex, font: "0", orientation: "N" };
  }
  return { id: crypto.randomUUID(), type, x, y, width: 240, height: 120, text: "", filled: false, zIndex, font: "0", orientation: "N" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value: number, step: number): number {
  if (step <= 1) {
    return value;
  }
  return Math.round(value / step) * step;
}

function normalizeOrientation(value: string | undefined): ZplOrientation {
  const orientation = (value ?? "N").toUpperCase();
  return orientation === "R" || orientation === "I" || orientation === "B" ? orientation : "N";
}

function parseZplCommandArgs(body: string, command: string): string[] {
  const re = new RegExp(`\\^${command}([^\\^]*)`, "i");
  const match = re.exec(body);
  if (!match) {
    return [];
  }
  return (match[1] ?? "").split(",");
}

function parseBarcodeHeight(args: string[], fallback = 100): number {
  const raw = Number(args[1] ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(40, Math.round(raw));
  }
  return Math.max(40, Math.round(fallback));
}

function parseGraphicFieldSize(body: string): { width: number; height: number } | null {
  const args = parseZplCommandArgs(body, "GF");
  if (!args.length) {
    return null;
  }
  const offset = Number.isFinite(Number(args[0])) ? 0 : 1;
  const totalBytes = Math.max(0, Number.parseInt(args[offset] ?? "", 10));
  const usedBytes = Math.max(0, Number.parseInt(args[offset + 1] ?? "", 10));
  const bytesPerRow = Math.max(0, Number.parseInt(args[offset + 2] ?? "", 10));
  if (bytesPerRow <= 0) {
    return null;
  }
  const rowCount = Math.max(1, Math.ceil((usedBytes || totalBytes || bytesPerRow) / bytesPerRow));
  return {
    width: Math.max(8, bytesPerRow * 8),
    height: Math.max(8, rowCount)
  };
}

function normalizeGraphicName(rawName: string): string {
  let normalized = (rawName ?? "").trim().toUpperCase();
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

function extractDownloadedGraphicSizes(zpl: string): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  const normalized = zpl
    .replace(/\u000F/g, "^FS\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E\u0010-\u001F\u007F]/g, "");
  const re = /~DG([^,\^~]+),([^,\^~]+),([^,\^~]+),[^\^~]*/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    const name = normalizeGraphicName(match[1] ?? "");
    const totalBytes = Math.max(0, Number.parseInt((match[2] ?? "").trim(), 10));
    const bytesPerRow = Math.max(1, Number.parseInt((match[3] ?? "").trim(), 10));
    if (!name || totalBytes <= 0 || bytesPerRow <= 0) {
      continue;
    }
    const rowCount = Math.max(1, Math.ceil(totalBytes / bytesPerRow));
    sizes.set(name, {
      width: Math.max(8, bytesPerRow * 8),
      height: Math.max(8, rowCount)
    });
  }
  return sizes;
}

function extractGraphicDownloadCommands(zpl: string): string[] {
  const normalized = zpl
    .replace(/\u000F/g, "^FS\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E\u0010-\u001F\u007F]/g, "");
  const matches = normalized.match(/~DG[^\^~]*/gi) ?? [];
  const unique = new Set<string>();
  matches.forEach((entry) => {
    const value = entry.trim();
    if (value) {
      unique.add(value);
    }
  });
  return Array.from(unique.values());
}

function stripCode128ControlSequences(value: string): string {
  return (value ?? "").replace(/>([:;689])/g, "");
}

function estimateLinearBarcodeWidthDots(type: BuilderElementType, rawValue: string, moduleWidth: number): number {
  const safeModule = Math.max(1, moduleWidth);
  if (type === "ean13") {
    return Math.max(140, Math.round((95 + 20) * safeModule));
  }
  if (type === "itf14") {
    const digits = (rawValue ?? "").replace(/\D/g, "");
    const pairs = Math.max(1, Math.ceil(digits.length / 2));
    return Math.max(140, Math.round((pairs * 14 + 24) * safeModule));
  }
  if (type === "code39") {
    const chars = Math.max(1, (rawValue ?? "").length + 2);
    return Math.max(140, Math.round((chars * 16 + 16) * safeModule));
  }
  const code128Chars = Math.max(1, stripCode128ControlSequences(rawValue).length);
  return Math.max(160, Math.round((code128Chars * 11 + 70) * safeModule));
}

function buildItemFingerprint(item: BuilderItem): string {
  return [
    item.type,
    item.text,
    Math.round(item.width),
    Math.round(item.height),
    item.orientation,
    item.font,
    item.filled ? "1" : "0"
  ].join("|");
}

function getLastOrientationFromFw(segment: string): ZplOrientation {
  const regex = /\^FW([NRIB])/gi;
  let match: RegExpExecArray | null;
  let orientation: ZplOrientation = "N";
  while ((match = regex.exec(segment)) !== null) {
    orientation = normalizeOrientation(match[1]);
  }
  return orientation;
}

function getFieldOrientationFromFormat(zpl: string, fieldStartIndex: number, body: string): ZplOrientation {
  const before = zpl.slice(0, Math.max(0, fieldStartIndex));
  const fromBefore = getLastOrientationFromFw(before);
  const fromBody = getLastOrientationFromFw(body);
  return fromBody !== "N" ? fromBody : fromBefore;
}

function rotatePointForOrientation(x: number, y: number, orientation: ZplOrientation): { x: number; y: number } {
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

function foLocalAnchorForOrientation(
  orientation: ZplOrientation,
  width: number,
  height: number
): { x: number; y: number } {
  if (orientation === "R") {
    return { x: 0, y: height };
  }
  if (orientation === "I") {
    return { x: width, y: height };
  }
  if (orientation === "B") {
    return { x: width, y: 0 };
  }
  return { x: 0, y: 0 };
}

function mapFieldPosition(
  command: "FO" | "FT",
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
  orientation: ZplOrientation
): { x: number; y: number; width: number; height: number } {
  const localAnchor =
    command === "FO"
      ? foLocalAnchorForOrientation(orientation, width, height)
      : { x: 0, y: height };
  const rotatedAnchor = rotatePointForOrientation(localAnchor.x, localAnchor.y, orientation);
  const tx = anchorX - rotatedAnchor.x;
  const ty = anchorY - rotatedAnchor.y;
  const corners = [
    rotatePointForOrientation(0, 0, orientation),
    rotatePointForOrientation(width, 0, orientation),
    rotatePointForOrientation(width, height, orientation),
    rotatePointForOrientation(0, height, orientation)
  ];
  const minX = Math.min(...corners.map((point) => tx + point.x));
  const maxX = Math.max(...corners.map((point) => tx + point.x));
  const minY = Math.min(...corners.map((point) => ty + point.y));
  const maxY = Math.max(...corners.map((point) => ty + point.y));
  return {
    x: Math.max(0, Math.round(minX)),
    y: Math.max(0, Math.round(minY)),
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY))
  };
}

function softSnapToStep(value: number, step: number, threshold: number): number {
  if (step <= 1) {
    return value;
  }
  const snapped = snapToStep(value, step);
  return Math.abs(snapped - value) <= threshold ? snapped : value;
}

function snapToItemsAxis(
  value: number,
  size: number,
  axis: "x" | "y",
  draggingId: string,
  items: BuilderItem[],
  threshold: number
): number {
  let snapped = value;
  let bestDistance = threshold + 1;
  for (const other of items) {
    if (other.id === draggingId) {
      continue;
    }
    const otherStart = axis === "x" ? other.x : other.y;
    const otherEnd = axis === "x" ? other.x + other.width : other.y + other.height;
    const otherCenter = (otherStart + otherEnd) / 2;
    const candidates = [
      otherStart,
      otherEnd,
      otherStart - size,
      otherEnd - size,
      otherCenter - size / 2
    ];
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - value);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        snapped = candidate;
      }
    }
  }
  return snapped;
}

function buildZplFromItems(
  items: BuilderItem[],
  canvasWidth: number,
  canvasHeight: number,
  graphicDownloads: string[] = []
): string {
  const lines = ["^XA", `^PW${canvasWidth}`, `^LL${canvasHeight}`, "^LH0,0"];
  graphicDownloads.forEach((entry) => lines.push(entry));
  [...items].sort((a, b) => a.zIndex - b.zIndex).forEach((item) => {
    const x = Math.round(item.x);
    const y = Math.round(item.y);
    const canReuseSource =
      !!item.sourceCommand
      && typeof item.sourceBody === "string"
      && item.sourceFingerprint === buildItemFingerprint(item)
      && Number.isFinite(item.sourceAnchorX)
      && Number.isFinite(item.sourceAnchorY)
      && Number.isFinite(item.sourceViewX)
      && Number.isFinite(item.sourceViewY);
    if (canReuseSource) {
      const dx = Math.round(item.x - (item.sourceViewX ?? item.x));
      const dy = Math.round(item.y - (item.sourceViewY ?? item.y));
      const nextX = Math.max(0, Math.round((item.sourceAnchorX ?? x) + dx));
      const nextY = Math.max(0, Math.round((item.sourceAnchorY ?? y) + dy));
      lines.push(`^${item.sourceCommand}${nextX},${nextY}${item.sourceBody}^FS`);
      return;
    }
    if (item.type === "passthrough") {
      if (item.sourceCommand && item.sourceBody && Number.isFinite(item.sourceAnchorX) && Number.isFinite(item.sourceAnchorY)) {
        const sourceX = item.sourceAnchorX ?? x;
        const sourceY = item.sourceAnchorY ?? y;
        lines.push(`^${item.sourceCommand}${Math.round(sourceX)},${Math.round(sourceY)}${item.sourceBody}^FS`);
      }
      return;
    }
    if (item.type === "text") {
      const textHeight = Math.max(14, Math.round(item.height * 0.8));
      const textWidth = Math.max(10, Math.round(textHeight * 0.6));
      lines.push(`^FO${x},${y}^A${item.font}${item.orientation},${textHeight},${textWidth}^FD${item.text}^FS`);
      return;
    }
    if (item.type === "code128") {
      const barHeight = Math.max(40, Math.round(item.height));
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^BC${item.orientation},${barHeight},Y,N,N^FD${item.text}^FS`);
      return;
    }
    if (item.type === "gs1128") {
      const barHeight = Math.max(40, Math.round(item.height));
      const payload = item.text.startsWith(">8") ? item.text : `>8${item.text}`;
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^BC${item.orientation},${barHeight},Y,N,N^FD${payload}^FS`);
      return;
    }
    if (item.type === "itf14") {
      const barHeight = Math.max(40, Math.round(item.height));
      const digits = item.text.replace(/\D/g, "").slice(0, 14) || "01234567890123";
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^B2${item.orientation},${barHeight},Y,N,N^FD${digits}^FS`);
      return;
    }
    if (item.type === "code39") {
      const barHeight = Math.max(40, Math.round(item.height));
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^B3${item.orientation},N,${barHeight},Y,N^FD${item.text}^FS`);
      return;
    }
    if (item.type === "pdf417") {
      const rows = clamp(Math.round(item.height / 16), 3, 30);
      const colWidth = clamp(Math.round(item.width / 42), 2, 30);
      lines.push(`^FO${x},${y}^B7${item.orientation},${Math.max(2, colWidth)},${rows},4,16,N^FD${item.text}^FS`);
      return;
    }
    if (item.type === "qr") {
      const moduleSize = clamp(Math.round(Math.min(item.width, item.height) / 28), 2, 10);
      const qx = Math.max(0, x - QR_COMPAT_OFFSET_X);
      const qy = Math.max(0, y - QR_COMPAT_OFFSET_Y);
      lines.push(`^FO${qx},${qy}^BQ${item.orientation},2,${moduleSize}^FDLA,${item.text}^FS`);
      return;
    }
    if (item.type === "datamatrix") {
      const moduleSize = clamp(Math.round(Math.min(item.width, item.height) / 24), 3, 12);
      lines.push(`^FO${x},${y}^BX${item.orientation},${moduleSize},200^FD${item.text}^FS`);
      return;
    }
    if (item.type === "ean13") {
      const barHeight = Math.max(40, Math.round(item.height));
      const digits = item.text.replace(/\D/g, "").slice(0, 13) || "5901234123457";
      lines.push(`^FO${x},${y}^BY2,2,${barHeight}^BE${item.orientation},${barHeight},Y,N^FD${digits}^FS`);
      return;
    }
    if (item.type === "line") {
      lines.push(`^FO${x},${y}^GB${Math.round(item.width)},${Math.max(1, Math.round(item.height))},1^FS`);
      return;
    }
    if (item.type === "line-v") {
      lines.push(`^FO${x},${y}^GB${Math.max(1, Math.round(item.width))},${Math.round(item.height)},1^FS`);
      return;
    }
    if (item.type === "line-d") {
      const direction = (item.text ?? "").trim().toUpperCase() === "L" ? "L" : "R";
      lines.push(`^FO${x},${y}^GD${Math.max(1, Math.round(item.width))},${Math.max(1, Math.round(item.height))},1,${direction}^FS`);
      return;
    }
    if (item.type === "circle") {
      const diameter = Math.max(8, Math.round(Math.min(item.width, item.height)));
      const thickness = item.filled ? diameter : 2;
      lines.push(`^FO${x},${y}^GC${diameter},${thickness}^FS`);
      return;
    }
    if (item.type === "ellipse") {
      const width = Math.max(8, Math.round(item.width));
      const height = Math.max(8, Math.round(item.height));
      const thickness = item.filled ? Math.max(1, Math.min(width, height)) : 2;
      lines.push(`^FO${x},${y}^GE${width},${height},${thickness}^FS`);
      return;
    }
    const width = Math.max(2, Math.round(item.width));
    const height = Math.max(2, Math.round(item.height));
    const thickness = item.filled ? Math.max(1, Math.min(width, height)) : 2;
    lines.push(`^FO${x},${y}^GB${width},${height},${thickness}^FS`);
  });
  lines.push("^XZ");
  return lines.join("\n");
}

function parseItemsFromZpl(zpl: string): BuilderItem[] {
  const items: BuilderItem[] = [];
  const normalizedZpl = zpl
    .replace(/\u000F/g, "^FS\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E\u0010-\u001F\u007F]/g, "");
  const downloadedGraphics = extractDownloadedGraphicSizes(normalizedZpl);
  const fieldRegex = /\^(FO|FT)"?(-?\d+)"?,\s*"?(-?\d+)"?([\s\S]*?)\^FS/g;
  let match: RegExpExecArray | null;
  while ((match = fieldRegex.exec(normalizedZpl)) !== null) {
    const command = (match[1] === "FT" ? "FT" : "FO") as "FO" | "FT";
    const rawX = Number(match[2]);
    const rawY = Number(match[3]);
    const body = match[4] ?? "";
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      continue;
    }
    const fieldOrientation = getFieldOrientationFromFormat(normalizedZpl, match.index, body);
    const pushParsed = (item: BuilderItem) => {
      items.push({
        ...item,
        sourceCommand: command,
        sourceBody: body,
        sourceAnchorX: rawX,
        sourceAnchorY: rawY,
        sourceViewX: item.x,
        sourceViewY: item.y,
        sourceFingerprint: buildItemFingerprint(item)
      });
    };

    if (/\^GF/i.test(body)) {
      const gfSize = parseGraphicFieldSize(body) ?? { width: 64, height: 16 };
      pushParsed({
        id: crypto.randomUUID(),
        type: "passthrough",
        x: rawX,
        y: rawY,
        width: gfSize.width,
        height: gfSize.height,
        text: "",
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: fieldOrientation
      });
      continue;
    }

    const xg = /\^XG([^,\^]+)(?:,(\d+))?(?:,(\d+))?/i.exec(body);
    if (xg) {
      const name = normalizeGraphicName(xg[1] ?? "");
      const mx = Math.max(1, Number.parseInt((xg[2] ?? "1").trim(), 10) || 1);
      const my = Math.max(1, Number.parseInt((xg[3] ?? "1").trim(), 10) || 1);
      const base = downloadedGraphics.get(name) ?? { width: 120, height: 120 };
      const width = Math.max(8, base.width * mx);
      const height = Math.max(8, base.height * my);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        width,
        height,
        fieldOrientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "passthrough",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: `XG ${name || "GRAPHIC"}`,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: fieldOrientation
      });
      continue;
    }

    const gb = /\^GB(\d+),(\d+)(?:,(\d+))?/i.exec(body);
    if (gb) {
      const width = Math.max(2, Number(gb[1]));
      const height = Math.max(2, Number(gb[2]));
      const border = Number(gb[3] ?? 1);
      const isFilled = border >= Math.min(width, height) - 1;
      pushParsed({
        id: crypto.randomUUID(),
        type: height <= 6 || width <= 6 || border <= 1 ? (height >= width ? "line-v" : "line") : "box",
        x: rawX,
        y: rawY,
        width,
        height,
        text: "",
        filled: isFilled,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }

    const gc = /\^GC(\d+)(?:,(\d+))?/i.exec(body);
    if (gc) {
      const diameter = Math.max(8, Number(gc[1]));
      const border = Number(gc[2] ?? 2);
      pushParsed({
        id: crypto.randomUUID(),
        type: "circle",
        x: rawX,
        y: rawY,
        width: diameter,
        height: diameter,
        text: "",
        filled: border >= diameter - 1,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }

    const ge = /\^GE(\d+),(\d+)(?:,(\d+))?/i.exec(body);
    if (ge) {
      const width = Math.max(8, Number(ge[1]));
      const height = Math.max(8, Number(ge[2]));
      const border = Number(ge[3] ?? 2);
      pushParsed({
        id: crypto.randomUUID(),
        type: "ellipse",
        x: rawX,
        y: rawY,
        width,
        height,
        text: "",
        filled: border >= Math.min(width, height) - 1,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }

    const gd = /\^GD(\d+),(\d+)(?:,(\d+))?(?:,([LR]))?/i.exec(body);
    if (gd) {
      const width = Math.max(8, Number(gd[1]));
      const height = Math.max(8, Number(gd[2]));
      const direction = (gd[4] ?? "R").toUpperCase() === "L" ? "L" : "R";
      pushParsed({
        id: crypto.randomUUID(),
        type: "line-d",
        x: rawX,
        y: rawY,
        width,
        height,
        text: direction,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }

    if (/\^BQ/i.test(body)) {
      const fd = /\^FD(?:[A-Z]{1,2},)?([^\\^]*)/i.exec(body);
      const payload = fd?.[1] ?? "https://zplremix.local";
      const bqn = /\^BQ([NRIB])?(?:,[12])?(?:,(\d+))?/i.exec(body);
      const orientation = normalizeOrientation(bqn?.[1]);
      const magnification = clamp(Number(bqn?.[2] ?? 3), 1, 12);
      const qrSize = estimateQrBoxSize(payload, magnification);
      pushParsed({
        id: crypto.randomUUID(),
        type: "qr",
        x: rawX + QR_COMPAT_OFFSET_X,
        y: rawY + QR_COMPAT_OFFSET_Y,
        width: qrSize.width,
        height: qrSize.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^BX/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const bx = /\^BX([NRIB])?/i.exec(body);
      const orientation = normalizeOrientation(bx?.[1] ?? fieldOrientation);
      pushParsed({
        id: crypto.randomUUID(),
        type: "datamatrix",
        x: rawX,
        y: rawY,
        width: 120,
        height: 120,
        text: fd?.[1] ?? "DMX-123456",
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^BE/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const beArgs = parseZplCommandArgs(body, "BE");
      const orientation = normalizeOrientation(beArgs[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(beArgs, byHeight);
      const payload = fd?.[1] ?? "5901234123457";
      const estimatedWidth = estimateLinearBarcodeWidthDots("ean13", payload, byModule);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        estimatedWidth,
        barHeight,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "ean13",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^B7/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const b7Args = parseZplCommandArgs(body, "B7");
      const orientation = normalizeOrientation(b7Args[0] || fieldOrientation);
      const colWidth = Number(b7Args[1] ?? 4);
      const rows = Number(b7Args[2] ?? 6);
      const width = Math.max(160, colWidth * 42);
      const height = Math.max(64, rows * 16);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        width,
        height,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "pdf417",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: fd?.[1] ?? "PDF417 SAMPLE DATA",
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^B2/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const b2Args = parseZplCommandArgs(body, "B2");
      const orientation = normalizeOrientation(b2Args[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(b2Args, byHeight);
      const payload = fd?.[1] ?? "01234567890123";
      const estimatedWidth = estimateLinearBarcodeWidthDots("itf14", payload, byModule);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        estimatedWidth,
        barHeight,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "itf14",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^B3/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const b3Args = parseZplCommandArgs(body, "B3");
      const orientation = normalizeOrientation(b3Args[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(["", b3Args[2] ?? ""], byHeight);
      const payload = fd?.[1] ?? "CODE39-123";
      const estimatedWidth = estimateLinearBarcodeWidthDots("code39", payload, byModule);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        estimatedWidth,
        barHeight,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "code39",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^BC/i.test(body)) {
      const fd = /\^FD([^\\^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const bcArgs = parseZplCommandArgs(body, "BC");
      const orientation = normalizeOrientation(bcArgs[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(bcArgs, byHeight);
      const payload = fd?.[1] ?? "1234567890";
      const estimatedWidth = estimateLinearBarcodeWidthDots("code128", payload, byModule);
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        estimatedWidth,
        barHeight,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: payload.startsWith(">8") ? "gs1128" : "code128",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    const fd = /\^FD([^\\^]*)/i.exec(body);
    if (fd) {
      const a = /\^A([A-Z0-9])([NRIB])?,?(-?\d*)?,?(-?\d*)?/i.exec(body);
      const font = ((a?.[1] ?? "0").toUpperCase() as ZplFont);
      const orientation = normalizeOrientation(a?.[2] ?? fieldOrientation);
      const h = Number(a?.[3] || 32);
      const width = estimateTextBoxWidth(fd[1], h);
      const height = Math.max(24, Math.round(h * 1.2));
      const position = mapFieldPosition(
        command,
        rawX,
        rawY,
        width,
        height,
        orientation
      );
      pushParsed({
        id: crypto.randomUUID(),
        type: "text",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: fd[1],
        filled: false,
        zIndex: items.length,
        font: ["0", "A", "B", "D", "E", "F", "G", "H"].includes(font) ? font : "0",
        orientation
      });
    }
  }
  return items;
}

function isContentEditableType(type: BuilderElementType): boolean {
  return (
    type === "text" ||
    type === "code128" ||
    type === "gs1128" ||
    type === "itf14" ||
    type === "code39" ||
    type === "pdf417" ||
    type === "qr" ||
    type === "datamatrix" ||
    type === "ean13"
  );
}

function isBarcodeElementType(type: BuilderElementType): boolean {
  return (
    type === "code128" ||
    type === "gs1128" ||
    type === "itf14" ||
    type === "code39" ||
    type === "pdf417" ||
    type === "qr" ||
    type === "datamatrix" ||
    type === "ean13"
  );
}

function normalizeEan13(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 12 ? digits.slice(0, 13) : "5901234123457";
}

function estimateQrBoxSize(text: string, magnification: number): { width: number; height: number } {
  const fallback = Math.max(56, Math.round(Math.max(1, magnification) * 32));
  if (typeof document === "undefined") {
    return { width: fallback, height: fallback };
  }
  try {
    const temp = document.createElement("canvas");
    bwipjs.toCanvas(temp, {
      bcid: "qrcode",
      text: text || "0",
      scale: Math.max(1, Math.min(12, Math.round(magnification))),
      includetext: false,
      parse: true,
      parsefnc: true,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF",
      barcolor: "111827"
    });
    const size = Math.max(24, Math.round(Math.max(temp.width, temp.height) * QR_PREVIEW_DRAW_ADJUST));
    return { width: size, height: size };
  } catch {
    return { width: fallback, height: fallback };
  }
}

function BuilderBarcodePreview({ item }: { item: BuilderItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !isBarcodeElementType(item.type)) {
      return;
    }
    const target = canvasRef.current;
    const targetW = Math.max(8, Math.round(item.width));
    const targetH = Math.max(8, Math.round(item.height));
    const temp = document.createElement("canvas");
    try {
      const options: Record<string, string | number | boolean> = {
        text: item.text || "0",
        scale: 2,
        includetext: false,
        paddingwidth: 0,
        paddingheight: 0,
        backgroundcolor: "FFFFFF",
        barcolor: "111827"
      };
      if (item.orientation === "R") {
        options.rotate = "R";
      } else if (item.orientation === "I") {
        options.rotate = "I";
      } else if (item.orientation === "B") {
        options.rotate = "L";
      }
      if (item.type === "code128") {
        options.bcid = "code128";
        options.parsefnc = true;
      } else if (item.type === "gs1128") {
        options.bcid = "code128";
        const gs1Payload = item.text || "(00)012345678901234567";
        options.text = gs1Payload.startsWith(">8") ? gs1Payload : `>8${gs1Payload}`;
        options.parsefnc = true;
      } else if (item.type === "itf14") {
        options.bcid = "interleaved2of5";
        const digits = (item.text || "01234567890123").replace(/\D/g, "").slice(0, 14);
        options.text = digits.length % 2 === 0 ? digits : digits.slice(0, Math.max(0, digits.length - 1));
        options.includetext = true;
      } else if (item.type === "code39") {
        options.bcid = "code39";
      } else if (item.type === "pdf417") {
        options.bcid = "pdf417";
        options.includetext = false;
      } else if (item.type === "qr") {
        options.bcid = "qrcode";
        options.includetext = false;
      } else if (item.type === "datamatrix") {
        options.bcid = "datamatrix";
        options.includetext = false;
      } else if (item.type === "ean13") {
        options.bcid = "ean13";
        options.text = normalizeEan13(item.text);
      }
      bwipjs.toCanvas(temp, options as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
      target.width = targetW;
      target.height = targetH;
      const ctx = target.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = false;
      const isLinear =
        item.type === "code128"
        || item.type === "gs1128"
        || item.type === "itf14"
        || item.type === "code39"
        || item.type === "ean13";
      const fit = isLinear
        ? Math.min(targetW / Math.max(1, temp.width), targetH / Math.max(1, temp.height))
        : Math.min(targetW / Math.max(1, temp.width), targetH / Math.max(1, temp.height));
      const drawW = Math.max(1, Math.round(temp.width * fit));
      const drawH = Math.max(1, Math.round(temp.height * fit));
      const drawX = Math.round((targetW - drawW) / 2);
      const drawY = Math.round((targetH - drawH) / 2);
      ctx.drawImage(temp, drawX, drawY, drawW, drawH);
    } catch {
      const ctx = target.getContext("2d");
      if (!ctx) {
        return;
      }
      target.width = targetW;
      target.height = targetH;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.strokeStyle = "#1f2c3f";
      ctx.strokeRect(0, 0, targetW, targetH);
    }
  }, [item]);

  return (
    <canvas
      ref={canvasRef}
      className="builder-item-barcode-canvas"
    />
  );
}

function getMinSizeForType(type: BuilderElementType): { width: number; height: number } {
  if (type === "line") {
    return { width: 16, height: 1 };
  }
  if (type === "line-v") {
    return { width: 1, height: 16 };
  }
  if (type === "line-d") {
    return { width: 16, height: 16 };
  }
  if (type === "circle") {
    return { width: 12, height: 12 };
  }
  if (type === "pdf417") {
    return { width: 120, height: 48 };
  }
  if (type === "text") {
    return { width: 22, height: 16 };
  }
  return { width: 12, height: 12 };
}

function isFillableType(type: BuilderElementType): boolean {
  return type === "box" || type === "circle" || type === "ellipse";
}

function moveSelectedLayer(items: BuilderItem[], selectedId: string, mode: "up" | "down" | "front" | "back"): BuilderItem[] {
  const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((item) => item.id === selectedId);
  if (index < 0) {
    return items;
  }
  if (mode === "up" && index < ordered.length - 1) {
    [ordered[index], ordered[index + 1]] = [ordered[index + 1], ordered[index]];
  } else if (mode === "down" && index > 0) {
    [ordered[index], ordered[index - 1]] = [ordered[index - 1], ordered[index]];
  } else if (mode === "front") {
    const [picked] = ordered.splice(index, 1);
    ordered.push(picked);
  } else if (mode === "back") {
    const [picked] = ordered.splice(index, 1);
    ordered.unshift(picked);
  }
  const rank = new Map<string, number>();
  ordered.forEach((item, idx) => rank.set(item.id, idx));
  return items.map((item) => ({ ...item, zIndex: rank.get(item.id) ?? item.zIndex }));
}

export function LabelBuilderPage({ seedZpl, onBack }: LabelBuilderPageProps) {
  const [canvasSettings, setCanvasSettings] = useState<BuilderCanvasSettings>(() => loadCanvasSettings());
  const [items, setItems] = useState<BuilderItem[]>(() => parseItemsFromZpl(seedZpl));
  const [selectedBarcodeType, setSelectedBarcodeType] = useState<BarcodeElementType>("code128");
  const [isDirty, setIsDirty] = useState(false);
  const [gridSize, setGridSize] = useState(24);
  const [gridDarkness, setGridDarkness] = useState(22);
  const [dragMode, setDragMode] = useState<DragMode>("smooth");
  const [dragStep, setDragStep] = useState(12);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [snapToItemsEnabled, setSnapToItemsEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [accordionOpen, setAccordionOpen] = useState<Record<BuilderAccordionKey, boolean>>({
    canvas: false,
    grid: false,
    elements: false,
    selected: false,
    barcodes: false,
    text: false,
    separators: false,
    shapes: false
  });
  const [zplAccordionOpen, setZplAccordionOpen] = useState<BuilderZplAccordionKey>("generated");
  const canvasRef = useRef<HTMLDivElement>(null);

  const canvasWidth = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelWidth, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelWidth, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const canvasHeight = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelHeight, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelHeight, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const viewScale = useMemo(() => {
    const maxSide = Math.max(canvasWidth, canvasHeight);
    const autoFit = 680 / maxSide;
    return clamp(autoFit, 0.28, 1);
  }, [canvasWidth, canvasHeight]);

  const selectedItem = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null;
    }
    return items.find((item) => item.id === selectedIds[0]) ?? null;
  }, [items, selectedIds]);
  const sourceGraphicDownloads = useMemo(() => extractGraphicDownloadCommands(seedZpl), [seedZpl]);
  const generatedZpl = useMemo(
    () => buildZplFromItems(items, canvasWidth, canvasHeight, sourceGraphicDownloads),
    [items, canvasWidth, canvasHeight, sourceGraphicDownloads]
  );
  const sizeRange =
    canvasSettings.labelUnit === "in"
      ? { min: 1, max: 12, step: 0.1 }
      : canvasSettings.labelUnit === "cm"
        ? { min: 2, max: 30, step: 0.1 }
        : { min: 20, max: 300, step: 1 };
  const safeGridSize = clamp(Math.round(gridSize), 8, 80);
  const safeGridDarkness = clamp(Math.round(gridDarkness), 8, 65);
  const safeDragStep = clamp(Math.round(dragStep), 1, 64);
  const gridAlpha = clamp(safeGridDarkness / 100, 0.08, 0.65);

  const onGridSizeChange = (value: number) => setGridSize(clamp(Math.round(value), 8, 80));
  const onGridDarknessChange = (value: number) => setGridDarkness(clamp(Math.round(value), 8, 65));
  const onDragStepChange = (value: number) => setDragStep(clamp(Math.round(value), 1, 64));
  const updateCanvasSettings = (updater: (prev: BuilderCanvasSettings) => BuilderCanvasSettings) => {
    setCanvasSettings((prev) => updater(prev));
    setIsDirty(true);
  };
  const toggleAccordion = (key: BuilderAccordionKey) => {
    setAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const openZplAccordion = (key: BuilderZplAccordionKey) => {
    setZplAccordionOpen(key);
  };

  const selectSingle = (id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  };

  const resolveDragPosition = (
    nextX: number,
    nextY: number,
    currentItem: BuilderItem,
    allItems: BuilderItem[]
  ): { x: number; y: number } => {
    let x = nextX;
    let y = nextY;
    const step = safeDragStep;
    const gridSnapThreshold = Math.max(3, Math.round(safeGridSize * 0.22));
    const elementSnapThreshold = Math.max(7, Math.round(Math.min(safeGridSize, step) * 0.55));

    if (dragMode === "step") {
      x = snapToStep(x, step);
      y = snapToStep(y, step);
    }
    if (snapToGridEnabled) {
      if (dragMode === "step") {
        x = snapToStep(x, safeGridSize);
        y = snapToStep(y, safeGridSize);
      } else {
        x = softSnapToStep(x, safeGridSize, gridSnapThreshold);
        y = softSnapToStep(y, safeGridSize, gridSnapThreshold);
      }
    }
    if (snapToItemsEnabled) {
      x = snapToItemsAxis(x, currentItem.width, "x", currentItem.id, allItems, elementSnapThreshold);
      y = snapToItemsAxis(y, currentItem.height, "y", currentItem.id, allItems, elementSnapThreshold);
    }

    const maxX = canvasWidth - Math.max(12, currentItem.width);
    const maxY = canvasHeight - Math.max(12, currentItem.height);
    return {
      x: clamp(x, 0, maxX),
      y: clamp(y, 0, maxY)
    };
  };

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        const maxX = canvasWidth - Math.max(12, item.width);
        const maxY = canvasHeight - Math.max(12, item.height);
        return {
          ...item,
          x: clamp(item.x, 0, maxX),
          y: clamp(item.y, 0, maxY)
        };
      })
    );
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    setItems(parseItemsFromZpl(seedZpl));
    setSelectedIds([]);
    setSelectedId(null);
    setDraggingId(null);
    setDragSnapshot([]);
    setSelectionBox(null);
    setIsDirty(false);
  }, [seedZpl]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }
    setAccordionOpen((prev) => (prev.selected ? prev : { ...prev, selected: true }));
  }, [selectedItem]);

  useEffect(() => {
    if (!draggingId && !resizing && !selectionBox) {
      return;
    }
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      onCanvasPointerMove(event.clientX, event.clientY);
    };
    const handleMouseUp = () => {
      stopDrag();
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingId, resizing, selectionBox, items, viewScale, safeGridSize, safeDragStep, snapToGridEnabled, snapToItemsEnabled, dragMode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_PREVIEW_SETTINGS_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const next = {
        ...parsed,
        printerSettings: {
          ...(typeof parsed.printerSettings === "object" && parsed.printerSettings ? parsed.printerSettings : {}),
          densityDpmm: canvasSettings.densityDpmm,
          dpi: canvasSettings.densityDpmm === 24 ? 600 : canvasSettings.densityDpmm === 12 ? 300 : 203,
          labelWidth: canvasSettings.labelWidth,
          labelHeight: canvasSettings.labelHeight,
          labelUnit: canvasSettings.labelUnit
        }
      };
      window.localStorage.setItem(LS_PREVIEW_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  }, [canvasSettings]);

  const onPaletteDragStart = (e: DragEvent<HTMLButtonElement>, type: BuilderElementType) => {
    e.dataTransfer.setData("application/x-zplremix-builder-item", type);
  };

  const onCanvasDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-zplremix-builder-item") as BuilderElementType;
    if (!type) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = clamp((e.clientX - rect.left) / viewScale, 0, canvasWidth - 20);
    const rawY = clamp((e.clientY - rect.top) / viewScale, 0, canvasHeight - 20);
    const nextLayer = items.length ? Math.max(...items.map((item) => item.zIndex)) + 1 : 0;
    const draft = createItem(type, rawX, rawY, nextLayer);
    const pos = resolveDragPosition(rawX, rawY, draft, items);
    draft.x = pos.x;
    draft.y = pos.y;
    setItems((prev) => [...prev, draft]);
    selectSingle(draft.id);
    setIsDirty(true);
  };

  const onCanvasMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || e.target !== e.currentTarget) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / viewScale, 0, canvasWidth);
    const y = clamp((e.clientY - rect.top) / viewScale, 0, canvasHeight);
    setDraggingId(null);
    setResizing(null);
    setDragSnapshot([]);
    setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
    selectSingle(null);
  };

  const onItemMouseDown = (e: MouseEvent, item: BuilderItem) => {
    if (!canvasRef.current) {
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const exists = prev.includes(item.id);
        const next = exists ? prev.filter((id) => id !== item.id) : [...prev, item.id];
        setSelectedId(next.length === 1 ? next[0] : null);
        return next;
      });
      setDraggingId(null);
      setDragSnapshot([]);
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewScale;
    const y = (e.clientY - rect.top) / viewScale;
    const movingIds = selectedIds.includes(item.id) && selectedIds.length > 1 ? selectedIds : [item.id];
    if (e.altKey) {
      const sources = items.filter((entry) => movingIds.includes(entry.id));
      if (!sources.length) {
        return;
      }
      const maxZ = items.length ? Math.max(...items.map((entry) => entry.zIndex)) : 0;
      const idMap = new Map<string, string>();
      sources.forEach((source) => idMap.set(source.id, crypto.randomUUID()));
      const clones = sources.map((source, index) => ({
        ...source,
        id: idMap.get(source.id) ?? crypto.randomUUID(),
        zIndex: maxZ + index + 1
      }));
      const anchorCloneId = idMap.get(item.id) ?? clones[0].id;
      setItems((prev) => [...prev, ...clones]);
      setSelectedIds(clones.map((clone) => clone.id));
      setSelectedId(anchorCloneId);
      setDraggingId(anchorCloneId);
      setDragOffset({ x: x - item.x, y: y - item.y });
      setDragSnapshot(clones.map((clone) => ({ id: clone.id, x: clone.x, y: clone.y })));
      setIsDirty(true);
      return;
    }
    if (!selectedIds.includes(item.id)) {
      selectSingle(item.id);
    } else {
      setSelectedId(item.id);
    }
    setDraggingId(item.id);
    setDragOffset({ x: x - item.x, y: y - item.y });
    setDragSnapshot(items.filter((entry) => movingIds.includes(entry.id)).map((entry) => ({ id: entry.id, x: entry.x, y: entry.y })));
  };

  const onResizeHandleMouseDown = (e: MouseEvent, item: BuilderItem, axis: "right" | "bottom" | "corner") => {
    if (!canvasRef.current) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewScale;
    const y = (e.clientY - rect.top) / viewScale;
    selectSingle(item.id);
    setDraggingId(null);
    setResizing({
      id: item.id,
      axis,
      startMouseX: x,
      startMouseY: y,
      startWidth: item.width,
      startHeight: item.height
    });
  };

  const onCanvasPointerMove = (clientX: number, clientY: number) => {
    if (!canvasRef.current) {
      return;
    }
    if (resizing) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / viewScale;
      const y = (clientY - rect.top) / viewScale;
      const deltaX = x - resizing.startMouseX;
      const deltaY = y - resizing.startMouseY;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== resizing.id) {
            return item;
          }
          const minSize = getMinSizeForType(item.type);
          const useX = resizing.axis === "right" || resizing.axis === "corner";
          const useY = resizing.axis === "bottom" || resizing.axis === "corner";
          let nextWidth = useX ? resizing.startWidth + deltaX : item.width;
          let nextHeight = useY ? resizing.startHeight + deltaY : item.height;
          if (dragMode === "step") {
            if (useX) nextWidth = snapToStep(nextWidth, safeDragStep);
            if (useY) nextHeight = snapToStep(nextHeight, safeDragStep);
          }
          if (snapToGridEnabled) {
            if (useX) nextWidth = snapToStep(nextWidth, safeGridSize);
            if (useY) nextHeight = snapToStep(nextHeight, safeGridSize);
          }
          if (useX) nextWidth = Math.max(minSize.width, nextWidth);
          if (useY) nextHeight = Math.max(minSize.height, nextHeight);
          const maxWidth = canvasWidth - item.x;
          const maxHeight = canvasHeight - item.y;
          return {
            ...item,
            width: useX ? clamp(nextWidth, minSize.width, maxWidth) : item.width,
            height: useY ? clamp(nextHeight, minSize.height, maxHeight) : item.height
          };
        })
      );
      setIsDirty(true);
      return;
    }
    if (selectionBox) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / viewScale, 0, canvasWidth);
      const y = clamp((clientY - rect.top) / viewScale, 0, canvasHeight);
      setSelectionBox((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev));
      return;
    }
    if (!draggingId) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / viewScale;
    const y = (clientY - rect.top) / viewScale;
    if (dragSnapshot.length > 1) {
      const anchorStart = dragSnapshot.find((entry) => entry.id === draggingId);
      if (!anchorStart) {
        return;
      }
      setItems((prev) => {
        const anchorCurrent = prev.find((entry) => entry.id === draggingId);
        if (!anchorCurrent) {
          return prev;
        }
        const anchorPos = resolveDragPosition(x - dragOffset.x, y - dragOffset.y, anchorCurrent, prev);
        const deltaX = anchorPos.x - anchorStart.x;
        const deltaY = anchorPos.y - anchorStart.y;
        const idSet = new Set(dragSnapshot.map((entry) => entry.id));
        const startById = new Map(dragSnapshot.map((entry) => [entry.id, entry] as const));
        return prev.map((entry) => {
          if (!idSet.has(entry.id)) {
            return entry;
          }
          const start = startById.get(entry.id);
          if (!start) {
            return entry;
          }
          const maxX = canvasWidth - Math.max(12, entry.width);
          const maxY = canvasHeight - Math.max(12, entry.height);
          return {
            ...entry,
            x: clamp(start.x + deltaX, 0, maxX),
            y: clamp(start.y + deltaY, 0, maxY)
          };
        });
      });
      setIsDirty(true);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== draggingId) {
          return item;
        }
        const pos = resolveDragPosition(x - dragOffset.x, y - dragOffset.y, item, prev);
        return {
          ...item,
          x: pos.x,
          y: pos.y
        };
      })
    );
    setIsDirty(true);
  };

  const onCanvasMouseMove = (e: MouseEvent) => {
    onCanvasPointerMove(e.clientX, e.clientY);
  };

  const stopDrag = () => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);
      const selected = items
        .filter((item) => item.x < maxX && item.x + item.width > minX && item.y < maxY && item.y + item.height > minY)
        .map((item) => item.id);
      setSelectedIds(selected);
      setSelectedId(selected.length === 1 ? selected[0] : null);
      setSelectionBox(null);
    }
    setDraggingId(null);
    setResizing(null);
    setDragSnapshot([]);
  };

  const updateSelected = (patch: Partial<BuilderItem>) => {
    if (!selectedId) {
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) {
          return item;
        }
        const next = { ...item, ...patch };
        const normalizedWidth =
          item.type === "text" && patch.text !== undefined && patch.width === undefined
            ? estimateTextBoxWidth(next.text, next.height)
            : next.width;
        const minSize = getMinSizeForType(item.type);
        const nextWidth = Math.max(minSize.width, normalizedWidth);
        const nextHeight = Math.max(minSize.height, next.height);
        return {
          ...next,
          width: nextWidth,
          height: nextHeight,
          x: clamp(next.x, 0, canvasWidth - Math.max(12, nextWidth)),
          y: clamp(next.y, 0, canvasHeight - Math.max(12, nextHeight))
        };
      })
    );
    setIsDirty(true);
  };

  const removeSelected = () => {
    if (!selectedIds.length) {
      return;
    }
    const selectedSet = new Set(selectedIds);
    setItems((prev) => prev.filter((item) => !selectedSet.has(item.id)));
    setSelectedIds([]);
    setSelectedId(null);
    setIsDirty(true);
  };

  const resetToNewLabel = () => {
    setItems([]);
    setSelectedIds([]);
    setSelectedId(null);
    setDraggingId(null);
    setResizing(null);
    setSelectionBox(null);
    setDragSnapshot([]);
    setIsDirty(true);
  };

  const changeSelectedLayer = (mode: "up" | "down" | "front" | "back") => {
    if (!selectedId) {
      return;
    }
    setItems((prev) => moveSelectedLayer(prev, selectedId, mode));
    setIsDirty(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedIds.length) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        const selectedSet = new Set(selectedIds);
        setItems((prev) => prev.filter((item) => !selectedSet.has(item.id)));
        setSelectedIds([]);
        setSelectedId(null);
        setIsDirty(true);
        return;
      }
      if (draggingId || resizing) {
        return;
      }
      const delta = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (event.key === "ArrowLeft") {
        dx = -delta;
      } else if (event.key === "ArrowRight") {
        dx = delta;
      } else if (event.key === "ArrowUp") {
        dy = -delta;
      } else if (event.key === "ArrowDown") {
        dy = delta;
      } else {
        return;
      }
      event.preventDefault();
      const selectedSet = new Set(selectedIds);
      setItems((prev) =>
        prev.map((item) => {
          if (!selectedSet.has(item.id)) {
            return item;
          }
          const maxX = canvasWidth - Math.max(12, item.width);
          const maxY = canvasHeight - Math.max(12, item.height);
          return {
            ...item,
            x: clamp(item.x + dx, 0, maxX),
            y: clamp(item.y + dy, 0, maxY)
          };
        })
      );
      setIsDirty(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, draggingId, resizing, canvasWidth, canvasHeight]);

  return (
      <section className="builder-grid">
        <aside className="builder-sidebar">
          <section className={`builder-accordion${accordionOpen.canvas ? " is-open" : ""}`}>
            <button type="button" className="builder-accordion-toggle" onClick={() => toggleAccordion("canvas")} aria-expanded={accordionOpen.canvas}>
              <span>Canvas Settings</span>
              <span className="builder-accordion-icon" aria-hidden>{accordionOpen.canvas ? "-" : "+"}</span>
            </button>
            <div className="builder-accordion-body">
              <div className="printer-profile">
                <div className="printer-row">
                  <label htmlFor="builder-density">DPI / Density:</label>
                  <div className="printer-controls">
                    <select
                      id="builder-density"
                      value={canvasSettings.densityDpmm}
                      onChange={(e) =>
                        updateCanvasSettings((prev) => ({
                          ...prev,
                          densityDpmm: Number(e.target.value) as PrintDensityDpmm
                        }))
                      }
                    >
                      <option value={8}>8 dpmm (203 dpi)</option>
                      <option value={12}>12 dpmm (300 dpi)</option>
                      <option value={24}>24 dpmm (600 dpi)</option>
                    </select>
                  </div>
                </div>
                <div className="printer-row printer-row-size">
                  <label>Label Size:</label>
                  <div className="printer-controls size-controls">
                    <div className="size-line">
                      <span>W</span>
                      <input
                        type="range"
                        min={sizeRange.min}
                        max={sizeRange.max}
                        step={sizeRange.step}
                        value={canvasSettings.labelWidth}
                        onChange={(e) =>
                          updateCanvasSettings((prev) => ({
                            ...prev,
                            labelWidth: Math.max(0.1, Number(e.target.value))
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={sizeRange.min}
                        max={sizeRange.max}
                        step={sizeRange.step}
                        value={canvasSettings.labelWidth}
                        onChange={(e) =>
                          updateCanvasSettings((prev) => ({
                            ...prev,
                            labelWidth: Math.max(0.1, Number(e.target.value))
                          }))
                        }
                      />
                    </div>
                    <div className="size-line">
                      <span>H</span>
                      <input
                        type="range"
                        min={sizeRange.min}
                        max={sizeRange.max}
                        step={sizeRange.step}
                        value={canvasSettings.labelHeight}
                        onChange={(e) =>
                          updateCanvasSettings((prev) => ({
                            ...prev,
                            labelHeight: Math.max(0.1, Number(e.target.value))
                          }))
                        }
                      />
                      <input
                        type="number"
                        min={sizeRange.min}
                        max={sizeRange.max}
                        step={sizeRange.step}
                        value={canvasSettings.labelHeight}
                        onChange={(e) =>
                          updateCanvasSettings((prev) => ({
                            ...prev,
                            labelHeight: Math.max(0.1, Number(e.target.value))
                          }))
                        }
                      />
                    </div>
                    <select
                      value={canvasSettings.labelUnit}
                      onChange={(e) => updateCanvasSettings((prev) => ({ ...prev, labelUnit: e.target.value as LabelUnit }))}
                    >
                      <option value="in">inches</option>
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                    </select>
                  </div>
                </div>
              </div>
              <p className="muted">
                Canvas dots: {canvasWidth} x {canvasHeight}
              </p>
            </div>
          </section>

          <section className={`builder-accordion${accordionOpen.grid ? " is-open" : ""}`}>
            <button type="button" className="builder-accordion-toggle" onClick={() => toggleAccordion("grid")} aria-expanded={accordionOpen.grid}>
              <span>Grid & Snap</span>
              <span className="builder-accordion-icon" aria-hidden>{accordionOpen.grid ? "-" : "+"}</span>
            </button>
            <div className="builder-accordion-body">
              <div className="printer-profile">
                <div className="printer-row printer-row-size">
                  <label>Grid Size:</label>
                  <div className="printer-controls size-controls">
                    <div className="size-line">
                      <span>px</span>
                      <input
                        type="range"
                        min={8}
                        max={80}
                        step={1}
                        value={safeGridSize}
                        onChange={(e) => onGridSizeChange(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        min={8}
                        max={80}
                        step={1}
                        value={safeGridSize}
                        onChange={(e) => onGridSizeChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <div className="printer-row printer-row-size">
                  <label>Grid Darkness:</label>
                  <div className="printer-controls size-controls">
                    <div className="size-line">
                      <span>%</span>
                      <input
                        type="range"
                        min={8}
                        max={65}
                        step={1}
                        value={safeGridDarkness}
                        onChange={(e) => onGridDarknessChange(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        min={8}
                        max={65}
                        step={1}
                        value={safeGridDarkness}
                        onChange={(e) => onGridDarknessChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <div className="printer-row">
                  <label htmlFor="builder-drag-mode">Drag Mode:</label>
                  <div className="printer-controls">
                    <select id="builder-drag-mode" value={dragMode} onChange={(e) => setDragMode(e.target.value as DragMode)}>
                      <option value="smooth">Smooth (free)</option>
                      <option value="step">Step</option>
                    </select>
                  </div>
                </div>
                <div className="printer-row printer-row-size">
                  <label>Step Size:</label>
                  <div className="printer-controls size-controls">
                    <div className="size-line">
                      <span>px</span>
                      <input
                        type="range"
                        min={1}
                        max={64}
                        step={1}
                        value={safeDragStep}
                        onChange={(e) => onDragStepChange(Number(e.target.value))}
                      />
                      <input
                        type="number"
                        min={1}
                        max={64}
                        step={1}
                        value={safeDragStep}
                        onChange={(e) => onDragStepChange(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <div className="printer-row printer-row-toggle">
                  <label htmlFor="builder-snap-grid">Snap To Grid</label>
                  <div className="printer-controls">
                    <input
                      id="builder-snap-grid"
                      type="checkbox"
                      checked={snapToGridEnabled}
                      onChange={(e) => setSnapToGridEnabled(e.target.checked)}
                    />
                  </div>
                </div>
                <div className="printer-row printer-row-toggle">
                  <label htmlFor="builder-snap-items">Snap To Elements</label>
                  <div className="printer-controls">
                    <input
                      id="builder-snap-items"
                      type="checkbox"
                      checked={snapToItemsEnabled}
                      onChange={(e) => setSnapToItemsEnabled(e.target.checked)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={`builder-accordion${accordionOpen.elements ? " is-open" : ""}`}>
            <button type="button" className="builder-accordion-toggle" onClick={() => toggleAccordion("elements")} aria-expanded={accordionOpen.elements}>
              <span>Elements</span>
              <span className="builder-accordion-icon" aria-hidden>{accordionOpen.elements ? "-" : "+"}</span>
            </button>
            <div className="builder-accordion-body">
              <div className="builder-palette">
                <section className={`builder-sub-accordion${accordionOpen.text ? " is-open" : ""}`}>
                  <button type="button" className="builder-sub-accordion-toggle" onClick={() => toggleAccordion("text")} aria-expanded={accordionOpen.text}>
                    <span>Text</span>
                    <span className="builder-sub-accordion-icon" aria-hidden>{accordionOpen.text ? "-" : "+"}</span>
                  </button>
                  <div className="builder-sub-accordion-body">
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "text")}>
                      Add Text
                    </button>
                  </div>
                </section>
                <section className={`builder-sub-accordion${accordionOpen.separators ? " is-open" : ""}`}>
                  <button type="button" className="builder-sub-accordion-toggle" onClick={() => toggleAccordion("separators")} aria-expanded={accordionOpen.separators}>
                    <span>Separators</span>
                    <span className="builder-sub-accordion-icon" aria-hidden>{accordionOpen.separators ? "-" : "+"}</span>
                  </button>
                  <div className="builder-sub-accordion-body">
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "line")}>
                      Horizontal Line
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "line-v")}>
                      Vertical Line
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "line-d")}>
                      Diagonal Line
                    </button>
                  </div>
                </section>
                <section className={`builder-sub-accordion${accordionOpen.shapes ? " is-open" : ""}`}>
                  <button type="button" className="builder-sub-accordion-toggle" onClick={() => toggleAccordion("shapes")} aria-expanded={accordionOpen.shapes}>
                    <span>Shapes</span>
                    <span className="builder-sub-accordion-icon" aria-hidden>{accordionOpen.shapes ? "-" : "+"}</span>
                  </button>
                  <div className="builder-sub-accordion-body">
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "box")}>
                      Rectangle
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "circle")}>
                      Circle
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "ellipse")}>
                      Ellipse
                    </button>
                  </div>
                </section>
                <section className={`builder-sub-accordion${accordionOpen.barcodes ? " is-open" : ""}`}>
                  <button type="button" className="builder-sub-accordion-toggle" onClick={() => toggleAccordion("barcodes")} aria-expanded={accordionOpen.barcodes}>
                    <span>Barcodes</span>
                    <span className="builder-sub-accordion-icon" aria-hidden>{accordionOpen.barcodes ? "-" : "+"}</span>
                  </button>
                  <div className="builder-sub-accordion-body">
                    <select
                      value={selectedBarcodeType}
                      onChange={(e) => setSelectedBarcodeType(e.target.value as BarcodeElementType)}
                      aria-label="Barcode type"
                    >
                      <option value="code128">Code128</option>
                      <option value="gs1128">GS1-128</option>
                      <option value="itf14">ITF-14</option>
                      <option value="code39">Code39</option>
                      <option value="pdf417">PDF417</option>
                      <option value="qr">QR</option>
                      <option value="datamatrix">DataMatrix</option>
                      <option value="ean13">EAN-13</option>
                    </select>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, selectedBarcodeType)}>
                      Barcode
                    </button>
                  </div>
                </section>
              </div>
              <p className="muted">Drag element and drop it on canvas.</p>
            </div>
          </section>

          <section className={`builder-accordion${accordionOpen.selected ? " is-open" : ""}`}>
            <button type="button" className="builder-accordion-toggle" onClick={() => toggleAccordion("selected")} aria-expanded={accordionOpen.selected}>
              <span>Selected</span>
              <span className="builder-accordion-icon" aria-hidden>{accordionOpen.selected ? "-" : "+"}</span>
            </button>
            <div className="builder-accordion-body">
              {selectedItem ? (
                <div className="builder-form">
                  <label>
                    X
                    <input type="number" value={Math.round(selectedItem.x)} onChange={(e) => updateSelected({ x: Number(e.target.value) })} />
                  </label>
                  <label>
                    Y
                    <input type="number" value={Math.round(selectedItem.y)} onChange={(e) => updateSelected({ y: Number(e.target.value) })} />
                  </label>
                  <label>
                    W
                    <input
                      type="number"
                      value={Math.round(selectedItem.width)}
                      onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      value={Math.round(selectedItem.height)}
                      onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                    />
                  </label>
                  {isFillableType(selectedItem.type) && (
                    <label className="builder-form-checkbox">
                      Filled
                      <input
                        type="checkbox"
                        checked={selectedItem.filled}
                        onChange={(e) => updateSelected({ filled: e.target.checked })}
                      />
                    </label>
                  )}
                  {isContentEditableType(selectedItem.type) && (
                    <label>
                      Content
                      <input type="text" value={selectedItem.text} onChange={(e) => updateSelected({ text: e.target.value })} />
                    </label>
                  )}
                  {selectedItem.type === "text" && (
                    <label>
                      Font
                      <select
                        value={selectedItem.font}
                        onChange={(e) => updateSelected({ font: e.target.value as ZplFont })}
                      >
                        <option value="0">0 (scalable)</option>
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="D">D</option>
                        <option value="E">E</option>
                        <option value="F">F</option>
                        <option value="G">G</option>
                        <option value="H">H</option>
                      </select>
                    </label>
                  )}
                  {(selectedItem.type === "text" || isBarcodeElementType(selectedItem.type)) && (
                    <label>
                      Orientation
                      <select
                        value={selectedItem.orientation}
                        onChange={(e) => updateSelected({ orientation: e.target.value as ZplOrientation })}
                      >
                        <option value="N">N (normal)</option>
                        <option value="R">R (90)</option>
                        <option value="I">I (180)</option>
                        <option value="B">B (270)</option>
                      </select>
                    </label>
                  )}
                  {selectedItem.type === "line-d" && (
                    <label>
                      Direction
                      <select
                        value={(selectedItem.text ?? "R").toUpperCase() === "L" ? "L" : "R"}
                        onChange={(e) => updateSelected({ text: e.target.value === "L" ? "L" : "R" })}
                      >
                        <option value="R">R (up-right)</option>
                        <option value="L">L (down-right)</option>
                      </select>
                    </label>
                  )}
                  <div className="builder-layer-tools">
                    <button type="button" className="download-btn" onClick={() => changeSelectedLayer("back")}>
                      Send Back
                    </button>
                    <button type="button" className="download-btn" onClick={() => changeSelectedLayer("down")}>
                      Backward
                    </button>
                    <button type="button" className="download-btn" onClick={() => changeSelectedLayer("up")}>
                      Forward
                    </button>
                    <button type="button" className="download-btn" onClick={() => changeSelectedLayer("front")}>
                      Bring Front
                    </button>
                  </div>
                  <button type="button" className="download-btn" onClick={removeSelected}>
                    Delete Element
                  </button>
                </div>
              ) : selectedIds.length > 1 ? (
                <p className="muted">{selectedIds.length} elements selected. Drag, use arrows, or press Delete.</p>
              ) : (
                <p className="muted">Click an element on canvas to edit.</p>
              )}
            </div>
          </section>
        </aside>

        <section className="builder-canvas-wrap">
          <h2>Label</h2>
          <div
            ref={canvasRef}
            className="builder-canvas"
            style={{
              width: `${canvasWidth * viewScale}px`,
              height: `${canvasHeight * viewScale}px`,
              backgroundImage:
                `linear-gradient(0deg, rgba(210, 223, 242, ${gridAlpha}) 1px, transparent 1px), ` +
                `linear-gradient(90deg, rgba(210, 223, 242, ${gridAlpha}) 1px, transparent 1px), ` +
                "linear-gradient(var(--label-paper), var(--label-paper))",
              backgroundSize: `${safeGridSize}px ${safeGridSize}px, ${safeGridSize}px ${safeGridSize}px, auto`
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onCanvasDrop}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={stopDrag}
          >
            {selectionBox && (
              <div
                className="builder-selection-box"
                style={{
                  left: `${Math.min(selectionBox.startX, selectionBox.currentX) * viewScale}px`,
                  top: `${Math.min(selectionBox.startY, selectionBox.currentY) * viewScale}px`,
                  width: `${Math.abs(selectionBox.currentX - selectionBox.startX) * viewScale}px`,
                  height: `${Math.abs(selectionBox.currentY - selectionBox.startY) * viewScale}px`
                }}
              />
            )}
            {[...items].sort((a, b) => a.zIndex - b.zIndex).map((item) => (
              <div
                key={item.id}
                className={`builder-item builder-item-${item.type}${selectedIds.includes(item.id) ? " is-selected" : ""}${item.filled ? " is-filled" : ""}`}
                style={{
                  left: `${item.x * viewScale}px`,
                  top: `${item.y * viewScale}px`,
                  width: `${Math.max(6, item.width) * viewScale}px`,
                  height: `${Math.max(6, item.height) * viewScale}px`,
                  zIndex: item.zIndex + 1,
                  ...(item.type === "line-d"
                    ? {
                        backgroundImage:
                          (item.text ?? "R").toUpperCase() === "L"
                            ? "linear-gradient(135deg, transparent calc(50% - 1px), #1f2c3f calc(50% - 1px), #1f2c3f calc(50% + 1px), transparent calc(50% + 1px))"
                            : "linear-gradient(45deg, transparent calc(50% - 1px), #1f2c3f calc(50% - 1px), #1f2c3f calc(50% + 1px), transparent calc(50% + 1px))"
                      }
                    : {})
                }}
                onMouseDown={(e) => onItemMouseDown(e, item)}
              >
                {item.type === "text" && (
                  <span
                    style={
                      (() => {
                        const isQuarterTurn = item.orientation === "R" || item.orientation === "B";
                        const textLength = Math.max(1, item.text.length);
                        const logicalWidth = isQuarterTurn ? item.height : item.width;
                        const logicalHeight = isQuarterTurn ? item.width : item.height;
                        const fitByHeight = logicalHeight * 0.82;
                        const fitByWidth = logicalWidth / (textLength * 0.62);
                        const fitted = Math.max(10, Math.min(fitByHeight, fitByWidth));
                        return {
                        fontSize: `${Math.max(10, Math.round(fitted * viewScale))}px`,
                        lineHeight: 1,
                        fontWeight: 700,
                        transform:
                          item.orientation === "R"
                            ? "rotate(90deg)"
                            : item.orientation === "I"
                              ? "rotate(180deg)"
                              : item.orientation === "B"
                                ? "rotate(270deg)"
                                : undefined,
                        transformOrigin: "50% 50%"
                        };
                      })()
                    }
                  >
                    {item.text}
                  </span>
                )}
                {item.type === "passthrough" && (
                  <span className="builder-item-passthrough-label">{item.text || "PASSTHROUGH"}</span>
                )}
                {isBarcodeElementType(item.type) && <BuilderBarcodePreview item={item} />}
                <span className="builder-item-resize-handle builder-item-resize-handle-right" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "right")} />
                <span className="builder-item-resize-handle builder-item-resize-handle-bottom" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "bottom")} />
                <span className="builder-item-resize-handle builder-item-resize-handle-corner" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "corner")} />
              </div>
            ))}
          </div>
        </section>

        <aside className="builder-zpl">
          <section className={`builder-zpl-accordion${zplAccordionOpen === "generated" ? " is-open" : ""}`}>
            <button
              type="button"
              className="builder-zpl-accordion-toggle"
              onClick={() => openZplAccordion("generated")}
              aria-expanded={zplAccordionOpen === "generated"}
            >
              <span>Generated ZPL</span>
              <span className="builder-zpl-accordion-icon" aria-hidden>{zplAccordionOpen === "generated" ? "-" : "+"}</span>
            </button>
            <div className="builder-zpl-accordion-body">
              <textarea value={generatedZpl} readOnly />
            </div>
          </section>
          <section className={`builder-zpl-accordion${zplAccordionOpen === "loaded" ? " is-open" : ""}`}>
            <button
              type="button"
              className="builder-zpl-accordion-toggle"
              onClick={() => openZplAccordion("loaded")}
              aria-expanded={zplAccordionOpen === "loaded"}
            >
              <span>Loaded Source ZPL</span>
              <span className="builder-zpl-accordion-icon" aria-hidden>{zplAccordionOpen === "loaded" ? "-" : "+"}</span>
            </button>
            <div className="builder-zpl-accordion-body">
              <textarea value={seedZpl} readOnly />
            </div>
          </section>
          <div className="builder-bottom-actions">
            <button type="button" className="download-btn" onClick={resetToNewLabel}>
              New Label
            </button>
            <button type="button" className="download-btn" onClick={() => onBack()}>
              Back
            </button>
            <button type="button" className="download-btn" onClick={() => onBack(isDirty ? generatedZpl : seedZpl)}>
              Apply To Main View
            </button>
            <button type="button" className="download-btn" onClick={() => onBack(seedZpl)}>
              Use Source ZPL And Back
            </button>
          </div>
        </aside>
      </section>
  );
}
