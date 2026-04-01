export const metadata = {
  requireAuth: true,
  requireFeatures: ['partnerships.rfp.view'],
  pageTitle: 'RFP Campaign',
  pageTitleKey: 'partnerships.rfpCampaigns.detailTitle',
  pageGroup: 'Partnerships',
  pageGroupKey: 'partnerships.nav.group',
  pagePriority: 10,
  pageOrder: 152,
  navHidden: true,
  breadcrumb: [
    { label: 'Partnerships', labelKey: 'partnerships.nav.group' },
    { label: 'RFP Campaigns', labelKey: 'partnerships.rfpCampaigns.title' },
    { label: 'Campaign Detail', labelKey: 'partnerships.rfpCampaigns.detailTitle' },
  ],
}
