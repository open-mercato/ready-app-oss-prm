export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.rfp.manage'],
  pageTitle: 'RFP Message Templates',
  pageTitleKey: 'partnerships.rfpSettings.title',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 151,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'RFP Campaigns', labelKey: 'partnerships.rfpCampaigns.title', href: '/backend/partnerships/rfp-campaigns' },
    { label: 'Message Templates', labelKey: 'partnerships.rfpSettings.title' },
  ],
}
