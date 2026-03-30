import { z } from 'zod'
import { WIC_LEVEL_OPTIONS, WIC_SOURCE_OPTIONS } from './custom-fields'
import { TIER_THRESHOLDS } from './tier-thresholds'

const TIER_NAMES = TIER_THRESHOLDS.map((t) => t.tier) as [string, ...string[]]

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/

export const wicScoringResultSchema = z.object({
  contributorGithubUsername: z.string().min(1, 'GitHub username is required'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  wicScore: z.number().nonnegative('WIC score must be non-negative'),
  level: z.enum(WIC_LEVEL_OPTIONS),
  impactBonus: z.number().nonnegative('Impact bonus must be non-negative'),
  bountyBonus: z.number().nonnegative('Bounty bonus must be non-negative'),
  whyBonus: z.string(),
  included: z.string(),
  excluded: z.string(),
  scriptVersion: z.string().min(1, 'Script version is required'),
})

export type WicScoringResult = z.infer<typeof wicScoringResultSchema>

export const wicImportRequestSchema = z.object({
  organizationId: z.string().uuid('organizationId must be a valid UUID'),
  month: z.string().regex(MONTH_REGEX, 'month must be in YYYY-MM format'),
  source: z.enum(WIC_SOURCE_OPTIONS),
  records: z.array(wicScoringResultSchema).min(1, 'At least one record is required').max(500, 'Maximum 500 records per batch'),
})

export type WicImportRequest = z.infer<typeof wicImportRequestSchema>

// ---------------------------------------------------------------------------
// Partner License Deal
// ---------------------------------------------------------------------------

export const createAgencySchema = z.object({
  agencyName: z.string().min(1).max(200),
  adminEmail: z.string().email(),
  seedDemoData: z.boolean().default(true),
  initialTier: z.enum(TIER_NAMES).default('OM Agency'),
})

export type CreateAgencyInput = z.infer<typeof createAgencySchema>

export const partnerLicenseDealCreateSchema = z.object({
  organizationId: z.string().uuid(),
  companyId: z.string().uuid(),
  licenseIdentifier: z.string().min(1, 'License identifier is required'),
  industryTag: z.string().min(1, 'Industry tag is required'),
  type: z.string().default('enterprise'),
  status: z.string().default('won'),
  isRenewal: z.boolean().default(false),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  closedAt: z.coerce.date(),
  year: z.number().int(),
  tenantId: z.string().uuid(),
  createdBy: z.string().uuid(),
})

export type PartnerLicenseDealCreateInput = z.infer<typeof partnerLicenseDealCreateSchema>

export const partnerLicenseDealUpdateSchema = z.object({
  id: z.string().uuid(),
  licenseIdentifier: z.string().min(1).optional(),
  industryTag: z.string().min(1).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  isRenewal: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  closedAt: z.coerce.date().optional(),
})

// ---------------------------------------------------------------------------
// RFP Campaign
// ---------------------------------------------------------------------------

export const rfpCampaignCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required'),
  deadline: z.coerce.date(),
  audience: z.enum(['all', 'selected']).default('all'),
  selectedAgencyIds: z.array(z.string().uuid()).optional(),
})

export type RfpCampaignCreateInput = z.infer<typeof rfpCampaignCreateSchema>

export const rfpCampaignUpdateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  deadline: z.coerce.date().optional(),
  audience: z.enum(['all', 'selected']).optional(),
  selectedAgencyIds: z.array(z.string().uuid()).optional(),
})

// ---------------------------------------------------------------------------
// RFP Settings (message templates)
// ---------------------------------------------------------------------------

export const rfpSettingsUpdateSchema = z.object({
  campaignTemplate: z.string().min(1, 'Campaign template is required'),
  awardTemplate: z.string().min(1, 'Award template is required'),
  rejectionTemplate: z.string().min(1, 'Rejection template is required'),
})

export type RfpSettingsUpdateInput = z.infer<typeof rfpSettingsUpdateSchema>

// ---------------------------------------------------------------------------
// RFP Response
// ---------------------------------------------------------------------------

export const rfpResponseCreateSchema = z.object({
  campaignId: z.string().uuid(),
  responseText: z.string().min(1, 'Response text is required'),
})

export type RfpResponseCreateInput = z.infer<typeof rfpResponseCreateSchema>

export const rfpResponseUpdateSchema = z.object({
  campaignId: z.string().uuid(),
  responseText: z.string().min(1, 'Response text is required'),
})
