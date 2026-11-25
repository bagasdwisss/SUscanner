import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DriveServiceError,
  verifyDriveConnection,
} from "@/lib/drive-service";

export const maxDuration = 30;

const verifyBodySchema = z.object({
  rootFolderId: z.string().trim().max(250).optional().nullable(),
  appsScriptUrl: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof verifyBodySchema> = {};
  try {
    const raw = await request.json();
    const parsed = verifyBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Parameter verifikasi Drive tidak valid." },
        { status: 400 },
      );
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  try {
    const result = await verifyDriveConnection({
      rootFolderId: body.rootFolderId,
      appsScriptUrl: body.appsScriptUrl,
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
        code: "DRIVE_VERIFY_ERROR",
        error: "Gagal menghubungi layanan Google Drive Apps Script.",
      },
      { status: 502 },
    );
  }
}
