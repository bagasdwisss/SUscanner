import { NextResponse, connection } from "next/server";
import { buildDriveFolderUrl } from "@/lib/drive-config";
import {
  detectDriveEnvAuthMode,
  resolveConfiguredRootFolderId,
} from "@/lib/drive-service";
import type { DriveStatusResponse } from "@/lib/su-types";

export async function GET() {
  await connection();
  const mode = detectDriveEnvAuthMode();
  const defaultRootFolderId = resolveConfiguredRootFolderId(null);

  const payload: DriveStatusResponse = {
    configured: mode !== "unconfigured",
    mode,
    defaultRootFolderId,
    defaultRootFolderUrl: buildDriveFolderUrl(defaultRootFolderId),
    hasGoogleClientId: Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()),
  };

  return NextResponse.json(payload);
}
