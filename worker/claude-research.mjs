// Live web research with Claude (Anthropic API) and its server-side web search
// tool. Returns the same shape as callGemini in index.mjs:
//   { answer, sources, webGrounded: true, answerSource: "web", provider: "claude" }
//   or { fallback: true, reason }
// so callers can fall back to Gemini, then to TaxComp's local notes.
//
// * Model: claude-opus-5-5 (owner choice 2026-11-09).
// * Web search: web_search_20260318 (dynamic filtering keeps only relevant
//   result text in context), capped by max_uses per question.
// * Citations: every web_search_result_location citation becomes a numbered
//   source after the TaxComp notes, and a [n] marker after the cited text, as
//   Anthropic requires citations to be shown to end users.
// * Server-side refusal fallback ("default"): if Opus 5.5 declines, the API
//   re-runs the request on another Claude model inside the same call.

import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-opus-5-5";
const MAX_PAUSE_CONTINUATIONS = 3;
const MAX_WEB_SOURCES = 8;

const CLAUDE_GUIDANCE = [
  "You have a web search tool. For Uganda tax questions, run at least one web search before answering and base current rates, thresholds, deadlines and rules on what you find, preferring URA, Uganda legislation, ULII and other official sources.",
  "Keep the answer short and plain-text, and let the citations show where each statement comes from.",
].join(" ");

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Converts the chat's Gemini-style history ({role: user|model, parts}) to Claude messages. */
function toClaudeMessages(history, question) {
  const messages = [];
  for (const item of Array.isArray(history) ? history : []) {
    const text = item?.parts?.map((part) => part?.text || "").join("").trim();
    if (!text) continue;
    const role = item.role === "model" ? "assistant" : "user";
    if (messages.length === 0 && role !== "user") continue; // must start with a user turn
    messages.push({ role, content: text });
  }
  messages.push({ role: "user", content: question });
  return messages;
}

/** Builds the cited answer and source list from Claude's content blocks. */
export function extractCitedAnswer(content, evidenceSources = []) {
  const sources = [...evidenceSources];
  const indexByUrl = new Map(sources.map((source, index) => [source.url, index + 1]));
  let answer = "";
  let webCitations = 0;
  for (const block of Array.isArray(content) ? content : []) {
    if (block?.type !== "text" || typeof block.text !== "string") continue;
    const markers = new Set();
    for (const citation of Array.isArray(block.citations) ? block.citations : []) {
      if (citation?.type !== "web_search_result_location") continue;
      const url = publicUrl(citation.url);
      if (!url) continue;
      let index = indexByUrl.get(url);
      if (!index && sources.length < evidenceSources.length + MAX_WEB_SOURCES) {
        sources.push({
          label: typeof citation.title === "string" && citation.title.trim() ? citation.title.trim().slice(0, 180) : new URL(url).hostname,
          url,
          sourceType: "live_web",
        });
        index = sources.length;
        indexByUrl.set(url, index);
      }
      if (index) {
        markers.add(index);
        webCitations += 1;
      }
    }
    answer += block.text + [...markers].map((index) => ` [${index}]`).join("");
  }
  return { answer: answer.trim(), sources, webGrounded: webCitations > 0 };
}

function failureReason(error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "authentication";
  if (error instanceof Anthropic.RateLimitError) return "rate_limited";
  if (error instanceof Anthropic.BadRequestError) return "invalid_request";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "network_error";
  if (error instanceof Anthropic.APIError) return Number(error.status) >= 500 ? "unavailable" : "provider_error";
  return "unavailable";
}

/**
 * @param {object} options
 * @param {string} options.question
 * @param {Array} [options.history]  chat history in the Gemini-style shape used by index.mjs
 * @param {{text: string, sources: Array}} options.evidence  reviewed TaxComp notes
 * @param {string} options.systemInstruction
 * @param {object} options.env       needs ANTHROPIC_API_KEY (secret); ANTHROPIC_FETCH is a test seam
 * @param {"low"|"medium"|"high"} [options.effort]
 * @param {number} [options.maxSearches]
 * @param {(answer: string, sources: Array) => string} [options.validate]  e.g. drop unknown [n] note citations
 * @param {number} [options.maxAnswerLength]
 */
export async function callClaude({
  question, history = [], evidence, systemInstruction, env,
  effort = "medium", maxSearches = 3, validate = (answer) => answer, maxAnswerLength = 12_000,
}) {
  if (typeof env?.ANTHROPIC_API_KEY !== "string" || !env.ANTHROPIC_API_KEY) {
    return { fallback: true, reason: "missing_api_key" };
  }
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    maxRetries: 1,
    timeout: 60_000, // web searches usually finish in 10-40 s

    ...(typeof env.ANTHROPIC_FETCH === "function" ? { fetch: env.ANTHROPIC_FETCH } : {}),
  });
  const system = `${systemInstruction.replace(/Google Search/g, "web search")}\n\n${CLAUDE_GUIDANCE}\n\n${evidence.text}`;
  const messages = toClaudeMessages(history, question);
  const params = {
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system,
    output_config: { effort },
    tools: [{
      type: "web_search_20260318",
      name: "web_search",
      max_uses: maxSearches,
      user_location: { type: "approximate", timezone: "Africa/Kampala" },
    }],
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };

  let response;
  try {
    response = await client.beta.messages.create({ ...params, messages });
    // A long server-side search turn can pause; send it back unchanged to resume.
    for (let i = 0; response.stop_reason === "pause_turn" && i < MAX_PAUSE_CONTINUATIONS; i += 1) {
      messages.push({ role: "assistant", content: response.content });
      response = await client.beta.messages.create({ ...params, messages });
    }
  } catch (error) {
    const reason = failureReason(error);
    console.error("Claude API request failed", { model: CLAUDE_MODEL, reason, status: error?.status ?? null, errorName: error?.name ?? "UnknownError" });
    return { fallback: true, reason, upstreamStatus: typeof error?.status === "number" ? error.status : undefined };
  }

  if (response.stop_reason === "refusal") {
    console.info("Claude declined the request", { model: response.model, category: response.stop_details?.category ?? null });
    return { fallback: true, reason: "refusal" };
  }
  if (response.stop_reason === "pause_turn") return { fallback: true, reason: "paused" };

  const extracted = extractCitedAnswer(response.content, evidence.sources);
  if (!extracted.answer || extracted.answer.length > maxAnswerLength) return { fallback: true, reason: "invalid_response" };
  if (!extracted.webGrounded) {
    console.info("Claude answer had no web citations", { model: response.model, searches: response.usage?.server_tool_use?.web_search_requests ?? 0 });
    return { fallback: true, reason: "grounding_unavailable" };
  }
  return {
    answer: validate(extracted.answer, extracted.sources),
    sources: extracted.sources,
    webGrounded: true,
    answerSource: "web",
    provider: "claude",
    model: response.model,
    searches: response.usage?.server_tool_use?.web_search_requests ?? 0,
  };
}
