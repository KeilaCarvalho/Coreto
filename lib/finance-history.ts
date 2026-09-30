// ISO dates/months sort chronologically. An explicitly saved empty record wins.
export function latestAtOrBefore<T>(rows: T[], target: string, dateOf: (row: T) => string): T | undefined {
  return rows.reduce<T | undefined>((latest, row) => {
    const date = dateOf(row);
    return date <= target && (!latest || date > dateOf(latest)) ? row : latest;
  }, undefined);
}
