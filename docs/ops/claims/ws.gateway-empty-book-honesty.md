# Claim ws.gateway-empty-book-honesty

**status:** claimed
**owner:** cursor-denon-nitro
**slice:** public-door empty ≠ zero
**tracker:** ws.gateway
**branch:** feat/ws-empty-book-honesty
**updated:** 2026-08-14

## Goal

Public depth/trades hubs never present an empty book as a live zero book. Empty ≠ zero. Missing market stays a typed close, not fabricated depth.

## Done-bar

Tests fail if a hub emits bids/asks of `[]` that a client could read as a priced empty book vs honest no-book; no invented mids; no Vue.

## Do not touch

- #1838 academy · #1839 notify · #1841 agents
- bank.ramps lane · connect-unscored lane
- Vue · Shehzad · invent depth · wave-14 docs
- tracker stays `ready` (mountain event not this slice)
