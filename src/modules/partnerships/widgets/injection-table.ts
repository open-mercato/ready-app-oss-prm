import type { ModuleInjectionTable } from '@open-mercato/shared/modules/widgets/injection'

// Dashboard widgets are NOT registered here — they are controlled by
// DashboardRoleWidgets records seeded in setup.ts. Registering them
// here would bypass role-based filtering and show all widgets to all users.

const injectionTable: ModuleInjectionTable = {}

export { injectionTable }
export default injectionTable
