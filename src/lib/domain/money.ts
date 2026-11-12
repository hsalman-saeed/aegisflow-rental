/**
 * Pure integer-cent monetary helpers (BR-001).
 * Eliminates IEEE-754 floating-point drift across partial settlements.
 */

/** Converts a USD dollar amount to integer cents using half-up rounding. */
export function dollarsToCents(usd: number | string): number {
  const numeric =
    typeof usd === "string" ? Number(usd.replace(/[$,\s]/g, "")) : usd;

  if (!Number.isFinite(numeric)) {
    throw new RangeError(`Invalid USD amount: ${String(usd)}`);
  }

  const sign = numeric < 0 ? -1 : 1;
  const scaled = Math.abs(numeric) * 100;
  return sign * Math.floor(scaled + 0.5 + Number.EPSILON);
}

/** Converts integer cents to a fixed 2-decimal string for Braintree SDK calls. */
export function centsToBraintreeString(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Expected integer cents, received: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

/** Formats integer cents for display (e.g., 150000 -> "$1,500.00"). */
export function formatUsdDisplay(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Expected integer cents, received: ${cents}`);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

