# A6 — Lightweight Charts v5 plan (non-blocking Wave A)

**Status:** WRITTEN · not implementing v5 in Wave A  
**Today:** LWC **v3.8** vendored standalone under `assets/js/market-chart/`  
**Attribution:** tradingview.com link on desk (A0.5)

## Goal

RSI / MACD panes and multi-pane layout without inventing indicators.

## Decision gates before upgrade

1. Golden tests for any indicator math (input candles → values) before UI.
2. NOTICE / Apache-2.0 vendored build (same pattern as v3.8) — **not** package.json without Denon.
3. Attribution remains on chart surface.
4. Wave C timing: after Wave A honesty DoD + style pick or waiver.

## Steps (when scheduled)

1. Diff v3.8 → v5 breaking API (createChart options, series API).
2. Spike branch: mount only; no indicators.
3. Port kline.js wrapper; keep resolution map.
4. Pane API for RSI/MACD after goldens.
5. Measure interaction latency (scorecard dim 16).

## Out of scope

AI trades, social, confetti, fake candles.
