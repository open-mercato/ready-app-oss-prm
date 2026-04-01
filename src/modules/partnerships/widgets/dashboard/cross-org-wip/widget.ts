import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const CrossOrgWipWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.cross-org-wip',
    title: 'Agency Pipeline Activity',
    description: 'Cross-organization summary table showing WIP, WIC, and MIN per agency with month switcher.',
    features: ['dashboards.view', 'partnerships.widgets.cross-org-wip'],
    defaultSize: 'lg',
    defaultEnabled: true,
    tags: ['partnerships', 'management'],
    category: 'partnerships',
    icon: 'bar-chart-2',
    supportsRefresh: true,
  },
  Widget: CrossOrgWipWidget,
}

export default widget
