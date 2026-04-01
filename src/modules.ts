// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
//
// Only modules used by PRM are registered (per App Spec §4.5).
// This is an example app distributed via create-mercato-app --example prm.

export type ModuleEntry = { id: string; from?: '@open-mercato/core' | '@app' | string }

export const enabledModules: ModuleEntry[] = [
  // --- Platform infrastructure ---
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'perspectives', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'api_docs', from: '@open-mercato/core' },
  { id: 'business_rules', from: '@open-mercato/core' },
  { id: 'feature_toggles', from: '@open-mercato/core' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'messages', from: '@open-mercato/core' },
  { id: 'translations', from: '@open-mercato/core' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'scheduler', from: '@open-mercato/scheduler' },

  // --- OM core modules used by PRM (App Spec §4.5) ---
  { id: 'customers', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'dictionaries', from: '@open-mercato/core' },
  { id: 'workflows', from: '@open-mercato/core' },

  // --- App module ---
  { id: 'partnerships', from: '@app' },
]
