// F1 provider calls: Claude (structured JSON output), then Gemini (JSON
// schema), then TaxComp's text reader for text input. Every provider's output
// goes through validateExtraction; malformed output fails cleanly.
// Document contents are never logged.
import Anthropic from "@anthropic-ai/sdk";
import prompt from "../../prompts/assessment-extraction.v1.json" with { type: "json" };
import { MalformedExtractionError, readNoticeText, validateExtraction, type Extraction } from "./extract.mts";

export const CLAUDE_MODEL = "claude-opus-5-5";
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const PROMPT_VERSION = `${prompt.id}.v${prompt.version}`;

export type NoticeInput =
  | { kind: "file"; bytes: Uint8Array; contentType: string }
  | { kind: "text"; text: string };

export interface AiEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_FETCH?: typeof fetch;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GEMINI_FETCH?: typeof fetch;
}

export interface ReadResult {
  extraction: Extraction;
  attempts: Array<{ provider: string; outcome: string }>;
}

export class UnreadableNoticeError extends Error {
  readonly attempts: ReadResult["attempts"];
  constructor(message: string, attempts: ReadResult["attempts"]) {
    super(message);
    this.name = "UnreadableNoticeError";
    this.attempts = attempts;
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Inlines "#/$defs/..." references (both providers get the same plain schema). */
export function inlineSchema(schema: JsonValue, defs: Record<string, JsonValue> = {}): JsonValue {
  if (Array.isArray(schema)) return schema.map((item) => inlineSchema(item, defs));
  if (schema && typeof schema === "object") {
    const localDefs = (schema.$defs && typeof schema.$defs === "object" && !Array.isArray(schema.$defs)) ? { ...defs, ...(schema.$defs as Record<string, JsonValue>) } : defs;
    const ref = schema.$ref;
    if (typeof ref === "string") {
      const name = ref.replace(/^#\/\$defs\//, "");
      const target = localDefs[name];
      if (!target) throw new Error(`Unknown schema reference ${ref}`);
      return inlineSchema(target, localDefs);
    }
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === "$defs") continue;
      out[key] = inlineSchema(value, localDefs);
    }
    return out;
  }
  return schema;
}

export const OUTPUT_SCHEMA = inlineSchema(prompt.output_schema as unknown as JsonValue) as Record<string, unknown>;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function viaClaude(input: NoticeInput, env: AiEnv): Promise<Extraction> {
  if (!env.ANTHROPIC_API_KEY) throw new ProviderSkip("missing_api_key");
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 1,
    timeout: 60_000,
    ...(env.ANTHROPIC_FETCH ? { fetch: env.ANTHROPIC_FETCH } : {}),
  });
  let source: Anthropic.ContentBlockParam;
  if (input.kind === "text") {
    source = { type: "document", source: { type: "text", media_type: "text/plain", data: input.text.slice(0, 100_000) } };
  } else if (input.contentType === "application/pdf") {
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(input.bytes) } };
  } else if (IMAGE_TYPES.has(input.contentType)) {
    source = { type: "image", source: { type: "base64", media_type: input.contentType as "image/jpeg" | "image/png" | "image/webp", data: toBase64(input.bytes) } };
  } else {
    throw new ProviderSkip("unsupported_type");
  }
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    system: prompt.system,
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: [source, { type: "text", text: prompt.user }] }],
  });
  if (response.stop_reason === "refusal") throw new ProviderSkip("refusal");
  if (response.stop_reason === "max_tokens") throw new ProviderSkip("truncated");
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MalformedExtractionError("Claude returned text that is not JSON.");
  }
  return validateExtraction(parsed, "ai-claude");
}

async function viaGemini(input: NoticeInput, env: AiEnv): Promise<Extraction> {
  if (!env.GEMINI_API_KEY) throw new ProviderSkip("missing_api_key");
  const model = env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;
  const part = input.kind === "text"
    ? { text: input.text.slice(0, 100_000) }
    : input.contentType === "application/pdf" || IMAGE_TYPES.has(input.contentType)
      ? { inline_data: { mime_type: input.contentType, data: toBase64(input.bytes) } }
      : null;
  if (!part) throw new ProviderSkip("unsupported_type");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const fetchImpl = env.GEMINI_FETCH ?? fetch;
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: "user", parts: [part, { text: prompt.user }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: OUTPUT_SCHEMA, temperature: 0 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new ProviderSkip(`http_${response.status}`);
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MalformedExtractionError("Gemini returned text that is not JSON.");
    }
    return validateExtraction(parsed, "ai-gemini");
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderSkip("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

class ProviderSkip extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "ProviderSkip";
    this.reason = reason;
  }
}

function outcomeOf(error: unknown): string {
  if (error instanceof ProviderSkip) return error.reason;
  if (error instanceof MalformedExtractionError) return "malformed_output";
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") return `http_${status}`;
  const name = (error as { name?: unknown })?.name;
  return name === "APIConnectionTimeoutError" ? "timeout" : "error";
}

/** Reads a notice with the first provider that returns valid output. */
export async function readNotice(input: NoticeInput, env: AiEnv): Promise<ReadResult> {
  const attempts: ReadResult["attempts"] = [];
  for (const [provider, fn] of [["claude", viaClaude], ["gemini", viaGemini]] as const) {
    try {
      const extraction = await fn(input, env);
      attempts.push({ provider, outcome: "ok" });
      return { extraction, attempts };
    } catch (error) {
      const outcome = outcomeOf(error);
      attempts.push({ provider, outcome });
      // Never log the document or the provider's text; only the outcome.
      console.warn("Assessment reader provider failed", { provider, outcome, prompt: PROMPT_VERSION });
    }
  }
  if (input.kind === "text") {
    const extraction = readNoticeText(input.text); // throws MalformedExtractionError when there is too little text
    attempts.push({ provider: "text-reader", outcome: "ok" });
    return { extraction, attempts };
  }
  throw new UnreadableNoticeError("We could not read this file automatically. Try a clearer photo or a PDF, or type the figures in yourself.", attempts);
}
