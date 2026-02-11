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

