export const metadata = {
  requireAuth: true,
  requireFeatures: ['auth.users.list'],
  pageTitle: 'Users',
  pageTitleKey: 'partnerships.users.title',
  pageGroup: 'Settings',
  pageGroupKey: 'backend.nav.settings',
  pagePriority: 10,
  pageOrder: 125,
  breadcrumb: [
    { label: 'Settings', labelKey: 'backend.nav.settings' },
    { label: 'Users', labelKey: 'partnerships.users.title' },
  ],
}
