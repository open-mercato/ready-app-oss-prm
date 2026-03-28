import {
  parseMonthBoundaries,
  formatMonthUtc,
  countWipDeals,
  querySchema,
  type WipCountContext,
} from '../wip-count'
import { CustomFieldValue } from '@open-mercato/core/modules/entities/data/entities'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CountCall = { entity: unknown; filter: Record<string, unknown> }

function createMockEm(countResult: number = 0) {
  const countCalls: CountCall[] = []

  const em = {
    countCalls,
    count(entity: unknown, filter: Record<string, unknown>) {
      countCalls.push({ entity, filter })
      return Promise.resolve(countResult)
    },
  }

  return { em: em as unknown as WipCountContext['em'], countCalls }
}

const TENANT_ID = 'tenant-001'
const ORG_ID = 'org-001'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wip-count', () => {
  // -------------------------------------------------------------------------
  // querySchema validation
  // -------------------------------------------------------------------------

  describe('querySchema', () => {
    it('accepts a valid YYYY-MM month', () => {
      const result = querySchema.safeParse({ month: '2026-03' })
      expect(result.success).toBe(true)
    })

    it('rejects invalid month format', () => {
      const cases = ['2026-3', '26-03', '2026/03', 'March', '2026-13', '']
      for (const bad of cases) {
        const result = querySchema.safeParse({ month: bad })
        expect(result.success).toBe(false)
      }
    })

    it('accepts missing month (optional)', () => {
      const result = querySchema.safeParse({})
      expect(result.success).toBe(true)
      expect(result.data?.month).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // parseMonthBoundaries
  // -------------------------------------------------------------------------

  describe('parseMonthBoundaries', () => {
    it('returns correct UTC start and end for 2026-03', () => {
      const { start, end } = parseMonthBoundaries('2026-03')
      expect(start.toISOString()).toBe('2026-03-01T00:00:00.000Z')
      expect(end.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    })

    it('correctly handles December (month rollover)', () => {
      const { start, end } = parseMonthBoundaries('2025-12')
      expect(start.toISOString()).toBe('2025-12-01T00:00:00.000Z')
      expect(end.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    })

    it('correctly handles January', () => {
      const { start, end } = parseMonthBoundaries('2026-01')
      expect(start.toISOString()).toBe('2026-01-01T00:00:00.000Z')
      expect(end.toISOString()).toBe('2026-02-01T00:00:00.000Z')
    })
  })

  // -------------------------------------------------------------------------
  // formatMonthUtc
  // -------------------------------------------------------------------------

  describe('formatMonthUtc', () => {
    it('formats a UTC date to YYYY-MM', () => {
      const date = new Date('2026-03-15T12:30:00.000Z')
      expect(formatMonthUtc(date)).toBe('2026-03')
    })

    it('pads single-digit months with a leading zero', () => {
      const date = new Date('2026-01-01T00:00:00.000Z')
      expect(formatMonthUtc(date)).toBe('2026-01')
    })
  })

  // -------------------------------------------------------------------------
  // countWipDeals — Test 1: returns count=0 when no deals have wip_registered_at
  // -------------------------------------------------------------------------

  describe('countWipDeals', () => {
    it('returns count=0 when no deals have wip_registered_at', async () => {
      const { em, countCalls } = createMockEm(0)
      const ctx: WipCountContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const { start, end } = parseMonthBoundaries('2026-03')

      const count = await countWipDeals(ctx, start, end)

      expect(count).toBe(0)
      expect(countCalls).toHaveLength(1)
      const call = countCalls[0]
      expect(call.entity).toBe(CustomFieldValue)
    })

    // -----------------------------------------------------------------------
    // Test 2: returns correct count scoped to organization
    // -----------------------------------------------------------------------

    it('returns correct count scoped to organization', async () => {
      const { em, countCalls } = createMockEm(5)
      const ctx: WipCountContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const { start, end } = parseMonthBoundaries('2026-03')

      const count = await countWipDeals(ctx, start, end)

      expect(count).toBe(5)
      const filter = countCalls[0].filter as Record<string, unknown>
      expect(filter.tenantId).toBe(TENANT_ID)
      expect(filter.organizationId).toBe(ORG_ID)
      expect(filter.entityId).toBe('customers:customer_deal')
      expect(filter.fieldKey).toBe('wip_registered_at')
    })

    it('omits organizationId filter when organizationId is null', async () => {
      const { em, countCalls } = createMockEm(3)
      const ctx: WipCountContext = { em, tenantId: TENANT_ID, organizationId: null }
      const { start, end } = parseMonthBoundaries('2026-03')

      await countWipDeals(ctx, start, end)

      const filter = countCalls[0].filter as Record<string, unknown>
      expect('organizationId' in filter).toBe(false)
    })

    // -----------------------------------------------------------------------
    // Test 3: correctly filters by month boundaries (UTC)
    // -----------------------------------------------------------------------

    it('correctly filters by month boundaries (UTC)', async () => {
      const { em, countCalls } = createMockEm(2)
      const ctx: WipCountContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const { start, end } = parseMonthBoundaries('2026-03')

      await countWipDeals(ctx, start, end)

      const filter = countCalls[0].filter as Record<string, unknown>
      const valueTextFilter = filter.valueText as Record<string, string>
      expect(valueTextFilter.$gte).toBe('2026-03-01T00:00:00.000Z')
      expect(valueTextFilter.$lt).toBe('2026-04-01T00:00:00.000Z')
      expect(filter.deletedAt).toBeNull()
    })

    it('excludes values before the month start boundary', async () => {
      // Verify that February timestamps would NOT be included in a March query.
      // We test this by checking the $gte boundary is the first of March.
      const { em, countCalls } = createMockEm(0)
      const ctx: WipCountContext = { em, tenantId: TENANT_ID, organizationId: ORG_ID }
      const { start, end } = parseMonthBoundaries('2026-03')

      await countWipDeals(ctx, start, end)

      const filter = countCalls[0].filter as Record<string, unknown>
      const vt = filter.valueText as Record<string, string>
      // A value at '2026-02-28T23:59:59.999Z' < $gte boundary → excluded
      expect(new Date('2026-02-28T23:59:59.999Z') < new Date(vt.$gte)).toBe(true)
      // A value at '2026-04-01T00:00:00.000Z' >= $lt boundary → excluded
      expect(new Date('2026-04-01T00:00:00.000Z') >= new Date(vt.$lt)).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Test 4: rejects invalid month format with 400
  // (tested via querySchema — the route handler uses this schema)
  // -------------------------------------------------------------------------

  describe('month validation (querySchema — mirrors route 400 behaviour)', () => {
    it('rejects invalid month format with a validation error', () => {
      const badValues = ['2026-3', '26-03', '2026/03', 'March', '2026-00', '2026-13', 'not-a-month']
      for (const bad of badValues) {
        const result = querySchema.safeParse({ month: bad })
        expect(result.success).toBe(false)
        if (!result.success) {
          // Zod v4 uses .issues; fall back to .errors for compatibility
          const issues: Array<{ message: string }> =
            (result.error as unknown as { issues?: Array<{ message: string }> }).issues ??
            (result.error as unknown as { errors?: Array<{ message: string }> }).errors ??
            []
          const hasYyyyMmMessage = issues.some((e) => e.message.includes('YYYY-MM'))
          expect(hasYyyyMmMessage).toBe(true)
        }
      }
    })
  })

  // -------------------------------------------------------------------------
  // Test 5: defaults to current month when month param omitted
  // -------------------------------------------------------------------------

  describe('formatMonthUtc (default month logic)', () => {
    it('defaults to current UTC month when month param is omitted', () => {
      // Simulate the handler logic: if month is undefined, use formatMonthUtc(new Date())
      const now = new Date()
      const defaultMonth = formatMonthUtc(now)

      // The result must match YYYY-MM format
      expect(defaultMonth).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)

      // The year must be the current UTC year
      expect(defaultMonth.startsWith(String(now.getUTCFullYear()))).toBe(true)

      // Verify boundaries computed from the default are valid
      const { start, end } = parseMonthBoundaries(defaultMonth)
      expect(end.getTime()).toBeGreaterThan(start.getTime())
    })
  })
})
