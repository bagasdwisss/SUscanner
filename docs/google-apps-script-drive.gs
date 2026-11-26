/**
 * Google Apps Script (doPost Web App) untuk integrasi penuh SU-Scanner ke Google Drive & Google Sheets.
 *
 * Fitur yang didukung:
 * - Upload PDF ke subfolder bertingkat otomatis: Drive Induk / [Kecamatan] / [Kelurahan]
 * - Kebijakan konflik nama file (revision _rev2, overwrite/timpa lama, atau skip)
 * - Cek duplikasi real-time di Google Drive (action: "exists")
 * - Penjelajah Drive terpadu: daftar folder/file, rename, pindah folder (explore, rename, move)
 * - Log otomatis ke Google Sheets "Rekap_Scan_SU" di Folder Induk
 *
 * Cara pasang / update Web App:
 * 1. Buka https://script.google.com/home menggunakan akun Google pemilik folder Drive tujuan.
 * 2. Klik "New project" / buka proyek SU-Scanner Drive Uploader, lalu tempel seluruh kode ini.
 * 3. Klik "Deploy" -> "New deployment" (atau "Manage deployments" -> Edit -> New version):
 *    - Execute as: Me (email Anda)
 *    - Who has access / Yang memiliki akses: Anyone / Siapa saja (WAJIB, bukan "Anyone with Google account")
 */

var DEFAULT_ROOT_FOLDER_ID = "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub";
var OPTIONAL_SHARED_SECRET = "";
var SHEET_NAME = "Rekap_Scan_SU";

/**
 * Jalankan fungsi ini (klik Run di editor Apps Script) untuk menyetujui izin Drive & Sheets
 * sekaligus membuat file Rekap_Scan_SU di Folder Induk secara langsung.
 */
function authorizeAndCreateSheet() {
  var rootFolder = DriveApp.getFolderById(DEFAULT_ROOT_FOLDER_ID);
  var res = ensureRekapSheet(rootFolder);
  Logger.log(JSON.stringify(res));
  return res;
}

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

function findSubfolder(parentFolder, targetName, normalizeFn) {
  var cleanTarget = normalizeFn(targetName);
  var targetNormalized = cleanTarget.toLowerCase();
  var folders = parentFolder.getFolders();
  while (folders.hasNext()) {
    var existing = folders.next();
    if (normalizeFn(existing.getName()).toLowerCase() === targetNormalized) {
      return existing;
    }
  }
  return null;
}

function findOrCreateSubfolder(parentFolder, targetName, normalizeFn) {
  var existing = findSubfolder(parentFolder, targetName, normalizeFn);
  if (existing) {
    return { folder: existing, created: false };
  }
  var cleanTarget = normalizeFn(targetName);
  return { folder: parentFolder.createFolder(cleanTarget), created: true };
}

function findMatchingFilesInFolder(folder, filename) {
  var matches = [];
  var targetLower = String(filename || "").trim().toLowerCase();
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().toLowerCase() === targetLower) {
      matches.push(f);
    }
  }
  return matches;
}

function nextRevisionFilename(folder, filename) {
  var existingNames = {};
  var files = folder.getFiles();
  while (files.hasNext()) {
    existingNames[files.next().getName().toLowerCase()] = true;
  }
  if (!existingNames[filename.toLowerCase()]) return filename;
  var rev = 2;
  while (rev < 500) {
    var cand = filename.replace(/(\.pdf)$/i, "_rev" + rev + "$1");
    if (cand === filename) cand = filename + "_rev" + rev;
    if (!existingNames[cand.toLowerCase()]) return cand;
    rev++;
  }
  return filename.replace(/(\.pdf)$/i, "_" + Date.now() + "$1");
}

var KECAMATAN_COLOR_PALETTE = [
  "#DBEAFE",
  "#DCFCE7",
  "#FEF3C7",
  "#FCE7F3",
  "#EDE9FE",
  "#FFEDD5",
  "#CCFBF1",
  "#E0E7FF",
  "#ECFCCB",
  "#FAE8FF",
  "#E0F2FE",
  "#FFE4E6",
  "#FEF9C3",
  "#D1FAE5",
  "#F3E8FF",
  "#FED7AA",
  "#CFFAFE",
  "#FDE68A",
  "#E2E8F0",
  "#DDD6FE",
  "#BBF7D0",
  "#BAE6FD",
];

