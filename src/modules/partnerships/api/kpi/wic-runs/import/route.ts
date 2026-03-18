import type { NextRequest } from 'next/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['partnerships.kpi.manage'] },
}

export async function POST(req: NextRequest, ctx: any) {
  const body = await req.json()
  const executeCommand = ctx.container.resolve('executeCommand') as any
  const result = await executeCommand('partnerships.partner_wic_run.import', body, ctx)
  return Response.json({ ok: true, data: { id: result.id } }, { status: 201 })
}

export const openApi = {
  '/api/partnerships/kpi/wic-runs/import': {
    post: { summary: 'Import WIC assessment run', tags: ['Partnerships'] },
  },
}
