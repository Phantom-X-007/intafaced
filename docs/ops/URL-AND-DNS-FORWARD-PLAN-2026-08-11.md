# URL + DNS forward plan (LOCKED site) — 2026-08-11

**Status:** Waiting on DNS control for `intafaced.com`  
**Site product lock:** exchange-first site freezes unless Nitro opens a named fix  
**Apply surface (live today):** https://zenyoda3.github.io/intafaced-sovereign-os/

---

## 0 · Answers that must not get lost after compaction

### Do we need Hostinger login?

**Yes — for the agreed brand URL `https://trade.intafaced.com`.**

Verified facts (re-check if stale):

| Fact                 | Value                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Registrar            | **Hostinger**                                                                             |
| Nameservers          | `ns1.dns-parking.com` / `ns2.dns-parking.com` (**Hostinger parking DNS**, not Cloudflare) |
| Apex `intafaced.com` | Serves **payments** on **Vercel** — do not overwrite                                      |
| Target exchange URL  | **`trade.intafaced.com`**                                                                 |
| Agent auth today     | GitHub token only · Vercel token **invalid** · **no** Cloudflare/Hostinger API            |

So: Nitro (or whoever owns Hostinger) must either:

1. Log into **Hostinger hPanel** and add the CNAME, **or**
2. Hand the agent a **Hostinger / DNS API token** (same pattern as `~/.grok/agent-auth/github_token`), **or**
3. Change nameservers to Cloudflare/Vercel and give the agent that platform’s working token.

Without one of those, **agents cannot create `trade.intafaced.com`.**

### Does custom domain force visitors into the public GitHub repo?

**No.** Domain → host → website only.  
Public GitHub is a **separate discovery** risk if a deploy repo stays public.  
TV apply only needs a public HTTPS product URL.

### Can TV submit without Hostinger?

**Yes.** Interim URL remains GitHub Pages (already in apply pack). Brand URL is preferred; not a hard TV gate.

---

## 1 · Agreed end state

```
intafaced.com          → payments (Vercel) — UNTOUCHED
www.intafaced.com      → payments — UNTOUCHED
trade.intafaced.com    → exchange / Sovereign OS marketing site (TV apply URL)
GitHub monorepo        → build system; never the Product URL on TV form
```

---

## 2 · Hostinger path (default — lowest concept risk)

### Nitro does once (manual — only if no API token)

1. Log into Hostinger (recover via Forgot password if needed; whois does **not** expose account email).
2. Domain **intafaced.com** → **DNS / DNS Zone**.
3. Add:

| Type  | Name    | Target               | Proxy          |
| ----- | ------- | -------------------- | -------------- |
| CNAME | `trade` | `ZenYoda3.github.io` | off / DNS only |

4. Do **not** edit apex A or `www` (payments).
5. Tell agent: **`CNAME done`**.

### Agent does after CNAME (automatic)

1. GitHub Pages custom domain: `trade.intafaced.com`
2. Enforce HTTPS
3. Verify `https://trade.intafaced.com` loads the exchange site
4. Update `docs/TV-APPLY-PACK.md` Product URL → trade…
5. Update scoreboard / SITE-LOCK live URL line
6. Optional: privatize deploy repo later (needs GitHub Pro for private Pages) — not required for CNAME cutover

### Host target note

Default host = **existing GitHub Pages** (`ZenYoda3/intafaced-sovereign-os`) so no new host account.  
Alternative later: Vercel/CF Pages project + different CNAME target (same DNS control requirement).

---

## 3 · If Hostinger stays unreachable

| Option                          | Product URL       | Nitro                                  | Agent              |
| ------------------------------- | ----------------- | -------------------------------------- | ------------------ |
| **A · Submit TV now**           | github.io         | Form + pack                            | Keep Pages green   |
| **B · Recover Hostinger later** | trade… when ready | CNAME once                             | Wire domain + pack |
| **C · New DNS home**            | trade…            | Move NS or give CF/Vercel working auth | Full cutover       |

**Recommendation:** **A now** if TV pressure; **B** when Hostinger is found. Do not block TV forever on DNS.

---

## 4 · Repo visibility (separate from domain)

| Repo                              | Role                       | Note                                                                       |
| --------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `Phantom-X-007/intafaced`         | Monorepo / spend           | May stay public for Actions thrift; **never** TV Product URL               |
| `ZenYoda3/intafaced-sovereign-os` | Static **build** for Pages | Public today; only dist assets. Optional later: private + Pro or move host |

Custom domain does **not** by itself hide a public repo. It changes what TV is **told** to open.

---

## 5 · Session cold-start checklist

1. Live site: hard-refresh github.io (or trade… if live).
2. Site design: **LOCKED** unless Nitro opens a named fix.
3. DNS: if `dig +short trade.intafaced.com` empty → still waiting Hostinger/CNAME.
4. TV: Product URL = trade if live, else github.io; pack = `docs/TV-APPLY-PACK.md`.
5. Agent cannot invent Hostinger access — only GitHub until token/CNAME arrives.

---

## 6 · One-line truth for Nitro

**Yes — for `trade.intafaced.com` you need Hostinger access (or equivalent DNS control) once.**  
Until then the site stays locked on GitHub Pages and TV can still be submitted there.
