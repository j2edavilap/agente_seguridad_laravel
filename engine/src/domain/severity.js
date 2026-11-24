export const SEVERITIES = Object.freeze(['critico', 'alto', 'medio', 'bajo', 'informativo']);

export const PENALTIES = Object.freeze({
  critico: 25,
  alto: 10,
  medio: 4,
  bajo: 1,
  informativo: 0,
});

export function emptyCounts() {
  return Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
}

export function isCounts(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    SEVERITIES.every((severity) => Number.isInteger(value[severity]) && value[severity] >= 0)
  );
}

export function sumCounts(counts) {
  if (!counts) return 0;
  return SEVERITIES.reduce((acc, severity) => acc + (counts[severity] ?? 0), 0);
}

export function penalty(counts) {
  if (!counts) return 0;
  return SEVERITIES.reduce((acc, severity) => acc + PENALTIES[severity] * (counts[severity] ?? 0), 0);
}

export function addCounts(target, source) {
  for (const severity of SEVERITIES) {
    target[severity] += source?.[severity] ?? 0;
  }
  return target;
}

export function subtractCounts(a, b) {
  return Object.fromEntries(
    SEVERITIES.map((severity) => [severity, Math.max(0, (a?.[severity] ?? 0) - (b?.[severity] ?? 0))]),
  );
}
