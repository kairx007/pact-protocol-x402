import { describe, expect, it } from "vitest";
import { formatBaseUnits } from "./amount";

describe("formatBaseUnits", () => {
  it("formats integer token units without floating point", () => {
    expect(formatBaseUnits("123450000", 6)).toBe("123.45");
    expect(formatBaseUnits("1", 18)).toBe("0.000000000000000001");
    expect(formatBaseUnits("900719925474099312345", 0)).toBe(
      "900719925474099312345",
    );
  });

  it("keeps zero exact and rejects malformed base-unit values", () => {
    expect(formatBaseUnits("0", 18)).toBe("0");
    expect(formatBaseUnits("01", 6)).toBe("—");
    expect(formatBaseUnits("1.2", 6)).toBe("—");
  });
});
