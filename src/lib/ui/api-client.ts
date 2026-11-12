/** Client-side helpers shared across cockpit panels (no secret handling). */

export type HeroStep = 1 | 2 | 3 | 4 | 5 | 6;

export function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export async function postApiJson<TResponse>(
  url: string,
  payload: unknown
): Promise<{ ok: boolean; status: number; data: TResponse }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as TResponse;
  return { ok: res.ok, status: res.status, data };
}

export const BRAINTREE_SANDBOX_URL = "https://sandbox.braintreegateway.com";

