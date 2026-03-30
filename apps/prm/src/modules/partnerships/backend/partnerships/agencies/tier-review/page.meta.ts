export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.tier.manage'],
  pageTitle: 'Tier Review',
  pageTitleKey: 'partnerships.tierReview.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 112,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'Agencies', labelKey: 'partnerships.agencies.title', href: '/backend/partnerships/agencies' },
    { label: 'Tier Review', labelKey: 'partnerships.tierReview.title' },
  ],
}
