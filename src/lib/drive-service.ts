import { createSign, randomBytes } from "node:crypto";
import type {
  DriveAuthMode,
  DriveConflictPolicy,
  DriveDuplicateCheckResult,
  DriveExplorerEntry,
  DriveUploadResult,
} from "./su-types";
import {
  buildDriveFolderUrl,
  DEFAULT_APPS_SCRIPT_URL,
  validateAppsScriptWebhookUrl,
} from "./drive-config";
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  extractDriveFolderId,
  findMatchingKecamatanFolder,
  findMatchingKelurahanFolder,
  normalizeKecamatanName,
  normalizeKelurahanName,
} from "./su-formatter";

export class DriveServiceError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface SheetSyncMeta {
  logToSheet?: boolean;
  nomorSu?: string;
  tahunSu?: string;
  kodeHak?: string;
  nomorHak?: string;
  nib?: string;
  luasTanah?: string;
  pageCount?: number;
  operatorName?: string;
}

export function resolveConfiguredRootFolderId(override?: string | null): string {
  const fromOverride = extractDriveFolderId(override);
  if (fromOverride) return fromOverride;

  const fromEnv = extractDriveFolderId(
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
  );
  return fromEnv ?? DEFAULT_DRIVE_ROOT_FOLDER_ID;
}

export function detectDriveEnvAuthMode(): DriveAuthMode {
  if (
    process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL &&
    validateAppsScriptWebhookUrl(process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL)
  ) {
    return "apps-script-env";
  }

  if (
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  ) {
    return "oauth-refresh-env";
  }

  if (
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  ) {
    return "service-account-env";
  }

  if (validateAppsScriptWebhookUrl(DEFAULT_APPS_SCRIPT_URL)) {
    return "apps-script-default";
  }

  return "unconfigured";
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseServiceAccountCredentials(): {
  clientEmail: string;
  privateKey: string;
} {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new DriveServiceError(
        "INVALID_SERVICE_ACCOUNT",
        "GOOGLE_SERVICE_ACCOUNT_JSON tidak memiliki client_email atau private_key.",
        500,
      );
    }
    return {
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "";
  const privateKey = (
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
  ).replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new DriveServiceError(
      "INVALID_SERVICE_ACCOUNT",
      "Kredensial Google Service Account belum lengkap.",
      500,
    );
  }
  return { clientEmail, privateKey };
}

async function fetchServiceAccountAccessToken(): Promise<string> {
  const { clientEmail, privateKey } = parseServiceAccountCredentials();
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const signingInput = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64UrlEncode(signer.sign(privateKey));
  const assertion = `${signingInput}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new DriveServiceError(
      "DRIVE_TOKEN_ERROR",
      tokenData.error_description ||
        tokenData.error ||
        "Gagal menukar token Google Service Account.",
      502,
    );
  }
  return tokenData.access_token;
}

async function fetchOAuthRefreshAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || "";
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim() || "";

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const tokenData = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new DriveServiceError(
      "DRIVE_TOKEN_ERROR",
      tokenData.error_description ||
        "Gagal memperbarui Google OAuth Access Token. Periksa GOOGLE_DRIVE_REFRESH_TOKEN.",
      401,
    );
  }
  return tokenData.access_token;
}

function escapeDriveQuery(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mapDriveApiError(
  status: number,
  bodyText: string,
  rootFolderId: string,
): DriveServiceError {
  if (bodyText.includes("storageQuotaExceeded")) {
    return new DriveServiceError(
      "DRIVE_QUOTA_ERROR",
      "Service Account tidak memiliki kuota penyimpanan My Drive pribadi. Gunakan Google Apps Script Web App, OAuth Refresh Token, atau Google Workspace Shared Drive.",
      403,
    );
  }
  if (status === 404) {
    return new DriveServiceError(
      "DRIVE_FOLDER_NOT_FOUND",
      `Folder Google Drive (${rootFolderId}) tidak ditemukan atau belum dibagikan ke akun pengunggah.`,
      404,
    );
  }
  if (status === 401 || status === 403) {
    return new DriveServiceError(
      "DRIVE_PERMISSION_DENIED",
      "Akses Google Drive ditolak (401/403). Pastikan izin Editor telah diberikan.",
      status,
    );
  }
  return new DriveServiceError(
    "DRIVE_API_ERROR",
    `Google Drive API merespons galat (${status}).`,
    502,
  );
}

interface DriveFolderItem {
  id: string;
  name: string;
  webViewLink?: string;
}

interface DriveFileListItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
}

async function listChildFoldersRestV3(
  accessToken: string,
  parentFolderId: string,
): Promise<DriveFolderItem[]> {
  const escapedParent = escapeDriveQuery(parentFolderId);
  const query = `'${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const all: DriveFolderItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: query,
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields: "nextPageToken,files(id,name,webViewLink)",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      throw mapDriveApiError(listRes.status, await listRes.text(), parentFolderId);
    }
    const listData = (await listRes.json()) as {
      files?: DriveFolderItem[];
      nextPageToken?: string;
    };
    all.push(...(listData.files ?? []));
    pageToken = listData.nextPageToken;
  } while (pageToken);
  return all;
}

