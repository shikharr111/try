# Calculation engine: formulas and conventions

All math lives in `src/lib/calc/` (pure TypeScript, no framework or network). Quantities are
`Dec` fixed-point decimals (BigInt, 9 dp, round-half-away-from-zero); dates are ISO `YYYY-MM-DD`
calendar days. Every formula below has tests in `__tests__/` using hand-computed inputs.

## Cutoff rule
Planned and actual cumulative values are always evaluated at the **same cutoff date**. Reports dated
after the cutoff are ignored.

## Progress (`progress.ts`)
| Quantity | Formula | Edge cases |
|---|---|---|
| Planned cumulative qty | explicit daily plan: sum of planned qty dated <= cutoff; else linear: `total x workingDays(start..cutoff) / workingDays(start..finish)` | 0 before start; `total` on/after finish; holidays/weekends excluded using the activity calendar |
| Actual cumulative qty | sum of reported qty dated <= cutoff | same-day entries are summed and flagged; negative qty and wrong units are rejected |
| Progress % | `completed / total approved x 100` | `null` when total is 0 (`ZERO_TOTAL_QTY`); uncapped value can exceed 100 (`OVER_COMPLETED`), a capped copy is used for roll-ups |
| Progress variance (pp) | `actual% - planned%` | negative = behind |
| Work shortfall % | `max(0, plannedQty - actualQty) / plannedQty x 100` | `null` when planned is 0 (nothing was due); ahead-of-schedule gives 0 |
| Remaining work | `max(0, total - actual)` | over-completion reported separately |
| Schedule variance (working days) | earned schedule: `ES - AT` where ES is the baseline working-day position whose planned cumulative equals the actual cumulative, AT the working days elapsed | negative = behind; exact for linear plans, interpolated for explicit plans |

## Resources (`resources.ts`)
Workforce and machine-hour variances are **informational**. They never feed delay figures:
a shortage can coexist with on-time progress and the reverse.
- Workforce variance = `actual - planned` person-days, only over days where both counts exist
  (unreported days are excluded, not treated as zero); % = variance / planned x 100.
- Machine hours: variance = `operating - planned`; utilization = `operating / planned x 100`;
  downtime % = `downtime / (operating + downtime) x 100`.

## Forecast (`forecast.ts`)
- Recent productivity = quantity reported in the trailing window (default 10 working days) / number of
  **reporting days** in it. Requires >= 3 reporting days (default); otherwise status is
  `insufficient_data` and the date is `null`.
- Forecast finish = `ceil(remaining / rate)`-th working day counting from the next working day after
  the cutoff (unstarted work: not before its planned start or predecessors' forecast finish + lag).
- Zero recent progress, or an activity that is due but has no reports, is **uncertain**, not forecast.
- The baseline average rate is used only for work that is not yet due to start, flagged low confidence.
- Confidence: high = >= 5 reporting days, >= 80% coverage, CV <= 0.5; medium = >= 3 days and >= 50% coverage; else low.
- Project forecast propagates through FS logic; any uncertain activity makes the project date `null`
  (a lower bound is exposed as `latestKnownFinish`).

## Three different things (never conflated)
1. **Progress shortfall**: quantity behind plan at the cutoff (percent).
2. **Schedule deviation**: progress variance (pp) and earned-schedule variance (working days).
3. **Forecast delay**: projected finish minus planned finish in calendar days (`max(0, .)`; signed value kept).

## Critical path (`cpm.ts`)
Finish-to-start only (other types are rejected, not faked). Forward pass `ES = max(EF(pred) + lag)`,
backward pass `LF = min(LS(succ) - lag)`, `float = LS - ES`, critical when float = 0. Cycles raise `CycleError`.
Float comes from durations and logic on the project calendar, not from imposed constraint dates.

## Health (`project.ts`)
A configurable **policy** layered on the numbers (defaults: at risk at <= -5 pp or forecast delay >= 1 day;
delayed at <= -10 pp or >= 7 days). The thresholds and reasons are returned with every result.
