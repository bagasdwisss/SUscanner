import { createSign, randomBytes } from "node:crypto";
import type { DriveAuthMode, DriveUploadResult } from "./su-types";
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
    error?: string;
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
      `Folder Google Drive (${rootFolderId}) tidak ditemukan atau belum dibagikan ke akun Google/Service Account pengunggah.`,
      404,
    );
  }
  if (status === 401 || status === 403) {
    return new DriveServiceError(
      "DRIVE_PERMISSION_DENIED",
      "Akses Google Drive ditolak (401/403). Pastikan izin Editor telah diberikan atau login ulang ke akun Google Drive.",
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

async function findOrCreateDriveSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string,
  matchFolder: (
    folders: readonly DriveFolderItem[],
    target: string,
  ) => DriveFolderItem | undefined,
): Promise<{ folder: DriveFolderItem; created: boolean }> {
  const escapedParent = escapeDriveQuery(parentFolderId);
  const query = `'${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

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
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      throw mapDriveApiError(listRes.status, errText, parentFolderId);
    }

    const listData = (await listRes.json()) as {
      files?: DriveFolderItem[];
      nextPageToken?: string;
    };
    const match = matchFolder(listData.files ?? [], folderName);
    if (match) {
      return { folder: match, created: false };
    }
    pageToken = listData.nextPageToken;
  } while (pageToken);

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
    const errText = await createRes.text();
    throw mapDriveApiError(createRes.status, errText, parentFolderId);
  }

  const createdFolder = (await createRes.json()) as DriveFolderItem;
  return { folder: createdFolder, created: true };
}

async function uploadPdfMultipartRestV3(params: {
  accessToken: string;
  provider: string;
  rootFolderId: string;
  kecamatanName: string;
  kelurahanName?: string;
  filename: string;
  pdfBuffer: Buffer;
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

  const boundary = `suScannerBoundary_${randomBytes(12).toString("hex")}`;
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
      {
        name: params.filename,
        parents: [targetFolder.id],
        description: `Surat Ukur Kecamatan ${kecResult.folder.name}${
          kelResult ? `, Kelurahan ${kelResult.folder.name}` : ""
        } — Diunggah otomatis oleh SU-Scanner`,
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
    const errText = await uploadRes.text();
    throw mapDriveApiError(uploadRes.status, errText, targetFolder.id);
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    ok: true,
    nestedSupported: true,
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
}): Promise<DriveUploadResult> {
  const validatedUrl = validateAppsScriptWebhookUrl(params.webhookUrl);
  if (!validatedUrl) {
    throw new DriveServiceError(
      "INVALID_APPS_SCRIPT_URL",
      "URL Google Apps Script tidak valid. Harus diawali https://script.google.com/macros/s/...",
      400,
    );
  }

  const res = await fetch(validatedUrl.toString(), {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      rootFolderId: params.rootFolderId,
      kecamatan: params.kecamatanName,
      kelurahan: params.kelurahanName || "",
      filename: params.filename,
      pdfBase64: params.pdfBase64,
      secret: process.env.GOOGLE_DRIVE_APPS_SCRIPT_SECRET || "",
    }),
  });

  const rawText = await res.text();
  if (res.status === 403 || rawText.trim().startsWith("<")) {
    throw new DriveServiceError(
      "APPS_SCRIPT_PERMISSION_DENIED",
      "Akses Google Apps Script Web App ditolak (HTTP 403 / halaman login). Di editor Google Apps Script klik Deploy → Manage deployments → Edit → ubah 'Who has access / Yang memiliki akses' menjadi 'Anyone / Siapa saja' (bukan 'Only myself' atau 'Anyone with Google account').",
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

  const rootFolderId = resolveConfiguredRootFolderId(params.rootFolderId);
  const pdfBuffer = Buffer.from(params.pdfBase64, "base64");
  if (pdfBuffer.byteLength === 0) {
    throw new DriveServiceError(
      "EMPTY_PDF",
      "Berkas PDF kosong atau gagal didekode.",
      400,
    );
  }

  // 1. User browser OAuth token (if user signed in via GIS popup)
  if (params.clientAccessToken?.trim()) {
    return uploadPdfMultipartRestV3({
      accessToken: params.clientAccessToken.trim(),
      provider: "google-oauth-client",
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBuffer,
    });
  }

  // 2. Explicit Apps Script webhook from env, or explicit client URL
  const explicitAppsScriptUrl =
    process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL?.trim() ||
    params.appsScriptUrl?.trim() ||
    "";
  if (explicitAppsScriptUrl) {
    return uploadViaAppsScript({
      webhookUrl: explicitAppsScriptUrl,
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBase64: params.pdfBase64,
    });
  }

  // 3. Server-side OAuth2 Refresh Token
  const envMode = detectDriveEnvAuthMode();
  if (envMode === "oauth-refresh-env") {
    const token = await fetchOAuthRefreshAccessToken();
    return uploadPdfMultipartRestV3({
      accessToken: token,
      provider: "google-oauth-refresh",
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBuffer,
    });
  }

  // 4. Server-side Service Account
  if (envMode === "service-account-env") {
    const token = await fetchServiceAccountAccessToken();
    return uploadPdfMultipartRestV3({
      accessToken: token,
      provider: "google-service-account",
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBuffer,
    });
  }

  // 5. Hardcoded default Apps Script endpoint so Drive integration stays permanent
  if (DEFAULT_APPS_SCRIPT_URL) {
    return uploadViaAppsScript({
      webhookUrl: DEFAULT_APPS_SCRIPT_URL,
      rootFolderId,
      kecamatanName,
      kelurahanName,
      filename: params.filename,
      pdfBase64: params.pdfBase64,
    });
  }

  throw new DriveServiceError(
    "DRIVE_NOT_CONFIGURED",
    "Koneksi Google Drive belum dikonfigurasi.",
    503,
  );
}
