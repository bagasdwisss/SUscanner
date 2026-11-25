/**
 * Google Apps Script (doPost Web App) untuk integrasi langsung SU-Scanner ke Google Drive.
 *
 * Cara pasang / update Web App:
 * 1. Buka https://script.google.com/home menggunakan akun Google pemilik folder Drive tujuan.
 * 2. Klik "New project" / buka proyek SU-Scanner Drive Uploader, lalu tempel seluruh kode ini.
 * 3. Klik "Deploy" -> "New deployment" (atau "Manage deployments" -> Edit -> New version):
 *    - Execute as: Me (email Anda)
 *    - Who has access / Yang memiliki akses: Anyone / Siapa saja (WAJIB, bukan "Anyone with Google account")
 * 4. URL /exec sudah terpasang permanen di aplikasi SU-Scanner.
 */

var DEFAULT_ROOT_FOLDER_ID = "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub";
// Opsional: samakan dengan GOOGLE_DRIVE_APPS_SCRIPT_SECRET di .env.local jika dipakai.
var OPTIONAL_SHARED_SECRET = "";

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function normalizeKecamatanTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/^(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKelurahanTitle(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(
      /^(?:kelurahan|kel\.?|desa|kampung|gampong|nagari|kp\.?)\s*[:.\-]?\s*/i,
      "",
    )
    .replace(/\s+/g, " ")
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
  var createdFolder = parentFolder.createFolder(cleanTarget);
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

    if (body.action === "verify") {
      var verifyFolder = DriveApp.getFolderById(rootFolderId);
      return jsonResponse({
        ok: true,
        verified: true,
        nestedSupported: true,
        service: "SU-Scanner Drive Uploader",
        folderId: verifyFolder.getId(),
        folderName: verifyFolder.getName(),
        folderUrl: verifyFolder.getUrl(),
      });
    }

    var kecamatan = normalizeKecamatanTitle(body.kecamatan);
    var kelurahan = normalizeKelurahanTitle(body.kelurahan);
    var filename = String(body.filename || "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim();
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
    var kecResult = findOrCreateSubfolder(
      rootFolder,
      kecamatan,
      normalizeKecamatanTitle,
    );
    var kelResult = kelurahan
      ? findOrCreateSubfolder(
          kecResult.folder,
          kelurahan,
          normalizeKelurahanTitle,
        )
      : null;
    var targetFolder = kelResult ? kelResult.folder : kecResult.folder;

    var bytes = Utilities.base64Decode(pdfBase64);
    var blob = Utilities.newBlob(bytes, "application/pdf", filename);
    var uploadedFile = targetFolder.createFile(blob);

    var kecName = kecResult.folder.getName();
    var kelName = kelResult ? kelResult.folder.getName() : undefined;

    return jsonResponse({
      ok: true,
      nestedSupported: true,
      provider: "apps-script",
      fileId: uploadedFile.getId(),
      fileName: uploadedFile.getName(),
      fileUrl: uploadedFile.getUrl(),
      folderId: targetFolder.getId(),
      folderName: kelName ? kecName + " / " + kelName : kecName,
      folderUrl: targetFolder.getUrl(),
      folderCreated: kelResult ? kelResult.created : kecResult.created,
      kecamatanName: kecName,
      kecamatanCreated: kecResult.created,
      kelurahanName: kelName,
      kelurahanCreated: kelResult ? kelResult.created : false,
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
    nestedSupported: true,
    service: "SU-Scanner Drive Uploader",
    defaultRootFolderId: DEFAULT_ROOT_FOLDER_ID,
  });
}
