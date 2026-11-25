export type StandardHakCode = "M" | "U" | "B" | "P" | "L" | "W";

export type ScanFilter = "original" | "magic" | "grayscale" | "bw";

export type PageSlot = "page1" | "page2";

export type PdfQualityPreset = "high" | "standard" | "compact";

export type ConfidenceLevel = "high" | "medium" | "low";

export type NamingMode = "standard" | "custom";

export interface NormalizedPoint {
  /** Normalized horizontal coordinate (0..1) relative to rotated source image */
  x: number;
  /** Normalized vertical coordinate (0..1) relative to rotated source image */
  y: number;
}

/** Ordered clockwise: [topLeft, topRight, bottomRight, bottomLeft] */
export type QuadCorners = [
  NormalizedPoint,
  NormalizedPoint,
  NormalizedPoint,
  NormalizedPoint,
];

export interface ScannedPageState {
  id: string;
  originalFileName: string;
  mimeType: string;
  /** Uncropped image data/object URL after EXIF normalization */
  rawUrl: string;
  rawWidth: number;
  rawHeight: number;
  /** Clockwise rotation applied before cropping */
  rotation: 0 | 90 | 180 | 270;
  /** Current crop corners in rotated-image normalized coordinates */
  corners: QuadCorners;
  /** Initial auto-detected corners for quick reset */
  autoDetectedCorners: QuadCorners;
  /** Whether an actual paper edge contour was detected vs full-frame fallback */
  hasAutoContour: boolean;
  filter: ScanFilter;
  /** Brightness adjustment in range [-50, 50] */
  brightness: number;
  /** Contrast adjustment in range [-50, 50] */
  contrast: number;
  /** Processed image data URL (cropped + dewarped + filtered) */
  processedDataUrl: string;
  processedWidth: number;
  processedHeight: number;
  isProcessing: boolean;
  errorMessage: string | null;
}

export interface AiExtractionConfidence {
  nomor_su: number;
  tahun_su: number;
  jenis_hak: number;
  nomor_hak: number;
  kecamatan: number;
  kelurahan: number;
}

export interface AiRawEvidence {
  teks_nomor_su: string | null;
  teks_nomor_hak: string | null;
  teks_lokasi: string | null;
}

export interface AiExtractionResult {
  is_halaman_data_su: boolean;
  nomor_su_raw: string | null;
  tahun_su: string | null;
  kode_jenis_hak_angka: string | null;
  kode_jenis_hak_huruf: StandardHakCode | null;
  nomor_hak_raw: string | null;
  kecamatan_raw: string | null;
  kelurahan_raw: string | null;
  nib_terdeteksi: string | null;
  raw_evidence: AiRawEvidence;
  confidence: AiExtractionConfidence;
  catatan_peringatan: string | null;
}

export interface SuNamingFields {
  nomorSu: string;
  tahunSu: string;
  kodeHak: string;
  nomorHak: string;
  isCustomHak: boolean;
  customHak: string;
  kecamatan: string;
  kelurahan: string;
}

export interface FieldConfidenceMeta {
  score: number | null;
  level: ConfidenceLevel;
  reason: string | null;
}

export interface SuFieldConfidences {
  nomorSu: FieldConfidenceMeta;
  tahunSu: FieldConfidenceMeta;
  kodeHak: FieldConfidenceMeta;
  nomorHak: FieldConfidenceMeta;
  kecamatan: FieldConfidenceMeta;
  kelurahan: FieldConfidenceMeta;
}

export type AiStatus =
  | "idle"
  | "extracting"
  | "ocr-local"
  | "success"
  | "unconfigured"
  | "error";

export type AiEngineSource = "gemini" | "local-ocr";

export type DriveAuthMode =
  | "apps-script-env"
  | "apps-script-default"
  | "oauth-refresh-env"
  | "service-account-env"
  | "unconfigured";

export interface DriveStatusResponse {
  configured: boolean;
  mode: DriveAuthMode;
  defaultRootFolderId: string;
  defaultRootFolderUrl: string;
  defaultAppsScriptUrl: string;
  hasGoogleClientId: boolean;
}

export interface DriveUploadResult {
  ok: true;
  provider: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  folderId: string;
  folderName: string;
  folderUrl: string;
  folderCreated: boolean;
  kecamatanName?: string;
  kecamatanCreated?: boolean;
  kelurahanName?: string | null;
  kelurahanCreated?: boolean;
  nestedSupported?: boolean;
}

export interface SessionHistoryItem {
  id: string;
  filename: string;
  createdAt: number;
  pageCount: number;
  sizeBytes: number;
  nomorSu: string;
  tahunSu: string;
  kodeHak: string;
  nomorHak: string;
  kecamatan?: string;
  kelurahan?: string;
  driveFileUrl?: string;
  driveFolderUrl?: string;
  /** Optional PDF bytes persisted in local IndexedDB for re-download during session */
  pdfBytes?: ArrayBuffer;
}
