/**
 * Identity L3 — pure WebAuthn ceremony catalog honesty (no crypto I/O).
 *
 * Structural ceremony types only. Does not invent credentials or origins.
 */

export const WEBAUTHN_CEREMONY_TYPES = ['webauthn.create', 'webauthn.get'] as const;
export type WebAuthnCeremonyType = (typeof WEBAUTHN_CEREMONY_TYPES)[number];

export type CeremonyBoardInput = {
  readonly type: WebAuthnCeremonyType;
  readonly hasChallenge: boolean;
  readonly hasOrigin: boolean;
};

/** L3 — catalog board. */
export function webauthnCeremonyCatalogBoardCard(): {
  readonly ceremonies: number;
  readonly create: number;
  readonly get: number;
} {
  return {
    ceremonies: WEBAUTHN_CEREMONY_TYPES.length,
    create: WEBAUTHN_CEREMONY_TYPES.includes('webauthn.create') ? 1 : 0,
    get: WEBAUTHN_CEREMONY_TYPES.includes('webauthn.get') ? 1 : 0,
  };
}

/** L3 — catalog status line. */
export function webauthnCeremonyCatalogStatusLine(): string {
  const c = webauthnCeremonyCatalogBoardCard();
  return `ceremonies=${c.ceremonies} create=${c.create} get=${c.get}`;
}

/** L3 — parse catalog. */
export function parseWebauthnCeremonyCatalogStatusLine(line: string): {
  readonly ceremonies: number;
  readonly create: number;
  readonly get: number;
} | null {
  const m = line.trim().match(/^ceremonies=(\d+) create=([01]) get=([01])$/);
  if (!m) return null;
  return { ceremonies: Number(m[1]), create: Number(m[2]), get: Number(m[3]) };
}

/** L3 — true when catalog matches. */
export function webauthnCeremonyCatalogStatusLineMatches(): boolean {
  const p = parseWebauthnCeremonyCatalogStatusLine(webauthnCeremonyCatalogStatusLine());
  if (!p) return false;
  const c = webauthnCeremonyCatalogBoardCard();
  return p.ceremonies === c.ceremonies && p.create === c.create && p.get === c.get;
}

/** L3 — both create and get present. */
export function webauthnCeremonyCatalogStatusLineConsistent(line: string): boolean {
  const p = parseWebauthnCeremonyCatalogStatusLine(line);
  if (!p) return false;
  return p.ceremonies === 2 && p.create === 1 && p.get === 1;
}

/** L3 — ceremony board. */
export function webauthnCeremonyBoardCard(input: CeremonyBoardInput): {
  readonly type: string;
  readonly challenge: number;
  readonly origin: number;
  readonly ready: number;
} {
  const challenge = input.hasChallenge ? 1 : 0;
  const origin = input.hasOrigin ? 1 : 0;
  return {
    type: input.type,
    challenge,
    origin,
    ready: challenge === 1 && origin === 1 ? 1 : 0,
  };
}

/** L3 — status line. */
export function webauthnCeremonyStatusLine(input: CeremonyBoardInput): string {
  const c = webauthnCeremonyBoardCard(input);
  return `type=${c.type === 'webauthn.create' ? 'create' : 'get'} challenge=${c.challenge} origin=${c.origin} ready=${c.ready}`;
}

/** L3 — parse ceremony. */
export function parseWebauthnCeremonyStatusLine(line: string): {
  readonly type: string;
  readonly challenge: number;
  readonly origin: number;
  readonly ready: number;
} | null {
  const m = line.trim().match(/^type=(create|get) challenge=([01]) origin=([01]) ready=([01])$/);
  if (!m) return null;
  return {
    type: m[1]!,
    challenge: Number(m[2]),
    origin: Number(m[3]),
    ready: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function webauthnCeremonyStatusLineMatches(input: CeremonyBoardInput): boolean {
  const p = parseWebauthnCeremonyStatusLine(webauthnCeremonyStatusLine(input));
  if (!p) return false;
  const c = webauthnCeremonyBoardCard(input);
  const short = c.type === 'webauthn.create' ? 'create' : 'get';
  return (
    p.type === short &&
    p.challenge === c.challenge &&
    p.origin === c.origin &&
    p.ready === c.ready
  );
}

/** L3 — ready iff challenge and origin. */
export function webauthnCeremonyStatusLineConsistent(line: string): boolean {
  const p = parseWebauthnCeremonyStatusLine(line);
  if (!p) return false;
  return p.ready === (p.challenge === 1 && p.origin === 1 ? 1 : 0);
}

/** L3 — export header. */
export function webauthnCeremonyExportHeader(): string {
  return 'type,challenge,origin,ready';
}

/** L3 — export line. */
export function webauthnCeremonyExportLine(input: CeremonyBoardInput): string {
  const c = webauthnCeremonyBoardCard(input);
  const short = c.type === 'webauthn.create' ? 'create' : 'get';
  return `${short},${c.challenge},${c.origin},${c.ready}`;
}

/** L3 — full export. */
export function webauthnCeremonyExportText(input: CeremonyBoardInput): string {
  return [webauthnCeremonyExportHeader(), webauthnCeremonyExportLine(input)].join('\n');
}

/** L3 — type declared. */
export function isDeclaredWebauthnCeremony(type: string): boolean {
  return (WEBAUTHN_CEREMONY_TYPES as readonly string[]).includes(type);
}
