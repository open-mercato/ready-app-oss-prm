import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const TierExpiryBannerWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.tier-expiry-banner',
    title: 'Tier Review Notice',
    description: 'Shows a banner when the tier review date is approaching or overdue.',
    features: ['dashboards.view', 'partnerships.widgets.tier-expiry-banner'],
    defaultSize: 'lg',
    defaultEnabled: true,
    tags: ['partnerships', 'tier', 'notification'],
    category: 'partnerships',
    icon: 'bell',
    supportsRefresh: true,
  },
  Widget: TierExpiryBannerWidget,
}

export default widget
