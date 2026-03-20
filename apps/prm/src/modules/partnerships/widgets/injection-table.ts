import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

const injectionTable: ModuleInjectionTable = {
  'dashboard:widgets': [
    {
      widgetId: 'partnerships.dashboard.wip-count',
      priority: 10,
    },
    {
      widgetId: 'partnerships.dashboard.onboarding-checklist',
      priority: 20,
    },
  ],
}

export default injectionTable
