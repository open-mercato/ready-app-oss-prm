import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

export const injectionTable: ModuleInjectionTable = {
  'menu:portal:sidebar:main': {
    widgetId: 'partnerships.injection.portal-nav',
    priority: 100,
  },
}

export default injectionTable
