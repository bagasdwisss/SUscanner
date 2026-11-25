/**
 * Google Apps Script (doPost Web App) untuk integrasi langsung SU-Scanner Pro ke Google Drive.
 *
 * Cara pasang (~2 menit, tanpa Google Cloud Console / tanpa OAuth Verification):
 * 1. Buka https://script.google.com/home menggunakan akun Google pemilik folder Drive tujuan.
 * 2. Klik "New project" / "Proyek baru", hapus isi default, lalu tempel seluruh kode ini.
 * 3. Klik "Deploy" -> "New deployment" -> pilih tipe "Web app":
 *    - Description: SU-Scanner Drive Uploader
 *    - Execute as: Me (email Anda)
 *    - Who has access: Anyone (atau Anyone with Google account)
 * 4. Klik "Deploy", klik "Authorize access" -> pilih akun Google Anda -> Allow.
 * 5. Salin "Web app URL" (berakhiran /exec), lalu tempel ke menu "Pengaturan Drive" di aplikasi
 *    atau masukkan ke .env.local sebagai GOOGLE_DRIVE_APPS_SCRIPT_URL.
 */

var DEFAULT_ROOT_FOLDER_ID = "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub";
// Opsional: samakan dengan GOOGLE_DRIVE_APPS_SCRIPT_SECRET di .env.local jika dipakai.
var OPTIONAL_SHARED_SECRET = "";

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function normalizeFolderTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/^(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*/i, "")
    .replace(/\s+/g, " ")
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
  var createdFolder = parentFolder.createFolder(targetName);
  return { folder: createdFolder, created: true };
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Payload kosong." });
    }

    var body = JSON.parse(e.postData.contents);
    if (OPTIONAL_SHARED_SECRET && body.secret !== OPTIONAL_SHARED_SECRET) {
      return jsonResponse({
        ok: false,
        error: "Secret autentikasi Apps Script tidak cocok.",
      });
    }

    var rootFolderId = String(body.rootFolderId || DEFAULT_ROOT_FOLDER_ID).trim();
    var kecamatan = normalizeFolderTitle(body.kecamatan);
    var filename = String(body.filename || "").trim();
    var pdfBase64 = String(body.pdfBase64 || "");

    if (!kecamatan) {
      return jsonResponse({
        ok: false,
        error: "Nama Kecamatan wajib diisi untuk menentukan subfolder Drive.",
      });
    }
    if (!filename || !pdfBase64) {
      return jsonResponse({
        ok: false,
        error: "Nama file dan isi PDF base64 wajib tersedia.",
      });
    }

    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var subResult = findOrCreateSubfolder(rootFolder, kecamatan);
    var subFolder = subResult.folder;

    var bytes = Utilities.base64Decode(pdfBase64);
    var blob = Utilities.newBlob(bytes, "application/pdf", filename);
    var uploadedFile = subFolder.createFile(blob);

    return jsonResponse({
      ok: true,
      provider: "apps-script",
      fileId: uploadedFile.getId(),
      fileName: uploadedFile.getName(),
      fileUrl: uploadedFile.getUrl(),
      folderId: subFolder.getId(),
      folderName: subFolder.getName(),
      folderUrl: subFolder.getUrl(),
      folderCreated: subResult.created,
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: "SU-Scanner Pro Drive Uploader",
    defaultRootFolderId: DEFAULT_ROOT_FOLDER_ID,
  });
}
