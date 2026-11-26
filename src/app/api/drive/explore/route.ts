import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  DriveServiceError,
  exploreDriveFolder,
  moveDriveFile,
  renameDriveFile,
} from "@/lib/drive-service";

export const maxDuration = 30;

const exploreSchema = z.object({
  action: z.enum(["list", "rename", "move"]).default("list"),
  folderId: z.string().trim().max(250).optional().nullable(),
  rootFolderId: z.string().trim().max(250).optional().nullable(),
  query: z.string().trim().max(120).optional().nullable(),
  fileId: z.string().trim().max(250).optional().nullable(),
  newFilename: z.string().trim().max(180).optional().nullable(),
  targetKecamatan: z.string().trim().max(120).optional().nullable(),
  targetKelurahan: z.string().trim().max(120).optional().nullable(),
  appsScriptUrl: z.string().trim().max(500).optional().nullable(),
  clientAccessToken: z.string().trim().max(2500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof exploreSchema>;
  try {
    const raw = await request.json();
    const parsed = exploreSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Permintaan Drive Explorer tidak valid." },
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
    if (body.action === "rename") {
      if (!body.fileId || !body.newFilename) {
        return NextResponse.json(
          { ok: false, error: "fileId dan newFilename wajib diisi." },
          { status: 400 },
        );
      }
      const res = await renameDriveFile({
        fileId: body.fileId,
        newFilename: body.newFilename,
        appsScriptUrl: body.appsScriptUrl,
        clientAccessToken: body.clientAccessToken,
      });
      return NextResponse.json(res);
    }

    if (body.action === "move") {
      if (!body.fileId || !body.targetKecamatan) {
        return NextResponse.json(
          { ok: false, error: "fileId dan targetKecamatan wajib diisi." },
          { status: 400 },
        );
      }
      const res = await moveDriveFile({
        fileId: body.fileId,
        rootFolderId: body.rootFolderId,
        targetKecamatan: body.targetKecamatan,
        targetKelurahan: body.targetKelurahan,
        appsScriptUrl: body.appsScriptUrl,
        clientAccessToken: body.clientAccessToken,
      });
      return NextResponse.json(res);
    }

    const res = await exploreDriveFolder({
      folderId: body.folderId,
      rootFolderId: body.rootFolderId,
      query: body.query,
      appsScriptUrl: body.appsScriptUrl,
      clientAccessToken: body.clientAccessToken,
    });
    return NextResponse.json(res);
  } catch (err) {
    if (err instanceof DriveServiceError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Operasi Drive Explorer gagal." },
      { status: 502 },
    );
  }
}
