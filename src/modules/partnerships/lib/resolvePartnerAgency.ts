import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerAgency } from '../data/entities'

export interface PartnerAgencyContext {
  agency: PartnerAgency
  agencyOrganizationId: string
}

export async function resolvePartnerAgency(
  em: EntityManager,
  customerEntityId: string | null | undefined,
  tenantId: string,
  organizationId: string,
): Promise<PartnerAgencyContext | null> {
  if (!customerEntityId) return null

  const agency = await em.findOne(PartnerAgency, {
    tenantId,
    organizationId,
    agencyOrganizationId: customerEntityId,
    deletedAt: null,
  })

  if (!agency) return null

  return { agency, agencyOrganizationId: agency.agencyOrganizationId }
}
