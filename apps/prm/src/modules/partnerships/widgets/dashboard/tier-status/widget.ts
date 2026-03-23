import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const TierStatusWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.tier-status',
    title: 'Tier Status',
    description: 'Shows current tier and KPI progress.',
    features: ['dashboards.view', 'partnerships.widgets.tier-status'],
    defaultSize: 'md',
    defaultEnabled: true,
    tags: ['partnerships', 'kpi', 'tier'],
    category: 'partnerships',
    icon: 'shield',
    supportsRefresh: true,
  },
  Widget: TierStatusWidget,
}

export default widget
