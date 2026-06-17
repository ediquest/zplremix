import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from "react";
import bwipjs from "bwip-js";
import type { PrinterSettings } from "../../core/types";
import { ZplCanvas } from "../preview/ZplCanvas";

type LabelBuilderPageProps = {
  seedZpl: string;
  onBack: (nextZpl?: string) => void;
};

type BuilderElementType =
  | "passthrough"
  | "text"
  | "graphic"
  | "table"
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
  | "shade"
  | "circle"
  | "ellipse";
type BarcodeElementType = "code128" | "gs1128" | "itf14" | "code39" | "pdf417" | "qr" | "datamatrix" | "ean13";
type DragMode = "smooth" | "step";
type BuilderAccordionKey = "canvas" | "grid" | "elements" | "selected" | "barcodes" | "text" | "separators" | "shapes" | "generator";
type BuilderZplAccordionKey = "generated" | "loaded";
type ZplOrientation = "N" | "R" | "I" | "B";
type ZplFont = "0" | "A" | "B" | "D" | "E" | "F" | "G" | "H";
type BatchMode = "increment" | "decrement";

type BuilderItem = {
  id: string;
  type: BuilderElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  textWidthRatio?: number;
  locked?: boolean;
  hidden?: boolean;
  showText?: boolean;
  lockAspectRatio?: boolean;
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
  lockAspectRatio: boolean;
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

type BuilderGuideLine = {
  axis: "x" | "y";
  value: number;
};

type PrintDensityDpmm = 8 | 12 | 24;
type LabelUnit = "in" | "mm" | "cm";

type BuilderCanvasSettings = {
  densityDpmm: PrintDensityDpmm;
  labelWidth: number;
  labelHeight: number;
  labelUnit: LabelUnit;
};

type UploadedGraphic = {
  name: string;
  command: string;
  width: number;
  height: number;
};

type BatchGeneratorRule = {
  itemId: string;
  mode: BatchMode;
  start: number;
  step: number;
  pad: number;
  prefix: string;
  suffix: string;
};

type StoredBatchBuilderProject = {
  id: string;
  savedAt: string;
  canvasSettings: BuilderCanvasSettings;
  items: BuilderItem[];
  selectedBarcodeType: BarcodeElementType;
  gridSize: number;
  gridDarkness: number;
  dragMode: DragMode;
  dragStep: number;
  snapToGridEnabled: boolean;
  snapToItemsEnabled: boolean;
  uploadedGraphics: UploadedGraphic[];
  includeSeedGraphics: boolean;
  batchRules: BatchGeneratorRule[];
  batchLabelCount: number;
};

type InitialBuilderState = {
  canvasSettings: BuilderCanvasSettings;
  items: BuilderItem[];
  selectedBarcodeType: BarcodeElementType;
  gridSize: number;
  gridDarkness: number;
  dragMode: DragMode;
  dragStep: number;
  snapToGridEnabled: boolean;
  snapToItemsEnabled: boolean;
  uploadedGraphics: UploadedGraphic[];
  includeSeedGraphics: boolean;
  batchRules: BatchGeneratorRule[];
  batchLabelCount: number;
};

type BuilderHistorySnapshot = InitialBuilderState;

type BuilderClipboardSnapshot = {
  items: BuilderItem[];
  pasteCount: number;
};

const LS_PREVIEW_SETTINGS_KEY = "zplremix.preview.settings";
const LS_BUILDER_BATCH_PROJECTS_KEY = "zplremix.builder.batch.projects";
const LS_BUILDER_LAST_BATCH_ID_KEY = "zplremix.builder.batch.last_id";
const QR_COMPAT_OFFSET_X = 0;
const QR_COMPAT_OFFSET_Y = 12;
const QR_PREVIEW_DRAW_ADJUST = 0.4;
const QR_EFFECTIVE_SIZE_MAX = 293;
const DATAMATRIX_EFFECTIVE_SIZE_MAX = 299;
const TEXT_WIDTH_RATIO_MIN = 0.2;
const TEXT_WIDTH_RATIO_MAX = 64;
const BUILDER_HISTORY_LIMIT = 80;
const TABLE_META_PREFIX = "ZPLRMX_TABLE";
const SHADE_META_PREFIX = "ZPLRMX_SHADE";
const BATCH_META_PREFIX = "ZPLRMX_BATCH";
const TABLE_LAYOUT_TEMPLATES = ["2x2", "3x2", "3x3", "4x2", "4x3", "4x4", "6x3", "6x4"] as const;
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

function extractBatchProjectIdFromZpl(zpl: string): string | null {
  const normalized = (zpl ?? "")
    .replace(/\u000F/g, "^FS\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E\u0010-\u001F\u007F]/g, "");
  const re = new RegExp(`\\^FX${BATCH_META_PREFIX},([A-Za-z0-9_-]{6,64})`, "ig");
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    if (match[1]) {
      return match[1];
    }
  }
  return null;
}

function buildBatchMarkerLine(batchId: string, index: number, total: number): string {
  return `^FX${BATCH_META_PREFIX},${batchId},${index + 1},${total}`;
}

function injectBatchMarker(zpl: string, batchId: string, index: number, total: number): string {
  const marker = buildBatchMarkerLine(batchId, index, total);
  const safe = (zpl ?? "").trim();
  if (!safe) {
    return `^XA\n${marker}\n^XZ`;
  }
  if (/^\^XA\b/i.test(safe)) {
    return safe.replace(/^\^XA\b/i, `^XA\n${marker}`);
  }
  return `^XA\n${marker}\n${safe}\n^XZ`;
}

function loadStoredBatchProjects(): Record<string, StoredBatchBuilderProject> {
  try {
    const raw = window.localStorage.getItem(LS_BUILDER_BATCH_PROJECTS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, StoredBatchBuilderProject>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredBatchProject(project: StoredBatchBuilderProject) {
  try {
    const existing = loadStoredBatchProjects();
    const merged: Record<string, StoredBatchBuilderProject> = {
      ...existing,
      [project.id]: project
    };
    const sorted = Object.values(merged).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
    const limited = sorted.slice(0, 20);
    const compact = Object.fromEntries(limited.map((entry) => [entry.id, entry]));
    window.localStorage.setItem(LS_BUILDER_BATCH_PROJECTS_KEY, JSON.stringify(compact));
    window.localStorage.setItem(LS_BUILDER_LAST_BATCH_ID_KEY, project.id);
  } catch {
    // Ignore storage failures.
  }
}

function loadLastBatchProjectId(): string | null {
  try {
    const raw = window.localStorage.getItem(LS_BUILDER_LAST_BATCH_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function deleteStoredBatchProject(projectId: string | null) {
  if (!projectId) {
    return;
  }
  try {
    const existing = loadStoredBatchProjects();
    if (existing[projectId]) {
      delete existing[projectId];
      window.localStorage.setItem(LS_BUILDER_BATCH_PROJECTS_KEY, JSON.stringify(existing));
    }
    const last = loadLastBatchProjectId();
    if (last === projectId) {
      window.localStorage.removeItem(LS_BUILDER_LAST_BATCH_ID_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

function extractFirstLabelFromPayload(zpl: string): string {
  const match = /\^XA[\s\S]*?\^XZ/i.exec(zpl ?? "");
  return match?.[0] ?? zpl;
}

function createDefaultInitialBuilderState(seedZpl: string): InitialBuilderState {
  return {
    canvasSettings: loadCanvasSettings(),
    items: parseItemsFromZpl(seedZpl),
    selectedBarcodeType: "code128",
    gridSize: 24,
    gridDarkness: 22,
    dragMode: "smooth",
    dragStep: 12,
    snapToGridEnabled: true,
    snapToItemsEnabled: true,
    uploadedGraphics: [],
    includeSeedGraphics: true,
    batchRules: [],
    batchLabelCount: 10
  };
}

function resolveInitialBuilderState(seedZpl: string): InitialBuilderState {
  const fallback = createDefaultInitialBuilderState(seedZpl);
  const projects = loadStoredBatchProjects();
  let batchId = extractBatchProjectIdFromZpl(seedZpl);
  if (!batchId && (seedZpl.match(/\^XA/gi)?.length ?? 0) > 1) {
    batchId = loadLastBatchProjectId();
  }
  if (!batchId) {
    const singleLabelFallback = extractFirstLabelFromPayload(seedZpl);
    return {
      ...fallback,
      items: parseItemsFromZpl(singleLabelFallback)
    };
  }
  const stored = projects[batchId];
  if (!stored) {
    const singleLabelFallback = extractFirstLabelFromPayload(seedZpl);
    return {
      ...fallback,
      items: parseItemsFromZpl(singleLabelFallback)
    };
  }
  return {
    ...fallback,
    canvasSettings: stored.canvasSettings ?? fallback.canvasSettings,
    items: Array.isArray(stored.items) ? stored.items : fallback.items,
    selectedBarcodeType: stored.selectedBarcodeType ?? fallback.selectedBarcodeType,
    gridSize: Number.isFinite(stored.gridSize) ? stored.gridSize : fallback.gridSize,
    gridDarkness: Number.isFinite(stored.gridDarkness) ? stored.gridDarkness : fallback.gridDarkness,
    dragMode: stored.dragMode === "step" ? "step" : "smooth",
    dragStep: Number.isFinite(stored.dragStep) ? stored.dragStep : fallback.dragStep,
    snapToGridEnabled: stored.snapToGridEnabled !== false,
    snapToItemsEnabled: stored.snapToItemsEnabled !== false,
    uploadedGraphics: Array.isArray(stored.uploadedGraphics) ? stored.uploadedGraphics : fallback.uploadedGraphics,
    includeSeedGraphics: stored.includeSeedGraphics !== false,
    batchRules: Array.isArray(stored.batchRules) ? stored.batchRules : fallback.batchRules,
    batchLabelCount: Number.isFinite(stored.batchLabelCount) ? Math.max(1, Math.round(stored.batchLabelCount)) : fallback.batchLabelCount
  };
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

function estimateTextBoxWidth(text: string, fontHeight: number, fontWidth?: number, font: ZplFont = "0"): number {
  const safeHeight = Math.max(12, fontHeight);
  const textHeight = Math.max(10, Math.round(safeHeight * 0.8));
  const payload = text || " ";
  const widthFromZpl = Number.isFinite(fontWidth) ? Number(fontWidth) : NaN;
  const ratioFromZpl = Number.isFinite(widthFromZpl) && widthFromZpl > 0
    ? clamp(widthFromZpl / Math.max(1, textHeight), TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX)
    : 1;
  const fallbackPerChar = Number.isFinite(widthFromZpl) && widthFromZpl > 0
    ? Math.max(4, Math.round(widthFromZpl * 0.72))
    : Math.max(5, Math.round(textHeight * 0.56));
  let measured = payload.length * fallbackPerChar;
  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `700 ${textHeight}px ${resolveBuilderTextFontFamily(font)}`;
        measured = Math.max(measured * 0.6, ctx.measureText(payload).width);
      }
    } catch {
      // no-op: keep fallback measurement
    }
  }
  const padding = Math.max(6, Math.round(textHeight * 0.35));
  const widthCalibration = resolveBuilderTextWidthCalibration(font);
  const widthScale = widthCalibration * ratioFromZpl;
  return Math.max(22, Math.round(measured * widthScale + padding));
}

function resolveTextWidthRatioForBox(text: string, fontHeight: number, targetWidth: number, font: ZplFont): number {
  const textHeight = Math.max(10, Math.round(Math.max(12, fontHeight) * 0.8));
  const safeTarget = Math.max(22, targetWidth);
  let low = TEXT_WIDTH_RATIO_MIN;
  let high = TEXT_WIDTH_RATIO_MAX;
  for (let index = 0; index < 12; index += 1) {
    const mid = (low + high) / 2;
    const measured = estimateTextBoxWidth(text, fontHeight, textHeight * mid, font);
    if (measured < safeTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return clamp((low + high) / 2, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX);
}

function resolveBuilderTextFontFamily(font: ZplFont): string {
  const normalized = (font ?? "0").toUpperCase();
  if (normalized === "0") {
    return "'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue', Arial, sans-serif";
  }
  return "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
}

function resolveBuilderTextWidthCalibration(font: ZplFont): number {
  const normalized = (font ?? "0").toUpperCase();
  return normalized === "0" ? 0.88 : 1;
}

function createItem(type: BuilderElementType, x: number, y: number, zIndex: number): BuilderItem {
  if (type === "text") {
    const text = "New text";
    const height = 32;
    const font: ZplFont = "0";
    return {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width: estimateTextBoxWidth(text, height, undefined, font),
      height,
      text,
      textWidthRatio: 0.6,
      locked: false,
      hidden: false,
      lockAspectRatio: true,
      filled: false,
      zIndex,
      font,
      orientation: "N"
    };
  }
  if (type === "graphic") {
    return {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width: 180,
      height: 120,
      text: "R:LOGO.GRF",
      locked: false,
      hidden: false,
      filled: false,
      zIndex,
      font: "0",
      orientation: "N"
    };
  }
  if (type === "table") {
    return {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width: 320,
      height: 160,
      text: "3x2",
      locked: false,
      hidden: false,
      filled: false,
      zIndex,
      font: "0",
      orientation: "N"
    };
  }
  if (type === "code128") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 120, text: "1234567890", locked: false, hidden: false, showText: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "gs1128") {
    return { id: crypto.randomUUID(), type, x, y, width: 300, height: 120, text: "(00)012345678901234567", locked: false, hidden: false, showText: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "itf14") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 110, text: "01234567890123", locked: false, hidden: false, showText: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "code39") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 110, text: "CODE39-123", locked: false, hidden: false, showText: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "pdf417") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 140, text: "PDF417 SAMPLE DATA", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "qr") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "https://zplremix.local", locked: false, hidden: false, lockAspectRatio: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "datamatrix") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "DMX-123456", locked: false, hidden: false, lockAspectRatio: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "ean13") {
    return { id: crypto.randomUUID(), type, x, y, width: 260, height: 110, text: "5901234123457", locked: false, hidden: false, showText: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line") {
    return { id: crypto.randomUUID(), type, x, y, width: 280, height: 4, text: "", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line-v") {
    return { id: crypto.randomUUID(), type, x, y, width: 4, height: 220, text: "", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "line-d") {
    return { id: crypto.randomUUID(), type, x, y, width: 220, height: 120, text: "R", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "shade") {
    return { id: crypto.randomUUID(), type, x, y, width: 200, height: 120, text: "55", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "circle") {
    return { id: crypto.randomUUID(), type, x, y, width: 120, height: 120, text: "", locked: false, hidden: false, lockAspectRatio: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  if (type === "ellipse") {
    return { id: crypto.randomUUID(), type, x, y, width: 180, height: 120, text: "", locked: false, hidden: false, lockAspectRatio: true, filled: false, zIndex, font: "0", orientation: "N" };
  }
  return { id: crypto.randomUUID(), type, x, y, width: 240, height: 120, text: "", locked: false, hidden: false, filled: false, zIndex, font: "0", orientation: "N" };
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

function parseTableSpec(text: string): { rows: number; cols: number } {
  const normalized = (text ?? "").trim().toLowerCase();
  const match = /^(\d+)\s*[x,]\s*(\d+)$/.exec(normalized);
  const rows = clamp(Number(match?.[1] ?? 3), 1, 24);
  const cols = clamp(Number(match?.[2] ?? 2), 1, 24);
  return { rows, cols };
}

function toTableSpecText(text: string): string {
  const { rows, cols } = parseTableSpec(text);
  return `${rows}x${cols}`;
}

function normalizeShadePercent(text: string): number {
  const parsed = Number.parseInt((text ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return 55;
  }
  return clamp(Math.round(parsed), 10, 90);
}

function buildShadeGfa(width: number, height: number, shadePercent: number): string {
  const safeWidth = Math.max(8, Math.round(width));
  const safeHeight = Math.max(8, Math.round(height));
  const bytesPerRow = Math.ceil(safeWidth / 8);
  const totalBytes = bytesPerRow * safeHeight;
  const threshold = clamp(shadePercent, 10, 90) / 100;
  const bayer4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const chunks: string[] = [];
  for (let y = 0; y < safeHeight; y += 1) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let value = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit;
        if (x >= safeWidth) {
          continue;
        }
        const matrixValue = bayer4x4[y % 4][x % 4] / 16;
        if (matrixValue < threshold) {
          value |= 1 << (7 - bit);
        }
      }
      chunks.push(value.toString(16).toUpperCase().padStart(2, "0"));
    }
  }
  return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${chunks.join("")}`;
}

function normalizeGraphicNameFromFilename(filename: string): string {
  const base = (filename ?? "LOGO")
    .replace(/\.[^.]+$/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 32) || "LOGO";
  return normalizeGraphicName(`R:${base}.GRF`);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function pngToDg(file: File, name: string): Promise<UploadedGraphic> {
  const dataUrl = await fileToDataUrl(file);
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const width = Math.max(1, Math.round(image.naturalWidth || image.width));
  const height = Math.max(1, Math.round(image.naturalHeight || image.height));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not open image context.");
  }
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const totalBytes = bytesPerRow * height;
  const chunks: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit;
        if (x >= width) {
          continue;
        }
        const offset = (y * width + x) * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const a = data[offset + 3];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        const dark = a > 20 && luminance < 170;
        if (dark) {
          byte |= 1 << (7 - bit);
        }
      }
      chunks.push(byte.toString(16).toUpperCase().padStart(2, "0"));
    }
  }
  return {
    name,
    width,
    height,
    command: `~DG${name},${totalBytes},${bytesPerRow},${chunks.join("")}`
  };
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

function getLinearBarcodePayload(item: BuilderItem): string {
  if (item.type === "ean13") {
    return normalizeEan13(item.text);
  }
  if (item.type === "itf14") {
    return item.text.replace(/\D/g, "").slice(0, 14) || "01234567890123";
  }
  if (item.type === "gs1128") {
    return item.text.startsWith(">8") ? item.text : `>8${item.text}`;
  }
  return item.text;
}

function getLinearBarcodeModuleWidth(item: BuilderItem): number {
  const payload = getLinearBarcodePayload(item);
  const effectiveType = item.type === "gs1128" ? "code128" : item.type;
  const baseWidth = estimateLinearBarcodeWidthDots(effectiveType, payload, 1);
  return clamp(Math.round(Math.max(12, item.width) / Math.max(1, baseWidth)), 1, 10);
}

function getLinearBarcodeSourceModuleWidth(item: BuilderItem): number {
  if (item.sourceBody) {
    const byArgs = parseZplCommandArgs(item.sourceBody, "BY");
    const parsed = Number(byArgs[0] ?? "");
    if (Number.isFinite(parsed) && parsed > 0) {
      return clamp(Math.round(parsed), 1, 10);
    }
  }
  return getLinearBarcodeModuleWidth(item);
}

function normalizePastedItemFrame(item: BuilderItem): BuilderItem {
  if (!isLinearBarcodeElementType(item.type)) {
    return item;
  }
  if (item.sourceBody) {
    return item;
  }
  const effectiveType = item.type === "gs1128" ? "code128" : item.type;
  const moduleWidth = getLinearBarcodeSourceModuleWidth(item);
  return {
    ...item,
    width: estimateLinearBarcodeWidthDots(effectiveType, getLinearBarcodePayload(item), moduleWidth)
  };
}

function getTextFontHeight(item: BuilderItem): number {
  return Math.max(14, Math.round(item.height * 0.8));
}

function getTextCharacterWidth(item: BuilderItem): number {
  return Math.max(8, Math.round(getTextFontHeight(item) * clamp(item.textWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX)));
}

function getQrModuleSize(item: BuilderItem): number {
  return clamp(Math.round(Math.min(item.width, item.height) / 28), 2, 10);
}

function getDatamatrixModuleSize(item: BuilderItem): number {
  return clamp(Math.round(Math.min(item.width, item.height) / 24), 3, 12);
}

function getPdf417ColumnWidth(item: BuilderItem): number {
  return clamp(Math.round(item.width / 42), 2, 30);
}

function getPdf417Rows(item: BuilderItem): number {
  return clamp(Math.round(item.height / 16), 3, 30);
}

function getDimensionLabels(item: BuilderItem): { width: string; height: string } {
  if (item.type === "text") {
    return { width: "Box W", height: "Box H" };
  }
  if (isLinearBarcodeElementType(item.type)) {
    return { width: "Target W", height: "Bar H" };
  }
  if (item.type === "qr" || item.type === "datamatrix") {
    return { width: "Symbol W", height: "Symbol H" };
  }
  if (item.type === "pdf417") {
    return { width: "Target W", height: "Target H" };
  }
  return { width: "W", height: "H" };
}

function getEffectiveDetails(item: BuilderItem): string[] {
  if (item.type === "text") {
    return [`^A height ${getTextFontHeight(item)}`, `char width ${getTextCharacterWidth(item)}`];
  }
  if (isLinearBarcodeElementType(item.type)) {
    const moduleWidth = getLinearBarcodeModuleWidth(item);
    const effectiveType = item.type === "gs1128" ? "code128" : item.type;
    const effectiveWidth = estimateLinearBarcodeWidthDots(effectiveType, getLinearBarcodePayload(item), moduleWidth);
    return [`^BY module ${moduleWidth}`, `effective W ${effectiveWidth}`, `bar H ${Math.max(40, Math.round(item.height))}`];
  }
  if (item.type === "qr") {
    const moduleSize = getQrModuleSize(item);
    const effective = estimateQrBoxSize(item.text, moduleSize);
    return [`^BQ magnification ${moduleSize}`, `effective ${effective.width} x ${effective.height}`];
  }
  if (item.type === "datamatrix") {
    const moduleSize = getDatamatrixModuleSize(item);
    const effective = estimateDatamatrixBoxSize(item.text, moduleSize);
    return [`^BX module ${moduleSize}`, `effective ${effective.width} x ${effective.height}`];
  }
  if (item.type === "pdf417") {
    return [`^B7 column width ${getPdf417ColumnWidth(item)}`, `rows ${getPdf417Rows(item)}`];
  }
  return [`${Math.round(item.width)} x ${Math.round(item.height)} dots`];
}

function buildItemFingerprint(item: BuilderItem): string {
  return [
    item.type,
    item.text,
    item.textWidthRatio ?? 0.6,
    Math.round(item.width),
    Math.round(item.height),
    item.orientation,
    item.font,
    item.locked ? "1" : "0",
    item.hidden ? "1" : "0",
    item.showText === false ? "0" : "1",
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
): { value: number; guide: number | null } {
  let snapped = value;
  let guide: number | null = null;
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
        if (axis === "x") {
          if (candidate === otherStart || candidate === otherEnd) {
            guide = candidate;
          } else if (candidate === otherStart - size) {
            guide = otherStart;
          } else if (candidate === otherEnd - size) {
            guide = otherEnd;
          } else {
            guide = otherCenter;
          }
        } else {
          if (candidate === otherStart || candidate === otherEnd) {
            guide = candidate;
          } else if (candidate === otherStart - size) {
            guide = otherStart;
          } else if (candidate === otherEnd - size) {
            guide = otherEnd;
          } else {
            guide = otherCenter;
          }
        }
      }
    }
  }
  return { value: snapped, guide };
}

function snapResizeEdgeToItems(
  edge: number,
  axis: "x" | "y",
  resizingId: string,
  items: BuilderItem[],
  threshold: number
): { edge: number; guide: number | null } {
  let snapped = edge;
  let guide: number | null = null;
  let bestDistance = threshold + 1;
  for (const other of items) {
    if (other.id === resizingId) {
      continue;
    }
    const otherStart = axis === "x" ? other.x : other.y;
    const otherEnd = axis === "x" ? other.x + other.width : other.y + other.height;
    const otherCenter = (otherStart + otherEnd) / 2;
    const candidates = [otherStart, otherEnd, otherCenter];
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - edge);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        snapped = candidate;
        guide = candidate;
      }
    }
  }
  return { edge: snapped, guide };
}

function buildZplFromItems(
  items: BuilderItem[],
  canvasWidth: number,
  canvasHeight: number,
  graphicDownloads: string[] = [],
  graphicSizes: Map<string, { width: number; height: number }> = new Map()
): string {
  const lines = ["^XA", `^PW${canvasWidth}`, `^LL${canvasHeight}`, "^LH0,0", "^CI28"];
  graphicDownloads.forEach((entry) => lines.push(entry));
  [...items].sort((a, b) => a.zIndex - b.zIndex).forEach((item) => {
    if (item.hidden) {
      return;
    }
    const x = Math.round(item.x);
    const y = Math.round(item.y);
    const canReuseSource =
      item.type !== "table"
      &&
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
      const textWidthRatio = clamp(item.textWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX);
      const textWidth = Math.max(8, Math.round(textHeight * textWidthRatio));
      lines.push(`^FO${x},${y}^A${item.font}${item.orientation},${textHeight},${textWidth}^FD${item.text}^FS`);
      return;
    }
    if (item.type === "graphic") {
      const name = normalizeGraphicName(item.text || "R:LOGO.GRF");
      const base = graphicSizes.get(name) ?? { width: Math.max(1, Math.round(item.width)), height: Math.max(1, Math.round(item.height)) };
      const mx = clamp(Math.round(Math.max(1, item.width) / Math.max(1, base.width)), 1, 99);
      const my = clamp(Math.round(Math.max(1, item.height) / Math.max(1, base.height)), 1, 99);
      lines.push(`^FO${x},${y}^XG${name},${mx},${my}^FS`);
      return;
    }
    if (item.type === "table") {
      const width = Math.max(12, Math.round(item.width));
      const height = Math.max(12, Math.round(item.height));
      const { rows, cols } = parseTableSpec(item.text);
      const meta = `^FX${TABLE_META_PREFIX},${rows},${cols}`;
      lines.push(`^FO${x},${y}^GB${width},${height},2${meta},OUTER^FS`);
      for (let col = 1; col < cols; col += 1) {
        const xLine = x + Math.round((width * col) / cols);
        lines.push(`^FO${xLine},${y}^GB1,${height},1${meta},V^FS`);
      }
      for (let row = 1; row < rows; row += 1) {
        const yLine = y + Math.round((height * row) / rows);
        lines.push(`^FO${x},${yLine}^GB${width},1,1${meta},H^FS`);
      }
      return;
    }
    if (item.type === "shade") {
      const width = Math.max(8, Math.round(item.width));
      const height = Math.max(8, Math.round(item.height));
      const shadePercent = normalizeShadePercent(item.text);
      const meta = `^FX${SHADE_META_PREFIX},${shadePercent}`;
      lines.push(`^FO${x},${y}${meta}${buildShadeGfa(width, height, shadePercent)}^FS`);
      return;
    }
    if (item.type === "code128") {
      const barHeight = Math.max(40, Math.round(item.height));
      const moduleWidth = getLinearBarcodeModuleWidth(item);
      const showText = item.showText === false ? "N" : "Y";
      lines.push(`^FO${x},${y}^BY${moduleWidth},2,${barHeight}^BC${item.orientation},${barHeight},${showText},N,N^FD${item.text}^FS`);
      return;
    }
    if (item.type === "gs1128") {
      const barHeight = Math.max(40, Math.round(item.height));
      const payload = item.text.startsWith(">8") ? item.text : `>8${item.text}`;
      const moduleWidth = getLinearBarcodeModuleWidth(item);
      const showText = item.showText === false ? "N" : "Y";
      lines.push(`^FO${x},${y}^BY${moduleWidth},2,${barHeight}^BC${item.orientation},${barHeight},${showText},N,N^FD${payload}^FS`);
      return;
    }
    if (item.type === "itf14") {
      const barHeight = Math.max(40, Math.round(item.height));
      const digits = item.text.replace(/\D/g, "").slice(0, 14) || "01234567890123";
      const moduleWidth = getLinearBarcodeModuleWidth(item);
      const showText = item.showText === false ? "N" : "Y";
      lines.push(`^FO${x},${y}^BY${moduleWidth},2,${barHeight}^B2${item.orientation},${barHeight},${showText},N,N^FD${digits}^FS`);
      return;
    }
    if (item.type === "code39") {
      const barHeight = Math.max(40, Math.round(item.height));
      const moduleWidth = getLinearBarcodeModuleWidth(item);
      const showText = item.showText === false ? "N" : "Y";
      lines.push(`^FO${x},${y}^BY${moduleWidth},2,${barHeight}^B3${item.orientation},N,${barHeight},${showText},N^FD${item.text}^FS`);
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
      const moduleWidth = getLinearBarcodeModuleWidth(item);
      const showText = item.showText === false ? "N" : "Y";
      lines.push(`^FO${x},${y}^BY${moduleWidth},2,${barHeight}^BE${item.orientation},${barHeight},${showText},N^FD${digits}^FS`);
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
        locked: false,
        hidden: false,
        lockAspectRatio: item.lockAspectRatio ?? supportsAspectRatioLock(item.type),
        sourceCommand: command,
        sourceBody: body,
        sourceAnchorX: rawX,
        sourceAnchorY: rawY,
        sourceViewX: item.x,
        sourceViewY: item.y,
        sourceFingerprint: buildItemFingerprint(item)
      });
    };

    const shadeMeta = new RegExp(`\\^FX${SHADE_META_PREFIX},(\\d{1,3})`, "i").exec(body);
    if (shadeMeta && /\^GF/i.test(body)) {
      const gfSize = parseGraphicFieldSize(body) ?? { width: 120, height: 80 };
      const shadePercent = normalizeShadePercent(shadeMeta[1] ?? "55");
      pushParsed({
        id: crypto.randomUUID(),
        type: "shade",
        x: rawX,
        y: rawY,
        width: gfSize.width,
        height: gfSize.height,
        text: String(shadePercent),
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }

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

      // Some PRN streams place following commands (e.g. ^BY/^FT/^BC/^FD)
      // directly after ^GF data without a dedicated ^FS. Recover those
      // commands as separate editable items.
      const gfSegment = /\^GF[^^]*/i.exec(body);
      const trailing = gfSegment ? body.slice(gfSegment.index + gfSegment[0].length).trim() : "";
      if (trailing && /\^(FO|FT)\b/i.test(trailing)) {
        const recovered = parseItemsFromZpl(`^XA\n${trailing}\n^XZ`);
        recovered.forEach((entry) => {
          items.push({
            ...entry,
            id: crypto.randomUUID(),
            zIndex: items.length
          });
        });
      }
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
        type: "graphic",
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height,
        text: name || "R:LOGO.GRF",
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: fieldOrientation
      });
      continue;
    }

    const gb = /\^GB(\d+),(\d+)(?:,(\d+))?/i.exec(body);
    const tableMeta = new RegExp(`\\^FX${TABLE_META_PREFIX},(\\d+),(\\d+),(OUTER|V|H)`, "i").exec(body);
    if (tableMeta) {
      const part = (tableMeta[3] ?? "").toUpperCase();
      if (part !== "OUTER") {
        continue;
      }
      const rows = clamp(Number(tableMeta[1] ?? 3), 1, 24);
      const cols = clamp(Number(tableMeta[2] ?? 2), 1, 24);
      const width = Math.max(12, Number(gb?.[1] ?? 320));
      const height = Math.max(12, Number(gb?.[2] ?? 160));
      pushParsed({
        id: crypto.randomUUID(),
        type: "table",
        x: rawX,
        y: rawY,
        width,
        height,
        text: `${rows}x${cols}`,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation: "N"
      });
      continue;
    }
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
      const fd = /\^FD(?:[A-Z]{1,2},)?([^^]*)/i.exec(body);
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
      const fd = /\^FD([^^]*)/i.exec(body);
      const bxArgs = parseZplCommandArgs(body, "BX");
      const orientation = normalizeOrientation(bxArgs[0] || fieldOrientation);
      const moduleWidth = clamp(Number(bxArgs[1] ?? 5), 1, 12);
      const payload = fd?.[1] ?? "DMX-123456";
      const dmSize = estimateDatamatrixBoxSize(payload, moduleWidth);
      pushParsed({
        id: crypto.randomUUID(),
        type: "datamatrix",
        x: rawX,
        y: rawY,
        width: dmSize.width,
        height: dmSize.height,
        text: payload,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^BE/i.test(body)) {
      const fd = /\^FD([^^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const beArgs = parseZplCommandArgs(body, "BE");
      const orientation = normalizeOrientation(beArgs[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(beArgs, byHeight);
      const showText = (beArgs[2] ?? "Y").trim().toUpperCase() !== "N";
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
        showText,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^B7/i.test(body)) {
      const fd = /\^FD([^^]*)/i.exec(body);
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
      const fd = /\^FD([^^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const b2Args = parseZplCommandArgs(body, "B2");
      const orientation = normalizeOrientation(b2Args[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(b2Args, byHeight);
      const showText = (b2Args[2] ?? "Y").trim().toUpperCase() !== "N";
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
        showText,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^B3/i.test(body)) {
      const fd = /\^FD([^^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const b3Args = parseZplCommandArgs(body, "B3");
      const orientation = normalizeOrientation(b3Args[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(["", b3Args[2] ?? ""], byHeight);
      const showText = (b3Args[3] ?? "Y").trim().toUpperCase() !== "N";
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
        showText,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    if (/\^BC/i.test(body)) {
      const fd = /\^FD([^^]*)/i.exec(body);
      const byArgs = parseZplCommandArgs(body, "BY");
      const byModule = clamp(Number(byArgs[0] ?? 2), 1, 10);
      const byHeight = parseBarcodeHeight(["", byArgs[2] ?? ""], 100);
      const bcArgs = parseZplCommandArgs(body, "BC");
      const orientation = normalizeOrientation(bcArgs[0] || fieldOrientation);
      const barHeight = parseBarcodeHeight(bcArgs, byHeight);
      const showText = (bcArgs[2] ?? "Y").trim().toUpperCase() !== "N";
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
        showText,
        filled: false,
        zIndex: items.length,
        font: "0",
        orientation
      });
      continue;
    }

    const fd = /\^FD([^^]*)/i.exec(body);
    const serial = /\^SN([^,\^]+)/i.exec(body);
    const serialSeed = (serial?.[1] ?? "").trim();
    const textPayload = fd?.[1] ?? (serialSeed.length ? serialSeed : "");
    if (textPayload.length) {
      const a = /\^A([A-Z0-9])([NRIB])?,?(-?\d*)?,?(-?\d*)?/i.exec(body);
      const font = ((a?.[1] ?? "0").toUpperCase() as ZplFont);
      const orientation = normalizeOrientation(a?.[2] ?? fieldOrientation);
      const h = Number(a?.[3] || 32);
      const w = Number(a?.[4] || 0);
      const textWidthRatio = h > 0 && w > 0 ? clamp(w / h, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX) : 0.6;
      const width = estimateTextBoxWidth(textPayload, h, w, font);
      const height = Math.max(16, Math.round(h));
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
        text: textPayload,
        textWidthRatio,
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
    type === "graphic" ||
    type === "table" ||
    type === "shade" ||
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

function isLinearBarcodeElementType(type: BuilderElementType): type is "code128" | "gs1128" | "itf14" | "code39" | "ean13" {
  return type === "code128" || type === "gs1128" || type === "itf14" || type === "code39" || type === "ean13";
}

function isBatchGeneratorSupportedType(type: BuilderElementType): boolean {
  return type === "text" || isBarcodeElementType(type);
}

function parseTrailingNumericToken(value: string): { prefix: string; suffix: string; start: number; pad: number } {
  const text = value ?? "";
  const match = /^(.*?)(\d+)(\D*)$/.exec(text);
  if (!match) {
    return {
      prefix: text,
      suffix: "",
      start: 1,
      pad: 1
    };
  }
  return {
    prefix: match[1] ?? "",
    suffix: match[3] ?? "",
    start: Number.parseInt(match[2] ?? "1", 10) || 1,
    pad: Math.max(1, (match[2] ?? "").length)
  };
}

function formatBatchNumber(value: number, pad: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString().padStart(Math.max(1, Math.round(pad)), "0");
  return `${sign}${digits}`;
}

function normalizeEan13(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 12 ? digits.slice(0, 13) : "5901234123457";
}

function sanitizeCode128ForBuilder(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return "0";
  }
  const withoutZplControl = raw.replace(/>([:;689])/g, "");
  const cleaned = withoutZplControl.replace(/[^\x20-\x7E]/g, "");
  return cleaned || "0";
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

function estimateDatamatrixBoxSize(text: string, moduleWidth: number): { width: number; height: number } {
  const fallback = Math.max(32, Math.round(Math.max(1, moduleWidth) * 18));
  if (typeof document === "undefined") {
    return { width: fallback, height: fallback };
  }
  try {
    const temp = document.createElement("canvas");
    const symbolScale = Math.max(1, Math.min(12, Math.round(Math.max(1, moduleWidth) * 0.5)));
    bwipjs.toCanvas(temp, {
      bcid: "datamatrix",
      text: text || "DMX-123456",
      scale: symbolScale,
      includetext: false,
      parse: true,
      parsefnc: true,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF",
      barcolor: "111827"
    });
    return {
      width: Math.max(24, Math.round(temp.width)),
      height: Math.max(24, Math.round(temp.height))
    };
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
        options.text = sanitizeCode128ForBuilder(item.text);
      } else if (item.type === "gs1128") {
        options.bcid = "code128";
        const gs1Payload = item.text || "(00)012345678901234567";
        const normalizedGs1 = gs1Payload.startsWith(">8") ? gs1Payload : `>8${gs1Payload}`;
        options.text = sanitizeCode128ForBuilder(normalizedGs1);
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
      try {
        bwipjs.toCanvas(temp, options as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
      } catch {
        if (item.type === "code128" || item.type === "gs1128") {
          const retryOptions = {
            ...options,
            parsefnc: false,
            text: sanitizeCode128ForBuilder(item.text)
          };
          bwipjs.toCanvas(temp, retryOptions as unknown as Parameters<typeof bwipjs.toCanvas>[1]);
        } else {
          throw new Error("Barcode preview render failed.");
        }
      }
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
  if (type === "graphic") {
    return { width: 8, height: 8 };
  }
  if (type === "table") {
    return { width: 64, height: 48 };
  }
  if (type === "shade") {
    return { width: 16, height: 16 };
  }
  return { width: 12, height: 12 };
}

function clampSizeToZplEffect(
  type: BuilderElementType,
  width: number,
  height: number
): { width: number; height: number } {
  if (type === "qr") {
    return {
      width: Math.min(width, QR_EFFECTIVE_SIZE_MAX),
      height: Math.min(height, QR_EFFECTIVE_SIZE_MAX)
    };
  }
  if (type === "datamatrix") {
    return {
      width: Math.min(width, DATAMATRIX_EFFECTIVE_SIZE_MAX),
      height: Math.min(height, DATAMATRIX_EFFECTIVE_SIZE_MAX)
    };
  }
  return { width, height };
}

function getItemMaxPosition(item: BuilderItem, canvasWidth: number, canvasHeight: number): { x: number; y: number } {
  if (item.type === "text") {
    return {
      x: canvasWidth,
      y: canvasHeight
    };
  }
  return {
    // If element is larger than canvas, keep origin at 0 instead of going negative/off-canvas.
    x: Math.max(0, canvasWidth - Math.max(12, item.width)),
    y: Math.max(0, canvasHeight - Math.max(12, item.height))
  };
}

function getTextCharWidthFromItem(item: BuilderItem, height: number): number {
  const textHeight = Math.max(10, Math.round(height * 0.8));
  const ratio = clamp(item.textWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX);
  return Math.max(4, Math.round(textHeight * ratio));
}

function isFillableType(type: BuilderElementType): boolean {
  return type === "box" || type === "circle" || type === "ellipse";
}

function supportsAspectRatioLock(type: BuilderElementType): boolean {
  return type === "graphic" || type === "qr" || type === "datamatrix" || type === "circle" || type === "ellipse";
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
  const initialState = useMemo(() => resolveInitialBuilderState(seedZpl), [seedZpl]);
  const [canvasSettings, setCanvasSettings] = useState<BuilderCanvasSettings>(() => initialState.canvasSettings);
  const [items, setItems] = useState<BuilderItem[]>(() => initialState.items);
  const [selectedBarcodeType, setSelectedBarcodeType] = useState<BarcodeElementType>(() => initialState.selectedBarcodeType);
  const [isDirty, setIsDirty] = useState(false);
  const [gridSize, setGridSize] = useState(() => initialState.gridSize);
  const [gridDarkness, setGridDarkness] = useState(() => initialState.gridDarkness);
  const [dragMode, setDragMode] = useState<DragMode>(() => initialState.dragMode);
  const [dragStep, setDragStep] = useState(() => initialState.dragStep);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(() => initialState.snapToGridEnabled);
  const [snapToItemsEnabled, setSnapToItemsEnabled] = useState(() => initialState.snapToItemsEnabled);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [guideLines, setGuideLines] = useState<BuilderGuideLine[]>([]);
  const [canvasCursor, setCanvasCursor] = useState<{ x: number; y: number } | null>(null);
  const [uploadedGraphics, setUploadedGraphics] = useState<UploadedGraphic[]>(() => initialState.uploadedGraphics);
  const [includeSeedGraphics, setIncludeSeedGraphics] = useState<boolean>(() => initialState.includeSeedGraphics);
  const [batchRules, setBatchRules] = useState<BatchGeneratorRule[]>(() => initialState.batchRules);
  const [batchLabelCount, setBatchLabelCount] = useState<number>(() => initialState.batchLabelCount);
  const [batchNotice, setBatchNotice] = useState<string>("");
  const [hoveredBatchItemId, setHoveredBatchItemId] = useState<string | null>(null);
  const undoStackRef = useRef<BuilderHistorySnapshot[]>([]);
  const redoStackRef = useRef<BuilderHistorySnapshot[]>([]);
  const clipboardRef = useRef<BuilderClipboardSnapshot | null>(null);
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const [clipboardAvailable, setClipboardAvailable] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState<Record<BuilderAccordionKey, boolean>>({
    canvas: false,
    grid: false,
    elements: false,
    selected: false,
    barcodes: false,
    text: false,
    separators: false,
    shapes: false,
    generator: initialState.batchRules.length > 0
  });
  const [zplAccordionOpen, setZplAccordionOpen] = useState<BuilderZplAccordionKey>("generated");
  const canvasRef = useRef<HTMLDivElement>(null);
  const graphicFileInputRef = useRef<HTMLInputElement>(null);

  const cloneHistorySnapshot = (snapshot: BuilderHistorySnapshot): BuilderHistorySnapshot => ({
    ...snapshot,
    canvasSettings: { ...snapshot.canvasSettings },
    items: snapshot.items.map((item) => ({ ...item })),
    uploadedGraphics: snapshot.uploadedGraphics.map((entry) => ({ ...entry })),
    batchRules: snapshot.batchRules.map((entry) => ({ ...entry }))
  });

  const captureHistorySnapshot = (): BuilderHistorySnapshot => ({
    canvasSettings: { ...canvasSettings },
    items: items.map((item) => ({ ...item })),
    selectedBarcodeType,
    gridSize,
    gridDarkness,
    dragMode,
    dragStep,
    snapToGridEnabled,
    snapToItemsEnabled,
    uploadedGraphics: uploadedGraphics.map((entry) => ({ ...entry })),
    includeSeedGraphics,
    batchRules: batchRules.map((entry) => ({ ...entry })),
    batchLabelCount
  });

  const refreshHistoryAvailability = () => {
    setHistoryAvailability({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0
    });
  };

  const pushUndoSnapshot = () => {
    undoStackRef.current.push(cloneHistorySnapshot(captureHistorySnapshot()));
    if (undoStackRef.current.length > BUILDER_HISTORY_LIMIT) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    refreshHistoryAvailability();
  };

  const restoreHistorySnapshot = (snapshot: BuilderHistorySnapshot) => {
    const next = cloneHistorySnapshot(snapshot);
    setCanvasSettings(next.canvasSettings);
    setItems(next.items);
    setSelectedBarcodeType(next.selectedBarcodeType);
    setGridSize(next.gridSize);
    setGridDarkness(next.gridDarkness);
    setDragMode(next.dragMode);
    setDragStep(next.dragStep);
    setSnapToGridEnabled(next.snapToGridEnabled);
    setSnapToItemsEnabled(next.snapToItemsEnabled);
    setUploadedGraphics(next.uploadedGraphics);
    setIncludeSeedGraphics(next.includeSeedGraphics);
    setBatchRules(next.batchRules);
    setBatchLabelCount(next.batchLabelCount);
    setBatchNotice("");
    setHoveredBatchItemId(null);
    setDraggingId(null);
    setResizing(null);
    setDragSnapshot([]);
    setSelectionBox(null);
    setGuideLines([]);
    setSelectedId(null);
    setSelectedIds([]);
    setIsDirty(true);
  };

  const undoBuilderChange = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      refreshHistoryAvailability();
      return;
    }
    redoStackRef.current.push(cloneHistorySnapshot(captureHistorySnapshot()));
    restoreHistorySnapshot(previous);
    refreshHistoryAvailability();
  };

  const redoBuilderChange = () => {
    const next = redoStackRef.current.pop();
    if (!next) {
      refreshHistoryAvailability();
      return;
    }
    undoStackRef.current.push(cloneHistorySnapshot(captureHistorySnapshot()));
    restoreHistorySnapshot(next);
    refreshHistoryAvailability();
  };

  const copySelectedItems = () => {
    const selectedSet = new Set(selectedIds);
    const copied = items
      .filter((item) => selectedSet.has(item.id))
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((item) => ({ ...item }));
    if (!copied.length) {
      return;
    }
    clipboardRef.current = {
      items: copied,
      pasteCount: 0
    };
    setClipboardAvailable(true);
  };

  const pasteClipboardItems = () => {
    const clipboard = clipboardRef.current;
    if (!clipboard?.items.length) {
      return;
    }
    pushUndoSnapshot();
    const pasteCount = clipboard.pasteCount + 1;
    const offset = 24 * pasteCount;
    const maxZ = items.length ? Math.max(...items.map((item) => item.zIndex)) : 0;
    const clones = clipboard.items.map((source, index) => {
      const draft: BuilderItem = normalizePastedItemFrame({
        ...source,
        id: crypto.randomUUID(),
        zIndex: maxZ + index + 1
      });
      const maxPos = getItemMaxPosition(draft, canvasWidth, canvasHeight);
      return {
        ...draft,
        x: clamp(source.x + offset, 0, maxPos.x),
        y: clamp(source.y + offset, 0, maxPos.y)
      };
    });
    clipboardRef.current = {
      ...clipboard,
      pasteCount
    };
    setItems((prev) => [...prev, ...clones]);
    setSelectedIds(clones.map((item) => item.id));
    setSelectedId(clones.length === 1 ? clones[0].id : null);
    setIsDirty(true);
  };

  const duplicateSelectedItems = () => {
    if (!selectedIds.length) {
      return;
    }
    copySelectedItems();
    pasteClipboardItems();
  };

  const canvasWidth = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelWidth, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelWidth, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const canvasHeight = useMemo(() => {
    const mm = unitToMm(canvasSettings.labelHeight, canvasSettings.labelUnit);
    return Math.max(40, Math.round(mm * canvasSettings.densityDpmm));
  }, [canvasSettings.labelHeight, canvasSettings.labelUnit, canvasSettings.densityDpmm]);
  const baseViewScale = useMemo(() => {
    const maxSide = Math.max(canvasWidth, canvasHeight);
    const autoFit = 920 / maxSide;
    return clamp(autoFit, 0.28, 1);
  }, [canvasWidth, canvasHeight]);
  const viewScale = useMemo(() => baseViewScale * canvasZoom, [baseViewScale, canvasZoom]);
  const rulerStep = useMemo(() => {
    if (viewScale >= 1) {
      return 50;
    }
    if (viewScale >= 0.5) {
      return 100;
    }
    return 200;
  }, [viewScale]);
  const horizontalRulerTicks = useMemo(
    () => Array.from({ length: Math.floor(canvasWidth / rulerStep) + 1 }, (_, index) => index * rulerStep),
    [canvasWidth, rulerStep]
  );
  const verticalRulerTicks = useMemo(
    () => Array.from({ length: Math.floor(canvasHeight / rulerStep) + 1 }, (_, index) => index * rulerStep),
    [canvasHeight, rulerStep]
  );
  const builderPrinterSettings = useMemo<PrinterSettings>(
    () => ({
      model: "Custom",
      densityDpmm: canvasSettings.densityDpmm,
      dpi: canvasSettings.densityDpmm === 24 ? 600 : canvasSettings.densityDpmm === 12 ? 300 : 203,
      quality: "grayscale",
      labelWidth: canvasSettings.labelWidth,
      labelHeight: canvasSettings.labelHeight,
      labelUnit: canvasSettings.labelUnit,
      showLabelIndex: 1,
      showLabelCount: 1
    }),
    [canvasSettings]
  );

  const selectedItem = useMemo(() => {
    if (selectedIds.length !== 1) {
      return null;
    }
    return items.find((item) => item.id === selectedIds[0]) ?? null;
  }, [items, selectedIds]);
  const selectedDimensionLabels = useMemo(
    () => selectedItem ? getDimensionLabels(selectedItem) : { width: "W", height: "H" },
    [selectedItem]
  );
  const selectedEffectiveDetails = useMemo(
    () => selectedItem ? getEffectiveDetails(selectedItem) : [],
    [selectedItem]
  );
  const selectedHasZplParameters = !!selectedItem && (
    selectedItem.type === "text"
    || isBarcodeElementType(selectedItem.type)
    || selectedEffectiveDetails.length > 0
  );
  const hiddenCount = useMemo(() => items.filter((item) => item.hidden).length, [items]);
  const activeMeasure = useMemo(() => {
    const selected = items.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) {
      return null;
    }
    const minX = Math.min(...selected.map((item) => item.x));
    const minY = Math.min(...selected.map((item) => item.y));
    const maxX = Math.max(...selected.map((item) => item.x + item.width));
    const maxY = Math.max(...selected.map((item) => item.y + item.height));
    return {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY)
    };
  }, [items, selectedIds]);
  const sourceGraphicDownloads = useMemo(
    () => (includeSeedGraphics ? extractGraphicDownloadCommands(seedZpl) : []),
    [includeSeedGraphics, seedZpl]
  );
  const sourceGraphicSizes = useMemo(
    () => (includeSeedGraphics ? extractDownloadedGraphicSizes(seedZpl) : new Map<string, { width: number; height: number }>()),
    [includeSeedGraphics, seedZpl]
  );
  const allGraphicDownloads = useMemo(() => {
    const unique = new Set<string>(sourceGraphicDownloads);
    uploadedGraphics.forEach((entry) => unique.add(entry.command));
    return Array.from(unique.values());
  }, [sourceGraphicDownloads, uploadedGraphics]);
  const allGraphicSizes = useMemo(() => {
    const merged = new Map<string, { width: number; height: number }>(sourceGraphicSizes);
    uploadedGraphics.forEach((entry) => {
      merged.set(entry.name, { width: entry.width, height: entry.height });
    });
    return merged;
  }, [sourceGraphicSizes, uploadedGraphics]);
  const getMinSizeForItem = (item: BuilderItem): { width: number; height: number } => {
    const baseMin = getMinSizeForType(item.type);
    return baseMin;
  };
  const generatedZpl = useMemo(
    () => buildZplFromItems(items, canvasWidth, canvasHeight, allGraphicDownloads, allGraphicSizes),
    [items, canvasWidth, canvasHeight, allGraphicDownloads, allGraphicSizes]
  );
  const [builderPreviewZpl, setBuilderPreviewZpl] = useState(generatedZpl);
  const batchRuleEntries = useMemo(
    () =>
      batchRules
        .map((rule) => ({ rule, item: items.find((entry) => entry.id === rule.itemId) ?? null }))
        .filter((entry): entry is { rule: BatchGeneratorRule; item: BuilderItem } => !!entry.item && isBatchGeneratorSupportedType(entry.item.type)),
    [batchRules, items]
  );
  const batchRuleIdSet = useMemo(() => new Set(batchRules.map((entry) => entry.itemId)), [batchRules]);
  const generatedZplLines = useMemo(() => generatedZpl.split("\n"), [generatedZpl]);
  useEffect(() => {
    if (!draggingId && !resizing) {
      setBuilderPreviewZpl(generatedZpl);
      return;
    }
    const timer = window.setTimeout(() => {
      setBuilderPreviewZpl(generatedZpl);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [draggingId, generatedZpl, resizing]);

  const selectedGeneratedLineIndex = useMemo(() => {
    if (!selectedItem) {
      return -1;
    }
    const x = Math.round(selectedItem.x);
    const y = Math.round(selectedItem.y);
    const canReuseSource =
      selectedItem.type !== "table"
      && !!selectedItem.sourceCommand
      && typeof selectedItem.sourceBody === "string"
      && selectedItem.sourceFingerprint === buildItemFingerprint(selectedItem)
      && Number.isFinite(selectedItem.sourceAnchorX)
      && Number.isFinite(selectedItem.sourceAnchorY)
      && Number.isFinite(selectedItem.sourceViewX)
      && Number.isFinite(selectedItem.sourceViewY);

    if (canReuseSource) {
      const dx = Math.round(selectedItem.x - (selectedItem.sourceViewX ?? selectedItem.x));
      const dy = Math.round(selectedItem.y - (selectedItem.sourceViewY ?? selectedItem.y));
      const nextX = Math.max(0, Math.round((selectedItem.sourceAnchorX ?? x) + dx));
      const nextY = Math.max(0, Math.round((selectedItem.sourceAnchorY ?? y) + dy));
      const prefix = `^${selectedItem.sourceCommand}${nextX},${nextY}`;
      return generatedZplLines.findIndex((line) => line.startsWith(prefix));
    }

    if (selectedItem.type === "text") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^A${selectedItem.font}${selectedItem.orientation},`));
    }
    if (selectedItem.type === "graphic") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^XG`));
    }
    if (selectedItem.type === "table") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GB`));
    }
    if (selectedItem.type === "shade") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^FX${SHADE_META_PREFIX},`));
    }
    if (selectedItem.type === "code128" || selectedItem.type === "gs1128") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^BY`) && /\^BC/i.test(line));
    }
    if (selectedItem.type === "itf14") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^BY`) && /\^B2/i.test(line));
    }
    if (selectedItem.type === "code39") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^BY`) && /\^B3/i.test(line));
    }
    if (selectedItem.type === "pdf417") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^B7`));
    }
    if (selectedItem.type === "qr") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO`) && /\^BQ/i.test(line) && line.includes(`^FDLA,${selectedItem.text}`));
    }
    if (selectedItem.type === "datamatrix") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^BX`));
    }
    if (selectedItem.type === "ean13") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^BY`) && /\^BE/i.test(line));
    }
    if (selectedItem.type === "line") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GB`));
    }
    if (selectedItem.type === "line-v") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GB`));
    }
    if (selectedItem.type === "line-d") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GD`));
    }
    if (selectedItem.type === "circle") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GC`));
    }
    if (selectedItem.type === "ellipse") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GE`));
    }
    if (selectedItem.type === "box") {
      return generatedZplLines.findIndex((line) => line.startsWith(`^FO${x},${y}^GB`));
    }
    return -1;
  }, [generatedZplLines, selectedItem]);
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

  const onGridSizeChange = (value: number) => {
    pushUndoSnapshot();
    setGridSize(clamp(Math.round(value), 8, 80));
    setIsDirty(true);
  };
  const onGridDarknessChange = (value: number) => {
    pushUndoSnapshot();
    setGridDarkness(clamp(Math.round(value), 8, 65));
    setIsDirty(true);
  };
  const onDragStepChange = (value: number) => {
    pushUndoSnapshot();
    setDragStep(clamp(Math.round(value), 1, 64));
    setIsDirty(true);
  };
  const onDragModeChange = (value: DragMode) => {
    pushUndoSnapshot();
    setDragMode(value);
    setIsDirty(true);
  };
  const onSnapToGridChange = (value: boolean) => {
    pushUndoSnapshot();
    setSnapToGridEnabled(value);
    setIsDirty(true);
  };
  const onSnapToItemsChange = (value: boolean) => {
    pushUndoSnapshot();
    setSnapToItemsEnabled(value);
    setIsDirty(true);
  };
  const onSelectedBarcodeTypeChange = (value: BarcodeElementType) => {
    pushUndoSnapshot();
    setSelectedBarcodeType(value);
    setIsDirty(true);
  };
  const zoomCanvas = (direction: "in" | "out" | "fit") => {
    if (direction === "fit") {
      setCanvasZoom(1);
      return;
    }
    setCanvasZoom((prev) => clamp(Math.round((prev + (direction === "in" ? 0.15 : -0.15)) * 100) / 100, 0.5, 2.5));
  };
  const updateCanvasSettings = (updater: (prev: BuilderCanvasSettings) => BuilderCanvasSettings) => {
    pushUndoSnapshot();
    setCanvasSettings((prev) => updater(prev));
    setIsDirty(true);
  };
  const toggleAccordion = (key: BuilderAccordionKey) => {
    setAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const openZplAccordion = (key: BuilderZplAccordionKey) => {
    setZplAccordionOpen(key);
  };

  const addItemToBatchGenerator = (item: BuilderItem) => {
    if (!isBatchGeneratorSupportedType(item.type)) {
      return;
    }
    pushUndoSnapshot();
    setBatchRules((prev) => {
      if (prev.some((entry) => entry.itemId === item.id)) {
        return prev;
      }
      const parsed = parseTrailingNumericToken(item.text);
      setIsDirty(true);
      return [
        ...prev,
        {
          itemId: item.id,
          mode: "increment",
          start: parsed.start,
          step: 1,
          pad: parsed.pad,
          prefix: parsed.prefix,
          suffix: parsed.suffix
        }
      ];
    });
  };

  const updateBatchRule = (itemId: string, patch: Partial<BatchGeneratorRule>) => {
    pushUndoSnapshot();
    setIsDirty(true);
    setBatchRules((prev) => prev.map((entry) => (entry.itemId === itemId ? { ...entry, ...patch } : entry)));
  };

  const removeBatchRule = (itemId: string) => {
    pushUndoSnapshot();
    setIsDirty(true);
    setBatchRules((prev) => prev.filter((entry) => entry.itemId !== itemId));
  };

  const clearBatchGenerator = () => {
    pushUndoSnapshot();
    const batchIdFromSeed = extractBatchProjectIdFromZpl(seedZpl);
    deleteStoredBatchProject(batchIdFromSeed);
    setBatchRules([]);
    setHoveredBatchItemId(null);
    setBatchNotice("");
    setIsDirty(true);
    if (accordionOpen.generator) {
      setSelectedId(null);
      setSelectedIds([]);
    }
  };

  const generateBatchAndOpenPreview = () => {
    const safeCount = clamp(Math.round(batchLabelCount), 1, 500);
    if (!batchRuleEntries.length) {
      setBatchNotice("Add at least one text/barcode item to generator.");
      return;
    }
    const batchId = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    const projectSnapshot: StoredBatchBuilderProject = {
      id: batchId,
      savedAt: new Date().toISOString(),
      canvasSettings,
      items,
      selectedBarcodeType,
      gridSize,
      gridDarkness,
      dragMode,
      dragStep,
      snapToGridEnabled,
      snapToItemsEnabled,
      uploadedGraphics,
      includeSeedGraphics,
      batchRules,
      batchLabelCount: safeCount
    };
    saveStoredBatchProject(projectSnapshot);
    const ruleById = new Map(batchRuleEntries.map((entry) => [entry.rule.itemId, entry.rule]));
    const labels: string[] = [];
    for (let index = 0; index < safeCount; index += 1) {
      const nextItems = items.map((item) => {
        const rule = ruleById.get(item.id);
        if (!rule) {
          return item;
        }
        const rawValue = rule.mode === "increment"
          ? rule.start + rule.step * index
          : rule.start - rule.step * index;
        const numeric = formatBatchNumber(rawValue, rule.pad);
        let nextText = `${rule.prefix}${numeric}${rule.suffix}`;
        if (item.type === "ean13") {
          nextText = normalizeEan13(nextText);
        }
        return {
          ...item,
          text: nextText
        };
      });
      const labelZpl = buildZplFromItems(nextItems, canvasWidth, canvasHeight, allGraphicDownloads, allGraphicSizes);
      labels.push(injectBatchMarker(labelZpl, batchId, index, safeCount));
    }
    setBatchNotice(`Generated ${safeCount} labels.`);
    onBack(labels.join("\n\n"));
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
  ): { x: number; y: number; guides: BuilderGuideLine[] } => {
    let x = nextX;
    let y = nextY;
    let guideX: number | null = null;
    let guideY: number | null = null;
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
      const snappedX = snapToItemsAxis(x, currentItem.width, "x", currentItem.id, allItems, elementSnapThreshold);
      const snappedY = snapToItemsAxis(y, currentItem.height, "y", currentItem.id, allItems, elementSnapThreshold);
      x = snappedX.value;
      y = snappedY.value;
      guideX = snappedX.guide;
      guideY = snappedY.guide;
    }

    const maxPos = getItemMaxPosition(currentItem, canvasWidth, canvasHeight);
    const clampedX = clamp(x, 0, maxPos.x);
    const clampedY = clamp(y, 0, maxPos.y);
    return {
      x: clampedX,
      y: clampedY,
      guides: [
        ...(guideX !== null ? [{ axis: "x" as const, value: guideX }] : []),
        ...(guideY !== null ? [{ axis: "y" as const, value: guideY }] : [])
      ]
    };
  };

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        const maxPos = getItemMaxPosition(item, canvasWidth, canvasHeight);
        return {
          ...item,
          x: clamp(item.x, 0, maxPos.x),
          y: clamp(item.y, 0, maxPos.y)
        };
      })
    );
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    const next = resolveInitialBuilderState(seedZpl);
    setCanvasSettings(next.canvasSettings);
    setItems(next.items);
    setSelectedBarcodeType(next.selectedBarcodeType);
    setGridSize(next.gridSize);
    setGridDarkness(next.gridDarkness);
    setDragMode(next.dragMode);
    setDragStep(next.dragStep);
    setSnapToGridEnabled(next.snapToGridEnabled);
    setSnapToItemsEnabled(next.snapToItemsEnabled);
    setUploadedGraphics(next.uploadedGraphics);
    setIncludeSeedGraphics(next.includeSeedGraphics);
    setBatchRules(next.batchRules);
    setBatchLabelCount(next.batchLabelCount);
    setBatchNotice("");
    setHoveredBatchItemId(null);
    setAccordionOpen((prev) => ({ ...prev, generator: next.batchRules.length > 0 }));
    setSelectedIds([]);
    setSelectedId(null);
    setDraggingId(null);
    setDragSnapshot([]);
    setSelectionBox(null);
    setCanvasZoom(1);
    setIsDirty(false);
    undoStackRef.current = [];
    redoStackRef.current = [];
    clipboardRef.current = null;
    setClipboardAvailable(false);
    refreshHistoryAvailability();
  }, [seedZpl]);

  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.type !== "text") {
          return item;
        }
        // Keep imported source fields bit-exact; otherwise source reuse breaks
        // and FT/rotated fields are re-emitted as approximated FO text.
        if (item.sourceCommand && item.sourceFingerprint) {
          return item;
        }
        const normalizedWidth = estimateTextBoxWidth(
          item.text,
          item.height,
          getTextCharWidthFromItem(item, item.height),
          item.font
        );
        if (Math.abs(normalizedWidth - item.width) < 0.5) {
          return item;
        }
        return { ...item, width: normalizedWidth };
      })
    );
  }, []);

  useEffect(() => {
    if (!selectedItem || accordionOpen.generator) {
      return;
    }
    setAccordionOpen((prev) => (prev.selected ? prev : { ...prev, selected: true }));
  }, [selectedItem, accordionOpen.generator]);

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
    pushUndoSnapshot();
    setItems((prev) => [...prev, draft]);
    selectSingle(draft.id);
    setIsDirty(true);
  };

  const onGraphicUploadClick = () => {
    graphicFileInputRef.current?.click();
  };

  const onGraphicFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    try {
      const name = normalizeGraphicNameFromFilename(file.name);
      const uploaded = await pngToDg(file, name);
      pushUndoSnapshot();
      setUploadedGraphics((prev) => {
        const filtered = prev.filter((entry) => entry.name !== uploaded.name);
        return [...filtered, uploaded];
      });
      if (selectedItem?.type === "graphic") {
        updateSelected({
          text: uploaded.name,
          width: uploaded.width,
          height: uploaded.height
        });
      }
    } catch {
      // Ignore parse failures quietly and keep current builder state.
    }
  };

  const applyUploadedGraphicToSelected = (graphic: UploadedGraphic) => {
    if (!selectedItem || selectedItem.type !== "graphic") {
      return;
    }
    updateSelected({
      text: graphic.name,
      width: graphic.width,
      height: graphic.height
    });
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
    if (accordionOpen.generator) {
      if (isBatchGeneratorSupportedType(item.type)) {
        addItemToBatchGenerator(item);
        setBatchNotice(`Added "${item.type}" to generator.`);
      }
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds((prev) => {
          const exists = prev.includes(item.id);
          const next = exists ? prev.filter((id) => id !== item.id) : [...prev, item.id];
          setSelectedId(next.length === 1 ? next[0] : null);
          return next;
        });
      } else {
        selectSingle(item.id);
      }
      setDraggingId(null);
      setResizing(null);
      setDragSnapshot([]);
      setGuideLines([]);
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
    const selectedMovableIds = selectedIds
      .map((id) => items.find((entry) => entry.id === id))
      .filter((entry): entry is BuilderItem => !!entry && !entry.locked)
      .map((entry) => entry.id);
    const movingIds = selectedMovableIds.includes(item.id) && selectedMovableIds.length > 1 ? selectedMovableIds : [item.id];
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
      pushUndoSnapshot();
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
    if (item.locked) {
      setDraggingId(null);
      setDragSnapshot([]);
      return;
    }
    pushUndoSnapshot();
    setDraggingId(item.id);
    setDragOffset({ x: x - item.x, y: y - item.y });
    setDragSnapshot(items.filter((entry) => movingIds.includes(entry.id)).map((entry) => ({ id: entry.id, x: entry.x, y: entry.y })));
  };

  const onResizeHandleMouseDown = (e: MouseEvent, item: BuilderItem, axis: "right" | "bottom" | "corner") => {
    if (!canvasRef.current) {
      return;
    }
    if (item.locked) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / viewScale;
    const y = (e.clientY - rect.top) / viewScale;
    pushUndoSnapshot();
    selectSingle(item.id);
    setDraggingId(null);
    setResizing({
      id: item.id,
      axis,
      startMouseX: x,
      startMouseY: y,
      startWidth: item.width,
      startHeight: item.height,
      lockAspectRatio: supportsAspectRatioLock(item.type) && (item.lockAspectRatio === true || e.shiftKey)
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
      let resizeGuides: BuilderGuideLine[] = [];
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== resizing.id) {
            return item;
          }
          const minSize = getMinSizeForItem(item);
          const useX = resizing.axis === "right" || resizing.axis === "corner";
          const useY = resizing.axis === "bottom" || resizing.axis === "corner";
          let nextWidth = useX ? resizing.startWidth + deltaX : item.width;
          let nextHeight = useY ? resizing.startHeight + deltaY : item.height;
          if (resizing.lockAspectRatio) {
            const ratio = Math.max(0.01, resizing.startWidth / Math.max(1, resizing.startHeight));
            if (resizing.axis === "right") {
              nextHeight = nextWidth / ratio;
            } else if (resizing.axis === "bottom") {
              nextWidth = nextHeight * ratio;
            } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              nextHeight = nextWidth / ratio;
            } else {
              nextWidth = nextHeight * ratio;
            }
          }
          if (dragMode === "step") {
            if (useX) nextWidth = snapToStep(nextWidth, safeDragStep);
            if (useY) nextHeight = snapToStep(nextHeight, safeDragStep);
          }
          if (snapToGridEnabled) {
            const gridSnapThreshold = Math.max(3, Math.round(safeGridSize * 0.22));
            if (useX) {
              const nextRight = item.x + nextWidth;
              const snappedRight = dragMode === "step"
                ? snapToStep(nextRight, safeGridSize)
                : softSnapToStep(nextRight, safeGridSize, gridSnapThreshold);
              nextWidth = snappedRight - item.x;
            }
            if (useY) {
              const nextBottom = item.y + nextHeight;
              const snappedBottom = dragMode === "step"
                ? snapToStep(nextBottom, safeGridSize)
                : softSnapToStep(nextBottom, safeGridSize, gridSnapThreshold);
              nextHeight = snappedBottom - item.y;
            }
          }
          if (useX) nextWidth = Math.max(minSize.width, nextWidth);
          if (useY) nextHeight = Math.max(minSize.height, nextHeight);
          if (resizing.lockAspectRatio) {
            const ratio = Math.max(0.01, resizing.startWidth / Math.max(1, resizing.startHeight));
            if (resizing.axis === "right") {
              nextHeight = nextWidth / ratio;
            } else if (resizing.axis === "bottom") {
              nextWidth = nextHeight * ratio;
            } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              nextHeight = nextWidth / ratio;
            } else {
              nextWidth = nextHeight * ratio;
            }
            nextWidth = Math.max(minSize.width, nextWidth);
            nextHeight = Math.max(minSize.height, nextHeight);
          }
          let nextTextWidthRatio = item.textWidthRatio;
          if (item.type === "text") {
            if (useX) {
              nextTextWidthRatio = resolveTextWidthRatioForBox(item.text, nextHeight, nextWidth, item.font);
            }
            const textCharWidth = Math.max(
              4,
              Math.round(Math.max(10, Math.round(nextHeight * 0.8)) * clamp(nextTextWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX))
            );
            nextWidth = estimateTextBoxWidth(item.text, nextHeight, textCharWidth, item.font);
          }
          const elementSnapThreshold = Math.max(7, Math.round(Math.min(safeGridSize, safeDragStep) * 0.55));
          let guideX: number | null = null;
          let guideY: number | null = null;
          if (snapToItemsEnabled) {
            if (useX) {
              const snapped = snapResizeEdgeToItems(item.x + nextWidth, "x", item.id, prev, elementSnapThreshold);
              nextWidth = Math.max(minSize.width, snapped.edge - item.x);
              guideX = snapped.guide;
            }
            if (useY) {
              const snapped = snapResizeEdgeToItems(item.y + nextHeight, "y", item.id, prev, elementSnapThreshold);
              nextHeight = Math.max(minSize.height, snapped.edge - item.y);
              guideY = snapped.guide;
            }
          }
          const capped = clampSizeToZplEffect(item.type, nextWidth, nextHeight);
          nextWidth = capped.width;
          nextHeight = capped.height;
          const maxWidth = canvasWidth - item.x;
          const maxHeight = canvasHeight - item.y;
          resizeGuides = [
            ...(guideX !== null ? [{ axis: "x" as const, value: guideX }] : []),
            ...(guideY !== null ? [{ axis: "y" as const, value: guideY }] : [])
          ];
          return {
            ...item,
            textWidthRatio: item.type === "text" ? nextTextWidthRatio : item.textWidthRatio,
            width: useX || resizing.lockAspectRatio ? clamp(nextWidth, minSize.width, maxWidth) : item.width,
            height: useY || resizing.lockAspectRatio ? clamp(nextHeight, minSize.height, maxHeight) : item.height
          };
        })
      );
      setGuideLines(resizeGuides);
      setIsDirty(true);
      return;
    }
    if (selectionBox) {
      setGuideLines([]);
      const rect = canvasRef.current.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / viewScale, 0, canvasWidth);
      const y = clamp((clientY - rect.top) / viewScale, 0, canvasHeight);
      setSelectionBox((prev) => (prev ? { ...prev, currentX: x, currentY: y } : prev));
      return;
    }
    if (!draggingId) {
      setGuideLines([]);
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
        setGuideLines(anchorPos.guides);
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
          const maxPos = getItemMaxPosition(entry, canvasWidth, canvasHeight);
          return {
            ...entry,
            x: clamp(start.x + deltaX, 0, maxPos.x),
            y: clamp(start.y + deltaY, 0, maxPos.y)
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
        setGuideLines(pos.guides);
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
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setCanvasCursor({
        x: Math.round(clamp((e.clientX - rect.left) / viewScale, 0, canvasWidth)),
        y: Math.round(clamp((e.clientY - rect.top) / viewScale, 0, canvasHeight))
      });
    }
    onCanvasPointerMove(e.clientX, e.clientY);
  };

  const stopDrag = () => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);
      const selected = items
        .filter((item) => !item.hidden && item.x < maxX && item.x + item.width > minX && item.y < maxY && item.y + item.height > minY)
        .map((item) => item.id);
      setSelectedIds(selected);
      setSelectedId(selected.length === 1 ? selected[0] : null);
      setSelectionBox(null);
    }
    setDraggingId(null);
    setResizing(null);
    setDragSnapshot([]);
    setGuideLines([]);
  };

  const updateSelected = (patch: Partial<BuilderItem>) => {
    if (!selectedId) {
      return;
    }
    pushUndoSnapshot();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== selectedId) {
          return item;
        }
        const next = { ...item, ...patch };
        const normalizedWidth =
          item.type === "text" && patch.text !== undefined && patch.width === undefined
            ? estimateTextBoxWidth(next.text, next.height, getTextCharWidthFromItem(next, next.height), next.font)
            : next.width;
        const minSize = getMinSizeForItem(next);
        let nextWidth = Math.max(minSize.width, normalizedWidth);
        let nextHeight = Math.max(minSize.height, next.height);
        let nextTextWidthRatio = next.textWidthRatio;
        if (item.type === "text") {
          if (patch.width !== undefined) {
            nextTextWidthRatio = resolveTextWidthRatioForBox(next.text, nextHeight, nextWidth, next.font);
          }
          const textCharWidth = Math.max(
            4,
            Math.round(Math.max(10, Math.round(nextHeight * 0.8)) * clamp(nextTextWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX))
          );
          nextWidth = estimateTextBoxWidth(next.text, nextHeight, textCharWidth, next.font);
        }
        const capped = clampSizeToZplEffect(item.type, nextWidth, nextHeight);
        nextWidth = capped.width;
        nextHeight = capped.height;
        const maxPos = getItemMaxPosition({ ...next, width: nextWidth, height: nextHeight }, canvasWidth, canvasHeight);
        return {
          ...next,
          textWidthRatio: item.type === "text" ? nextTextWidthRatio : next.textWidthRatio,
          width: nextWidth,
          height: nextHeight,
          x: clamp(next.x, 0, maxPos.x),
          y: clamp(next.y, 0, maxPos.y)
        };
      })
    );
    setIsDirty(true);
  };

  const updateSelectedTextCharacterWidth = (value: number) => {
    if (!selectedItem || selectedItem.type !== "text" || !Number.isFinite(value)) {
      return;
    }
    const fontHeight = getTextFontHeight(selectedItem);
    updateSelected({
      textWidthRatio: clamp(value / Math.max(1, fontHeight), TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX)
    });
  };

  const updateSelectedLinearModuleWidth = (value: number) => {
    if (!selectedItem || !isLinearBarcodeElementType(selectedItem.type) || !Number.isFinite(value)) {
      return;
    }
    const moduleWidth = clamp(Math.round(value), 1, 10);
    const effectiveType = selectedItem.type === "gs1128" ? "code128" : selectedItem.type;
    updateSelected({
      width: estimateLinearBarcodeWidthDots(effectiveType, getLinearBarcodePayload(selectedItem), moduleWidth)
    });
  };

  const updateSelectedQrModuleSize = (value: number) => {
    if (!selectedItem || selectedItem.type !== "qr" || !Number.isFinite(value)) {
      return;
    }
    const moduleSize = clamp(Math.round(value), 2, 10);
    const nextSize = moduleSize * 28;
    updateSelected({ width: nextSize, height: nextSize });
  };

  const updateSelectedDatamatrixModuleSize = (value: number) => {
    if (!selectedItem || selectedItem.type !== "datamatrix" || !Number.isFinite(value)) {
      return;
    }
    const moduleSize = clamp(Math.round(value), 3, 12);
    const nextSize = moduleSize * 24;
    updateSelected({ width: nextSize, height: nextSize });
  };

  const updateSelectedPdf417Columns = (value: number) => {
    if (!selectedItem || selectedItem.type !== "pdf417" || !Number.isFinite(value)) {
      return;
    }
    const columnWidth = clamp(Math.round(value), 2, 30);
    updateSelected({ width: columnWidth * 42 });
  };

  const updateSelectedPdf417Rows = (value: number) => {
    if (!selectedItem || selectedItem.type !== "pdf417" || !Number.isFinite(value)) {
      return;
    }
    const rows = clamp(Math.round(value), 3, 30);
    updateSelected({ height: rows * 16 });
  };

  const patchSelectedItems = (patch: Partial<BuilderItem>) => {
    if (!selectedIds.length) {
      return;
    }
    const selectedSet = new Set(selectedIds);
    pushUndoSnapshot();
    setItems((prev) => prev.map((item) => (selectedSet.has(item.id) ? { ...item, ...patch } : item)));
    setIsDirty(true);
  };

  const unhideAll = () => {
    if (!hiddenCount) {
      return;
    }
    pushUndoSnapshot();
    setItems((prev) => prev.map((item) => (item.hidden ? { ...item, hidden: false } : item)));
    setIsDirty(true);
  };

  const removeSelected = () => {
    if (!selectedIds.length) {
      return;
    }
    const selectedSet = new Set(selectedIds);
    pushUndoSnapshot();
    setItems((prev) => prev.filter((item) => !selectedSet.has(item.id)));
    setSelectedIds([]);
    setSelectedId(null);
    setIsDirty(true);
  };

  const resetToNewLabel = () => {
    pushUndoSnapshot();
    setItems([]);
    setUploadedGraphics([]);
    setIncludeSeedGraphics(false);
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
    pushUndoSnapshot();
    setItems((prev) => moveSelectedLayer(prev, selectedId, mode));
    setIsDirty(true);
  };

  const alignSelected = (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") => {
    if (selectedIds.length < 2) {
      return;
    }
    pushUndoSnapshot();
    const selectedSet = new Set(selectedIds);
    setItems((prev) => {
      const selected = prev.filter((item) => selectedSet.has(item.id));
      if (selected.length < 2) {
        return prev;
      }
      const minX = Math.min(...selected.map((item) => item.x));
      const minY = Math.min(...selected.map((item) => item.y));
      const maxX = Math.max(...selected.map((item) => item.x + item.width));
      const maxY = Math.max(...selected.map((item) => item.y + item.height));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      return prev.map((item) => {
        if (!selectedSet.has(item.id)) {
          return item;
        }
        let x = item.x;
        let y = item.y;
        if (mode === "left") {
          x = minX;
        } else if (mode === "hcenter") {
          x = centerX - item.width / 2;
        } else if (mode === "right") {
          x = maxX - item.width;
        } else if (mode === "top") {
          y = minY;
        } else if (mode === "vcenter") {
          y = centerY - item.height / 2;
        } else if (mode === "bottom") {
          y = maxY - item.height;
        }
        return {
          ...item,
          x: clamp(x, 0, getItemMaxPosition(item, canvasWidth, canvasHeight).x),
          y: clamp(y, 0, getItemMaxPosition(item, canvasWidth, canvasHeight).y)
        };
      });
    });
    setIsDirty(true);
  };

  const distributeSelected = (axis: "horizontal" | "vertical") => {
    if (selectedIds.length < 3) {
      return;
    }
    pushUndoSnapshot();
    const selectedSet = new Set(selectedIds);
    setItems((prev) => {
      const selected = prev.filter((item) => selectedSet.has(item.id));
      if (selected.length < 3) {
        return prev;
      }
      const sorted = [...selected].sort((a, b) =>
        axis === "horizontal"
          ? (a.x + a.width / 2) - (b.x + b.width / 2)
          : (a.y + a.height / 2) - (b.y + b.height / 2)
      );
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstCenter = axis === "horizontal" ? first.x + first.width / 2 : first.y + first.height / 2;
      const lastCenter = axis === "horizontal" ? last.x + last.width / 2 : last.y + last.height / 2;
      const step = (lastCenter - firstCenter) / Math.max(1, sorted.length - 1);
      const nextPositions = new Map<string, { x: number; y: number }>();
      sorted.forEach((item, index) => {
        const targetCenter = firstCenter + step * index;
        const x = axis === "horizontal" ? targetCenter - item.width / 2 : item.x;
        const y = axis === "vertical" ? targetCenter - item.height / 2 : item.y;
        nextPositions.set(item.id, {
          x: clamp(x, 0, getItemMaxPosition(item, canvasWidth, canvasHeight).x),
          y: clamp(y, 0, getItemMaxPosition(item, canvasWidth, canvasHeight).y)
        });
      });
      return prev.map((item) => {
        const next = nextPositions.get(item.id);
        return next ? { ...item, ...next } : item;
      });
    });
    setIsDirty(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoBuilderChange();
        } else {
          undoBuilderChange();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        redoBuilderChange();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "c") {
        event.preventDefault();
        copySelectedItems();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "v") {
        event.preventDefault();
        pasteClipboardItems();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === "d") {
        event.preventDefault();
        duplicateSelectedItems();
        return;
      }
      if (!selectedIds.length) {
        return;
      }
      if (event.key === "Delete") {
        event.preventDefault();
        const selectedSet = new Set(selectedIds);
        pushUndoSnapshot();
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
      pushUndoSnapshot();
      setItems((prev) =>
        prev.map((item) => {
          if (!selectedSet.has(item.id) || item.locked) {
            return item;
          }
          const maxPos = getItemMaxPosition(item, canvasWidth, canvasHeight);
          return {
            ...item,
            x: clamp(item.x + dx, 0, maxPos.x),
            y: clamp(item.y + dy, 0, maxPos.y)
          };
        })
      );
      setIsDirty(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, draggingId, resizing, canvasWidth, canvasHeight, historyAvailability, clipboardAvailable, items]);

  useEffect(() => {
    setBatchRules((prev) =>
      prev.filter((entry) => {
        const item = items.find((candidate) => candidate.id === entry.itemId);
        return !!item && isBatchGeneratorSupportedType(item.type);
      })
    );
  }, [items]);

  useEffect(() => {
    if (batchRules.length > 0) {
      return;
    }
    setHoveredBatchItemId(null);
    if (accordionOpen.generator) {
      setSelectedId(null);
      setSelectedIds([]);
    }
  }, [batchRules.length, accordionOpen.generator]);

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
                    <select id="builder-drag-mode" value={dragMode} onChange={(e) => onDragModeChange(e.target.value as DragMode)}>
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
                      onChange={(e) => onSnapToGridChange(e.target.checked)}
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
                      onChange={(e) => onSnapToItemsChange(e.target.checked)}
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
            <div className="builder-accordion-body builder-generator-body">
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
                    <input
                      ref={graphicFileInputRef}
                      type="file"
                      accept=".png,image/png"
                      className="zip-hidden-input"
                      onChange={onGraphicFileSelected}
                    />
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "box")}>
                      Rectangle
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "circle")}>
                      Circle
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "ellipse")}>
                      Ellipse
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "table")}>
                      Table Block
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "shade")}>
                      Shaded Box
                    </button>
                    <button type="button" draggable onDragStart={(e) => onPaletteDragStart(e, "graphic")}>
                      Graphic XG
                    </button>
                    {!!uploadedGraphics.length && (
                      <div className="builder-uploaded-graphics">
                        {uploadedGraphics.map((graphic) => (
                          <button
                            key={graphic.name}
                            type="button"
                            className="download-btn"
                            onClick={() => applyUploadedGraphicToSelected(graphic)}
                            disabled={selectedItem?.type !== "graphic"}
                            title={graphic.name}
                          >
                            Use {graphic.name}
                          </button>
                        ))}
                      </div>
                    )}
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
                      onChange={(e) => onSelectedBarcodeTypeChange(e.target.value as BarcodeElementType)}
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
                  <div className="builder-fieldset-title">Position</div>
                  <label>
                    X
                    <input type="number" value={Math.round(selectedItem.x)} onChange={(e) => updateSelected({ x: Number(e.target.value) })} />
                  </label>
                  <label>
                    Y
                    <input type="number" value={Math.round(selectedItem.y)} onChange={(e) => updateSelected({ y: Number(e.target.value) })} />
                  </label>
                  <label>
                    {selectedDimensionLabels.width}
                    <input
                      type="number"
                      value={Math.round(selectedItem.width)}
                      onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    {selectedDimensionLabels.height}
                    <input
                      type="number"
                      value={Math.round(selectedItem.height)}
                      onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                    />
                  </label>
                  {selectedHasZplParameters && <div className="builder-fieldset-title">ZPL Parameters</div>}
                  {selectedItem.type === "text" && (
                    <label>
                      Char W
                      <input
                        type="number"
                        min={1}
                        max={1024}
                        value={getTextCharacterWidth(selectedItem)}
                        onChange={(e) => updateSelectedTextCharacterWidth(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {isLinearBarcodeElementType(selectedItem.type) && (
                    <label>
                      Module W
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={getLinearBarcodeModuleWidth(selectedItem)}
                        onChange={(e) => updateSelectedLinearModuleWidth(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {selectedItem.type === "qr" && (
                    <label>
                      Module
                      <input
                        type="number"
                        min={2}
                        max={10}
                        value={getQrModuleSize(selectedItem)}
                        onChange={(e) => updateSelectedQrModuleSize(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {selectedItem.type === "datamatrix" && (
                    <label>
                      Module
                      <input
                        type="number"
                        min={3}
                        max={12}
                        value={getDatamatrixModuleSize(selectedItem)}
                        onChange={(e) => updateSelectedDatamatrixModuleSize(Number(e.target.value))}
                      />
                    </label>
                  )}
                  {selectedItem.type === "pdf417" && (
                    <>
                      <label>
                        Column W
                        <input
                          type="number"
                          min={2}
                          max={30}
                          value={getPdf417ColumnWidth(selectedItem)}
                          onChange={(e) => updateSelectedPdf417Columns(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Rows
                        <input
                          type="number"
                          min={3}
                          max={30}
                          value={getPdf417Rows(selectedItem)}
                          onChange={(e) => updateSelectedPdf417Rows(Number(e.target.value))}
                        />
                      </label>
                    </>
                  )}
                  {!!selectedEffectiveDetails.length && (
                    <div className="builder-effective-details">
                      {selectedEffectiveDetails.map((detail) => (
                        <span key={detail}>{detail}</span>
                      ))}
                    </div>
                  )}
                  {isContentEditableType(selectedItem.type) && <div className="builder-fieldset-title">Content</div>}
                  {isContentEditableType(selectedItem.type) && (
                    <label>
                      {selectedItem.type === "table"
                        ? "Rows x Cols"
                        : selectedItem.type === "graphic"
                          ? "Graphic Name"
                          : selectedItem.type === "shade"
                            ? "Shade % (10-90)"
                            : "Content"}
                      <input type="text" value={selectedItem.text} onChange={(e) => updateSelected({ text: e.target.value })} />
                    </label>
                  )}
                  {selectedItem.type === "table" && (
                    <label>
                      Table Template
                      <select
                        value={TABLE_LAYOUT_TEMPLATES.includes(toTableSpecText(selectedItem.text) as typeof TABLE_LAYOUT_TEMPLATES[number])
                          ? toTableSpecText(selectedItem.text)
                          : "custom"}
                        onChange={(e) => {
                          if (e.target.value !== "custom") {
                            updateSelected({ text: e.target.value });
                          }
                        }}
                      >
                        <option value="custom">Custom (manual)</option>
                        {TABLE_LAYOUT_TEMPLATES.map((template) => (
                          <option key={template} value={template}>{template}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedItem.type === "graphic" && (
                    <div className="builder-uploaded-graphics">
                      <button type="button" className="download-btn" onClick={onGraphicUploadClick}>
                        Upload PNG As ~DG
                      </button>
                      {!!uploadedGraphics.length && uploadedGraphics.map((graphic) => (
                        <button
                          key={graphic.name}
                          type="button"
                          className="download-btn"
                          onClick={() => applyUploadedGraphicToSelected(graphic)}
                          title={graphic.name}
                        >
                          Use {graphic.name}
                        </button>
                      ))}
                      <p className="muted">
                        Note: ^XG supports upscale only (mx/my &gt;= 1). To make logo smaller, upload a smaller source image.
                      </p>
                    </div>
                  )}
                  {(isFillableType(selectedItem.type) || supportsAspectRatioLock(selectedItem.type) || isLinearBarcodeElementType(selectedItem.type) || selectedItem.type === "text" || isBarcodeElementType(selectedItem.type) || selectedItem.type === "line-d") && (
                    <div className="builder-fieldset-title">Appearance</div>
                  )}
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
                  {supportsAspectRatioLock(selectedItem.type) && (
                    <label className="builder-form-checkbox">
                      Lock Ratio
                      <input
                        type="checkbox"
                        checked={selectedItem.lockAspectRatio === true}
                        onChange={(e) => updateSelected({ lockAspectRatio: e.target.checked })}
                      />
                    </label>
                  )}
                  {isLinearBarcodeElementType(selectedItem.type) && (
                    <label className="builder-form-checkbox">
                      Show Text
                      <input
                        type="checkbox"
                        checked={selectedItem.showText !== false}
                        onChange={(e) => updateSelected({ showText: e.target.checked })}
                      />
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
                  <div className="builder-fieldset-title">Layer</div>
                  <div className="builder-flag-tools">
                    <label className="builder-form-checkbox">
                      Locked
                      <input
                        type="checkbox"
                        checked={!!selectedItem.locked}
                        onChange={(e) => updateSelected({ locked: e.target.checked })}
                      />
                    </label>
                    <label className="builder-form-checkbox">
                      Hidden
                      <input
                        type="checkbox"
                        checked={!!selectedItem.hidden}
                        onChange={(e) => updateSelected({ hidden: e.target.checked })}
                      />
                    </label>
                  </div>
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
                <>
                  <p className="muted">{selectedIds.length} elements selected. Drag, use arrows, or press Delete.</p>
                  <div className="builder-align-tools">
                    <button type="button" className="download-btn" onClick={() => patchSelectedItems({ locked: true })}>
                      Lock Selected
                    </button>
                    <button type="button" className="download-btn" onClick={() => patchSelectedItems({ locked: false })}>
                      Unlock Selected
                    </button>
                    <button type="button" className="download-btn" onClick={() => patchSelectedItems({ hidden: true })}>
                      Hide Selected
                    </button>
                    <button type="button" className="download-btn" onClick={() => patchSelectedItems({ hidden: false })}>
                      Unhide Selected
                    </button>
                  </div>
                  <div className="builder-align-tools">
                    <button type="button" className="download-btn" onClick={() => alignSelected("left")}>
                      Align Left
                    </button>
                    <button type="button" className="download-btn" onClick={() => alignSelected("hcenter")}>
                      Align Center
                    </button>
                    <button type="button" className="download-btn" onClick={() => alignSelected("right")}>
                      Align Right
                    </button>
                    <button type="button" className="download-btn" onClick={() => alignSelected("top")}>
                      Align Top
                    </button>
                    <button type="button" className="download-btn" onClick={() => alignSelected("vcenter")}>
                      Align Middle
                    </button>
                    <button type="button" className="download-btn" onClick={() => alignSelected("bottom")}>
                      Align Bottom
                    </button>
                    <button type="button" className="download-btn" onClick={() => distributeSelected("horizontal")}>
                      Distribute H
                    </button>
                    <button type="button" className="download-btn" onClick={() => distributeSelected("vertical")}>
                      Distribute V
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">Click an element on canvas to edit.</p>
              )}
              {hiddenCount > 0 && (
                <button type="button" className="download-btn" onClick={unhideAll}>
                  Unhide All ({hiddenCount})
                </button>
              )}
            </div>
          </section>
          <hr className="builder-sidebar-divider" />
          <section className={`builder-accordion builder-accordion-generator${accordionOpen.generator ? " is-open" : ""}`}>
            <button type="button" className="builder-accordion-toggle" onClick={() => toggleAccordion("generator")} aria-expanded={accordionOpen.generator}>
              <span>Batch Generator</span>
              <span className="builder-accordion-icon" aria-hidden>{accordionOpen.generator ? "-" : "+"}</span>
            </button>
            <div className="builder-accordion-body">
              <p className="muted">Open this panel, then click text/barcode items on canvas to add them.</p>
              <p className="muted">When open: click only selects/adds; moving elements is temporarily disabled.</p>
              <div className="builder-generator-count">
                <label htmlFor="builder-batch-count">Labels count</label>
                <input
                  id="builder-batch-count"
                  type="number"
                  min={1}
                  max={500}
                  value={batchLabelCount}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    pushUndoSnapshot();
                    setBatchLabelCount(Number.isFinite(value) ? clamp(value, 1, 500) : 1);
                    setIsDirty(true);
                  }}
                />
              </div>
              {!!batchRuleEntries.length && (
                <div className="builder-generator-list">
                  {batchRuleEntries.map(({ rule, item }) => (
                    <div
                      key={rule.itemId}
                      className="builder-generator-rule"
                      onMouseEnter={() => setHoveredBatchItemId(rule.itemId)}
                      onMouseLeave={() => setHoveredBatchItemId((prev) => (prev === rule.itemId ? null : prev))}
                    >
                      <p className="builder-generator-title">
                        {item.type.toUpperCase()} | {item.text || "(empty)"}
                      </p>
                      <label>
                        Mode
                        <select
                          value={rule.mode}
                          onChange={(e) => updateBatchRule(rule.itemId, { mode: e.target.value as BatchMode })}
                        >
                          <option value="increment">Increment</option>
                          <option value="decrement">Decrement</option>
                        </select>
                      </label>
                      <label>
                        Start
                        <input
                          type="number"
                          value={rule.start}
                          onChange={(e) => updateBatchRule(rule.itemId, { start: Math.round(Number(e.target.value) || 0) })}
                        />
                      </label>
                      <label>
                        Step
                        <input
                          type="number"
                          min={1}
                          value={rule.step}
                          onChange={(e) => updateBatchRule(rule.itemId, { step: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                        />
                      </label>
                      <label>
                        Pad
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={rule.pad}
                          onChange={(e) => updateBatchRule(rule.itemId, { pad: clamp(Math.round(Number(e.target.value) || 1), 1, 12) })}
                        />
                      </label>
                      <button type="button" className="download-btn" onClick={() => removeBatchRule(rule.itemId)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!batchRuleEntries.length && (
                <p className="muted">No generator items yet.</p>
              )}
              {!!batchNotice && <p className="muted">{batchNotice}</p>}
              <div className="builder-generator-actions">
                <button type="button" className="download-btn" onClick={clearBatchGenerator} disabled={!batchRuleEntries.length}>
                  Clear Generator
                </button>
                <button type="button" className="download-btn" onClick={generateBatchAndOpenPreview}>
                  Generate
                </button>
              </div>
            </div>
          </section>
        </aside>

        <section className="builder-canvas-wrap">
          <div className="builder-canvas-header">
            <h2>Label</h2>
            <div className="builder-canvas-toolbar" aria-label="Canvas tools">
              <div className="builder-toolbar-group" aria-label="History actions">
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={undoBuilderChange}
                  disabled={!historyAvailability.canUndo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 7H5v4" />
                    <path d="M5 11c2.6-3.1 6.2-4.4 9.4-3.4 3.4 1.1 5.3 4.1 4.6 7.1-.6 2.7-3 4.6-6.1 4.6H9" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={redoBuilderChange}
                  disabled={!historyAvailability.canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 7h4v4" />
                    <path d="M19 11c-2.6-3.1-6.2-4.4-9.4-3.4-3.4 1.1-5.3 4.1-4.6 7.1.6 2.7 3 4.6 6.1 4.6H15" />
                  </svg>
                </button>
              </div>
              <div className="builder-toolbar-group" aria-label="Edit actions">
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={copySelectedItems}
                  disabled={!selectedIds.length}
                  title="Copy (Ctrl+C)"
                  aria-label="Copy"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 9h10v10H9z" />
                    <path d="M5 15H4V5h10v1" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={pasteClipboardItems}
                  disabled={!clipboardAvailable}
                  title="Paste (Ctrl+V)"
                  aria-label="Paste"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 5h6" />
                    <path d="M10 3h4l1 2-1 2h-4L9 5z" />
                    <path d="M7 5H5v16h14V5h-2" />
                    <path d="M8 13h8" />
                    <path d="M8 17h6" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="builder-icon-btn"
                  onClick={duplicateSelectedItems}
                  disabled={!selectedIds.length}
                  title="Duplicate (Ctrl+D)"
                  aria-label="Duplicate"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 8h10v10H8z" />
                    <path d="M6 16H4V4h12v2" />
                    <path d="M13 11v4" />
                    <path d="M11 13h4" />
                  </svg>
                </button>
              </div>
              <div className="builder-toolbar-group" aria-label="Zoom controls">
                <button type="button" className="builder-icon-btn" onClick={() => zoomCanvas("out")} title="Zoom Out" aria-label="Zoom Out">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="5.5" />
                    <path d="M15 15l5 5" />
                    <path d="M8 10.5h5" />
                  </svg>
                </button>
                <button type="button" className="builder-icon-btn builder-icon-btn-fit" onClick={() => zoomCanvas("fit")} title="Fit To Screen" aria-label="Fit To Screen">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 4H4v4" />
                    <path d="M16 4h4v4" />
                    <path d="M20 16v4h-4" />
                    <path d="M8 20H4v-4" />
                  </svg>
                  <span>{Math.round(canvasZoom * 100)}%</span>
                </button>
                <button type="button" className="builder-icon-btn" onClick={() => zoomCanvas("in")} title="Zoom In" aria-label="Zoom In">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="5.5" />
                    <path d="M15 15l5 5" />
                    <path d="M8 10.5h5" />
                    <path d="M10.5 8v5" />
                  </svg>
                </button>
              </div>
              <div className="builder-toolbar-group" aria-label="Snap controls">
                <button
                  type="button"
                  className={`builder-icon-btn${snapToGridEnabled ? " is-active" : ""}`}
                  onClick={() => onSnapToGridChange(!snapToGridEnabled)}
                  title="Snap To Grid"
                  aria-label="Snap To Grid"
                  aria-pressed={snapToGridEnabled}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 4h16v16H4z" />
                    <path d="M12 4v16" />
                    <path d="M4 12h16" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`builder-icon-btn${snapToItemsEnabled ? " is-active" : ""}`}
                  onClick={() => onSnapToItemsChange(!snapToItemsEnabled)}
                  title="Snap To Elements"
                  aria-label="Snap To Elements"
                  aria-pressed={snapToItemsEnabled}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 7h5v5H7z" />
                    <path d="M12 12h5v5h-5z" />
                    <path d="M5 19h14" />
                    <path d="M5 5h14" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div
            className="builder-ruler-frame"
            style={{
              gridTemplateColumns: `34px ${canvasWidth * viewScale}px`,
              gridTemplateRows: `24px ${canvasHeight * viewScale}px`
            }}
          >
            <div className="builder-ruler-corner">
              {canvasCursor ? `${canvasCursor.x},${canvasCursor.y}` : "dots"}
            </div>
            <div className="builder-ruler builder-ruler-top" style={{ width: `${canvasWidth * viewScale}px` }}>
              {activeMeasure && (
                <>
                  <span
                    className="builder-ruler-selection builder-ruler-selection-x"
                    style={{
                      left: `${activeMeasure.x * viewScale}px`,
                      width: `${activeMeasure.width * viewScale}px`
                    }}
                  />
                  <span className="builder-ruler-marker builder-ruler-marker-x" style={{ left: `${activeMeasure.x * viewScale}px` }} />
                  <span className="builder-ruler-marker builder-ruler-marker-x" style={{ left: `${(activeMeasure.x + activeMeasure.width) * viewScale}px` }} />
                  <span className="builder-ruler-marker-label builder-ruler-marker-label-x" style={{ left: `${activeMeasure.x * viewScale}px` }}>
                    {activeMeasure.x}
                  </span>
                  <span className="builder-ruler-marker-label builder-ruler-marker-label-x builder-ruler-marker-label-end" style={{ left: `${(activeMeasure.x + activeMeasure.width) * viewScale}px` }}>
                    {activeMeasure.x + activeMeasure.width}
                  </span>
                </>
              )}
              {horizontalRulerTicks.map((tick) => (
                <span key={`x-${tick}`} className="builder-ruler-tick" style={{ left: `${tick * viewScale}px` }}>
                  {tick}
                </span>
              ))}
            </div>
            <div className="builder-ruler builder-ruler-left" style={{ height: `${canvasHeight * viewScale}px` }}>
              {activeMeasure && (
                <>
                  <span
                    className="builder-ruler-selection builder-ruler-selection-y"
                    style={{
                      top: `${activeMeasure.y * viewScale}px`,
                      height: `${activeMeasure.height * viewScale}px`
                    }}
                  />
                  <span className="builder-ruler-marker builder-ruler-marker-y" style={{ top: `${activeMeasure.y * viewScale}px` }} />
                  <span className="builder-ruler-marker builder-ruler-marker-y" style={{ top: `${(activeMeasure.y + activeMeasure.height) * viewScale}px` }} />
                  <span className="builder-ruler-marker-label builder-ruler-marker-label-y" style={{ top: `${activeMeasure.y * viewScale}px` }}>
                    {activeMeasure.y}
                  </span>
                  <span className="builder-ruler-marker-label builder-ruler-marker-label-y builder-ruler-marker-label-end" style={{ top: `${(activeMeasure.y + activeMeasure.height) * viewScale}px` }}>
                    {activeMeasure.y + activeMeasure.height}
                  </span>
                </>
              )}
              {verticalRulerTicks.map((tick) => (
                <span key={`y-${tick}`} className="builder-ruler-tick" style={{ top: `${tick * viewScale}px` }}>
                  {tick}
                </span>
              ))}
            </div>
            <div
              ref={canvasRef}
              className={`builder-canvas builder-canvas-live-preview${accordionOpen.generator ? " is-generator-mode" : ""}`}
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
              onMouseLeave={() => setCanvasCursor(null)}
              onMouseUp={stopDrag}
            >
            {activeMeasure && (
              <div className="builder-measure-hud">
                X {activeMeasure.x} Y {activeMeasure.y} W {activeMeasure.width} H {activeMeasure.height}
              </div>
            )}
            <div className="builder-render-layer" aria-hidden>
              <ZplCanvas
                zpl={builderPreviewZpl}
                printerSettings={builderPrinterSettings}
                showNonPrintableZones={false}
                respectZplGeometry
                labelPaperColor="#ffffff"
                qrLegacyOffset={false}
              />
            </div>
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
            {guideLines.map((guide, index) => (
              <div
                key={`${guide.axis}-${guide.value}-${index}`}
                className={`builder-guide-line builder-guide-line-${guide.axis}`}
                style={
                  guide.axis === "x"
                    ? { left: `${guide.value * viewScale}px` }
                    : { top: `${guide.value * viewScale}px` }
                }
              />
            ))}
            {[...items].filter((item) => !item.hidden).sort((a, b) => a.zIndex - b.zIndex).map((item) => (
              <div
                key={item.id}
                className={`builder-item builder-item-${item.type}${selectedIds.includes(item.id) ? " is-selected" : ""}${item.filled ? " is-filled" : ""}${item.locked ? " is-locked" : ""}${batchRuleIdSet.has(item.id) ? " is-in-generator" : ""}${hoveredBatchItemId === item.id ? " is-generator-hover" : ""}`}
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
                    : item.type === "table"
                      ? (() => {
                          const { rows, cols } = parseTableSpec(item.text);
                          return {
                            backgroundImage:
                              `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / cols}% - 1px), rgba(31,44,63,0.35) calc(${100 / cols}% - 1px), rgba(31,44,63,0.35) calc(${100 / cols}%)), ` +
                              `repeating-linear-gradient(0deg, transparent 0, transparent calc(${100 / rows}% - 1px), rgba(31,44,63,0.35) calc(${100 / rows}% - 1px), rgba(31,44,63,0.35) calc(${100 / rows}%))`
                          };
                        })()
                    : item.type === "shade"
                      ? (() => {
                          const shadePercent = normalizeShadePercent(item.text);
                          const alpha = Math.max(0.12, Math.min(0.82, shadePercent / 100));
                          return {
                            backgroundImage:
                              `repeating-linear-gradient(90deg, rgba(31,44,63,${alpha}) 0, rgba(31,44,63,${alpha}) 1px, transparent 1px, transparent 2px), ` +
                              `repeating-linear-gradient(0deg, rgba(31,44,63,${alpha * 0.65}) 0, rgba(31,44,63,${alpha * 0.65}) 1px, transparent 1px, transparent 2px)`,
                            backgroundColor: "rgba(255,255,255,0.9)"
                          };
                        })()
                    : {})
                }}
                onMouseDown={(e) => onItemMouseDown(e, item)}
              >
                {item.type === "text" && (
                  <span
                    style={
                      (() => {
                        const textPx = Math.max(10, Math.round(item.height * 0.8));
                        const widthCalibration = resolveBuilderTextWidthCalibration(item.font);
                        const textWidthRatio = clamp(item.textWidthRatio ?? 0.6, TEXT_WIDTH_RATIO_MIN, TEXT_WIDTH_RATIO_MAX);
                        const rotation =
                          item.orientation === "R"
                            ? "rotate(90deg)"
                            : item.orientation === "I"
                              ? "rotate(180deg)"
                              : item.orientation === "B"
                                ? "rotate(270deg)"
                                : "";
                        const hasRotation = rotation.length > 0;
                        const widthScale = widthCalibration * textWidthRatio;
                        const scalePart = widthScale !== 1 ? ` scaleX(${widthScale})` : "";
                        return {
                        fontSize: `${Math.max(10, Math.round(textPx * viewScale))}px`,
                        fontFamily: resolveBuilderTextFontFamily(item.font),
                        lineHeight: 1,
                        fontWeight: 700,
                        transform: `${rotation}${scalePart}`.trim() || undefined,
                        transformOrigin: hasRotation ? "50% 50%" : "0 0"
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
                {item.type === "graphic" && (
                  <span className="builder-item-passthrough-label">{item.text || "R:LOGO.GRF"}</span>
                )}
                {item.type === "table" && (
                  <span className="builder-item-passthrough-label">TABLE {parseTableSpec(item.text).rows}x{parseTableSpec(item.text).cols}</span>
                )}
                {item.type === "shade" && (
                  <span className="builder-item-passthrough-label">SHADE {normalizeShadePercent(item.text)}%</span>
                )}
                {isBarcodeElementType(item.type) && <BuilderBarcodePreview item={item} />}
                {!item.locked && <span className="builder-item-resize-handle builder-item-resize-handle-right" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "right")} />}
                {!item.locked && <span className="builder-item-resize-handle builder-item-resize-handle-bottom" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "bottom")} />}
                {!item.locked && <span className="builder-item-resize-handle builder-item-resize-handle-corner" onMouseDown={(e) => onResizeHandleMouseDown(e, item, "corner")} />}
              </div>
            ))}
            </div>
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
              <pre className="builder-generated-zpl-view" aria-label="Generated ZPL">
                {generatedZplLines.map((line, index) => (
                  <span
                    key={`generated-line-${index}`}
                    className={`builder-generated-zpl-line${index === selectedGeneratedLineIndex ? " is-linked" : ""}`}
                  >
                    {line || " "}
                  </span>
                ))}
              </pre>
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
