export function persistIceberg(order: { readonly iceberg?: boolean; readonly displayQty?: string | null | unknown }): boolean {
  return order.iceberg === true || order.displayQty !== undefined;
}

export function persistTrail(order: { readonly trail?: unknown }): boolean {
  return order.trail !== undefined;
}

export function persistStrike(order: { readonly strike?: unknown }): boolean {
  return order.strike !== undefined;
}

export function persistExpiry(order: { readonly expiry?: unknown }): boolean {
  return order.expiry !== undefined;
}

export function persistExercise(order: { readonly exercise?: unknown }): boolean {
  return order.exercise === true;
}

export function persistMinQty(order: { readonly minQty?: unknown }): boolean {
  return order.minQty !== undefined;
}

export function persistAon(order: { readonly aon?: unknown }): boolean {
  return order.aon !== undefined;
}

export function persistPeg(order: { readonly peg?: unknown }): boolean {
  return order.peg !== undefined;
}

export function persistMidpoint(order: { readonly midpoint?: unknown }): boolean {
  return order.midpoint !== undefined;
}

export function persistRelative(order: { readonly relative?: unknown }): boolean {
  return order.relative !== undefined;
}

export function persistReference(order: { readonly reference?: unknown }): boolean {
  return order.reference !== undefined;
}

export function persistOffset(order: { readonly offset?: unknown }): boolean {
  return order.offset !== undefined;
}

export function persistAuction(order: { readonly auction?: unknown }): boolean {
  return order.auction !== undefined;
}

export function persistBenchmark(order: { readonly benchmark?: unknown }): boolean {
  return order.benchmark !== undefined;
}

export function persistCollar(order: { readonly collar?: unknown }): boolean {
  return order.collar !== undefined;
}

export function persistMin(order: { readonly min?: unknown }): boolean {
  return order.min !== undefined;
}

export function persistMax(order: { readonly max?: unknown }): boolean {
  return order.max !== undefined;
}

export function persistMinNotional(order: { readonly minNotional?: unknown }): boolean {
  return order.minNotional !== undefined;
}

export function persistCombo(order: { readonly combo?: unknown }): boolean {
  return order.combo !== undefined;
}

export function persistLegs(order: { readonly legs?: unknown }): boolean {
  return order.legs !== undefined;
}
