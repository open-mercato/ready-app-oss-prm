import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const CrossOrgWipWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.cross-org-wip',
    title: 'Agency Pipeline Activity',
    description: 'Cross-organization WIP table showing agency pipeline activity.',
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
