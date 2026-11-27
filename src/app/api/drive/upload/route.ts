import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DriveServiceError,
  uploadPdfToKecamatanDrive,
} from "@/lib/drive-service";

export const maxDuration = 60;

const uploadBodySchema = z.object({
  filename: z.string().trim().min(1).max(180),
  kecamatan: z.string().trim().min(1).max(120),
  kelurahan: z.string().trim().max(120).optional().nullable(),
  rootFolderId: z.string().trim().max(250).optional().nullable(),
  pdfBase64: z.string().min(32),
  conflictPolicy: z.enum(["revision", "overwrite", "skip"]).optional(),
  appsScriptUrl: z.string().trim().max(500).optional().nullable(),
  clientAccessToken: z.string().trim().max(2500).optional().nullable(),
  sheetMeta: z
    .object({
      logToSheet: z.boolean().optional(),
      nomorSu: z.string().max(40).optional(),
      tahunSu: z.string().max(10).optional(),
      kodeHak: z.string().max(20).optional(),
      nomorHak: z.string().max(40).optional(),
      nib: z.string().max(40).optional(),
      luasTanah: z.string().max(40).optional(),
      pageCount: z.number().int().min(1).max(50).optional(),
    })
    .optional()
    .nullable(),
});

const MAX_PDF_BASE64_CHARS = 14_000_000;

export async function POST(request: NextRequest) {
  let body: z.infer<typeof uploadBodySchema>;
  try {
    const raw = await request.json();
    const parsed = uploadBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_REQUEST",
          error:
            "Payload unggah Google Drive tidak lengkap. Pastikan nama file, Kecamatan, dan data PDF tersedia.",
        },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", error: "Body JSON tidak valid." },
      { status: 400 },
    );
  }

  if (body.pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return NextResponse.json(
      {
        ok: false,
        code: "PDF_TOO_LARGE",
        error: "Ukuran PDF melebihi batas maksimum unggahan (10 MB).",
      },
      { status: 413 },
    );
  }

  try {
    const result = await uploadPdfToKecamatanDrive({
      filename: body.filename,
      kecamatan: body.kecamatan,
      kelurahan: body.kelurahan,
      rootFolderId: body.rootFolderId,
      pdfBase64: body.pdfBase64,
      conflictPolicy: body.conflictPolicy,
      sheetMeta: body.sheetMeta ?? undefined,
      appsScriptUrl: body.appsScriptUrl,
      clientAccessToken: body.clientAccessToken,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DriveServiceError) {
      return NextResponse.json(
        { ok: false, code: err.code, error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        code: "DRIVE_UNEXPECTED_ERROR",
        error: "Gagal mengunggah berkas PDF ke Google Drive.",
      },
      { status: 502 },
    );
  }
}
