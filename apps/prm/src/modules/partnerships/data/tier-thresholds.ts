/**
 * Tier thresholds — defines KPI gates for each partnership tier.
 *
 * Each tier requires ALL three KPIs (wic, wip, min) to meet or exceed the
 * listed threshold (conjunctive). Tier 1 ("OM Agency") is assigned manually
 * during onboarding and is never auto-evaluated.
 */
export const TIER_THRESHOLDS = [
  { tier: 'OM Agency', wic: 1, wip: 1, min: 1, order: 1 },
  { tier: 'OM AI-native Agency', wic: 2, wip: 5, min: 2, order: 2 },
  { tier: 'OM AI-native Expert', wic: 3, wip: 15, min: 5, order: 3 },
  { tier: 'OM AI-native Core', wic: 4, wip: 15, min: 5, order: 4 },
] as const

export type TierName = (typeof TIER_THRESHOLDS)[number]['tier']

/**
 * Return the highest tier whose thresholds are ALL met, skipping tier 1
 * (OM Agency) which is a manual PM gate at onboarding.
 *
 * Returns `null` when no auto-evaluated tier qualifies.
 */
export function computeTierEligibility(wic: number, wip: number, min: number): TierName | null {
  let highest: TierName | null = null
  for (const t of TIER_THRESHOLDS) {
    if (t.order < 2) continue // OM Agency is manual
    if (wic >= t.wic && wip >= t.wip && min >= t.min) {
      highest = t.tier
    }
  }
  return highest
}

/**
 * Look up a tier's order (1-based). Returns 0 when the name is unknown.
 */
export function tierOrder(name: string): number {
  return TIER_THRESHOLDS.find((t) => t.tier === name)?.order ?? 0
}
