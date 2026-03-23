import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiMethodDoc, OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  path: '/partnerships/trigger-wic-import',
  POST: { requireAuth: false },
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function POST(req: Request) {
  // Cron API key auth — not standard user auth
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // WIC import is manual in Phase 2, automated in Phase 4
  return NextResponse.json({
    status: 'manual_import_only',
    message: 'WIC automated import available in Phase 4',
  })
}

// ---------------------------------------------------------------------------
// OpenAPI
// ---------------------------------------------------------------------------

const responseSchema = z.object({
  status: z.literal('manual_import_only'),
  message: z.string(),
})

const postDoc: OpenApiMethodDoc = {
  summary: 'Cron trigger: WIC import (placeholder — automated import available in Phase 4)',
  tags: ['Partnerships'],
  responses: [
    { status: 200, description: 'Placeholder response', schema: responseSchema },
    { status: 401, description: 'Invalid or missing x-api-key' },
  ],
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Partnerships',
  summary: 'Cron trigger — WIC import',
  methods: { POST: postDoc },
}

export default POST
