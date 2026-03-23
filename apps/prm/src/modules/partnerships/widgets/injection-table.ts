import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

const injectionTable: ModuleInjectionTable = {
  'dashboard:widgets': [
    {
      widgetId: 'partnerships.dashboard.cross-org-wip',
      priority: 5,
    },
    {
      widgetId: 'partnerships.dashboard.onboarding-checklist',
      priority: 10,
    },
    {
      widgetId: 'partnerships.dashboard.wip-count',
      priority: 20,
    },
    {
      widgetId: 'partnerships.dashboard.wic-summary',
      priority: 25,
    },
    {
      widgetId: 'partnerships.dashboard.tier-status',
      priority: 20,
    },
  ],
}

export { injectionTable }
export default injectionTable