function sortAndStyleRekapSheet(sheet) {
  if (!sheet || typeof sheet.getLastRow !== "function") return;
  var headerCols = 15;
  var numCols = Math.max(headerCols, sheet.getLastColumn());
  sheet.setFrozenRows(1);
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange
    .setBackground("#1E293B")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setVerticalAlignment("middle");

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var numRows = lastRow - 1;
  var dataRange = sheet.getRange(2, 1, numRows, numCols);
  var values = dataRange.getValues();
  var existingBgs = dataRange.getBackgrounds();

  var paletteLookup = {};
  for (var p = 0; p < KECAMATAN_COLOR_PALETTE.length; p++) {
    paletteLookup[KECAMATAN_COLOR_PALETTE[p].toUpperCase()] = true;
  }

  var kecColorMap = {};
  var usedColors = {};
  for (var r = 0; r < numRows; r++) {
    var kecRaw = String(values[r][9] || "")
      .trim()
      .toLowerCase();
    var bgHex = String((existingBgs[r] && existingBgs[r][9]) || existingBgs[r][0] || "")
      .trim()
      .toUpperCase();
    if (
      kecRaw &&
      !kecColorMap[kecRaw] &&
      paletteLookup[bgHex] &&
      !usedColors[bgHex]
    ) {
      kecColorMap[kecRaw] = bgHex;
      usedColors[bgHex] = true;
    }
  }

  var cmpField = function (va, vb) {
    var sa = String(va || "").trim().toLowerCase();
    var sb = String(vb || "").trim().toLowerCase();
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  };

  var cmpNumOrText = function (va, vb) {
    var sa = String(va || "").trim();
    var sb = String(vb || "").trim();
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
      var na = Number(sa);
      var nb = Number(sb);
      if (na !== nb) return na - nb;
    }
    return cmpField(sa, sb);
  };

  values.sort(function (a, b) {
    return (
      cmpField(a[9], b[9]) ||
      cmpField(a[10], b[10]) ||
      cmpNumOrText(a[4], b[4]) ||
      cmpNumOrText(a[3], b[3]) ||
      cmpField(a[2], b[2])
    );
  });

  var nextPaletteIdx = 0;
  for (var i = 0; i < numRows; i++) {
    values[i][0] = i + 1;
    var key = String(values[i][9] || "")
      .trim()
      .toLowerCase();
    if (key && !kecColorMap[key]) {
      var picked = "";
      for (var k = 0; k < KECAMATAN_COLOR_PALETTE.length; k++) {
        var cand = KECAMATAN_COLOR_PALETTE[k].toUpperCase();
        if (!usedColors[cand]) {
          picked = cand;
          break;
        }
      }
      if (!picked) {
        picked =
          KECAMATAN_COLOR_PALETTE[
            nextPaletteIdx % KECAMATAN_COLOR_PALETTE.length
          ].toUpperCase();
        nextPaletteIdx++;
      }
      kecColorMap[key] = picked;
      usedColors[picked] = true;
    }
  }

  var newBgs = [];
  var fontColors = [];
  for (var rowIdx = 0; rowIdx < numRows; rowIdx++) {
    var rowKec = String(values[rowIdx][9] || "")
      .trim()
      .toLowerCase();
    var rowBg = kecColorMap[rowKec] || "#F8FAFC";
    var bgRow = [];
    var fgRow = [];
    for (var colIdx = 0; colIdx < numCols; colIdx++) {
      bgRow.push(rowBg);
      fgRow.push("#111827");
    }
    newBgs.push(bgRow);
    fontColors.push(fgRow);
  }

  dataRange.setValues(values);
  dataRange.setBackgrounds(newBgs);
  dataRange.setFontColors(fontColors);
  dataRange.setBorder(false, false, false, false, false, false);

  for (var bIdx = 0; bIdx < numRows; bIdx++) {
    var curK = String(values[bIdx][9] || "")
      .trim()
      .toLowerCase();
    var prevK =
      bIdx > 0
        ? String(values[bIdx - 1][9] || "")
            .trim()
            .toLowerCase()
        : "";
    if (bIdx === 0 || curK !== prevK) {
      sheet
        .getRange(2 + bIdx, 1, 1, numCols)
        .setBorder(
          true,
          null,
          null,
          null,
          null,
          null,
          "#64748B",
          SpreadsheetApp.BorderStyle.SOLID,
        );
    }
  }
}

