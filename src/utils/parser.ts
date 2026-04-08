export function parseModbusAddress(addr: string): {
  type: "holding" | "coil" | "input";
  address: number;
} {
  const n = parseInt(addr, 10);
  if (n >= 40001 && n <= 49999) return { type: "holding", address: n - 40001 };
  if (n >= 1 && n <= 9999) return { type: "coil", address: n - 1 };
  if (n >= 30001 && n <= 39999) return { type: "input", address: n - 30001 };
  return { type: "holding", address: n };
}

export function parseExpect(expr: string): (val: number) => boolean {
  const between = expr.match(/^between\((\d+),\s*(\d+)\)$/);
  if (between) {
    const lo = Number(between[1]);
    const hi = Number(between[2]);
    return (v) => v >= lo && v <= hi;
  }
  const eq = expr.match(/^equals\((\d+)\)$/);
  if (eq) return (v) => v === Number(eq[1]);

  const lt = expr.match(/^lessThan\((\d+)\)$/);
  if (lt) return (v) => v < Number(lt[1]);

  const gt = expr.match(/^greaterThan\((\d+)\)$/);
  if (gt) return (v) => v > Number(gt[1]);

  return (v) => v === Number(expr);
}
