# L3 free-TRK wave21 — Stage-1 pure helpers

**Tip base:** wave20 (#851)  
**Class:** N  
**Board-Delta:** free implementable TRK Stage-1 under thrift hard (local only)

## Helpers

| Area                | Additions                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| ops.analytics       | `countMoneyMetrics`, `hasNonMoneyMetrics`                                  |
| academy.ambassadors | `hasAnyProgrammeRow`, `frozenRatio`                                        |
| academy.tournaments | `thirdPlaceUser`, `lastPlaceUser`, `endedSeasonCount`, `hasLiveSeason`     |
| academy.curriculum  | `listLessonSlugs`, `playbookCount`                                         |
| ops.affiliates      | `maxChainDepth`, `referrerCount`                                           |
| ops.notifications   | `refusedChannels`, `fanoutAcceptanceRatio`, `planHasSkips`, `countSendNow` |