function ensureRekapSheet(rootFolder) {
  if (typeof SpreadsheetApp === "undefined") {
    return { ok: false, error: "SpreadsheetApp tidak tersedia." };
  }
  if (!rootFolder || typeof rootFolder.getFilesByName !== "function") {
    rootFolder = DriveApp.getFolderById(DEFAULT_ROOT_FOLDER_ID);
  }
  var sheetFile = null;
  var existing = rootFolder.getFilesByName(SHEET_NAME);
  if (existing.hasNext()) {
    sheetFile = existing.next();
  }
  var ss;
  var created = false;
  if (sheetFile) {
    ss = SpreadsheetApp.openById(sheetFile.getId());
  } else {
    ss = SpreadsheetApp.create(SHEET_NAME);
    var createdFile = DriveApp.getFileById(ss.getId());
    createdFile.moveTo(rootFolder);
    created = true;
  }
  var sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "No",
      "Waktu Upload",
      "Nama File PDF",
      "Nomor SU",
      "Tahun SU",
      "Kode Hak",
      "Nomor Hak",
      "NIB",
      "Luas Tanah",
      "Kecamatan",
      "Kelurahan",
      "Halaman",
      "Link PDF Drive",
      "Folder Drive",
      "Operator",
    ]);
  }
  sortAndStyleRekapSheet(sheet);
  return {
    ok: true,
    ss: ss,
    sheet: sheet,
    sheetUrl: ss.getUrl(),
    sheetName: SHEET_NAME,
    created: created,
  };
}

