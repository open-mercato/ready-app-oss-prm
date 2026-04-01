import { expect, test } from '@playwright/test'
import { getAuthToken, apiRequest } from '@open-mercato/core/helpers/integration/api'
import { readJsonSafe, expectId, getTokenContext, deleteGeneralEntityIfExists } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createUserFixture, deleteUserIfExists } from '@open-mercato/core/helpers/integration/authFixtures'
import { createCompanyFixture, createDealFixture, deleteEntityIfExists } from '@open-mercato/core/helpers/integration/crmFixtures';

/**
 * TC-PRM-001: WIP Registered At Interceptor
 *
 * Verifies the partnerships.wip-stamp-guard and partnerships.wip-stamp-after
 * interceptors on PATCH /api/customers/deals:
 *
 * T1 — First move to SQL (order 3) stamps wip_registered_at
 * T2 — Moving back below SQL then to SQL again does NOT overwrite the stamp
 * T3 — Moving to Proposal (order 4, above SQL threshold) also stamps
 * T4 — Moving to Contacted (order 1, below SQL threshold) leaves field null
 * T5 — Sending wip_registered_at in custom fields body is silently stripped
 *
 * Source: apps/prm/src/modules/partnerships/api/interceptors.ts
 * Phase: 1, Commit: 2
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

const PRM_PIPELINE_NAME = 'PRM Pipeline';

/** Find the PRM Pipeline and return its id + stage map keyed by label. */
async function getPrmPipeline(
  request: Parameters<typeof apiRequest>[0],
  token: string,
): Promise<{ pipelineId: string; stageByLabel: Map<string, string> }> {
  const res = await apiRequest(request, 'GET', '/api/customers/pipelines', { token });
  expect(res.ok(), `GET /api/customers/pipelines failed: ${res.status()}`).toBeTruthy();
  const body = await readJsonSafe<{ items: JsonRecord[] }>(res);
  const items = body?.items ?? [];
  const pipeline = items.find((p) => p.name === PRM_PIPELINE_NAME) as JsonRecord | undefined;
  expect(pipeline, `PRM Pipeline not found — run seedDefaults first`).toBeTruthy();
  const pipelineId = pipeline!.id as string;

  const stagesRes = await apiRequest(
    request,
    'GET',
    `/api/customers/pipeline-stages?pipelineId=${encodeURIComponent(pipelineId)}`,
    { token },
  );
  expect(stagesRes.ok(), `GET pipeline-stages failed: ${stagesRes.status()}`).toBeTruthy();
  const stagesBody = await readJsonSafe<{ items: JsonRecord[] }>(stagesRes);
  const stages = stagesBody?.items ?? [];
  const stageByLabel = new Map<string, string>(
    stages.map((s) => [s.label as string, s.id as string]),
  );

  return { pipelineId, stageByLabel };
}

/** Create a throwaway company and return its id. */
async function createCompany(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  label: string,
): Promise<string> {
  const res = await apiRequest(request, 'POST', '/api/customers/companies', {
    token,
    data: { displayName: label },
  });
  expect(res.ok(), `POST /api/customers/companies failed: ${res.status()}`).toBeTruthy();
  const body = await readJsonSafe<JsonRecord>(res);
  return expectId(body?.id, 'company id missing from POST response');
}

/** Create a deal linked to a company, initially at the given stage. */
async function createDeal(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  input: { title: string; companyId: string; pipelineId: string; pipelineStageId: string },
): Promise<string> {
  const res = await apiRequest(request, 'POST', '/api/customers/deals', {
    token,
    data: {
      title: input.title,
      companyIds: [input.companyId],
      pipelineId: input.pipelineId,
      pipelineStageId: input.pipelineStageId,
    },
  });
  expect(res.ok(), `POST /api/customers/deals failed: ${res.status()}`).toBeTruthy();
  const body = await readJsonSafe<JsonRecord>(res);
  return expectId(body?.id, 'deal id missing from POST response');
}

/** Move a deal to a different pipeline stage via PUT. */
async function moveDealToStage(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  dealId: string,
  pipelineStageId: string,
  extra?: JsonRecord,
): Promise<void> {
  const res = await apiRequest(request, 'PUT', '/api/customers/deals', {
    token,
    data: { id: dealId, pipelineStageId, ...extra },
  });
  expect(res.ok(), `PUT /api/customers/deals (id=${dealId}) failed: ${res.status()}`).toBeTruthy();
}

/**
 * Read wip_registered_at for a deal via GET /api/customers/deals/[id].
 * Returns null if the field is absent or empty.
 */
