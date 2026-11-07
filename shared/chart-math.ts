// Pure arithmetic for the Chart component: nice axis ticks, value-to-position scaling and number
// formatting. No React Native imports, so the numbers a chart draws are unit-testable.

export interface Axis {
  /** Tick values from `min` to `max`, ascending, evenly spaced. */
  ticks: number[];
  min: number;
  max: number;
}

function niceStep(rough: number): number {
  const exponent = Math.floor(Math.log10(rough));
  const base = 10 ** exponent;
  const fraction = rough / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * An axis that contains every value and always includes zero (bars grow from it). Ticks land on
 * 1/2/5 x 10^n steps, about `target` of them.
 */
export function barAxis(values: readonly number[], target = 4): Axis {
  const finite = values.filter((value) => Number.isFinite(value));
  let low = Math.min(0, ...finite);
  let high = Math.max(0, ...finite);
  if (high === low) high = low + 1; // all zero: still draw an axis
  const step = niceStep((high - low) / Math.max(1, target));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  const count = Math.round((max - min) / step);
  for (let index = 0; index <= count; index++) {
    // Rounded to shed floating point noise such as 0.30000000000000004.
    ticks.push(Math.round((min + index * step) * 1e9) / 1e9);
  }
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1] };
}

/** Distance of `value` from the top of a plot of `height`, for an axis from `min` to `max`. */
export function yPosition(value: number, axis: Pick<Axis, "min" | "max">, height: number): number {
  const span = axis.max - axis.min;
  if (span <= 0) return height;
  return (1 - (value - axis.min) / span) * height;
}

/** Top and height of a bar for `value`: it spans from the zero line to the value. */
export function barRect(value: number, axis: Pick<Axis, "min" | "max">, height: number): { top: number; height: number } {
  const zero = yPosition(0, axis, height);
  const end = yPosition(Number.isFinite(value) ? value : 0, axis, height);
  const top = Math.min(zero, end);
  // A value of 0 still shows as a hairline so the category does not look missing.
  return { top, height: Math.max(1, Math.abs(zero - end)) };
}

/** 1234 -> "1.2k", 2500000 -> "2.5M", 0.5 -> "0.5"; at most two decimals. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  const trim = (n: number) => String(Math.round(n * 100) / 100);
  if (abs >= 1e9) return `${trim(value / 1e9)}B`;
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e4) return `${trim(value / 1e3)}k`;
  return trim(value);
}

/** Which of `count` category labels to print so they do not overlap: every `n`-th. */
export function labelStride(count: number, maxLabels = 8): number {
  return Math.max(1, Math.ceil(count / maxLabels));
}
