import type { ModuleInfo } from '@open-mercato/shared/modules/registry'
import './commands'

export const metadata: ModuleInfo = {
  name: 'partnerships',
  title: 'Partner Relationship Management',
  version: '0.1.0',
  description: 'B2B partner program management — agency onboarding, KPI tracking, tier governance, and lead distribution.',
  author: 'Open Mercato',
  license: 'Proprietary',
  ejectable: true,
}

export { features } from './acl'
