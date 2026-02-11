export type InputMode = "plain" | "base64" | "base64_gzip";

export type DetectedInput = {
  mode: InputMode;
  text: string;
};

export type LabelCandidate = {
  id: string;
  source: string;
  index: number;
  zpl: string;
};

export type ScanResult = {
  labels: LabelCandidate[];
  warnings: string[];
  entriesScanned?: number;
  entriesWithLabels?: number;
  modeCounts?: Record<InputMode, number>;
  fileSummaries?: Array<{
    name: string;
    mode: InputMode;
    labels: number;
  }>;
};

export type AppErrorCode =
  | "decode_failed"
  | "empty_input"
  | "no_labels"
  | "preview_failed";

export type AppError = {
  code: AppErrorCode;
  message: string;
};

export type PrintDensityDpmm = 8 | 12 | 24;
export type PrintQuality = "binary" | "grayscale";
export type LabelUnit = "in" | "mm" | "cm";

export type PrinterSettings = {
  model: string;
  densityDpmm: PrintDensityDpmm;
  dpi: number;
  quality: PrintQuality;
  labelWidth: number;
  labelHeight: number;
  labelUnit: LabelUnit;
  showLabelIndex: number;
  showLabelCount: number;
};
