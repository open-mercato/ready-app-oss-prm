"use client"

import * as React from 'react'
import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Organization = {
  id: string
  name: string
}

type Role = {
  id: string
  name: string
}

type UserRow = {
  id: string
  email: string
  organizationId: string | null
  roles: string[]
}

const AGENCY_ROLE_NAMES = ['partner_admin', 'partner_member', 'partner_contributor'] as const

function generateTempPassword(): string {
  return Math.random().toString(36).slice(2, 14) + '!1A'
}

// ---------------------------------------------------------------------------
// Invite / Edit Dialog
// ---------------------------------------------------------------------------

type UserDialogMode = 'create' | 'edit'

type UserDialogProps = {
  mode: UserDialogMode
  user: UserRow | null
  organizationId: string
  agencyRoles: Role[]
  onClose: () => void
  onDone: (credentialMessage: string | null) => void
}

function UserDialog({ mode, user, organizationId, agencyRoles, onClose, onDone }: UserDialogProps) {
  const t = useT()
  const [email, setEmail] = React.useState(user?.email ?? '')
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>(() => {
    if (user && agencyRoles.length > 0) {
      const match = agencyRoles.find((r) => user.roles.includes(r.name))
      return match?.id ?? agencyRoles[0]?.id ?? ''
    }
    return agencyRoles[0]?.id ?? ''
  })
  const [resetPassword, setResetPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !selectedRoleId) return
    setSubmitting(true)
    setError(null)

    try {
      if (mode === 'create') {
        const tempPassword = generateTempPassword()
        const call = await apiCall<{ id: string }>('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password: tempPassword,
            organizationId,
            roles: [selectedRoleId],
          }),
        })

        if (!call.ok) {
          const payload = call.result as Record<string, unknown> | null
          setError(typeof payload?.error === 'string' ? payload.error : t('partnerships.users.createError', 'Failed to create user'))
          return
        }

        const roleName = agencyRoles.find((r) => r.id === selectedRoleId)?.name ?? ''
        const message = [
          t('partnerships.users.credentialLine1', 'Account created on Open Mercato PRM.'),
          `${t('partnerships.users.credentialLogin', 'Login')}: ${email.trim()}`,
          `${t('partnerships.users.credentialPassword', 'Password')}: ${tempPassword}`,
          `${t('partnerships.users.credentialRole', 'Role')}: ${roleName}`,
          `${t('partnerships.users.credentialUrl', 'URL')}: ${window.location.origin}/login`,
          t('partnerships.users.credentialChangePassword', 'Please change your password after first login.'),
        ].join('\n')

        flash(t('partnerships.users.created', 'User created successfully'), 'success')
        onDone(message)
      } else {
        // Edit mode
        const body: Record<string, unknown> = {
          id: user!.id,
          email: email.trim(),
          roles: [selectedRoleId],
        }
        if (resetPassword) {
          body.password = generateTempPassword()
        }

        const call = await apiCall<{ id: string }>('/api/auth/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!call.ok) {
          const payload = call.result as Record<string, unknown> | null
          setError(typeof payload?.error === 'string' ? payload.error : t('partnerships.users.updateError', 'Failed to update user'))
          return
        }

        if (resetPassword && typeof body.password === 'string') {
          const roleName = agencyRoles.find((r) => r.id === selectedRoleId)?.name ?? ''
          const message = [
            t('partnerships.users.credentialResetLine1', 'Password has been reset on Open Mercato PRM.'),
            `${t('partnerships.users.credentialLogin', 'Login')}: ${email.trim()}`,
            `${t('partnerships.users.credentialPassword', 'Password')}: ${body.password}`,
            `${t('partnerships.users.credentialRole', 'Role')}: ${roleName}`,
            `${t('partnerships.users.credentialUrl', 'URL')}: ${window.location.origin}/login`,
            t('partnerships.users.credentialChangePassword', 'Please change your password after first login.'),
          ].join('\n')
          flash(t('partnerships.users.updated', 'User updated successfully'), 'success')
          onDone(message)
        } else {
          flash(t('partnerships.users.updated', 'User updated successfully'), 'success')
          onDone(null)
        }
      }
    } catch {
      setError(mode === 'create'
        ? t('partnerships.users.createError', 'Failed to create user')
        : t('partnerships.users.updateError', 'Failed to update user'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (email.trim() && selectedRoleId && !submitting) {
        handleSubmit(e as unknown as React.FormEvent)
      }
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? t('partnerships.users.inviteTitle', 'Invite User')
              : t('partnerships.users.editTitle', 'Edit User')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="user-email">
              {t('partnerships.users.fieldEmail', 'Email')}
            </label>
            <input
              id="user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="user@agency.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="user-role">
              {t('partnerships.users.fieldRole', 'Role')}
            </label>
            <select
              id="user-role"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              {agencyRoles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>

          {mode === 'edit' && (
            <div className="flex items-center gap-2">
              <input
                id="reset-password"
                type="checkbox"
                checked={resetPassword}
                onChange={(e) => setResetPassword(e.target.checked)}
                className="rounded border"
              />
              <label htmlFor="reset-password" className="text-sm">
                {t('partnerships.users.resetPassword', 'Reset password')}
              </label>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !email.trim() || !selectedRoleId}>
              {submitting
                ? t('partnerships.users.submitting', 'Saving...')
                : mode === 'create'
                  ? t('partnerships.users.inviteButton', 'Create & Show Credentials')
                  : t('partnerships.users.saveButton', 'Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Credential Handoff Banner
// ---------------------------------------------------------------------------

function CredentialBanner({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}) {
  const t = useT()

  async function handleCopy() {
    await navigator.clipboard.writeText(message)
    flash(t('partnerships.users.copiedCredentials', 'Credentials copied to clipboard'), 'success')
  }

  return (
    <div className="rounded-lg border bg-card p-6 mb-6">
      <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm font-mono">
        {message}
      </pre>
      <div className="mt-4 flex gap-3">
        <Button type="button" onClick={handleCopy}>
          {t('partnerships.users.copyCredentials', 'Copy Invite Message')}
        </Button>
        <Button type="button" variant="outline" onClick={onDismiss}>
          {t('partnerships.users.dismissCredentials', 'Dismiss')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()

  // State: bootstrap
  const [bootstrapLoading, setBootstrapLoading] = React.useState(true)
  const [bootstrapError, setBootstrapError] = React.useState<string | null>(null)

  // State: actor role (PM vs agency admin)
  const [actorIsPM, setActorIsPM] = React.useState(false)

  // State: organizations (for PM agency picker)
  const [organizations, setOrganizations] = React.useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = React.useState<string | null>(null)

  // State: roles
  const [agencyRoles, setAgencyRoles] = React.useState<Role[]>([])

  // State: user list
  const [users, setUsers] = React.useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const pageSize = 50

  // State: dialogs
  const [dialogMode, setDialogMode] = React.useState<UserDialogMode | null>(null)
  const [dialogUser, setDialogUser] = React.useState<UserRow | null>(null)
  const [credentialMessage, setCredentialMessage] = React.useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Bootstrap: load organizations + roles
  // -----------------------------------------------------------------------
  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setBootstrapLoading(true)
      setBootstrapError(null)

      try {
        // Fetch role detection, organizations, and roles in parallel
        const [statusCall, orgsCall, rolesCall] = await Promise.all([
          apiCall<{ role: string | null }>(
            '/api/partnerships/onboarding-status',
          ),
          apiCall<{ items: Array<{ id: string; name: string }> }>(
            '/api/directory/organizations?page=1&pageSize=100',
          ),
          apiCall<{ items: Array<{ id: string; name: string }> }>(
            '/api/auth/roles?page=1&pageSize=50',
          ),
        ])

        if (cancelled) return

        // Detect PM: onboarding-status returns null role for PM (PM is not partner_admin/member/contributor)
        const detectedRole = statusCall.ok ? statusCall.result?.role ?? null : null
        const isPM = detectedRole === null
        setActorIsPM(isPM)

        // Organizations
        if (orgsCall.ok && orgsCall.result?.items) {
          const orgs = orgsCall.result.items
          setOrganizations(orgs)
          // Auto-select for agency admin (not PM) — use their own org
          if (!isPM && orgs.length >= 1) {
            setSelectedOrgId(orgs[0].id)
          }
        } else {
          setBootstrapError(t('partnerships.users.loadError', 'Failed to load data'))
          setBootstrapLoading(false)
          return
        }

        // Roles: filter to agency roles
        if (rolesCall.ok && rolesCall.result?.items) {
          const allRoles = rolesCall.result.items
          const filtered = allRoles.filter((r) =>
            AGENCY_ROLE_NAMES.includes(r.name as typeof AGENCY_ROLE_NAMES[number]),
          )
          setAgencyRoles(filtered)
        }
      } catch {
        if (!cancelled) {
          setBootstrapError(t('partnerships.users.loadError', 'Failed to load data'))
        }
      }

      if (!cancelled) setBootstrapLoading(false)
    }

    bootstrap()
    return () => { cancelled = true }
  }, [t])

  // -----------------------------------------------------------------------
  // Load users when org is selected
  // -----------------------------------------------------------------------
  const loadUsers = React.useCallback(async (orgId: string, pageNum: number) => {
    setUsersLoading(true)
    const params = new URLSearchParams()
    params.set('organizationId', orgId)
    params.set('page', String(pageNum))
    params.set('pageSize', String(pageSize))

    const call = await apiCall<{ items: UserRow[]; total: number; totalPages: number }>(
      `/api/auth/users?${params.toString()}`,
    )

    if (call.ok && call.result) {
      setUsers(call.result.items ?? [])
      setTotal(call.result.total ?? 0)
      setTotalPages(call.result.totalPages ?? 1)
    } else {
      setUsers([])
      setTotal(0)
      setTotalPages(1)
    }
    setUsersLoading(false)
  }, [])

  React.useEffect(() => {
    if (selectedOrgId) {
      loadUsers(selectedOrgId, page)
    } else {
      setUsers([])
      setTotal(0)
      setTotalPages(1)
    }
  }, [selectedOrgId, page, loadUsers])

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  function handleInvite() {
    setDialogUser(null)
    setDialogMode('create')
  }

  function handleEdit(user: UserRow) {
    setDialogUser(user)
    setDialogMode('edit')
  }

  async function handleDelete(user: UserRow) {
    const confirmed = await confirm({
      title: t('partnerships.users.confirmDelete', 'Delete user "{email}"?', { email: user.email }),
      variant: 'destructive',
    })
    if (!confirmed) return

    try {
      const call = await apiCall(
        `/api/auth/users?id=${encodeURIComponent(user.id)}`,
        { method: 'DELETE' },
      )
      if (!call.ok) {
        flash(t('partnerships.users.deleteError', 'Failed to delete user'), 'error')
        return
      }
      flash(t('partnerships.users.deleted', 'User deleted successfully'), 'success')
      if (selectedOrgId) {
        loadUsers(selectedOrgId, page)
      }
    } catch {
      flash(t('partnerships.users.deleteError', 'Failed to delete user'), 'error')
    }
  }

  function handleDialogDone(credential: string | null) {
    setDialogMode(null)
    setDialogUser(null)
    if (credential) {
      setCredentialMessage(credential)
    }
    if (selectedOrgId) {
      loadUsers(selectedOrgId, page)
    }
  }

  function handleDialogClose() {
    setDialogMode(null)
    setDialogUser(null)
  }

  function handleOrgChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    setSelectedOrgId(value || null)
    setPage(1)
    setCredentialMessage(null)
  }

  // -----------------------------------------------------------------------
  // Role id -> name mapping for display
  // -----------------------------------------------------------------------
  const roleIdToName = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of agencyRoles) {
      map[r.id] = r.name
    }
    return map
  }, [agencyRoles])

  // -----------------------------------------------------------------------
  // Columns
  // -----------------------------------------------------------------------
  const columns = React.useMemo<ColumnDef<UserRow>[]>(() => [
    {
      accessorKey: 'email',
      header: t('partnerships.users.colEmail', 'Email'),
    },
    {
      accessorKey: 'roles',
      header: t('partnerships.users.colRoles', 'Roles'),
      cell: ({ row }) => {
        const roleNames = row.original.roles ?? []
        // Show only agency roles for clarity
        const display = roleNames.filter((name) =>
          AGENCY_ROLE_NAMES.includes(name as typeof AGENCY_ROLE_NAMES[number]),
        )
        return display.join(', ') || roleNames.join(', ')
      },
    },
  ], [t])

  // -----------------------------------------------------------------------
  // Render: bootstrap loading
  // -----------------------------------------------------------------------
  if (bootstrapLoading) {
    return (
      <Page>
        <PageHeader title={t('partnerships.users.title', 'Users')} />
        <PageBody>
          <LoadingMessage label={t('common.loading', 'Loading...')} />
        </PageBody>
      </Page>
    )
  }

  if (bootstrapError) {
    return (
      <Page>
        <PageHeader title={t('partnerships.users.title', 'Users')} />
        <PageBody>
          <ErrorMessage
            label={t('common.errorTitle', 'Something went wrong')}
            description={bootstrapError}
          />
        </PageBody>
      </Page>
    )
  }

  // -----------------------------------------------------------------------
  // Render: PM must select an agency first
  // -----------------------------------------------------------------------
  if (actorIsPM && !selectedOrgId) {
    return (
      <Page>
        <PageHeader title={t('partnerships.users.title', 'Users')} />
        <PageBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="agency-selector">
                {t('partnerships.users.selectAgency', 'Select Agency')}
              </label>
              <select
                id="agency-selector"
                className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
                value=""
                onChange={handleOrgChange}
              >
                <option value="">
                  {t('partnerships.users.selectAgencyPlaceholder', '-- Choose an agency --')}
                </option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('partnerships.users.selectAgencyHint', 'Select an agency to manage its users.')}
            </p>
          </div>
        </PageBody>
      </Page>
    )
  }

  // -----------------------------------------------------------------------
  // Render: main user list
  // -----------------------------------------------------------------------
  const selectedOrgName = organizations.find((o) => o.id === selectedOrgId)?.name ?? ''

  return (
    <Page>
      <PageBody>
        {/* PM agency selector */}
        {actorIsPM && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="agency-selector">
              {t('partnerships.users.selectAgency', 'Select Agency')}
            </label>
            <select
              id="agency-selector"
              className="w-full max-w-sm rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedOrgId ?? ''}
              onChange={handleOrgChange}
            >
              <option value="">
                {t('partnerships.users.selectAgencyPlaceholder', '-- Choose an agency --')}
              </option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Credential handoff banner */}
        {credentialMessage && (
          <CredentialBanner
            message={credentialMessage}
            onDismiss={() => setCredentialMessage(null)}
          />
        )}

        <DataTable
          title={actorIsPM
            ? t('partnerships.users.titleWithAgency', 'Users — {agency}', { agency: selectedOrgName })
            : t('partnerships.users.title', 'Users')}
          actions={
            <Button type="button" onClick={handleInvite}>
              {t('partnerships.users.inviteButton', 'Create & Show Credentials')}
            </Button>
          }
          columns={columns}
          data={users}
          isLoading={usersLoading}
          pagination={{
            page,
            pageSize,
            total,
            totalPages,
            onPageChange: setPage,
          }}
          rowActions={(row) => (
            <RowActions items={[
              {
                id: 'edit',
                label: t('common.edit', 'Edit'),
                onSelect: () => handleEdit(row),
              },
              {
                id: 'delete',
                label: t('common.delete', 'Delete'),
                destructive: true,
                onSelect: () => { void handleDelete(row) },
              },
            ]} />
          )}
          emptyState={
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t('partnerships.users.noUsers', 'No users found for this agency.')}
            </p>
          }
        />

        {/* Invite / Edit dialog */}
        {dialogMode && selectedOrgId && (
          <UserDialog
            mode={dialogMode}
            user={dialogUser}
            organizationId={selectedOrgId}
            agencyRoles={agencyRoles}
            onClose={handleDialogClose}
            onDone={handleDialogDone}
          />
        )}

        {ConfirmDialogElement}
      </PageBody>
    </Page>
  )
}
