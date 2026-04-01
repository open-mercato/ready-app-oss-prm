import { createModuleEvents } from '@open-mercato/shared/modules/events'

const events = [
  { id: 'partnerships.agency.created', label: 'Agency Created', entity: 'agency', category: 'lifecycle' },
  { id: 'partnerships.agency.tier_changed', label: 'Agency Tier Changed', entity: 'tier_assignment', category: 'lifecycle' },
  { id: 'partnerships.rfp_campaign.published', label: 'RFP Campaign Published', entity: 'rfp_campaign', category: 'lifecycle' },
  { id: 'partnerships.rfp_campaign.awarded', label: 'RFP Campaign Awarded', entity: 'rfp_campaign', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'partnerships', events })
export default eventsConfig
