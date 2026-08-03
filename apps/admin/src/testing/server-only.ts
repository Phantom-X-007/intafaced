/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * The real module's entire body is a `throw`, guarded by an export condition
 * (`react-server`) that Next sets and Vitest does not. Importing it in a test
 * therefore fails at module load — not because the code under test is wrong,
 * but because the marker is doing exactly its job in a runtime that is not the
 * one it polices.
 *
 * `vitest.config.ts` aliases the specifier here. Nothing is weakened by that:
 * the marker is enforced by `next build`, which still sees the real package, so
 * a `'use client'` file that imports `control-plane-client.ts` still fails the
 * build. This file only stops the alias from being the reason a test cannot run.
 *
 * It is deliberately empty. `server-only` exports nothing.
 */
export {};
