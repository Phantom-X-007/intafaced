# DNS / Host runbook — trade.intafaced.com

## Target

`trade.intafaced.com` → static site in `sites/sovereign-os/`

## Host options (priority)

1. **Cloudflare Pages / any static host** with custom domain
2. **GitHub Pages** from this repo path or `gh-pages` branch
3. **Interim:** jsDelivr / rawgit-style CDN from public GitHub branch (HTTPS)
4. **Interim:** cloudflared quick tunnel for emergency review only

## DNS records (when Nitro has registrar)

| Type  | Name  | Value           |
| ----- | ----- | --------------- |
| CNAME | trade | `<host-target>` |

Apex `intafaced.com` payments site: **do not modify** except adding subdomain.

## SSL

Host-managed cert; force HTTPS.

## AFK note

If custom domain not available overnight, freeze a **public HTTPS preview** on scoreboard and leave this runbook for DNS cutover (one human action).
