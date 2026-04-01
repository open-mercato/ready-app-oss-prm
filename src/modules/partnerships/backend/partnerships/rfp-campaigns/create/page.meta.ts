export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.rfp.manage'],
  pageTitle: 'Create RFP Campaign',
  pageTitleKey: 'partnerships.rfpCampaigns.createTitle',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 151,
  navHidden: true,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'RFP Campaigns', labelKey: 'partnerships.rfpCampaigns.title' },
    { label: 'Create RFP Campaign', labelKey: 'partnerships.rfpCampaigns.createTitle' },
  ],
}
