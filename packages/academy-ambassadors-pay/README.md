# @intafaced/academy-ambassadors-pay

Class M refuse-closed gate for academy ambassador **IFC pay** and **fee-share**.

Owner rate is env `ACADEMY_AMBASSADOR_SHARE_BPS` only — no default, no invented
bps, no `0` meaning “free” when unset. P&L profit-share is banned. There is no
ambassador-named ledger export on tip, so a set rate still settles `unwired`
(`academy.ambassador_recipe_unwired`) and never posts.

Leverage: residency/programme desks already on tip; existing academy IFC refuse
on the academy router; `token.staking` remains the lobby `stakeOf` gate, not a
pay rate.
