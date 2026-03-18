import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { PartnerMetricSnapshot, PartnerWicRun, PartnerWicContributionUnit } from '../data/entities'
import { ingestMetricSnapshotSchema, importWicRunSchema } from '../data/validators'
import { emitPartnershipEvent } from '../events'

const ingestMetricCommand: CommandHandler<Record<string, unknown>, PartnerMetricSnapshot> = {
  id: 'partnerships.partner_metric.ingest',
  isUndoable: false,

  async execute(rawInput, ctx) {
    const parsed = ingestMetricSnapshotSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId
    if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

    // WIP cannot be imported manually — CRM-derived only
    if (parsed.metricKey === 'wip' && parsed.source !== 'crm') {
      throw new CrudHttpError(400, { error: 'WIP metrics are CRM-derived only and cannot be manually imported' })
    }

    // Upsert: unique on (tenant, org, agency, metric, periodStart, periodEnd)
    const existing = await em.findOne(PartnerMetricSnapshot, {
      tenantId, organizationId,
      partnerAgencyId: parsed.partnerAgencyId,
      metricKey: parsed.metricKey,
      periodStart: new Date(parsed.periodStart),
      periodEnd: new Date(parsed.periodEnd),
    })

    if (existing) {
      existing.value = parsed.value
      existing.source = parsed.source
      await em.flush()
      emitPartnershipEvent('partnerships.partner_metric.snapshot_recorded', { snapshotId: existing.id, metricKey: parsed.metricKey, tenantId, organizationId }, ctx)
      return existing
    }

    const snapshot = em.create(PartnerMetricSnapshot, {
      tenantId, organizationId,
      partnerAgencyId: parsed.partnerAgencyId,
      metricKey: parsed.metricKey,
      periodStart: new Date(parsed.periodStart),
      periodEnd: new Date(parsed.periodEnd),
      value: parsed.value,
      source: parsed.source,
    })
    em.persist(snapshot)
    await em.flush()
    emitPartnershipEvent('partnerships.partner_metric.snapshot_recorded', { snapshotId: snapshot.id, metricKey: parsed.metricKey, tenantId, organizationId }, ctx)
    return snapshot
  },

  async buildLog({ result }) {
    return {
      actionLabel: `Metric ingested: ${result.metricKey}`,
      resourceKind: 'partnerships.partner_metric_snapshot',
      resourceId: String(result.id),
    }
  },
}

const importWicRunCommand: CommandHandler<Record<string, unknown>, PartnerWicRun> = {
  id: 'partnerships.partner_wic_run.import',
  isUndoable: false,

  async execute(rawInput, ctx) {
    const parsed = importWicRunSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as any
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.selectedOrganizationId
    const userId = ctx.auth?.userId
    if (!tenantId || !organizationId) throw new CrudHttpError(403, { error: 'Missing context' })

    // Create WIC run record
    const run = em.create(PartnerWicRun, {
      tenantId, organizationId,
      runDate: new Date(),
      periodStart: new Date(parsed.periodStart),
      periodEnd: new Date(parsed.periodEnd),
      scriptVersion: parsed.scriptVersion,
      status: 'completed' as const,
      rawOutput: parsed.rawOutput,
      importedByUserId: userId ?? null,
    })
    em.persist(run)
    await em.flush()

    // Create contribution units
    for (const unit of parsed.units) {
      const contributionUnit = em.create(PartnerWicContributionUnit, {
        tenantId, organizationId,
        wicRunId: run.id,
        partnerAgencyId: null, // Mapped later by GH profile → agency
        ghProfile: unit.ghProfile,
        monthKey: unit.monthKey,
        featureKey: unit.featureKey ?? null,
        baseScore: unit.baseScore,
        impactBonus: unit.impactBonus,
        bountyMultiplier: unit.bountyMultiplier,
        wicFinal: unit.wicFinal,
        wicLevel: unit.wicLevel ?? null,
        bountyBonus: unit.bountyBonus,
        includedReason: unit.includedReason ?? null,
        excludedReason: unit.excludedReason ?? null,
      })
      em.persist(contributionUnit)
    }
    await em.flush()

    return run
  },

  async buildLog({ result }) {
    return {
      actionLabel: 'WIC run imported',
      resourceKind: 'partnerships.partner_wic_run',
      resourceId: String(result.id),
    }
  },
}

registerCommand(ingestMetricCommand)
registerCommand(importWicRunCommand)

export { ingestMetricCommand, importWicRunCommand }
