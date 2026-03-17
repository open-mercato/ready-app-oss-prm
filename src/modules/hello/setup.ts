import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['hello.*'],
    admin: ['hello.*'],
    employee: ['hello.view'],
  },
}

export default setup
