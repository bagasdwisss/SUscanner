import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenAI,
  MediaResolution,
  PartMediaResolutionLevel,
  createPartFromBase64,
} from "@google/genai";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  SU_GEMINI_RESPONSE_JSON_SCHEMA,
  SU_SYSTEM_INSTRUCTION,
  SU_USER_PROMPT,
  suExtractionZodSchema,
} from "@/lib/su-prompt";

const AI_TIMEOUT_MS = 35_000;
const PER_MODEL_TIMEOUT_MS = 18_000;
const MAX_IMAGE_BYTES = 4_200_000;
const FALLBACK_GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
] as const;

function getCandidateGeminiModels(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  const list = configured
    ? [configured, ...FALLBACK_GEMINI_MODELS]
    : [...FALLBACK_GEMINI_MODELS];
  return Array.from(new Set(list));
}

function getErrorStatusCode(err: unknown): number | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

const requestBodySchema = z.object({
  imageDataUrl: z
    .string()
    .min(32)
    .refine(
      (val) => /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(val),
      "Format gambar harus berupa data URL JPEG, PNG, atau WebP.",
    ),
});

function extractJsonText(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonSource = fencedMatch ? fencedMatch[1] : trimmed;
  return JSON.parse(jsonSource);
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const commaIdx = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);
  const mimeType = mimeMatch?.[1] === "image/jpg" ? "image/jpeg" : (mimeMatch?.[1] ?? "image/jpeg");
  return { mimeType, base64 };
}

export async function POST(request: NextRequest) {
  let parsedBody: z.infer<typeof requestBodySchema>;
  try {
    const json = await request.json();
    const validation = requestBodySchema.safeParse(json);
    if (!validation.success) {
      return NextResponse.json(
        {
          code: "INVALID_REQUEST",
          error: "Payload gambar Halaman 1 tidak valid.",
        },
        { status: 400 },
      );
    }
    parsedBody = validation.data;
  } catch {
    return NextResponse.json(
      { code: "INVALID_JSON", error: "Body JSON tidak valid." },
      { status: 400 },
    );
  }

  const { mimeType, base64 } = parseDataUrl(parsedBody.imageDataUrl);
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        code: "IMAGE_TOO_LARGE",
        error: "Ukuran gambar Halaman 1 melebihi batas 4 MB untuk ekstraksi AI.",
      },
      { status: 413 },
    );
  }

  const gatewayKey =
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  const geminiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!gatewayKey && !geminiKey) {
    return NextResponse.json(
      {
        code: "AI_NOT_CONFIGURED",
        error:
          "API Key Vision AI belum dikonfigurasi (.env.local: GEMINI_API_KEY atau AI_GATEWAY_API_KEY). Anda tetap dapat memindai dokumen dan mengisi penamaan secara manual.",
      },
      { status: 503 },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    if (gatewayKey) {
      const gatewayModel =
        process.env.AI_GATEWAY_MODEL || "google/gemini-3.8-flash";
      const { output, usage } = await generateText({
        model: gatewayModel,
        instructions: SU_SYSTEM_INSTRUCTION,
        temperature: 0,
        abortSignal: controller.signal,
        output: Output.object({
          name: "SuratUkurExtraction",
          description: "Ekstraksi entitas penamaan file arsip Surat Ukur BPN.",
          schema: suExtractionZodSchema,
        }),
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: SU_USER_PROMPT },
              {
                type: "file",
                mediaType: mimeType,
                data: base64,
              },
            ],
          },
        ],
      });

      const validated = suExtractionZodSchema.parse(output);
      return NextResponse.json({
        extraction: validated,
        provider: "ai-gateway",
        model: gatewayModel,
        usage: {
          promptTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          totalTokens: usage?.totalTokens ?? 0,
        },
      });
    }

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        retryOptions: { attempts: 1 },
      },
    });
    const candidateModels = getCandidateGeminiModels();
    let lastError: unknown = null;

    for (const geminiModel of candidateModels) {
      if (controller.signal.aborted) break;
      const attemptSignal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
      ]);
      try {
        const response = await ai.models.generateContent({
          model: geminiModel,
          contents: [
            SU_USER_PROMPT,
            createPartFromBase64(
              base64,
              mimeType,
              PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
            ),
          ],
          config: {
            systemInstruction: SU_SYSTEM_INSTRUCTION,
            temperature: 0.0,
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
            responseMimeType: "application/json",
            responseJsonSchema: SU_GEMINI_RESPONSE_JSON_SCHEMA,
            abortSignal: attemptSignal,
          },
        });

        const rawText = response.text;
        if (!rawText) {
          lastError = new Error(`Model ${geminiModel} mengembalikan respons kosong.`);
          continue;
        }

        const parsedJson = extractJsonText(rawText);
        const validated = suExtractionZodSchema.parse(parsedJson);

        return NextResponse.json({
          extraction: validated,
          provider: "gemini-direct",
          model: geminiModel,
          usage: {
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
          },
        });
      } catch (err) {
        lastError = err;
        const status = getErrorStatusCode(err);
        if (status === 401 || status === 403) {
          return NextResponse.json(
            {
              code: "AI_AUTH_ERROR",
              error:
                "API Key Gemini ditolak atau tidak memiliki akses. Periksa GEMINI_API_KEY di .env.local.",
            },
            { status: 401 },
          );
        }
        if (
          err instanceof Error &&
          (err.name === "AbortError" || err.name === "TimeoutError")
        ) {
          if (controller.signal.aborted) throw err;
          continue;
        }
        // Retry next fallback model for retired (404), rate-limited (429), or high-demand (503/500) responses
        if (
          status === 404 ||
          status === 429 ||
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504
        ) {
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("Semua model Gemini gagal merespons.");
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return NextResponse.json(
        {
          code: "AI_TIMEOUT",
          error:
            "Ekstraksi Vision AI melebihi batas waktu. Silakan klik Baca Ulang AI atau isi kolom secara manual.",
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        code: "AI_UPSTREAM_ERROR",
        error:
          "Gagal memproses pembacaan AI saat ini. Pemindaian & ekspor PDF manual tetap dapat digunakan.",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
