export function formatBaseUnits(value: string, decimals: number): string {
  if (
    !/^(0|[1-9]\d*)$/.test(value) ||
    !Number.isInteger(decimals) ||
    decimals < 0
  )
    return "—";
  const digits = BigInt(value)
    .toString()
    .padStart(decimals + 1, "0");
  if (decimals === 0) return digits;
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole;
}
