export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.agency-profile.manage'],
  pageTitle: 'Agency Profile',
  pageTitleKey: 'partnerships.agencyProfile.title',
  pageGroup: 'Settings',
  pageGroupKey: 'backend.nav.settings',
  pagePriority: 10,
  pageOrder: 115,
  breadcrumb: [
    { label: 'Settings', labelKey: 'backend.nav.settings' },
    { label: 'Agency Profile', labelKey: 'partnerships.agencyProfile.title' },
  ],
}
