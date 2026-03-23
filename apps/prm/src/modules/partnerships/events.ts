import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'partnerships.agency.created', label: 'Agency Created', entity: 'agency', category: 'lifecycle' },
  { id: 'partnerships.agency.tier_changed', label: 'Agency Tier Changed', entity: 'tier_assignment', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'partnerships', events })
export default eventsConfig
