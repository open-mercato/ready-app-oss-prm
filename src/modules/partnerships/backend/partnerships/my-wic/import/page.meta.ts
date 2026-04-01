export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.wic.manage'],
  pageTitle: 'Import WIC Scores',
  pageTitleKey: 'partnerships.wicImport.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 131,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'WIC Scores', labelKey: 'partnerships.myWic.title', href: '/backend/partnerships/my-wic' },
    { label: 'Import WIC Scores', labelKey: 'partnerships.wicImport.title' },
  ],
}
