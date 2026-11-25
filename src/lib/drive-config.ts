import { DEFAULT_DRIVE_ROOT_FOLDER_ID } from "./su-formatter";

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

function normalizeFolderTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\\\|?*]/g, " ")
    .replace(/^(?:kecamatan|ketjamatan|kec\\.?|ketj\\.?)\\s*[:.\\-]?\\s*/i, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function findOrCreateSubfolder(parentFolder, targetName) {
  var targetLower = targetName.toLowerCase();
  var folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    var existing = folders.next();
    if (String(existing.getName() || "").trim().toLowerCase() === targetLower) {
      return { folder: existing, created: false };
    }
  }
  return { folder: parentFolder.createFolder(targetName), created: true };
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
    var kecamatan = normalizeFolderTitle(body.kecamatan);
    var filename = String(body.filename || "").trim();
    var pdfBase64 = String(body.pdfBase64 || "");

    if (!kecamatan) return jsonResponse({ ok: false, error: "Kecamatan wajib diisi." });
    if (!filename || !pdfBase64) return jsonResponse({ ok: false, error: "File PDF tidak lengkap." });

    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var sub = findOrCreateSubfolder(rootFolder, kecamatan);
    var blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), "application/pdf", filename);
    var file = sub.folder.createFile(blob);

    return jsonResponse({
      ok: true,
      provider: "apps-script",
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      folderId: sub.folder.getId(),
      folderName: sub.folder.getName(),
      folderUrl: sub.folder.getUrl(),
      folderCreated: sub.created
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}`;
