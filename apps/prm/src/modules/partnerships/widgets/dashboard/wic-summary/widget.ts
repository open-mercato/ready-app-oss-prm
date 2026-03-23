import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const WicSummaryWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.wic-summary',
    title: 'WIC Score',
    description: 'Shows the total WIC score for the current month.',
    features: ['dashboards.view', 'partnerships.widgets.wic-summary'],
    defaultSize: 'sm',
    defaultEnabled: true,
    tags: ['partnerships', 'kpi'],
    category: 'partnerships',
    icon: 'code',
    supportsRefresh: true,
  },
  Widget: WicSummaryWidget,
}

export default widget