async function listMatchingFilesRestV3(
  accessToken: string,
  folderId: string,
  filename: string,
): Promise<DriveFileListItem[]> {
  const escapedParent = escapeDriveQuery(folderId);
  const query = `'${escapedParent}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    pageSize: "500",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
  });
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw mapDriveApiError(res.status, await res.text(), folderId);
  }
  const json = (await res.json()) as { files?: DriveFileListItem[] };
  const targetLower = filename.trim().toLowerCase();
  return (json.files ?? []).filter(
    (f) => f.name.trim().toLowerCase() === targetLower,
  );
}

async function findOrCreateDriveSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string,
  matchFolder: (
    folders: readonly DriveFolderItem[],
    target: string,
  ) => DriveFolderItem | undefined,
): Promise<{ folder: DriveFolderItem; created: boolean }> {
  const folders = await listChildFoldersRestV3(accessToken, parentFolderId);
  const match = matchFolder(folders, folderName);
  if (match) {
    return { folder: match, created: false };
  }

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      }),
    },
  );
  if (!createRes.ok) {
    throw mapDriveApiError(createRes.status, await createRes.text(), parentFolderId);
  }
  const createdFolder = (await createRes.json()) as DriveFolderItem;
  return { folder: createdFolder, created: true };
}

async function resolveRestAccessToken(params: {
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<
  | { kind: "rest"; token: string; provider: string }
  | { kind: "apps-script"; webhookUrl: string }
> {
  if (params.clientAccessToken?.trim()) {
    return {
      kind: "rest",
      token: params.clientAccessToken.trim(),
      provider: "google-oauth-client",
    };
  }
  const envScriptUrl = validateAppsScriptWebhookUrl(
    process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL || "",
  )?.toString();
  const clientScriptUrl = validateAppsScriptWebhookUrl(
    params.appsScriptUrl || "",
  )?.toString();
  if (envScriptUrl || clientScriptUrl) {
    return {
      kind: "apps-script",
      webhookUrl: (envScriptUrl || clientScriptUrl) as string,
    };
  }
  const envMode = detectDriveEnvAuthMode();
  if (envMode === "oauth-refresh-env") {
    return {
      kind: "rest",
      token: await fetchOAuthRefreshAccessToken(),
      provider: "google-oauth-refresh",
    };
  }
  if (envMode === "service-account-env") {
    return {
      kind: "rest",
      token: await fetchServiceAccountAccessToken(),
      provider: "google-service-account",
    };
  }
  const defaultUrl = validateAppsScriptWebhookUrl(
    DEFAULT_APPS_SCRIPT_URL,
  )?.toString();
  if (defaultUrl) {
    return { kind: "apps-script", webhookUrl: defaultUrl };
  }
  throw new DriveServiceError(
    "DRIVE_NOT_CONFIGURED",
    "Koneksi Google Drive belum dikonfigurasi.",
    503,
  );
}

async function callAppsScriptPost(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      ...payload,
      secret: process.env.GOOGLE_DRIVE_APPS_SCRIPT_SECRET || "",
    }),
  });
  const rawText = await res.text();
  if (res.status === 403 || rawText.trim().startsWith("<")) {
    throw new DriveServiceError(
      "APPS_SCRIPT_PERMISSION_DENIED",
      "Akses Google Apps Script Web App ditolak (HTTP 403). Atur Deploy -> Who has access = Anyone / Siapa saja.",
      403,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new DriveServiceError(
      "APPS_SCRIPT_INVALID_JSON",
      "Respons Google Apps Script bukan JSON valid.",
      502,
    );
  }
  return parsed;
}

async function uploadPdfMultipartRestV3(params: {
  accessToken: string;
  provider: string;
  rootFolderId: string;
  kecamatanName: string;
  kelurahanName?: string;
  filename: string;
  pdfBuffer: Buffer;
  conflictPolicy: DriveConflictPolicy;
}): Promise<DriveUploadResult> {
  const kecResult = await findOrCreateDriveSubfolder(
    params.accessToken,
    params.rootFolderId,
    params.kecamatanName,
    findMatchingKecamatanFolder,
  );
  const kelResult = params.kelurahanName
    ? await findOrCreateDriveSubfolder(
        params.accessToken,
        kecResult.folder.id,
        params.kelurahanName,
        findMatchingKelurahanFolder,
      )
    : null;
  const targetFolder = kelResult ? kelResult.folder : kecResult.folder;

  const matches = await listMatchingFilesRestV3(
    params.accessToken,
    targetFolder.id,
    params.filename,
  );

  if (matches.length > 0 && params.conflictPolicy === "skip") {
    const kept = matches[0];
    return {
      ok: true,
      nestedSupported: true,
      skipped: true,
      provider: params.provider,
      fileId: kept.id,
      fileName: kept.name,
      fileUrl:
        kept.webViewLink || `https://drive.google.com/file/d/${kept.id}/view`,
      folderId: targetFolder.id,
      folderName: kelResult
        ? `${kecResult.folder.name} / ${kelResult.folder.name}`
        : kecResult.folder.name,
      folderUrl:
        targetFolder.webViewLink || buildDriveFolderUrl(targetFolder.id),
      folderCreated: false,
      kecamatanName: kecResult.folder.name,
      kecamatanCreated: kecResult.created,
      kelurahanName: kelResult ? kelResult.folder.name : undefined,
      kelurahanCreated: kelResult ? kelResult.created : false,
    };
  }

  let finalFilename = params.filename;
  let overwritten = false;
  if (matches.length > 0) {
    if (params.conflictPolicy === "overwrite") {
      for (const old of matches) {
        await fetch(
          `https://www.googleapis.com/drive/v3/files/${old.id}?supportsAllDrives=true`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${params.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ trashed: true }),
          },
        );
      }
      overwritten = true;
    } else {
      finalFilename = params.filename.replace(
        /(\.pdf)$/i,
        `_rev${Date.now().toString().slice(-4)}$1`,
      );
    }
  }

  const boundary = `suScannerBoundary_${randomBytes(12).toString("hex")}`;
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      {
        name: finalFilename,
        parents: [targetFolder.id],
        description: `Surat Ukur Kecamatan ${kecResult.folder.name}${
          kelResult ? `, Kelurahan ${kelResult.folder.name}` : ""
        } — Diunggah oleh SU-Scanner`,
      },
    )}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    "utf8",
  );
  const closingPart = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([metadataPart, params.pdfBuffer, closingPart]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!uploadRes.ok) {
    throw mapDriveApiError(uploadRes.status, await uploadRes.text(), targetFolder.id);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    ok: true,
    nestedSupported: true,
    overwritten,
    provider: params.provider,
    fileId: uploaded.id,
    fileName: uploaded.name,
    fileUrl:
      uploaded.webViewLink ||
      `https://drive.google.com/file/d/${uploaded.id}/view`,
    folderId: targetFolder.id,
    folderName: kelResult
      ? `${kecResult.folder.name} / ${kelResult.folder.name}`
      : kecResult.folder.name,
    folderUrl:
      targetFolder.webViewLink || buildDriveFolderUrl(targetFolder.id),
    folderCreated: kelResult ? kelResult.created : kecResult.created,
    kecamatanName: kecResult.folder.name,
    kecamatanCreated: kecResult.created,
    kelurahanName: kelResult ? kelResult.folder.name : undefined,
    kelurahanCreated: kelResult ? kelResult.created : false,
  };
}

