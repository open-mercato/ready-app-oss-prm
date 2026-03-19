import { z } from 'zod'

const uuid = () => z.string().uuid()

// ── Agency ─────────────────────────────────────────────────

export const onboardAgencySchema = z.object({
  agencyOrganizationId: uuid(),
})

export type OnboardAgencyInput = z.infer<typeof onboardAgencySchema>

// ── Tier Definition ────────────────────────────────────────

export const createTierDefinitionSchema = z.object({
  key: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(200),
  wicThreshold: z.number().int().min(0).default(0),
  wipThreshold: z.number().int().min(0).default(0),
  minThreshold: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const updateTierDefinitionSchema = z.object({
  id: uuid(),
  label: z.string().trim().min(1).max(200).optional(),
  wicThreshold: z.number().int().min(0).optional(),
  wipThreshold: z.number().int().min(0).optional(),
  minThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export type CreateTierDefinitionInput = z.infer<typeof createTierDefinitionSchema>
export type UpdateTierDefinitionInput = z.infer<typeof updateTierDefinitionSchema>

// ── Tier Assignment ────────────────────────────────────────

export const assignTierSchema = z.object({
  partnerAgencyId: uuid(),
  tierKey: z.string().trim().min(1).max(50),
  validUntil: z.string().datetime().optional(),
  reason: z.string().trim().max(500).optional(),
})

export type AssignTierInput = z.infer<typeof assignTierSchema>

// ── Metric Snapshot ────────────────────────────────────────

export const ingestMetricSnapshotSchema = z.object({
  partnerAgencyId: uuid(),
  metricKey: z.enum(['wic', 'wip', 'min']),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().min(0),
  source: z.enum(['ingest', 'crm', 'manual']).default('ingest'),
})

export type IngestMetricSnapshotInput = z.infer<typeof ingestMetricSnapshotSchema>

// ── RFP Campaign ───────────────────────────────────────────

export const createRfpCampaignSchema = z.object({
  title: z.string().trim().min(1).max(500),
  customerId: uuid().optional(),
})

export const updateRfpCampaignSchema = z.object({
  id: uuid(),
  title: z.string().trim().min(1).max(500).optional(),
  status: z.enum(['draft', 'published', 'closed', 'withdrawn']).optional(),
})

export type CreateRfpCampaignInput = z.infer<typeof createRfpCampaignSchema>
export type UpdateRfpCampaignInput = z.infer<typeof updateRfpCampaignSchema>

// ── RFP Response ───────────────────────────────────────────

export const submitRfpResponseSchema = z.object({
  rfpCampaignId: uuid(),
  partnerAgencyId: uuid(),
  status: z.enum(['invited', 'draft', 'submitted', 'withdrawn', 'selected']).default('draft'),
  score: z.number().min(0).max(100).optional(),
})

export type SubmitRfpResponseInput = z.infer<typeof submitRfpResponseSchema>

// ── License Deal (MIN) ─────────────────────────────────────

export const createLicenseDealSchema = z.object({
  customerId: uuid(),
  dealType: z.string().trim().min(1).max(100),
  status: z.enum(['pending', 'won', 'lost']).default('pending'),
  isRenewal: z.boolean().default(false),
})

export const updateLicenseDealSchema = z.object({
  id: uuid(),
  status: z.enum(['pending', 'won', 'lost']).optional(),
  isRenewal: z.boolean().optional(),
})

export const attributeLicenseDealSchema = z.object({
  id: uuid(),
  partnerAgencyId: uuid(),
})

export type CreateLicenseDealInput = z.infer<typeof createLicenseDealSchema>
export type UpdateLicenseDealInput = z.infer<typeof updateLicenseDealSchema>
export type AttributeLicenseDealInput = z.infer<typeof attributeLicenseDealSchema>

// ── WIC Run Import ─────────────────────────────────────────

export const importWicRunSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scriptVersion: z.string().trim().min(1).max(50),
  rawOutput: z.string().trim().min(1),
  units: z.array(z.object({
    ghProfile: z.string().trim().min(1),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/),
    featureKey: z.string().trim().optional(),
    baseScore: z.number().min(0),
    impactBonus: z.number().min(0).default(0),
    bountyMultiplier: z.number().min(1).default(1),
    wicFinal: z.number().min(0),
    wicLevel: z.string().optional(),
    bountyBonus: z.number().min(0).default(0),
    includedReason: z.string().optional(),
    excludedReason: z.string().optional(),
  })),
})

export type ImportWicRunInput = z.infer<typeof importWicRunSchema>

// ── Tier Downgrade ─────────────────────────────────────────

export const downgradeTierSchema = z.object({
  partnerAgencyId: uuid(),
  newTierKey: z.string().trim().min(1).max(50),
  reason: z.string().trim().min(1).max(500),
})

export type DowngradeTierInput = z.infer<typeof downgradeTierSchema>

// ── List query schemas (for makeCrudRoute) ──────────────────

export const agencyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  search: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const tierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  includeInactive: z.coerce.boolean().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const tierHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
})

export const licenseDealListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.enum(['open', 'won', 'lost']).optional(),
  dealType: z.enum(['enterprise', 'standard']).optional(),
  year: z.coerce.number().int().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const licenseDealMinQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  year: z.coerce.number().int().optional(),
})
