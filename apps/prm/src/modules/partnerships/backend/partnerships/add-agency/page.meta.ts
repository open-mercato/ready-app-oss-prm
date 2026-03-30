export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.agencies.manage'],
  showInSidebar: false,
  pageTitle: 'Add Agency',
  pageTitleKey: 'partnerships.addAgency.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 100,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'Add Agency', labelKey: 'partnerships.addAgency.title' },
  ],
}