async function uploadViaAppsScript(params: {
  webhookUrl: string;
  rootFolderId: string;
  kecamatanName: string;
  kelurahanName?: string;
  filename: string;
  pdfBase64: string;
  conflictPolicy: DriveConflictPolicy;
  sheetMeta?: SheetSyncMeta;
}): Promise<DriveUploadResult> {
  const parsed = await callAppsScriptPost(params.webhookUrl, {
    rootFolderId: params.rootFolderId,
    kecamatan: params.kecamatanName,
    kelurahan: params.kelurahanName || "",
    filename: params.filename,
    pdfBase64: params.pdfBase64,
    conflictPolicy: params.conflictPolicy,
    sheetMeta: params.sheetMeta ?? null,
  });

  if (!parsed.ok) {
    throw new DriveServiceError(
      "APPS_SCRIPT_ERROR",
      typeof parsed.error === "string"
        ? parsed.error
        : "Google Apps Script gagal mengunggah berkas ke Drive.",
      502,
    );
  }

  const folderId = String(parsed.folderId || "");
  const fileId = String(parsed.fileId || "");
  const kecamatanReturned =
    typeof parsed.kecamatanName === "string" && parsed.kecamatanName.trim()
      ? parsed.kecamatanName.trim()
      : params.kecamatanName;
  const kelurahanReturned =
    typeof parsed.kelurahanName === "string" && parsed.kelurahanName.trim()
      ? parsed.kelurahanName.trim()
      : undefined;

  return {
    ok: true,
    nestedSupported: parsed.nestedSupported === true,
    skipped: Boolean(parsed.skipped),
    overwritten: Boolean(parsed.overwritten),
    sheetLogged: Boolean(parsed.sheetLogged),
    sheetUrl: typeof parsed.sheetUrl === "string" ? parsed.sheetUrl : undefined,
    provider: "apps-script",
    fileId,
    fileName: String(parsed.fileName || params.filename),
    fileUrl:
      typeof parsed.fileUrl === "string" && parsed.fileUrl
        ? parsed.fileUrl
        : `https://drive.google.com/file/d/${fileId}/view`,
    folderId,
    folderName: String(
      parsed.folderName ||
        (kelurahanReturned
          ? `${kecamatanReturned} / ${kelurahanReturned}`
          : kecamatanReturned),
    ),
    folderUrl:
      typeof parsed.folderUrl === "string" && parsed.folderUrl
        ? parsed.folderUrl
        : buildDriveFolderUrl(folderId),
    folderCreated: Boolean(parsed.folderCreated),
    kecamatanName: kecamatanReturned,
    kecamatanCreated:
      typeof parsed.kecamatanCreated === "boolean"
        ? parsed.kecamatanCreated
        : !kelurahanReturned && Boolean(parsed.folderCreated),
    kelurahanName: kelurahanReturned,
    kelurahanCreated: Boolean(parsed.kelurahanCreated),
  };
}

