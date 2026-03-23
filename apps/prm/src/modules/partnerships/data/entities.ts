import { Entity, PrimaryKey, Property, Index, Unique, OptionalProps } from '@mikro-orm/core'

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
