'use client'
import { Page, PageHeader, PageBody } from '@open-mercato/ui/backend/Page'

export default function HelloPage() {
  return (
    <Page>
      <PageHeader
        title="Hello Starter"
        description="SPEC-062 framework validation — this module was loaded from a starter template."
      />
      <PageBody>
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            If you can see this page, the starter module was successfully:
          </p>
          <ul className="list-disc list-inside text-sm mt-2">
            <li>Copied to src/modules/</li>
            <li>Registered in src/modules.ts</li>
            <li>Discovered by yarn generate</li>
            <li>Rendered in the admin panel</li>
          </ul>
        </div>
      </PageBody>
    </Page>
  )
}
