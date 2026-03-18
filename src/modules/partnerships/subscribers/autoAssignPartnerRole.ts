import type { EntityManager } from '@mikro-orm/postgresql'
import { PartnerAgency } from '../data/entities'

export const metadata = {
  event: 'customer_accounts.user.updated',
  persistent: true,
  id: 'partnerships:auto-assign-partner-role',
}

export default async function handle(
  payload: unknown,
  ctx: { resolve: <T>(name: string) => T },
): Promise<void> {
  const data = payload as {
    id?: string
    tenantId?: string
    organizationId?: string
    customerEntityId?: string | null
  }

  if (!data.id || !data.tenantId || !data.organizationId || !data.customerEntityId) return

  const em = ctx.resolve<EntityManager>('em')

  const agency = await em.findOne(PartnerAgency, {
    tenantId: data.tenantId,
    organizationId: data.organizationId,
    agencyOrganizationId: data.customerEntityId,
    deletedAt: null,
  })
  if (!agency) return

  const { CustomerUser, CustomerRole, CustomerUserRole } = await import(
    '@open-mercato/core/modules/customer_accounts/data/entities'
  )

  const user = await em.findOne(CustomerUser, { id: data.id, deletedAt: null })
  if (!user) return

  const existingRoles = await em.find(CustomerUserRole, {
    user: { id: user.id },
    role: { slug: { $in: ['partner_admin', 'partner_member', 'partner_viewer'] } },
  })
  if (existingRoles.length > 0) return

  const partnerMemberRole = await em.findOne(CustomerRole, {
    tenantId: data.tenantId,
    organizationId: data.organizationId,
    slug: 'partner_member',
    deletedAt: null,
  })
  if (!partnerMemberRole) return

  const assignment = em.create(CustomerUserRole, {
    user,
    role: partnerMemberRole,
    createdAt: new Date(),
  })
  em.persist(assignment)
  await em.flush()
}
