import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, createPartFromBase64 } from "@google/genai";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  SU_GEMINI_RESPONSE_JSON_SCHEMA,
  SU_SYSTEM_INSTRUCTION,
  SU_USER_PROMPT,
  suExtractionZodSchema,
} from "@/lib/su-prompt";

const AI_TIMEOUT_MS = 15_000;
const MAX_IMAGE_BYTES = 4_200_000;

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
        process.env.AI_GATEWAY_MODEL || "google/gemini-2.5-flash";
      const { output } = await generateText({
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
      });
    }

    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: geminiModel,
      contents: [SU_USER_PROMPT, createPartFromBase64(base64, mimeType)],
      config: {
        systemInstruction: SU_SYSTEM_INSTRUCTION,
        temperature: 0.0,
        responseMimeType: "application/json",
        responseJsonSchema: SU_GEMINI_RESPONSE_JSON_SCHEMA,
        abortSignal: controller.signal,
      },
    });

    const rawText = response.text;
    if (!rawText) {
      return NextResponse.json(
        {
          code: "EMPTY_AI_RESPONSE",
          error: "Model AI tidak mengembalikan data JSON. Silakan coba lagi atau isi manual.",
        },
        { status: 502 },
      );
    }

    const parsedJson = extractJsonText(rawText);
    const validated = suExtractionZodSchema.parse(parsedJson);

    return NextResponse.json({
      extraction: validated,
      provider: "gemini-direct",
      model: geminiModel,
    });
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return NextResponse.json(
        {
          code: "AI_TIMEOUT",
          error:
            "Ekstraksi Vision AI melebihi batas waktu 15 detik. Silakan klik Baca Ulang AI atau isi kolom secara manual.",
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