export async function uploadPdfToKecamatanDrive(params: {
  filename: string;
  kecamatan: string;
  kelurahan?: string | null;
  rootFolderId?: string | null;
  pdfBase64: string;
  conflictPolicy?: DriveConflictPolicy;
  sheetMeta?: SheetSyncMeta;
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<DriveUploadResult> {
  const kecamatanName = normalizeKecamatanName(params.kecamatan);
  if (!kecamatanName) {
    throw new DriveServiceError(
      "KECAMATAN_REQUIRED",
      "Nama Kecamatan wajib diisi agar sistem dapat membuat/memilih subfolder Drive yang sesuai.",
      400,
    );
  }
  const kelurahanName = normalizeKelurahanName(params.kelurahan) || undefined;
  const conflictPolicy: DriveConflictPolicy =
    params.conflictPolicy ?? "revision";

  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const pdfBuffer = Buffer.from(params.pdfBase64, "base64");
  if (pdfBuffer.byteLength === 0) {
    throw new DriveServiceError(
      "EMPTY_PDF",
      "Berkas PDF kosong atau gagal didekode.",
      400,
    );
  }

  const route = await resolveRestAccessToken(params);
  if (route.kind === "rest") {
    return uploadPdfMultipartRestV3({
      accessToken: route.token,
      provider: route.provider,
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBuffer,
      conflictPolicy,
    });
  }

  return uploadViaAppsScript({
    webhookUrl: route.webhookUrl,
    rootFolderId,
    kecamatanName,
    kelurahanName,
    filename: params.filename,
    pdfBase64: params.pdfBase64,
    conflictPolicy,
    sheetMeta: params.sheetMeta,
  });
}

export async function checkDuplicateInDrive(params: {
  filename: string;
  kecamatan: string;
  kelurahan?: string | null;
  rootFolderId?: string | null;
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<DriveDuplicateCheckResult> {
  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const kecName = normalizeKecamatanName(params.kecamatan);
  const kelName = normalizeKelurahanName(params.kelurahan) || undefined;
  if (!kecName || !params.filename.trim()) {
    return {
      ok: true,
      supported: true,
      exists: false,
      count: 0,
      matches: [],
    };
  }

  const route = await resolveRestAccessToken(params);
  if (route.kind === "rest") {
    const kecFolders = await listChildFoldersRestV3(route.token, rootFolderId);
    const kecFolder = findMatchingKecamatanFolder(kecFolders, kecName);
    if (!kecFolder) {
      return { ok: true, supported: true, exists: false, count: 0, matches: [] };
    }
    let targetFolder = kecFolder;
    if (kelName) {
      const kelFolders = await listChildFoldersRestV3(route.token, kecFolder.id);
      const kelFolder = findMatchingKelurahanFolder(kelFolders, kelName);
      if (!kelFolder) {
        return { ok: true, supported: true, exists: false, count: 0, matches: [] };
      }
      targetFolder = kelFolder;
    }
    const files = await listMatchingFilesRestV3(
      route.token,
      targetFolder.id,
      params.filename,
    );
    return {
      ok: true,
      supported: true,
      exists: files.length > 0,
      count: files.length,
      matches: files.map((f) => ({
        id: f.id,
        name: f.name,
        url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        sizeBytes: f.size ? Number(f.size) : undefined,
        updatedAt: f.modifiedTime,
      })),
      folderName: targetFolder.name,
      folderUrl: targetFolder.webViewLink || buildDriveFolderUrl(targetFolder.id),
    };
  }

  const res = await callAppsScriptPost(route.webhookUrl, {
    action: "exists",
    rootFolderId,
    kecamatan: kecName,
    kelurahan: kelName || "",
    filename: params.filename,
  });
  if (res.ok && res.supported) {
    return {
      ok: true,
      supported: true,
      exists: Boolean(res.exists),
      count: Number(res.count || 0),
      matches: Array.isArray(res.matches)
        ? (res.matches as DriveDuplicateCheckResult["matches"])
        : [],
      folderName: typeof res.folderName === "string" ? res.folderName : undefined,
      folderUrl: typeof res.folderUrl === "string" ? res.folderUrl : undefined,
    };
  }

  return {
    ok: true,
    supported: false,
    exists: false,
    count: 0,
    matches: [],
    message:
      "Web App Apps Script perlu diperbarui & Deploy New version untuk mengaktifkan cek duplikat Drive.",
  };
}

export async function exploreDriveFolder(params: {
  folderId?: string | null;
  rootFolderId?: string | null;
  query?: string | null;
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<{
  ok: true;
  supported: boolean;
  folderId: string;
  folderName: string;
  folderUrl: string;
  items: DriveExplorerEntry[];
  message?: string;
}> {
  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const targetFolderId = params.folderId?.trim() || rootFolderId;
  const route = await resolveRestAccessToken(params);

  if (route.kind === "rest") {
    const escapedParent = escapeDriveQuery(targetFolderId);
    const q = `'${escapedParent}' in parents and trashed = false`;
    const sp = new URLSearchParams({
      q,
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    });
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${sp.toString()}`,
      { headers: { Authorization: `Bearer ${route.token}` } },
    );
    if (!res.ok) {
      throw mapDriveApiError(res.status, await res.text(), targetFolderId);
    }
    const json = (await res.json()) as { files?: DriveFileListItem[] };
    const needle = (params.query || "").trim().toLowerCase();
    const items: DriveExplorerEntry[] = (json.files ?? [])
      .filter((f) => !needle || f.name.toLowerCase().includes(needle))
      .map((f) => ({
        id: f.id,
        name: f.name,
        kind:
          f.mimeType === "application/vnd.google-apps.folder"
            ? ("folder" as const)
            : ("file" as const),
        mimeType: f.mimeType,
        url:
          f.webViewLink ||
          (f.mimeType === "application/vnd.google-apps.folder"
            ? buildDriveFolderUrl(f.id)
            : `https://drive.google.com/file/d/${f.id}/view`),
        sizeBytes: f.size ? Number(f.size) : undefined,
        updatedAt: f.modifiedTime,
      }))
      .sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name, "id")
          : a.kind === "folder"
            ? -1
            : 1,
      );
    return {
      ok: true,
      supported: true,
      folderId: targetFolderId,
      folderName: targetFolderId === rootFolderId ? "Folder Induk" : "Subfolder",
      folderUrl: buildDriveFolderUrl(targetFolderId),
      items,
    };
  }

  const parsed = await callAppsScriptPost(route.webhookUrl, {
    action: "explore",
    rootFolderId,
    folderId: targetFolderId,
    query: params.query || "",
  });

  if (parsed.ok && parsed.supported) {
    const items = Array.isArray(parsed.items)
      ? (parsed.items as DriveExplorerEntry[])
      : [];
    return {
      ok: true,
      supported: true,
      folderId: String(parsed.folderId || targetFolderId),
      folderName: String(parsed.folderName || "Drive Folder"),
      folderUrl: String(
        parsed.folderUrl || buildDriveFolderUrl(targetFolderId),
      ),
      items,
    };
  }

  return {
    ok: true,
    supported: false,
    folderId: targetFolderId,
    folderName: "Perlu Update Apps Script",
    folderUrl: buildDriveFolderUrl(targetFolderId),
    items: [],
    message:
      "Salin & Deploy New version kode Apps Script terbaru dari modal Pengaturan Google Drive agar fitur Jelajah Drive aktif.",
  };
}

export async function renameDriveFile(params: {
  fileId: string;
  newFilename: string;
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<{ ok: true; fileId: string; fileName: string; fileUrl: string }> {
  const route = await resolveRestAccessToken(params);
  if (route.kind === "rest") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${params.fileId}?supportsAllDrives=true&fields=id,name,webViewLink`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${route.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: params.newFilename }),
      },
    );
    if (!res.ok) {
      throw mapDriveApiError(res.status, await res.text(), params.fileId);
    }
    const json = (await res.json()) as {
      id: string;
      name: string;
      webViewLink?: string;
    };
    return {
      ok: true,
      fileId: json.id,
      fileName: json.name,
      fileUrl: json.webViewLink || `https://drive.google.com/file/d/${json.id}/view`,
    };
  }

  const parsed = await callAppsScriptPost(route.webhookUrl, {
    action: "rename",
    fileId: params.fileId,
    newFilename: params.newFilename,
  });
  if (!parsed.ok) {
    throw new DriveServiceError(
      "RENAME_FAILED",
      typeof parsed.error === "string"
        ? parsed.error
        : "Gagal mengganti nama file di Google Drive.",
      502,
    );
  }
  return {
    ok: true,
    fileId: String(parsed.fileId || params.fileId),
    fileName: String(parsed.fileName || params.newFilename),
    fileUrl: String(
      parsed.fileUrl || `https://drive.google.com/file/d/${params.fileId}/view`,
    ),
  };
}

export async function moveDriveFile(params: {
  fileId: string;
  rootFolderId?: string | null;
  targetKecamatan: string;
  targetKelurahan?: string | null;
  appsScriptUrl?: string | null;
  clientAccessToken?: string | null;
}): Promise<{
  ok: true;
  fileId: string;
  fileName: string;
  folderId: string;
  folderName: string;
  folderUrl: string;
}> {
  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const kecName = normalizeKecamatanName(params.targetKecamatan);
  const kelName = normalizeKelurahanName(params.targetKelurahan) || undefined;
  const route = await resolveRestAccessToken(params);

  if (route.kind === "rest") {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${params.fileId}?supportsAllDrives=true&fields=id,name,parents`,
      { headers: { Authorization: `Bearer ${route.token}` } },
    );
    if (!metaRes.ok) {
      throw mapDriveApiError(metaRes.status, await metaRes.text(), params.fileId);
    }
    const meta = (await metaRes.json()) as {
      id: string;
      name: string;
      parents?: string[];
    };
    const kecRes = await findOrCreateDriveSubfolder(
      route.token,
      rootFolderId,
      kecName,
      findMatchingKecamatanFolder,
    );
    const kelRes = kelName
      ? await findOrCreateDriveSubfolder(
          route.token,
          kecRes.folder.id,
          kelName,
          findMatchingKelurahanFolder,
        )
      : null;
    const dst = kelRes ? kelRes.folder : kecRes.folder;
    const prevParents = (meta.parents ?? []).join(",");
    const sp = new URLSearchParams({
      supportsAllDrives: "true",
      addParents: dst.id,
      fields: "id,name",
    });
    if (prevParents) sp.set("removeParents", prevParents);
    const moveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${params.fileId}?${sp.toString()}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${route.token}` },
      },
    );
    if (!moveRes.ok) {
      throw mapDriveApiError(moveRes.status, await moveRes.text(), dst.id);
    }
    return {
      ok: true,
      fileId: meta.id,
      fileName: meta.name,
      folderId: dst.id,
      folderName: kelRes ? `${kecRes.folder.name} / ${kelRes.folder.name}` : kecRes.folder.name,
      folderUrl: dst.webViewLink || buildDriveFolderUrl(dst.id),
    };
  }

  const parsed = await callAppsScriptPost(route.webhookUrl, {
    action: "move",
    rootFolderId,
    fileId: params.fileId,
    targetKecamatan: kecName,
    targetKelurahan: kelName || "",
  });
  if (!parsed.ok) {
    throw new DriveServiceError(
      "MOVE_FAILED",
      typeof parsed.error === "string"
        ? parsed.error
        : "Gagal memindahkan file ke folder tujuan.",
      502,
    );
  }
  return {
    ok: true,
    fileId: String(parsed.fileId || params.fileId),
    fileName: String(parsed.fileName || ""),
    folderId: String(parsed.folderId || ""),
    folderName: String(parsed.folderName || kecName),
    folderUrl: String(parsed.folderUrl || buildDriveFolderUrl(rootFolderId)),
  };
}

