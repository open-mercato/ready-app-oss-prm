import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const WipCountWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.wip-count',
    title: 'WIP This Month',
    description: 'Shows the count of Work In Progress deals for the current month.',
    features: ['dashboards.view', 'partnerships.widgets.wip-count'],
    defaultSize: 'sm',
    defaultEnabled: true,
    tags: ['partnerships', 'kpi'],
    category: 'partnerships',
    icon: 'trending-up',
    supportsRefresh: true,
  },
  Widget: WipCountWidget,
}

export default widget
