import { DEFAULT_DRIVE_ROOT_FOLDER_ID } from "./su-formatter";

export const DEFAULT_APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzRt7gk65qrR66jDG-Fk9qFj-dP7tVB8zQWSzZPvObqy5vG5TdndXo-LXdajiJ4OCQ1iQ/exec";

export function validateAppsScriptWebhookUrl(raw: string): URL | null {
  try {
    const parsed = new URL(raw.trim());
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "script.google.com" &&
      parsed.pathname.startsWith("/macros/s/")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export const APPS_SCRIPT_STORAGE_KEY = "su_scanner_drive_apps_script_url";
export const DRIVE_ROOT_STORAGE_KEY = "su_scanner_drive_root_folder_id";
export const DRIVE_AUTO_UPLOAD_STORAGE_KEY = "su_scanner_drive_auto_upload";

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `var DEFAULT_ROOT_FOLDER_ID = "${DEFAULT_DRIVE_ROOT_FOLDER_ID}";
var OPTIONAL_SHARED_SECRET = "";

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeKecamatanTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\\\|?*]/g, " ")
    .replace(/^(?:kecamatan|ketjamatan|kec\\.?|ketj\\.?)\\s*[:.\\-]?\\s*/i, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function normalizeKelurahanTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\\\|?*]/g, " ")
    .replace(/^(?:kelurahan|kel\\.?|desa|kampung|gampong|nagari|kp\\.?)\\s*[:.\\-]?\\s*/i, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function findOrCreateSubfolder(parentFolder, targetName, normalizeFn) {
  var cleanTarget = normalizeFn(targetName);
  var targetNormalized = cleanTarget.toLowerCase();
  var folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    var existing = folders.next();
    if (normalizeFn(existing.getName()).toLowerCase() === targetNormalized) {
      return { folder: existing, created: false };
    }
  }
  return { folder: parentFolder.createFolder(cleanTarget), created: true };
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Payload kosong." });
    }
    var body = JSON.parse(e.postData.contents);
    if (OPTIONAL_SHARED_SECRET && body.secret !== OPTIONAL_SHARED_SECRET) {
      return jsonResponse({ ok: false, error: "Secret tidak cocok." });
    }

    var rootFolderId = String(body.rootFolderId || DEFAULT_ROOT_FOLDER_ID).trim();
    var kecamatan = normalizeKecamatanTitle(body.kecamatan);
    var kelurahan = normalizeKelurahanTitle(body.kelurahan);
    var filename = String(body.filename || "").trim();
    var pdfBase64 = String(body.pdfBase64 || "");

    if (!kecamatan) return jsonResponse({ ok: false, error: "Kecamatan wajib diisi." });
    if (!filename || !pdfBase64) return jsonResponse({ ok: false, error: "File PDF tidak lengkap." });

    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var kecResult = findOrCreateSubfolder(rootFolder, kecamatan, normalizeKecamatanTitle);
    var kelResult = kelurahan
      ? findOrCreateSubfolder(kecResult.folder, kelurahan, normalizeKelurahanTitle)
      : null;
    var targetFolder = kelResult ? kelResult.folder : kecResult.folder;
    var blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), "application/pdf", filename);
    var file = targetFolder.createFile(blob);
    var kecName = kecResult.folder.getName();
    var kelName = kelResult ? kelResult.folder.getName() : undefined;

    return jsonResponse({
      ok: true,
      nestedSupported: true,
      provider: "apps-script",
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      folderId: targetFolder.getId(),
      folderName: kelName ? kecName + " / " + kelName : kecName,
      folderUrl: targetFolder.getUrl(),
      folderCreated: kelResult ? kelResult.created : kecResult.created,
      kecamatanName: kecName,
      kecamatanCreated: kecResult.created,
      kelurahanName: kelName,
      kelurahanCreated: kelResult ? kelResult.created : false
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    nestedSupported: true,
    service: "SU-Scanner Drive Uploader",
    defaultRootFolderId: DEFAULT_ROOT_FOLDER_ID
  });
}`;