async function readWipRegisteredAt(
  request: Parameters<typeof apiRequest>[0],
  token: string,
  dealId: string,
): Promise<string | null> {
  const res = await apiRequest(request, 'GET', `/api/customers/deals/${encodeURIComponent(dealId)}`, { token });
  expect(res.ok(), `GET /api/customers/deals/${dealId} failed: ${res.status()}`).toBeTruthy();
  // Response shape: { deal: {...}, people, companies, customFields, viewer }
  // customFields is at the top level, not nested inside deal
  const body = await readJsonSafe<{ deal: JsonRecord; customFields: JsonRecord }>(res);
  const customFields = body?.customFields as JsonRecord | undefined;
  const value = customFields?.cf_wip_registered_at ?? customFields?.wip_registered_at;
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

/** Delete a deal silently (for teardown). */
async function deleteDeal(
  request: Parameters<typeof apiRequest>[0],
  token: string | null,
  dealId: string | null,
): Promise<void> {
  if (!token || !dealId) return;
  await apiRequest(request, 'DELETE', `/api/customers/deals?id=${encodeURIComponent(dealId)}`, { token }).catch(
    () => {},
  );
}

/** Delete a company silently (for teardown). */
async function deleteCompany(
  request: Parameters<typeof apiRequest>[0],
  token: string | null,
  companyId: string | null,
): Promise<void> {
  if (!token || !companyId) return;
  await apiRequest(
    request,
    'DELETE',
    `/api/customers/companies?id=${encodeURIComponent(companyId)}`,
    { token },
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('TC-PRM-001: WIP Registered At Interceptor', () => {
  let token: string;
  let pipelineId: string;
  let stageByLabel: Map<string, string>;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request, 'admin');
    ({ pipelineId, stageByLabel } = await getPrmPipeline(request, token));
  });

  // -------------------------------------------------------------------------
  // T1: Moving to SQL stamps wip_registered_at
  // -------------------------------------------------------------------------
  test('T1: Move to SQL stage stamps wip_registered_at with current UTC timestamp', async ({ request }) => {
    const stamp = Date.now();
    let companyId: string | null = null;
    let dealId: string | null = null;

    try {
      const newStageId = expectId(stageByLabel.get('New'), 'New stage not found in PRM Pipeline');
      const sqlStageId = expectId(stageByLabel.get('SQL'), 'SQL stage not found in PRM Pipeline');

      companyId = await createCompany(request, token, `QA TC-PRM-001 T1 Co ${stamp}`);
      dealId = await createDeal(request, token, {
        title: `QA TC-PRM-001 T1 Deal ${stamp}`,
        companyId,
        pipelineId,
        pipelineStageId: newStageId,
      });

      // wip_registered_at must be null before the move
      const before = await readWipRegisteredAt(request, token, dealId);
      expect(before, 'wip_registered_at should be null before moving to SQL').toBeNull();

      const beforeMs = Date.now();
      await moveDealToStage(request, token, dealId, sqlStageId);
      const afterMs = Date.now();

      const wipValue = await readWipRegisteredAt(request, token, dealId);
      expect(wipValue, 'wip_registered_at should be set after moving to SQL').not.toBeNull();

      // Must be a valid ISO 8601 UTC timestamp
      const stamped = new Date(wipValue!);
      expect(Number.isNaN(stamped.getTime()), 'wip_registered_at must be a valid date').toBe(false);
      expect(wipValue).toMatch(/Z$/);

      // Must fall within the test window (generous ±5 s to absorb clock skew)
      expect(stamped.getTime()).toBeGreaterThanOrEqual(beforeMs - 5000);
      expect(stamped.getTime()).toBeLessThanOrEqual(afterMs + 5000);
    } finally {
      await deleteDeal(request, token, dealId);
      await deleteCompany(request, token, companyId);
    }
  });

  // -------------------------------------------------------------------------
  // T2: Second move to SQL does NOT overwrite wip_registered_at
  // -------------------------------------------------------------------------
  test('T2: Moving back below SQL then to SQL again preserves the original stamp', async ({ request }) => {
    const stamp = Date.now();
    let companyId: string | null = null;
    let dealId: string | null = null;

    try {
      const newStageId = expectId(stageByLabel.get('New'), 'New stage not found in PRM Pipeline');
      const sqlStageId = expectId(stageByLabel.get('SQL'), 'SQL stage not found in PRM Pipeline');
      const qualifiedStageId = expectId(stageByLabel.get('Qualified'), 'Qualified stage not found in PRM Pipeline');

      companyId = await createCompany(request, token, `QA TC-PRM-001 T2 Co ${stamp}`);
      dealId = await createDeal(request, token, {
        title: `QA TC-PRM-001 T2 Deal ${stamp}`,
        companyId,
        pipelineId,
        pipelineStageId: newStageId,
      });

      // First move to SQL — stamp is set
      await moveDealToStage(request, token, dealId, sqlStageId);
      const firstStamp = await readWipRegisteredAt(request, token, dealId);
      expect(firstStamp, 'wip_registered_at must be set after first move to SQL').not.toBeNull();

      // Move back below SQL threshold
      await moveDealToStage(request, token, dealId, qualifiedStageId);

      // Move to SQL again — timestamp must remain unchanged
      await moveDealToStage(request, token, dealId, sqlStageId);
      const secondStamp = await readWipRegisteredAt(request, token, dealId);
      expect(secondStamp, 'wip_registered_at must still be set after second move to SQL').not.toBeNull();
      expect(secondStamp, 'wip_registered_at must not be overwritten on second SQL move').toBe(firstStamp);
    } finally {
      await deleteDeal(request, token, dealId);
      await deleteCompany(request, token, companyId);
    }
  });

  // -------------------------------------------------------------------------
  // T3: Moving to Proposal (order 4, above SQL threshold) also stamps
  // -------------------------------------------------------------------------
  test('T3: Move to Proposal stage (order 4) stamps wip_registered_at', async ({ request }) => {
    const stamp = Date.now();
    let companyId: string | null = null;
    let dealId: string | null = null;

    try {
      const newStageId = expectId(stageByLabel.get('New'), 'New stage not found in PRM Pipeline');
      const proposalStageId = expectId(stageByLabel.get('Proposal'), 'Proposal stage not found in PRM Pipeline');

      companyId = await createCompany(request, token, `QA TC-PRM-001 T3 Co ${stamp}`);
      dealId = await createDeal(request, token, {
        title: `QA TC-PRM-001 T3 Deal ${stamp}`,
        companyId,
        pipelineId,
        pipelineStageId: newStageId,
      });

      await moveDealToStage(request, token, dealId, proposalStageId);

      const wipValue = await readWipRegisteredAt(request, token, dealId);
      expect(wipValue, 'wip_registered_at should be set when deal moves to Proposal (order 4)').not.toBeNull();

      const stamped = new Date(wipValue!);
      expect(Number.isNaN(stamped.getTime()), 'wip_registered_at must be a valid date').toBe(false);
      expect(wipValue).toMatch(/Z$/);
    } finally {
      await deleteDeal(request, token, dealId);
      await deleteCompany(request, token, companyId);
    }
  });

  // -------------------------------------------------------------------------
  // T4: Moving to Contacted (order 1, below SQL threshold) does not stamp
  // -------------------------------------------------------------------------
  test('T4: Move to Contacted stage (order 1) leaves wip_registered_at null', async ({ request }) => {
    const stamp = Date.now();
    let companyId: string | null = null;
    let dealId: string | null = null;

    try {
      const newStageId = expectId(stageByLabel.get('New'), 'New stage not found in PRM Pipeline');
      const contactedStageId = expectId(stageByLabel.get('Contacted'), 'Contacted stage not found in PRM Pipeline');

      companyId = await createCompany(request, token, `QA TC-PRM-001 T4 Co ${stamp}`);
      dealId = await createDeal(request, token, {
        title: `QA TC-PRM-001 T4 Deal ${stamp}`,
        companyId,
        pipelineId,
        pipelineStageId: newStageId,
      });

      await moveDealToStage(request, token, dealId, contactedStageId);

      const wipValue = await readWipRegisteredAt(request, token, dealId);
      expect(wipValue, 'wip_registered_at must remain null when deal moves to Contacted (order 1)').toBeNull();
    } finally {
      await deleteDeal(request, token, dealId);
      await deleteCompany(request, token, companyId);
    }
  });

  // -------------------------------------------------------------------------
  // T5: wip_registered_at sent in PATCH body is silently stripped
  // -------------------------------------------------------------------------
  test('T5: wip_registered_at in PUT custom fields body is stripped and not persisted', async ({ request }) => {
    const stamp = Date.now();
    let companyId: string | null = null;
    let dealId: string | null = null;

    try {
      const newStageId = expectId(stageByLabel.get('New'), 'New stage not found in PRM Pipeline');

      companyId = await createCompany(request, token, `QA TC-PRM-001 T5 Co ${stamp}`);
      dealId = await createDeal(request, token, {
        title: `QA TC-PRM-001 T5 Deal ${stamp}`,
        companyId,
        pipelineId,
        pipelineStageId: newStageId,
      });

      // Attempt to write wip_registered_at directly via PUT — must be stripped
      const forgedTimestamp = '2000-01-01T00:00:00.000Z';
      await moveDealToStage(request, token, dealId, newStageId, {
        customFields: {
          wip_registered_at: forgedTimestamp,
        },
      });

      const wipValue = await readWipRegisteredAt(request, token, dealId);
      // The interceptor strips the field before persistence; the deal stays at "New" (order 0),
      // so the after-interceptor also does not stamp. The field must remain null.
      expect(
        wipValue,
        'wip_registered_at must not be persisted when supplied directly in the PUT body',
      ).toBeNull();

      // Verify the forged value specifically was not stored
      if (wipValue !== null) {
        expect(wipValue, 'forged timestamp must not have been stored').not.toBe(forgedTimestamp);
      }
    } finally {
      await deleteDeal(request, token, dealId);
      await deleteCompany(request, token, companyId);
    }
  });
});