export async function verifyDriveConnection(params: {
  rootFolderId?: string | null;
  appsScriptUrl?: string | null;
}): Promise<{
  ok: true;
  mode: string;
  appsScriptUrl: string | null;
  nestedSupported: boolean;
  explorerSupported: boolean;
  sheetSupported: boolean;
  rootFolderId: string;
  rootFolderName?: string;
  rootFolderUrl: string;
  message: string;
}> {
  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const rootFolderUrl = buildDriveFolderUrl(rootFolderId);
  const envUrl = validateAppsScriptWebhookUrl(
    process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL || "",
  )?.toString();
  const clientUrl = validateAppsScriptWebhookUrl(
    params.appsScriptUrl || "",
  )?.toString();
  const targetUrl =
    envUrl ||
    clientUrl ||
    validateAppsScriptWebhookUrl(DEFAULT_APPS_SCRIPT_URL)?.toString() ||
    null;

  if (!targetUrl) {
    throw new DriveServiceError(
      "INVALID_APPS_SCRIPT_URL",
      "URL Web App Apps Script tidak valid.",
      400,
    );
  }

  const postJson = await callAppsScriptPost(targetUrl, {
    action: "verify",
    rootFolderId,
  });

  if (postJson.ok && postJson.verified) {
    return {
      ok: true,
      mode: envUrl ? "apps-script-env" : clientUrl ? "apps-script-client" : "apps-script-default",
      appsScriptUrl: targetUrl,
      nestedSupported: Boolean(postJson.nestedSupported),
      explorerSupported: Boolean(postJson.explorerSupported),
      sheetSupported: Boolean(postJson.sheetSupported),
      rootFolderId,
      rootFolderName:
        typeof postJson.folderName === "string" ? postJson.folderName : undefined,
      rootFolderUrl:
        typeof postJson.folderUrl === "string" ? postJson.folderUrl : rootFolderUrl,
      message: `Terhubung ke folder "${String(postJson.folderName || rootFolderId)}" (Kecamatan/Kelurahan, Cek Duplikat, Explorer & Sheets siap).`,
    };
  }

  const getRes = await fetch(targetUrl, { redirect: "follow" });
  const getText = await getRes.text();
  if (getRes.status === 403 || getText.trim().startsWith("<")) {
    throw new DriveServiceError(
      "APPS_SCRIPT_PERMISSION_DENIED",
      "Akses Google Apps Script Web App ditolak (HTTP 403). Atur akses menjadi Anyone / Siapa saja.",
      403,
    );
  }
  const getJson = JSON.parse(getText) as Record<string, unknown>;
  if (!getJson.ok) {
    throw new DriveServiceError(
      "APPS_SCRIPT_ERROR",
      typeof getJson.error === "string"
        ? getJson.error
        : "Google Apps Script merespons galat saat verifikasi.",
      502,
    );
  }

  return {
    ok: true,
    mode: envUrl ? "apps-script-env" : clientUrl ? "apps-script-client" : "apps-script-default",
    appsScriptUrl: targetUrl,
    nestedSupported: getJson.nestedSupported === true,
    explorerSupported: getJson.explorerSupported === true,
    sheetSupported: getJson.sheetSupported === true,
    rootFolderId,
    rootFolderUrl,
    message:
      getJson.explorerSupported === true
        ? "Web App Apps Script terbaru terhubung (Nested Folder, Cek Duplikat, Explorer & Sheets aktif)."
        : "Web App Apps Script terhubung (versi lama: klik Salin Kode & Deploy New version untuk mengaktifkan Explorer, Duplikat Cloud & Sheets).",
  };
}
