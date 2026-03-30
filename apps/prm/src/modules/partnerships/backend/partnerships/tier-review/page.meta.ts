export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.tier.manage'],
  showInSidebar: false,
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
