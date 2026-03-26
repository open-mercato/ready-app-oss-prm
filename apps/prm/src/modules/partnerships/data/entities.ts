import { Entity, PrimaryKey, Property, Index, Unique, OptionalProps } from '@mikro-orm/core'

// ---------------------------------------------------------------------------
// TierEvaluationState — monthly evaluation snapshot per agency
// ---------------------------------------------------------------------------

@Entity({ tableName: 'tier_evaluation_states' })
@Unique({ name: 'tes_org_month_unique', properties: ['organizationId', 'evaluationMonth', 'tenantId'] })
export class TierEvaluationState {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'gracePeriodStartedAt' | 'status'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'current_tier', type: 'text' })
  currentTier!: string

  @Property({ name: 'evaluation_month', type: 'text' })
  evaluationMonth!: string // YYYY-MM

  @Property({ name: 'grace_period_started_at', type: Date, nullable: true })
  gracePeriodStartedAt?: Date | null

  @Property({ type: 'text', default: 'OK' })
  status: string = 'OK' // OK | GracePeriod | ProposedDowngrade

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// ---------------------------------------------------------------------------
// TierChangeProposal — upgrade/downgrade proposal awaiting PM approval
// ---------------------------------------------------------------------------

@Entity({ tableName: 'tier_change_proposals' })
@Index({ name: 'tcp_org_month_idx', properties: ['organizationId', 'evaluationMonth'] })
export class TierChangeProposal {
  [OptionalProps]?: 'createdAt' | 'status' | 'rejectionReason' | 'resolvedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'evaluation_month', type: 'text' })
  evaluationMonth!: string

  @Property({ name: 'current_tier', type: 'text' })
  currentTier!: string

  @Property({ name: 'proposed_tier', type: 'text' })
  proposedTier!: string

  @Property({ type: 'text' })
  type!: string // upgrade | downgrade

  @Property({ type: 'text', default: 'PendingApproval' })
  status: string = 'PendingApproval' // Draft | PendingApproval | Approved | Rejected

  @Property({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null

  @Property({ name: 'wic_snapshot', type: 'float' })
  wicSnapshot!: number

  @Property({ name: 'wip_snapshot', type: 'integer' })
  wipSnapshot!: number

  @Property({ name: 'min_snapshot', type: 'integer' })
  minSnapshot!: number

  @Property({ name: 'resolved_at', type: Date, nullable: true })
  resolvedAt?: Date | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ---------------------------------------------------------------------------
// TierAssignment — immutable record of a tier change
// ---------------------------------------------------------------------------

@Entity({ tableName: 'tier_assignments' })
@Index({ name: 'ta_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class TierAssignment {
  [OptionalProps]?: 'createdAt' | 'reason'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ type: 'text' })
  tier!: string

  @Property({ name: 'effective_date', type: Date })
  effectiveDate!: Date

  @Property({ name: 'approved_by', type: 'uuid' })
  approvedBy!: string

  @Property({ type: 'text', nullable: true })
  reason?: string | null

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

@Entity({ tableName: 'partner_license_deals' })
@Unique({ name: 'pld_license_year_unique', properties: ['licenseIdentifier', 'year'] })
@Index({ name: 'pld_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class PartnerLicenseDeal {
  [OptionalProps]?: 'createdAt' | 'type' | 'status' | 'isRenewal'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'company_id', type: 'uuid' })
  companyId!: string

  @Property({ name: 'license_identifier', type: 'text' })
  licenseIdentifier!: string

  @Property({ name: 'industry_tag', type: 'text' })
  industryTag!: string

  @Property({ type: 'text', default: 'enterprise' })
  type: string = 'enterprise'

  @Property({ type: 'text', default: 'won' })
  status: string = 'won'

  @Property({ name: 'is_renewal', type: 'boolean', default: false })
  isRenewal: boolean = false

  @Property({ name: 'closed_at', type: Date })
  closedAt!: Date

  @Property({ type: 'integer' })
  year!: number

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ---------------------------------------------------------------------------
// PartnerRfpCampaign — RFP campaign created by PM
// ---------------------------------------------------------------------------

@Entity({ tableName: 'partner_rfp_campaigns' })
@Index({ name: 'rfp_camp_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class PartnerRfpCampaign {
  [OptionalProps]?: 'createdAt' | 'status' | 'audience'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ type: 'text' })
  title!: string

  @Property({ type: 'text' })
  description!: string

  @Property({ type: Date })
  deadline!: Date

  @Property({ type: 'text', default: 'all' })
  audience: string = 'all'

  @Property({ name: 'selected_agency_ids', type: 'jsonb', nullable: true })
  selectedAgencyIds?: string[] | null

  @Property({ type: 'text', default: 'draft' })
  status: string = 'draft'

  @Property({ name: 'winner_organization_id', type: 'uuid', nullable: true })
  winnerOrganizationId?: string | null

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_by', type: 'uuid' })
  createdBy!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()
}

// ---------------------------------------------------------------------------
// RfpSettings — per-tenant message templates for RFP notifications
// ---------------------------------------------------------------------------

@Entity({ tableName: 'rfp_settings' })
@Unique({ name: 'rfp_settings_tenant_idx', properties: ['tenantId'] })
export class RfpSettings {
  [OptionalProps]?: 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'campaign_template', type: 'text' })
  campaignTemplate!: string

  @Property({ name: 'award_template', type: 'text' })
  awardTemplate!: string

  @Property({ name: 'rejection_template', type: 'text' })
  rejectionTemplate!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date(), onCreate: () => new Date() })
  updatedAt: Date = new Date()
}

// ---------------------------------------------------------------------------
// PartnerRfpResponse — agency response to an RFP campaign
// ---------------------------------------------------------------------------

@Entity({ tableName: 'partner_rfp_responses' })
@Unique({ name: 'rfp_resp_camp_org_idx', properties: ['campaignId', 'organizationId'] })
@Index({ name: 'rfp_resp_tenant_idx', properties: ['tenantId'] })
export class PartnerRfpResponse {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'campaign_id', type: 'uuid' })
  campaignId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'response_text', type: 'text' })
  responseText!: string

  @Property({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date(), onCreate: () => new Date() })
  updatedAt: Date = new Date()
}
