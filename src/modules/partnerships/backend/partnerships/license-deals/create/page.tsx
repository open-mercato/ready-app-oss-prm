"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'

type CompanySearchItem = {
  companyId: string
  companyName: string
  organizationId: string
  agencyName: string
}

type OrgOption = {
  id: string
  name: string
}

export default function CreateLicenseDealPage() {
  const t = useT()
  const router = useRouter()

  // Organization selector
  const [organizations, setOrganizations] = React.useState<OrgOption[]>([])
  const [selectedOrgId, setSelectedOrgId] = React.useState('')
  const [orgsLoading, setOrgsLoading] = React.useState(true)

  // Company search
  const [companyQuery, setCompanyQuery] = React.useState('')
  const [companyResults, setCompanyResults] = React.useState<CompanySearchItem[]>([])
  const [searching, setSearching] = React.useState(false)
  const [selectedCompany, setSelectedCompany] = React.useState<CompanySearchItem | null>(null)
  const [showDropdown, setShowDropdown] = React.useState(false)
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form fields
  const [licenseIdentifier, setLicenseIdentifier] = React.useState('')
  const [industryTag, setIndustryTag] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [type, setType] = React.useState('enterprise')
  const [status, setStatus] = React.useState('won')
  const [isRenewal, setIsRenewal] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  // Load organizations for PM selector
  React.useEffect(() => {
    type OrgNode = { id: string; name: string; selectable?: boolean; children?: OrgNode[] }
    function flattenOrgs(nodes: OrgNode[], depth = 0): OrgOption[] {
      const result: OrgOption[] = []
      for (const node of nodes) {
        if (node.selectable !== false) {
          result.push({ id: node.id, name: depth > 0 ? '\u2003'.repeat(depth) + node.name : node.name })
        }
        if (node.children?.length) {
          result.push(...flattenOrgs(node.children, depth + 1))
        }
      }
      return result
    }
    async function loadOrgs() {
      const call = await apiCall<{ items: OrgNode[] }>(
        '/api/directory/organization-switcher',
      )
      if (call.ok && call.result?.items) {
        setOrganizations(flattenOrgs(call.result.items))
      }
      setOrgsLoading(false)
    }
    loadOrgs()
  }, [])

  function handleOrgChange(orgId: string) {
    setSelectedOrgId(orgId)
    setSelectedCompany(null)
    setCompanyQuery('')
    setCompanyResults([])
    setShowDropdown(false)
  }

  function handleCompanyQueryChange(value: string) {
    setCompanyQuery(value)
    setSelectedCompany(null)
    setShowDropdown(false)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!selectedOrgId || value.trim().length < 2) { setCompanyResults([]); return }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true)
      const call = await apiCall<{ results: CompanySearchItem[] }>(
        `/api/partnerships/company-search?q=${encodeURIComponent(value.trim())}`,
      )
      setSearching(false)
      if (call.ok && call.result?.results) {
        setCompanyResults(call.result.results.filter((c) => c.organizationId === selectedOrgId))
        setShowDropdown(true)
      }
    }, 400)
  }

  function selectCompany(company: CompanySearchItem) {
    setSelectedCompany(company)
    setCompanyQuery(company.companyName)
    setShowDropdown(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCompany) { setSubmitError('Please select a company.'); return }
    if (!selectedOrgId) { setSubmitError('Please select an organization.'); return }
    setSubmitting(true)
    setSubmitError(null)

    const call = await apiCall<{ id: string }>('/api/partnerships/partner-license-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: selectedOrgId,
        companyId: selectedCompany.companyId,
        licenseIdentifier,
        industryTag,
        startDate,
        endDate: endDate || null,
        type,
        status,
        isRenewal,
      }),
    })
    setSubmitting(false)

    if (call.ok) {
      flash(t('partnerships.licenseDeals.created', 'License deal created successfully'))
      router.push('/backend/partnerships/license-deals')
    } else {
      const payload = call.result as Record<string, unknown> | null
      setSubmitError(typeof payload?.error === 'string' ? payload.error : 'Failed to create license deal.')
    }
  }

  return (
    <Page>
      <PageBody>
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5 rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold">{t('partnerships.licenseDeals.createTitle', 'Add License Deal')}</h2>

          {/* Organization selector */}
          <div>
            <label htmlFor="organizationId" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.organization', 'Agency / Organization')}
            </label>
            {orgsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="h-4 w-4" />
                {t('partnerships.licenseDeals.loadingOrgs', 'Loading organizations...')}
              </div>
            ) : (
              <select
                id="organizationId"
                required
                value={selectedOrgId}
                onChange={(e) => handleOrgChange(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">{t('partnerships.licenseDeals.selectOrg', '— Select organization —')}</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Company search (typeahead) */}
          <div className="relative">
            <label htmlFor="companySearch" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.company', 'Company')}
            </label>
            <div className="relative">
              <input
                id="companySearch"
                type="text"
                required
                disabled={!selectedOrgId}
                value={companyQuery}
                onChange={(e) => handleCompanyQueryChange(e.target.value)}
                placeholder={selectedOrgId ? t('partnerships.companySearch.placeholder', 'Search by company name...') : t('partnerships.companySearch.selectOrgFirst', 'Select an organization first')}
                className="w-full rounded-md border px-3 py-2 text-sm disabled:bg-muted/30 disabled:cursor-not-allowed"
                autoComplete="off"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
            {selectedCompany && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedCompany.agencyName} &middot; {selectedCompany.companyId.slice(0, 8)}
              </p>
            )}
            {showDropdown && companyResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-md divide-y max-h-60 overflow-auto">
                {companyResults.map((c) => (
                  <button
                    key={c.companyId}
                    type="button"
                    onClick={() => selectCompany(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/50 text-sm"
                  >
                    <span className="font-medium">{c.companyName}</span>
                    <span className="text-muted-foreground ml-2">{c.agencyName}</span>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && companyResults.length === 0 && !searching && (
              <p className="mt-1 text-xs text-muted-foreground">{t('partnerships.companySearch.noResults', 'No companies found.')}</p>
            )}
          </div>

          <div>
            <label htmlFor="licenseIdentifier" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.licenseId', 'License Identifier')}
            </label>
            <input id="licenseIdentifier" type="text" required value={licenseIdentifier}
              onChange={(e) => setLicenseIdentifier(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g. LIC-ACME-2026-001" />
          </div>

          <div>
            <label htmlFor="industryTag" className="block text-sm font-medium mb-1">
              {t('partnerships.licenseDeals.fields.industry', 'Industry Tag')}
            </label>
            <input id="industryTag" type="text" required value={industryTag}
              onChange={(e) => setIndustryTag(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" placeholder="e.g. FinTech" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.startDate', 'Start Date')}
              </label>
              <input id="startDate" type="date" required value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.endDate', 'End Date')}
                <span className="text-muted-foreground font-normal ml-1">{t('partnerships.licenseDeals.fields.endDateHint', '(blank = perpetual)')}</span>
              </label>
              <input id="endDate" type="date" value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="type" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.type', 'Type')}
              </label>
              <select id="type" value={type} onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="enterprise">Enterprise</option>
                <option value="smb">SMB</option>
                <option value="startup">Startup</option>
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium mb-1">
                {t('partnerships.licenseDeals.fields.status', 'Status')}
              </label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="won">Won</option>
                <option value="pending">Pending</option>
                <option value="lost">Lost</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="isRenewal" type="checkbox" checked={isRenewal}
              onChange={(e) => setIsRenewal(e.target.checked)} className="rounded border" />
            <label htmlFor="isRenewal" className="text-sm">
              {t('partnerships.licenseDeals.fields.isRenewal', 'This is a renewal')}
            </label>
          </div>

          {submitError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? <><Spinner className="mr-2 h-4 w-4" />{t('partnerships.licenseDeals.submitting', 'Creating...')}</> : t('partnerships.licenseDeals.submitButton', 'Create License Deal')}
          </button>
        </form>
      </PageBody>
    </Page>
  )
}
