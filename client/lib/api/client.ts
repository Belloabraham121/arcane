export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  meta: {
    correlation_id?: string;
    timestamp?: string;
  };
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
};

function networkError<T>(): ApiEnvelope<T> {
  return {
    success: false,
    data: null,
    meta: {},
    error: {
      code: "NETWORK_ERROR",
      message: `Cannot reach API at ${API_URL}. Start the backend (cd backend && npm run dev).`,
    },
  };
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  let res: Response;

  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return networkError<T>();
  }

  try {
    return (await res.json()) as ApiEnvelope<T>;
  } catch {
    return {
      success: false,
      data: null,
      meta: {},
      error: {
        code: "INVALID_RESPONSE",
        message: `API returned non-JSON (HTTP ${res.status}). Is ${API_URL} the backend?`,
      },
    };
  }
}
