export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.agencies.manage'],
  pageTitle: 'Add Agency',
  pageTitleKey: 'partnerships.addAgency.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 111,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'Agencies', labelKey: 'partnerships.agencies.title', href: '/backend/partnerships/agencies' },
    { label: 'Add Agency', labelKey: 'partnerships.addAgency.title' },
  ],
}
