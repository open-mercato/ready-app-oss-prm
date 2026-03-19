import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import './commands/agencies'
import './commands/tiers'
import './commands/metrics'
import './commands/license-deals'
import './commands/rfp'

export function register(_container: AppContainer) {
  // Commands are registered via side effects of the imports above.
  // Phase 1c+: register tier lifecycle and KPI computation DI services here.
}
