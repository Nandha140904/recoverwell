const DEFAULT_API_TIMEOUT_MS = 8000;

const rawApiBaseUrl =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : "";

const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class ApiRequestError extends Error {
  code: "network" | "timeout";

  constructor(code: "network" | "timeout", message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

export function buildApiUrl(path: string) {
  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${path}` : path;
}

export async function fetchWithTimeout(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(buildApiUrl(path), {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiRequestError(
        "timeout",
        "The recovery server took too long to respond."
      );
    }

    throw new ApiRequestError(
      "network",
      "Unable to reach the recovery server."
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function readApiError(
  response: Response,
  fallbackMessage: string
) {
  try {
    const body = await response.json();
    if (typeof body?.error === "string" && body.error.trim()) {
      return body.error;
    }
  } catch {
    // Ignore non-JSON bodies and use the fallback message.
  }

  return fallbackMessage;
}
