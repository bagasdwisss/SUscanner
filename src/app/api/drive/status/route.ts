import { NextResponse, connection } from "next/server";
import {
  buildDriveFolderUrl,
  DEFAULT_APPS_SCRIPT_URL,
} from "@/lib/drive-config";
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
    defaultAppsScriptUrl:
      process.env.GOOGLE_DRIVE_APPS_SCRIPT_URL?.trim() ||
      DEFAULT_APPS_SCRIPT_URL,
    hasGoogleClientId: Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim()),
  };

  return NextResponse.json(payload);
}
