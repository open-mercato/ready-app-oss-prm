export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.tier.manage'],
  visible: (ctx: { auth?: { orgId?: string | null; homeOrgId?: string | null } }) =>
    !ctx.auth?.homeOrgId || ctx.auth?.orgId === ctx.auth?.homeOrgId,
  pageTitle: 'Tier Review',
  pageTitleKey: 'partnerships.tierReview.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 120,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'Tier Review', labelKey: 'partnerships.tierReview.title' },
  ],
}
