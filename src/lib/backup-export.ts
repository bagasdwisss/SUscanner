import { zipSync, strToU8 } from "fflate";
import type { SessionHistoryItem } from "./su-types.ts";

function escapeCsvCell(raw: string): string {
  const s = String(raw ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeXml(raw: string): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnLetter(colIdx: number): string {
  let col = "";
  let n = colIdx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

const REPORT_HEADERS = [
  "No",
  "Nama File PDF",
  "Nomor SU",
  "Tahun SU",
  "Kode Hak",
  "Nomor Hak",
  "NIB",
  "Luas Tanah",
  "Kecamatan",
  "Kelurahan / Desa",
  "Halaman",
  "Ukuran (Byte)",
  "Link PDF Google Drive",
  "Link Folder Drive",
  "Waktu Pindai",
  "Operator",
] as const;

function itemToRowCells(item: SessionHistoryItem, idx: number): string[] {
  return [
    String(idx + 1),
    item.filename,
    item.nomorSu || "",
    item.tahunSu || "",
    item.kodeHak || "",
    item.nomorHak || "",
    item.nib || "",
    item.luasTanah || "",
    item.kecamatan || "",
    item.kelurahan || "",
    String(item.pageCount),
    String(item.sizeBytes),
    item.driveFileUrl || "",
    item.driveFolderUrl || "",
    new Date(item.createdAt).toLocaleString("id-ID"),
    item.operatorName || "",
  ];
}

/**
 * Generates UTF-8 BOM CSV bytes compatible with Indonesian Microsoft Excel.
 */
export function buildReportCsvBlob(items: readonly SessionHistoryItem[]): Blob {
  const rows = [
    REPORT_HEADERS.map(escapeCsvCell).join(","),
    ...items.map((item, idx) => itemToRowCells(item, idx).map(escapeCsvCell).join(",")),
  ];
  const bom = "\uFEFF";
  return new Blob([bom + rows.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
}

/**
 * Generates a genuine OOXML `.xlsx` Excel workbook entirely client-side using `fflate`.
 */
export function buildReportXlsxBlob(items: readonly SessionHistoryItem[]): Blob {
  const allRows: string[][] = [
    [...REPORT_HEADERS],
    ...items.map((item, idx) => itemToRowCells(item, idx)),
  ];

  const rowsXml = allRows
    .map((cells, rIdx) => {
      const cellsXml = cells
        .map((val, cIdx) => {
          const ref = `${columnLetter(cIdx)}${rIdx + 1}`;
          if (rIdx > 0 && (cIdx === 0 || cIdx === 10 || cIdx === 11)) {
            const num = Number(val);
            if (Number.isFinite(num)) {
              return `<c r="${ref}"><v>${num}</v></c>`;
            }
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rIdx + 1}">${cellsXml}</row>`;
    })
    .join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Rekap Scan SU" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(relsXml),
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(wbRelsXml),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });

  const buffer = new Uint8Array(zipped).buffer;
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function sanitizeZipFolderSegment(raw: string | undefined, fallback: string): string {
  const clean = (raw || "").replace(/[<>:"/\\|?*]/g, "_").trim();
  return clean || fallback;
}

/**
 * Packages all session PDFs into a structured ZIP organized identically to Google Drive
 * (`/Kecamatan/Kelurahan/[filename].pdf`) plus a `rekap-scan.csv` manifest.
 */
export async function buildStructuredBackupZipBlob(
  items: readonly SessionHistoryItem[],
): Promise<{ blob: Blob; includedPdfCount: number }> {
  const entries: Record<string, Uint8Array> = {};
  const usedPaths = new Set<string>();
  let includedPdfCount = 0;

  for (const item of items) {
    if (!item.pdfBytes || item.pdfBytes.byteLength === 0) continue;
    const kec = sanitizeZipFolderSegment(item.kecamatan, "Tanpa Kecamatan");
    const kel = item.kelurahan
      ? sanitizeZipFolderSegment(item.kelurahan, "")
      : "";
    const file = sanitizeZipFolderSegment(item.filename, `SU-${item.id}.pdf`);
    const basePath = kel ? `${kec}/${kel}/${file}` : `${kec}/${file}`;

    let finalPath = basePath;
    let suffix = 2;
    while (usedPaths.has(finalPath.toLowerCase())) {
      finalPath = basePath.replace(/\.pdf$/i, `_rev${suffix}.pdf`);
      suffix++;
    }
    usedPaths.add(finalPath.toLowerCase());
    entries[finalPath] = new Uint8Array(item.pdfBytes);
    includedPdfCount++;
  }

  const csvText = await buildReportCsvBlob(items).text();
  entries["rekap-scan.csv"] = strToU8(csvText);

  const zipped = zipSync(entries, { level: 1 });
  return {
    blob: new Blob([new Uint8Array(zipped).buffer], { type: "application/zip" }),
    includedPdfCount,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}
