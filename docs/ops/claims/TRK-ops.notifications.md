# Claim TRK-ops.notifications

**status:** pr-open
**owner:** cursor-swarm-notify
**slice:** residual-N
**proof:** durable mute prefs (`notify.channel_mutes`) + `channel.muted` honesty · feat/ops-notifications-residual
**tip:** feat/ops-notifications-residual
**updated:** 2026-08-07

Mute API existed on MemoryMuteStore only — prefs vanished on restart. Shipped: persist channel mutes; prove muted refusal vs critical bypass. No gateway credentials.
