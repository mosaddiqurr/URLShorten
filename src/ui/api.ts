export async function post<T>(path: string, payload: unknown): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? "A few too many requests. Please try again in a minute."
          : typeof data?.error === "string"
            ? data.error
            : "This service is temporarily unavailable. Please try again.",
      );
    }
    if (!data)
      throw new Error(
        "This service is temporarily unavailable. Please try again.",
      );
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "Error") throw error;
    throw new Error("We couldn’t connect just now. Please try again.", {
      cause: error,
    });
  }
}
