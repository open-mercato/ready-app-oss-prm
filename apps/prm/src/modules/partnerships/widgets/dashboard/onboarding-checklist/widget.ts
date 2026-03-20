import { lazyDashboardWidget, type DashboardWidgetModule } from '@open-mercato/shared/modules/dashboard/widgets'

const OnboardingChecklistWidget = lazyDashboardWidget(() => import('./widget.client'))

const widget: DashboardWidgetModule = {
  metadata: {
    id: 'partnerships.dashboard.onboarding-checklist',
    title: 'Getting Started',
    description: 'Onboarding checklist for new agency members.',
    features: ['dashboards.view', 'partnerships.widgets.onboarding-checklist'],
    defaultSize: 'md',
    defaultEnabled: true,
    tags: ['partnerships', 'onboarding'],
    category: 'partnerships',
    icon: 'check-circle',
    supportsRefresh: true,
  },
  Widget: OnboardingChecklistWidget,
}

export default widget
