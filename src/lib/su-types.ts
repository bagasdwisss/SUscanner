import type { ImageQualityReport } from "./image-quality";

export type StandardHakCode = "M" | "U" | "B" | "P" | "L" | "W";

export type ScanFilter = "original" | "magic" | "grayscale" | "bw" | "stamp-clean";

export type PageSlot = "page1" | "page2";

export type PdfQualityPreset = "high" | "standard" | "compact";

export type ConfidenceLevel = "high" | "medium" | "low";

export type NamingMode = "standard" | "custom";

export type DriveConflictPolicy = "revision" | "overwrite" | "skip";

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

/** Optional curved edge midpoints clockwise: [topMid, rightMid, bottomMid, leftMid] */
export type EdgeMidpoints = [
  NormalizedPoint,
  NormalizedPoint,
  NormalizedPoint,
  NormalizedPoint,
];

export interface OcrWordBox {
  text: string;
  /** Normalized 0..1 coordinates relative to processed page image */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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
  /** Optional 4 midpoints for book-spine / page-curl Coons-patch dewarping */
  edgeMidpoints?: EdgeMidpoints;
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
  /** Optional word boxes for invisible searchable PDF text layer */
  ocrWords?: OcrWordBox[];
  /** Early motion-blur and specular glare quality diagnostic */
  qualityReport?: ImageQualityReport;
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
  luas_tanah?: string | null;
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
  nib?: string;
  luasTanah?: string;
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
  skipped?: boolean;
  overwritten?: boolean;
  sheetLogged?: boolean;
  sheetUrl?: string;
}

export interface DriveDuplicateCheckResult {
  ok: boolean;
  supported: boolean;
  exists: boolean;
  count: number;
  matches: Array<{
    id: string;
    name: string;
    url: string;
    sizeBytes?: number;
    updatedAt?: string;
  }>;
  folderName?: string;
  folderUrl?: string;
  message?: string;
}

export interface DriveExplorerEntry {
  id: string;
  name: string;
  kind: "folder" | "file";
  mimeType: string;
  url: string;
  sizeBytes?: number;
  updatedAt?: string;
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
  nib?: string;
  luasTanah?: string;
  operatorName?: string;
  driveFileUrl?: string;
  driveFolderUrl?: string;
  /** Optional PDF bytes persisted in local IndexedDB for re-download during session */
  pdfBytes?: ArrayBuffer;
}

export interface OfflineUploadJob {
  id: string;
  createdAt: number;
  filename: string;
  kecamatan: string;
  kelurahan?: string;
  rootFolderId?: string;
  conflictPolicy: DriveConflictPolicy;
  operatorName?: string;
  nomorSu: string;
  tahunSu: string;
  kodeHak: string;
  nomorHak: string;
  nib?: string;
  luasTanah?: string;
  pageCount: number;
  sizeBytes: number;
  pdfBytes: ArrayBuffer;
  attempts: number;
  lastError?: string | null;
}

export interface BatchQueuePair {
  id: string;
  status:
    | "pending"
    | "processing"
    | "ready"
    | "needs-review"
    | "uploading"
    | "uploaded"
    | "error";
  page1FileName: string;
  page1RawUrl: string;
  page1Width: number;
  page1Height: number;
  page1Corners: QuadCorners;
  page1ProcessedUrl: string;
  page1Quality?: ImageQualityReport;
  page1OcrWords?: OcrWordBox[];
  page2FileName?: string;
  page2RawUrl?: string;
  page2Width?: number;
  page2Height?: number;
  page2Corners?: QuadCorners;
  page2ProcessedUrl?: string;
  page2Quality?: ImageQualityReport;
  page2OcrWords?: OcrWordBox[];
  fields: SuNamingFields;
  confidences: SuFieldConfidences;
  warnings: string[];
  aiSource?: AiEngineSource;
  driveResult?: DriveUploadResult;
  errorMessage?: string;
}
