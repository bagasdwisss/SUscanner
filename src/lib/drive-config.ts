import { DEFAULT_DRIVE_ROOT_FOLDER_ID } from "./su-formatter.ts";

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
export const DRIVE_CONFLICT_POLICY_KEY = "su_scanner_drive_conflict_policy";
export const DRIVE_SYNC_SHEET_KEY = "su_scanner_drive_sync_sheet";
export const DRIVE_SHEET_URL_KEY = "su_scanner_drive_sheet_url";

export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export const GOOGLE_APPS_SCRIPT_TEMPLATE = `var DEFAULT_ROOT_FOLDER_ID = "${DEFAULT_DRIVE_ROOT_FOLDER_ID}";
var OPTIONAL_SHARED_SECRET = "";
var SHEET_NAME = "Rekap_Scan_SU";

function authorizeAndCreateSheet() {
  var rootFolder = DriveApp.getFolderById(DEFAULT_ROOT_FOLDER_ID);
  var res = ensureRekapSheet(rootFolder);
  Logger.log(JSON.stringify(res));
  return res;
}

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
    var cand = filename.replace(/(\\.pdf)$/i, "_rev" + rev + "$1");
    if (cand === filename) cand = filename + "_rev" + rev;
    if (!existingNames[cand.toLowerCase()]) return cand;
    rev++;
  }
  return filename.replace(/(\\.pdf)$/i, "_" + Date.now() + "$1");
}

var MASTER_TAB_NAME = "Rekap Semua";
var KECAMATAN_COLOR_PALETTE = [
  { tab: "#2563EB", row: "#DBEAFE" },
  { tab: "#16A34A", row: "#DCFCE7" },
  { tab: "#EA580C", row: "#FFEDD5" },
  { tab: "#7C3AED", row: "#EDE9FE" },
  { tab: "#E11D48", row: "#FFE4E6" },
  { tab: "#0D9488", row: "#CCFBF1" },
  { tab: "#D97706", row: "#FEF3C7" },
  { tab: "#4F46E5", row: "#E0E7FF" },
  { tab: "#C026D3", row: "#FAE8FF" },
  { tab: "#0891B2", row: "#CFFAFE" },
  { tab: "#65A30D", row: "#ECFCCB" },
  { tab: "#B45309", row: "#FDE68A" },
  { tab: "#0284C7", row: "#E0F2FE" },
  { tab: "#059669", row: "#D1FAE5" },
  { tab: "#DC2626", row: "#FEE2E2" },
  { tab: "#9333EA", row: "#F3E8FF" },
  { tab: "#475569", row: "#E2E8F0" },
  { tab: "#DB2777", row: "#FCE7F3" },
  { tab: "#CA8A04", row: "#FEF9C3" },
  { tab: "#1D4ED8", row: "#DBEAFE" },
  { tab: "#15803D", row: "#DCFCE7" },
  { tab: "#C2410C", row: "#FFEDD5" }
];

var REKAP_COLUMNS = [
  "No", "Waktu Upload", "Nama File PDF", "Nomor SU", "Tahun SU",
  "Kode Hak", "Nomor Hak", "NIB", "Luas Tanah", "Kecamatan",
  "Kelurahan", "Halaman", "Link PDF Drive", "Folder Drive", "Operator"
];

function sanitizeTabTitle(name) {
  var s = String(name || "")
    .replace(/[:\\\\\\/\\?\\*\\[\\]]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  if (!s) s = "Tanpa Nama";
  return s.length > 95 ? s.slice(0, 95).trim() : s;
}

function formatTabHeader(sheet, headerHex) {
  var numCols = Math.max(REKAP_COLUMNS.length, sheet.getLastColumn());
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REKAP_COLUMNS);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, numCols)
    .setBackground(headerHex || "#1E293B")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setVerticalAlignment("middle");
}

function getSheetOwnerKecamatan(sheet) {
  try {
    if (typeof sheet.getDeveloperMetadata === "function") {
      var metas = sheet.getDeveloperMetadata();
      for (var i = 0; i < metas.length; i++) {
        if (metas[i].getKey() === "kecamatan") {
          var v = String(metas[i].getValue() || "").trim();
          if (v) return v;
        }
      }
    }
  } catch (ignoreMetaErr) {}
  if (sheet.getLastRow() >= 2 && sheet.getLastColumn() >= 10) {
    var colVal = String(sheet.getRange(2, 10).getValue() || "").trim();
    if (colVal) return colVal;
  }
  return sheet.getName();
}

function buildKecColorAssignments(ss, extraKec) {
  var tabLookup = {};
  for (var p = 0; p < KECAMATAN_COLOR_PALETTE.length; p++) {
    tabLookup[KECAMATAN_COLOR_PALETTE[p].tab.toUpperCase()] = KECAMATAN_COLOR_PALETTE[p];
  }

  var kecMap = {};
  var usedTabs = {};

  var assignKec = function(kecName, preferredTabHex) {
    var k = String(kecName || "").trim().toLowerCase();
    if (!k || kecMap[k]) return;
    if (preferredTabHex && tabLookup[preferredTabHex.toUpperCase()] && !usedTabs[preferredTabHex.toUpperCase()]) {
      var pref = tabLookup[preferredTabHex.toUpperCase()];
      kecMap[k] = pref;
      usedTabs[pref.tab.toUpperCase()] = true;
      return;
    }
    for (var i = 0; i < KECAMATAN_COLOR_PALETTE.length; i++) {
      var cand = KECAMATAN_COLOR_PALETTE[i];
      if (!usedTabs[cand.tab.toUpperCase()]) {
        kecMap[k] = cand;
        usedTabs[cand.tab.toUpperCase()] = true;
        return;
      }
    }
    kecMap[k] = KECAMATAN_COLOR_PALETTE[Object.keys(kecMap).length % KECAMATAN_COLOR_PALETTE.length];
  };

  var sheets = ss.getSheets();
  for (var sIdx = 0; sIdx < sheets.length; sIdx++) {
    var sh = sheets[sIdx];
    var sName = sh.getName();
    if (sName === MASTER_TAB_NAME || sName === "Sheet1") continue;
    var owner = getSheetOwnerKecamatan(sh);
    var curTabHex = typeof sh.getTabColor === "function" ? String(sh.getTabColor() || "").toUpperCase() : "";
    assignKec(owner, curTabHex);
  }

  var master = ss.getSheetByName(MASTER_TAB_NAME);
  if (master && master.getLastRow() >= 2) {
    var mVals = master.getRange(2, 10, master.getLastRow() - 1, 1).getValues();
    for (var r = 0; r < mVals.length; r++) {
      assignKec(mVals[r][0], "");
    }
  }

  if (extraKec) assignKec(extraKec, "");
  return kecMap;
}

function cmpTextField(va, vb) {
  var sa = String(va || "").trim().toLowerCase();
  var sb = String(vb || "").trim().toLowerCase();
  if (!sa && !sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function cmpNumOrTextField(va, vb) {
  var sa = String(va || "").trim();
  var sb = String(vb || "").trim();
  if (/^\\d+$/.test(sa) && /^\\d+$/.test(sb)) {
    var na = Number(sa);
    var nb = Number(sb);
    if (na !== nb) return na - nb;
  }
  return cmpTextField(sa, sb);
}

function sortAndColorSheetRows(sheet, headerHex, rowBgOverride, kecColorMap) {
  if (!sheet || typeof sheet.getLastRow !== "function") return;
  formatTabHeader(sheet, headerHex);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  var numRows = lastRow - 1;
  var numCols = Math.max(REKAP_COLUMNS.length, sheet.getLastColumn());
  var dataRange = sheet.getRange(2, 1, numRows, numCols);
  var values = dataRange.getValues();

  values.sort(function(a, b) {
    return cmpTextField(a[9], b[9]) || cmpTextField(a[10], b[10]) || cmpNumOrTextField(a[4], b[4]) || cmpNumOrTextField(a[3], b[3]) || cmpTextField(a[2], b[2]);
  });

  var newBgs = [];
  var fontColors = [];
  for (var i = 0; i < numRows; i++) {
    values[i][0] = i + 1;
    var rowKec = String(values[i][9] || "").trim().toLowerCase();
    var bg = rowBgOverride || (kecColorMap && kecColorMap[rowKec] && kecColorMap[rowKec].row) || "#F8FAFC";
    var bgRow = [];
    var fgRow = [];
    for (var c = 0; c < numCols; c++) {
      bgRow.push(bg);
      fgRow.push("#111827");
    }
    newBgs.push(bgRow);
    fontColors.push(fgRow);
  }

  dataRange.setValues(values);
  dataRange.setBackgrounds(newBgs);
  dataRange.setFontColors(fontColors);
  dataRange.setBorder(false, false, false, false, false, false);

  if (!rowBgOverride) {
    for (var bIdx = 0; bIdx < numRows; bIdx++) {
      var curK = String(values[bIdx][9] || "").trim().toLowerCase();
      var prevK = bIdx > 0 ? String(values[bIdx - 1][9] || "").trim().toLowerCase() : "";
      if (bIdx === 0 || curK !== prevK) {
        sheet.getRange(2 + bIdx, 1, 1, numCols).setBorder(true, null, null, null, null, null, "#64748B", SpreadsheetApp.BorderStyle.SOLID);
      }
    }
  }
}

function getOrCreateMasterTab(ss) {
  var master = ss.getSheetByName(MASTER_TAB_NAME);
  if (!master) {
    var defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet) {
      defaultSheet.setName(MASTER_TAB_NAME);
      master = defaultSheet;
    } else {
      master = ss.insertSheet(MASTER_TAB_NAME, 0);
    }
  }
  formatTabHeader(master, "#1E293B");
  if (typeof master.setTabColor === "function") {
    master.setTabColor("#1E293B");
  }
  return master;
}

function findOrCreateKelurahanTab(ss, kecName, kelName, colorPair) {
  var desiredBase = sanitizeTabTitle(kelName || kecName);
  var disambiguated = sanitizeTabTitle((kelName || kecName) + " (" + kecName + ")");
  var kecLower = String(kecName || "").trim().toLowerCase();

  var existingSheets = ss.getSheets();
  for (var i = 0; i < existingSheets.length; i++) {
    var sh = existingSheets[i];
    var shName = sh.getName();
    if (shName === MASTER_TAB_NAME || shName === "Sheet1") continue;
    var ownerLower = getSheetOwnerKecamatan(sh).toLowerCase();
    if (ownerLower === kecLower && (shName.toLowerCase() === desiredBase.toLowerCase() || shName.toLowerCase() === disambiguated.toLowerCase())) {
      formatTabHeader(sh, colorPair.tab);
      if (typeof sh.setTabColor === "function") sh.setTabColor(colorPair.tab);
      return sh;
    }
  }

  var clash = ss.getSheetByName(desiredBase);
  var finalTitle = clash ? disambiguated : desiredBase;
  if (ss.getSheetByName(finalTitle)) {
    finalTitle = sanitizeTabTitle(finalTitle + " " + Date.now().toString().slice(-3));
  }
  var newSheet = ss.insertSheet(finalTitle);
  try {
    if (typeof newSheet.addDeveloperMetadata === "function") {
      newSheet.addDeveloperMetadata("kecamatan", kecName);
    }
  } catch (ignoreAddMeta) {}
  formatTabHeader(newSheet, colorPair.tab);
  if (typeof newSheet.setTabColor === "function") newSheet.setTabColor(colorPair.tab);
  return newSheet;
}

function syncAndSortAllTabs(ss, extraKec) {
  var kecColorMap = buildKecColorAssignments(ss, extraKec);
  var master = getOrCreateMasterTab(ss);
  sortAndColorSheetRows(master, "#1E293B", null, kecColorMap);

  var allSheets = ss.getSheets();
  var tabEntries = [];
  for (var i = 0; i < allSheets.length; i++) {
    var sh = allSheets[i];
    var shName = sh.getName();
    if (shName === MASTER_TAB_NAME) continue;
    var owner = getSheetOwnerKecamatan(sh);
    var ownerLower = owner.trim().toLowerCase();
    var pair = kecColorMap[ownerLower] || KECAMATAN_COLOR_PALETTE[0];
    formatTabHeader(sh, pair.tab);
    if (typeof sh.setTabColor === "function") sh.setTabColor(pair.tab);
    tabEntries.push({ sheet: sh, owner: ownerLower, name: shName.toLowerCase() });
  }

  tabEntries.sort(function(a, b) {
    if (a.owner !== b.owner) return a.owner < b.owner ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  if (master.getIndex() !== 1) {
    ss.setActiveSheet(master);
    ss.moveActiveSheet(1);
  }
  for (var t = 0; t < tabEntries.length; t++) {
    var targetPos = t + 2;
    var itemSheet = tabEntries[t].sheet;
    if (itemSheet.getIndex() !== targetPos) {
      ss.setActiveSheet(itemSheet);
      ss.moveActiveSheet(targetPos);
    }
  }
  return kecColorMap;
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
  var master = getOrCreateMasterTab(ss);
  syncAndSortAllTabs(ss, "");
  return {
    ok: true,
    ss: ss,
    sheet: master,
    sheetUrl: ss.getUrl(),
    sheetName: SHEET_NAME,
    created: created
  };
}

function appendScanRowToSheet(rootFolder, rowObj) {
  try {
    var ensured = ensureRekapSheet(rootFolder);
    if (!ensured.ok || !ensured.ss || !ensured.sheet) {
      return { logged: false, error: ensured.error };
    }
    var ss = ensured.ss;
    var master = ensured.sheet;
    var kecName = String(rowObj.kecamatan || "").trim() || "Tanpa Kecamatan";
    var kelName = String(rowObj.kelurahan || "").trim();
    var colorMap = buildKecColorAssignments(ss, kecName);
    var pair = colorMap[kecName.toLowerCase()] || KECAMATAN_COLOR_PALETTE[0];

    var rowValues = [
      Math.max(1, master.getLastRow()),
      new Date().toLocaleString("id-ID"),
      rowObj.fileName || "",
      rowObj.nomorSu || "",
      rowObj.tahunSu || "",
      rowObj.kodeHak || "",
      rowObj.nomorHak || "",
      rowObj.nib || "",
      rowObj.luasTanah || "",
      kecName,
      kelName,
      rowObj.pageCount || 1,
      rowObj.fileUrl || "",
      rowObj.folderName || "",
      rowObj.operatorName || "Operator"
    ];

    master.appendRow(rowValues);

    var kelTab = findOrCreateKelurahanTab(ss, kecName, kelName, pair);
    var kelRowValues = rowValues.slice();
    kelRowValues[0] = Math.max(1, kelTab.getLastRow());
    kelTab.appendRow(kelRowValues);
    sortAndColorSheetRows(kelTab, pair.tab, pair.row, null);

    syncAndSortAllTabs(ss, kecName);
    return { logged: true, sheetUrl: ensured.sheetUrl };
  } catch (err) {
    return { logged: false, error: err && err.message ? err.message : String(err) };
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
        sheetUrl: foundSheetUrl
      });
    }

    if (body.action === "init_sheet") {
      var initRoot = DriveApp.getFolderById(rootFolderId);
      var sheetRes = ensureRekapSheet(initRoot);
      if (!sheetRes.ok) {
        return jsonResponse({ ok: false, error: sheetRes.error || "Gagal menyiapkan Google Sheets." });
      }
      return jsonResponse({
        ok: true,
        supported: true,
        sheetUrl: sheetRes.sheetUrl,
        sheetName: sheetRes.sheetName,
        existed: !sheetRes.created,
        folderUrl: initRoot.getUrl()
      });
    }

    if (body.action === "exists") {
      var kecCheck = normalizeKecamatanTitle(body.kecamatan);
      var kelCheck = normalizeKelurahanTitle(body.kelurahan);
      var fname = String(body.filename || "").trim();
      var rootCheck = DriveApp.getFolderById(rootFolderId);
      var kecFolder = kecCheck ? findSubfolder(rootCheck, kecCheck, normalizeKecamatanTitle) : null;
      var targetCheck = kecFolder
        ? (kelCheck ? findSubfolder(kecFolder, kelCheck, normalizeKelurahanTitle) : kecFolder)
        : null;
      if (!targetCheck || !fname) {
        return jsonResponse({ ok: true, supported: true, exists: false, count: 0, matches: [] });
      }
      var found = findMatchingFilesInFolder(targetCheck, fname).map(function(f) {
        return {
          id: f.getId(),
          name: f.getName(),
          url: f.getUrl(),
          sizeBytes: f.getSize(),
          updatedAt: f.getLastUpdated().toISOString()
        };
      });
      return jsonResponse({
        ok: true,
        supported: true,
        exists: found.length > 0,
        count: found.length,
        matches: found,
        folderName: targetCheck.getName(),
        folderUrl: targetCheck.getUrl()
      });
    }

    if (body.action === "explore") {
      var folderToOpen = DriveApp.getFolderById(String(body.folderId || rootFolderId).trim());
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
            updatedAt: sf.getLastUpdated().toISOString()
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
            updatedAt: fl.getLastUpdated().toISOString()
          });
        }
      }
      return jsonResponse({
        ok: true,
        supported: true,
        folderId: folderToOpen.getId(),
        folderName: folderToOpen.getName(),
        folderUrl: folderToOpen.getUrl(),
        items: items
      });
    }

    if (body.action === "rename") {
      var fileToRename = DriveApp.getFileById(String(body.fileId || "").trim());
      var nextName = String(body.newFilename || "").replace(/[<>:"/\\\\|?*]/g, "_").trim();
      if (!nextName) return jsonResponse({ ok: false, error: "Nama file baru wajib diisi." });
      fileToRename.setName(nextName);
      return jsonResponse({
        ok: true,
        supported: true,
        fileId: fileToRename.getId(),
        fileName: fileToRename.getName(),
        fileUrl: fileToRename.getUrl()
      });
    }

    if (body.action === "move") {
      var fileToMove = DriveApp.getFileById(String(body.fileId || "").trim());
      var moveRoot = DriveApp.getFolderById(rootFolderId);
      var dstKec = normalizeKecamatanTitle(body.targetKecamatan);
      var dstKel = normalizeKelurahanTitle(body.targetKelurahan);
      if (!dstKec) return jsonResponse({ ok: false, error: "Kecamatan tujuan wajib diisi." });
      var dstKecRes = findOrCreateSubfolder(moveRoot, dstKec, normalizeKecamatanTitle);
      var dstKelRes = dstKel ? findOrCreateSubfolder(dstKecRes.folder, dstKel, normalizeKelurahanTitle) : null;
      var dstFolder = dstKelRes ? dstKelRes.folder : dstKecRes.folder;
      fileToMove.moveTo(dstFolder);
      return jsonResponse({
        ok: true,
        supported: true,
        fileId: fileToMove.getId(),
        fileName: fileToMove.getName(),
        folderId: dstFolder.getId(),
        folderName: dstKelRes ? dstKecRes.folder.getName() + " / " + dstKelRes.folder.getName() : dstKecRes.folder.getName(),
        folderUrl: dstFolder.getUrl()
      });
    }

    var kecamatan = normalizeKecamatanTitle(body.kecamatan);
    var kelurahan = normalizeKelurahanTitle(body.kelurahan);
    var filename = String(body.filename || "").replace(/[<>:"/\\\\|?*]/g, "_").trim();
    var pdfBase64 = String(body.pdfBase64 || "");
    var conflictPolicy = String(body.conflictPolicy || "revision");

    if (!kecamatan) return jsonResponse({ ok: false, error: "Kecamatan wajib diisi." });
    if (!filename || !pdfBase64) return jsonResponse({ ok: false, error: "File PDF tidak lengkap." });

    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var kecResult = findOrCreateSubfolder(rootFolder, kecamatan, normalizeKecamatanTitle);
    var kelResult = kelurahan
      ? findOrCreateSubfolder(kecResult.folder, kelurahan, normalizeKelurahanTitle)
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
        kelurahanCreated: kelResult ? kelResult.created : false
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

    var blob = Utilities.newBlob(Utilities.base64Decode(pdfBase64), "application/pdf", finalFilename);
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
        operatorName: body.sheetMeta.operatorName || "Operator"
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
    explorerSupported: true,
    dedupSupported: true,
    conflictSupported: true,
    sheetSupported: true,
    service: "SU-Scanner Drive Uploader",
    defaultRootFolderId: DEFAULT_ROOT_FOLDER_ID
  });
}`;
