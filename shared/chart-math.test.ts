import { describe, expect, it } from "vitest";
import { barAxis, barRect, formatCompact, labelStride, yPosition } from "./chart-math";

describe("barAxis", () => {
  it("covers the data, includes zero and uses nice steps", () => {
    const axis = barAxis([12, 18, 9, 7]);
    expect(axis.min).toBe(0);
    expect(axis.ticks).toEqual([0, 5, 10, 15, 20]);
    expect(axis.max).toBe(20);
  });

  it("includes zero when all values are large and positive", () => {
    expect(barAxis([950, 980]).min).toBe(0);
  });

  it("extends below zero for negative values", () => {
    const axis = barAxis([-30, 10]);
    expect(axis.min).toBeLessThanOrEqual(-30);
    expect(axis.ticks).toContain(0);
    expect(axis.max).toBeGreaterThanOrEqual(10);
  });

  it("handles small fractions without floating point noise", () => {
    const axis = barAxis([0.1, 0.3]);
    expect(axis.ticks.every((t) => Math.abs(t * 10 - Math.round(t * 10)) < 1e-9)).toBe(true);
  });

  it("still yields an axis when everything is zero or empty", () => {
    expect(barAxis([0, 0]).ticks.length).toBeGreaterThan(1);
    expect(barAxis([]).ticks.length).toBeGreaterThan(1);
  });
});

describe("yPosition and barRect", () => {
  const axis = { min: -10, max: 30 };
  it("puts max at the top and min at the bottom", () => {
    expect(yPosition(30, axis, 100)).toBe(0);
    expect(yPosition(-10, axis, 100)).toBe(100);
  });

  it("draws positive bars up from the zero line and negative bars down from it", () => {
    const positive = barRect(10, axis, 100);
    const negative = barRect(-10, axis, 100);
    const zero = yPosition(0, axis, 100);
    expect(positive.top + positive.height).toBeCloseTo(zero);
    expect(negative.top).toBeCloseTo(zero);
  });

  it("keeps a zero value visible as a hairline", () => {
    expect(barRect(0, axis, 100).height).toBe(1);
  });
});

describe("formatCompact and labelStride", () => {
  it("shortens large numbers and trims decimals", () => {
    expect(formatCompact(12)).toBe("12");
    expect(formatCompact(0.5)).toBe("0.5");
    expect(formatCompact(12345)).toBe("12.35k");
    expect(formatCompact(2500000)).toBe("2.5M");
    expect(formatCompact(NaN)).toBe("-");
  });

  it("prints every label for few categories and thins out many", () => {
    expect(labelStride(6)).toBe(1);
    expect(labelStride(8)).toBe(1);
    expect(labelStride(24)).toBe(3);
  });
});

describe("tick positions", () => {
  it("places a tick below zero below the zero line (not on the bar top)", () => {
    const axis = barAxis([3, -2, 5, 9]);
    expect(axis.ticks).toEqual([-5, 0, 5, 10]);
    expect(yPosition(-5, axis, 150)).toBe(150);
    expect(yPosition(0, axis, 150)).toBeCloseTo(100);
    expect(yPosition(10, axis, 150)).toBe(0);
  });
});
