import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkDuplicateInDrive,
  DriveServiceError,
} from "@/lib/drive-service";

export const maxDuration = 30;

const checkBodySchema = z.object({
  filename: z.string().trim().min(1).max(180),
  kecamatan: z.string().trim().min(1).max(120),
  kelurahan: z.string().trim().max(120).optional().nullable(),
  rootFolderId: z.string().trim().max(250).optional().nullable(),
  appsScriptUrl: z.string().trim().max(500).optional().nullable(),
  clientAccessToken: z.string().trim().max(2500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof checkBodySchema>;
  try {
    const raw = await request.json();
    const parsed = checkBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Nama file dan Kecamatan diperlukan untuk cek duplikat Drive." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body JSON tidak valid." },
      { status: 400 },
    );
  }

  try {
    const result = await checkDuplicateInDrive(body);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DriveServiceError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa duplikasi file di Google Drive." },
      { status: 502 },
    );
  }
}