function appendScanRowToSheet(rootFolder, rowObj) {
  try {
    var ensured = ensureRekapSheet(rootFolder);
    if (!ensured.ok || !ensured.sheet) {
      return { logged: false, error: ensured.error };
    }
    var sheet = ensured.sheet;
    var rowNum = Math.max(1, sheet.getLastRow());
    sheet.appendRow([
      rowNum,
      new Date().toLocaleString("id-ID"),
      rowObj.fileName || "",
      rowObj.nomorSu || "",
      rowObj.tahunSu || "",
      rowObj.kodeHak || "",
      rowObj.nomorHak || "",
      rowObj.nib || "",
      rowObj.luasTanah || "",
      rowObj.kecamatan || "",
      rowObj.kelurahan || "",
      rowObj.pageCount || 1,
      rowObj.fileUrl || "",
      rowObj.folderName || "",
      rowObj.operatorName || "Operator",
    ]);
    sortAndStyleRekapSheet(sheet);
    return { logged: true, sheetUrl: ensured.sheetUrl };
  } catch (err) {
    return {
      logged: false,
      error: err && err.message ? err.message : String(err),
    };
  }
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

    if (body.action === "verify") {
      var verifyFolder = DriveApp.getFolderById(rootFolderId);
      var foundSheetUrl = undefined;
      var existingSheet = verifyFolder.getFilesByName(SHEET_NAME);
      if (existingSheet.hasNext()) {
        foundSheetUrl = existingSheet.next().getUrl();
      }
      return jsonResponse({
        ok: true,
        verified: true,
        nestedSupported: true,
        explorerSupported: true,
        dedupSupported: true,
        conflictSupported: true,
        sheetSupported: true,
        service: "SU-Scanner Drive Uploader",
        folderId: verifyFolder.getId(),
        folderName: verifyFolder.getName(),
        folderUrl: verifyFolder.getUrl(),
        sheetUrl: foundSheetUrl,
      });
    }

    if (body.action === "init_sheet") {
      var initRoot = DriveApp.getFolderById(rootFolderId);
      var sheetRes = ensureRekapSheet(initRoot);
      if (!sheetRes.ok) {
        return jsonResponse({
          ok: false,
          error: sheetRes.error || "Gagal menyiapkan Google Sheets.",
        });
      }
      return jsonResponse({
        ok: true,
        supported: true,
        sheetUrl: sheetRes.sheetUrl,
        sheetName: sheetRes.sheetName,
        existed: !sheetRes.created,
        folderUrl: initRoot.getUrl(),
      });
    }

    if (body.action === "exists") {
      var kecCheck = normalizeKecamatanTitle(body.kecamatan);
      var kelCheck = normalizeKelurahanTitle(body.kelurahan);
      var fname = String(body.filename || "").trim();
      var rootCheck = DriveApp.getFolderById(rootFolderId);
      var kecFolder = kecCheck
        ? findSubfolder(rootCheck, kecCheck, normalizeKecamatanTitle)
        : null;
      var targetCheck = kecFolder
        ? kelCheck
          ? findSubfolder(kecFolder, kelCheck, normalizeKelurahanTitle)
          : kecFolder
        : null;
      if (!targetCheck || !fname) {
        return jsonResponse({
          ok: true,
          supported: true,
          exists: false,
          count: 0,
          matches: [],
        });
      }
      var found = findMatchingFilesInFolder(targetCheck, fname).map(
        function (f) {
          return {
            id: f.getId(),
            name: f.getName(),
            url: f.getUrl(),
            sizeBytes: f.getSize(),
            updatedAt: f.getLastUpdated().toISOString(),
          };
        },
      );
      return jsonResponse({
        ok: true,
        supported: true,
        exists: found.length > 0,
        count: found.length,
        matches: found,
        folderName: targetCheck.getName(),
        folderUrl: targetCheck.getUrl(),
      });
    }

    if (body.action === "explore") {
      var folderToOpen = DriveApp.getFolderById(
        String(body.folderId || rootFolderId).trim(),
      );
      var query = String(body.query || "").trim().toLowerCase();
      var items = [];
      var subfolders = folderToOpen.getFolders();
      while (subfolders.hasNext() && items.length < 180) {
        var sf = subfolders.next();
        if (!query || sf.getName().toLowerCase().indexOf(query) !== -1) {
          items.push({
            id: sf.getId(),
            name: sf.getName(),
            kind: "folder",
            mimeType: "application/vnd.google-apps.folder",
            url: sf.getUrl(),
            updatedAt: sf.getLastUpdated().toISOString(),
          });
        }
      }
      var files = folderToOpen.getFiles();
      while (files.hasNext() && items.length < 180) {
        var fl = files.next();
        if (!query || fl.getName().toLowerCase().indexOf(query) !== -1) {
          items.push({
            id: fl.getId(),
            name: fl.getName(),
            kind: "file",
            mimeType: fl.getMimeType(),
            url: fl.getUrl(),
            sizeBytes: fl.getSize(),
            updatedAt: fl.getLastUpdated().toISOString(),
          });
        }
      }
      return jsonResponse({
        ok: true,
        supported: true,
        folderId: folderToOpen.getId(),
        folderName: folderToOpen.getName(),
        folderUrl: folderToOpen.getUrl(),
        items: items,
      });
    }

    if (body.action === "rename") {
      var fileToRename = DriveApp.getFileById(String(body.fileId || "").trim());
      var nextName = String(body.newFilename || "")
        .replace(/[<>:"/\\|?*]/g, "_")
        .trim();
      if (!nextName) {
        return jsonResponse({ ok: false, error: "Nama file baru wajib diisi." });
      }
      fileToRename.setName(nextName);
      return jsonResponse({
        ok: true,
        supported: true,
        fileId: fileToRename.getId(),
        fileName: fileToRename.getName(),
        fileUrl: fileToRename.getUrl(),
      });
    }

    if (body.action === "move") {
      var fileToMove = DriveApp.getFileById(String(body.fileId || "").trim());
      var moveRoot = DriveApp.getFolderById(rootFolderId);
      var dstKec = normalizeKecamatanTitle(body.targetKecamatan);
      var dstKel = normalizeKelurahanTitle(body.targetKelurahan);
      if (!dstKec) {
        return jsonResponse({
          ok: false,
          error: "Kecamatan tujuan wajib diisi.",
        });
      }
      var dstKecRes = findOrCreateSubfolder(
        moveRoot,
        dstKec,
        normalizeKecamatanTitle,
      );
      var dstKelRes = dstKel
        ? findOrCreateSubfolder(
            dstKecRes.folder,
            dstKel,
            normalizeKelurahanTitle,
          )
        : null;
      var dstFolder = dstKelRes ? dstKelRes.folder : dstKecRes.folder;
      fileToMove.moveTo(dstFolder);
      return jsonResponse({
        ok: true,
        supported: true,
        fileId: fileToMove.getId(),
        fileName: fileToMove.getName(),
        folderId: dstFolder.getId(),
        folderName: dstKelRes
          ? dstKecRes.folder.getName() + " / " + dstKelRes.folder.getName()
          : dstKecRes.folder.getName(),
        folderUrl: dstFolder.getUrl(),
      });
    }

    var kecamatan = normalizeKecamatanTitle(body.kecamatan);
    var kelurahan = normalizeKelurahanTitle(body.kelurahan);
    var filename = String(body.filename || "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim();
    var pdfBase64 = String(body.pdfBase64 || "");
    var conflictPolicy = String(body.conflictPolicy || "revision");

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
    var kecName = kecResult.folder.getName();
    var kelName = kelResult ? kelResult.folder.getName() : undefined;

    var existingMatches = findMatchingFilesInFolder(targetFolder, filename);
    if (existingMatches.length > 0 && conflictPolicy === "skip") {
      var kept = existingMatches[0];
      return jsonResponse({
        ok: true,
        nestedSupported: true,
        skipped: true,
        provider: "apps-script",
        fileId: kept.getId(),
        fileName: kept.getName(),
        fileUrl: kept.getUrl(),
        folderId: targetFolder.getId(),
        folderName: kelName ? kecName + " / " + kelName : kecName,
        folderUrl: targetFolder.getUrl(),
        folderCreated: false,
        kecamatanName: kecName,
        kecamatanCreated: kecResult.created,
        kelurahanName: kelName,
        kelurahanCreated: kelResult ? kelResult.created : false,
      });
    }

    var finalFilename = filename;
    var overwritten = false;
    if (existingMatches.length > 0) {
      if (conflictPolicy === "overwrite") {
        for (var idx = 0; idx < existingMatches.length; idx++) {
          existingMatches[idx].setTrashed(true);
        }
        overwritten = true;
      } else {
        finalFilename = nextRevisionFilename(targetFolder, filename);
      }
    }

    var blob = Utilities.newBlob(
      Utilities.base64Decode(pdfBase64),
      "application/pdf",
      finalFilename,
    );
    var file = targetFolder.createFile(blob);

    var sheetInfo = { logged: false };
    if (body.sheetMeta && body.sheetMeta.logToSheet !== false) {
      sheetInfo = appendScanRowToSheet(rootFolder, {
        fileName: file.getName(),
        fileUrl: file.getUrl(),
        folderName: kelName ? kecName + " / " + kelName : kecName,
        kecamatan: kecName,
        kelurahan: kelName || "",
        nomorSu: body.sheetMeta.nomorSu || "",
        tahunSu: body.sheetMeta.tahunSu || "",
        kodeHak: body.sheetMeta.kodeHak || "",
        nomorHak: body.sheetMeta.nomorHak || "",
        nib: body.sheetMeta.nib || "",
        luasTanah: body.sheetMeta.luasTanah || "",
        pageCount: body.sheetMeta.pageCount || 1,
        operatorName: body.sheetMeta.operatorName || "Operator",
      });
    }

    return jsonResponse({
      ok: true,
      nestedSupported: true,
      overwritten: overwritten,
      sheetLogged: Boolean(sheetInfo.logged),
      sheetUrl: sheetInfo.sheetUrl || undefined,
      sheetError: sheetInfo.error || undefined,
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
    explorerSupported: true,
    dedupSupported: true,
    conflictSupported: true,
    sheetSupported: true,
    service: "SU-Scanner Drive Uploader",
    defaultRootFolderId: DEFAULT_ROOT_FOLDER_ID,
  });
}
