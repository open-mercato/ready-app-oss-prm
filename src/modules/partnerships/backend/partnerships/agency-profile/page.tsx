"use client"

import * as React from 'react'
import { Page, PageBody, PageHeader } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  INDUSTRIES_OPTIONS,
  SERVICES_OPTIONS,
  TECHNOLOGIES_OPTIONS,
  VERTICALS_OPTIONS,
} from '../../../data/custom-fields'
import type { AgencyProfileEditableValuesInput, AgencyProfileValuesInput } from '../../../data/validators'

type AgencyProfileFormValues = {
  services: string[]
  industries: string[]
  technologies: string[]
  verticals: string[]
  team_size: string
  founded_year: number | null
  website: string
  headquarters_city: string
  headquarters_country: string
  description: string
}

type AgencyProfileResponse = {
  organizationId: string
  organizationName: string | null
  values: AgencyProfileValuesInput
}

const TEAM_SIZE_OPTIONS = [
  { label: '1-5', value: '1-5' },
  { label: '6-20', value: '6-20' },
  { label: '21-50', value: '21-50' },
  { label: '51-200', value: '51-200' },
  { label: '200+', value: '200+' },
]

const EMPTY_VALUES: AgencyProfileFormValues = {
  services: [],
  industries: [],
  technologies: [],
  verticals: [],
  team_size: '',
  founded_year: null,
  website: '',
  headquarters_city: '',
  headquarters_country: '',
  description: '',
}

function toFormValues(values?: AgencyProfileValuesInput | null): AgencyProfileFormValues {
  return {
    services: Array.isArray(values?.services) ? values!.services : [],
    industries: Array.isArray(values?.industries) ? values!.industries : [],
    technologies: Array.isArray(values?.technologies) ? values!.technologies : [],
    verticals: Array.isArray(values?.verticals) ? values!.verticals : [],
    team_size: values?.team_size ?? '',
    founded_year: values?.founded_year ?? null,
    website: values?.website ?? '',
    headquarters_city: values?.headquarters_city ?? '',
    headquarters_country: values?.headquarters_country ?? '',
    description: values?.description ?? '',
  }
}

export default function AgencyProfilePage() {
  const t = useT()
  const [loading, setLoading] = React.useState(true)
  const [organizationName, setOrganizationName] = React.useState<string | null>(null)
  const [initialValues, setInitialValues] = React.useState<AgencyProfileFormValues>(EMPTY_VALUES)
  const [formKey, setFormKey] = React.useState(0)

  const fields = React.useMemo<CrudField[]>(() => [
    {
      id: 'description',
      label: t('partnerships.agencyProfile.fields.description', 'Description'),
      type: 'textarea',
      placeholder: t('partnerships.agencyProfile.placeholders.description', 'How do you position your agency?'),
    },
    {
      id: 'services',
      label: t('partnerships.agencyProfile.fields.services', 'Services'),
      type: 'tags',
      suggestions: [...SERVICES_OPTIONS],
      placeholder: t('partnerships.agencyProfile.placeholders.tags', 'Type or pick values...'),
    },
    {
      id: 'industries',
      label: t('partnerships.agencyProfile.fields.industries', 'Industries'),
      type: 'tags',
      suggestions: [...INDUSTRIES_OPTIONS],
      placeholder: t('partnerships.agencyProfile.placeholders.tags', 'Type or pick values...'),
    },
    {
      id: 'technologies',
      label: t('partnerships.agencyProfile.fields.technologies', 'Technologies'),
      type: 'tags',
      suggestions: [...TECHNOLOGIES_OPTIONS],
      placeholder: t('partnerships.agencyProfile.placeholders.tags', 'Type or pick values...'),
    },
    {
      id: 'verticals',
      label: t('partnerships.agencyProfile.fields.verticals', 'Verticals'),
      type: 'tags',
      suggestions: [...VERTICALS_OPTIONS],
      placeholder: t('partnerships.agencyProfile.placeholders.tags', 'Type or pick values...'),
    },
    {
      id: 'team_size',
      label: t('partnerships.agencyProfile.fields.teamSize', 'Team Size'),
      type: 'select',
      options: TEAM_SIZE_OPTIONS,
    },
    {
      id: 'founded_year',
      label: t('partnerships.agencyProfile.fields.foundedYear', 'Founded Year'),
      type: 'number',
    },
    {
      id: 'website',
      label: t('partnerships.agencyProfile.fields.website', 'Website'),
      type: 'text',
      placeholder: 'https://example.com',
    },
    {
      id: 'headquarters_city',
      label: t('partnerships.agencyProfile.fields.headquartersCity', 'Headquarters City'),
      type: 'text',
    },
    {
      id: 'headquarters_country',
      label: t('partnerships.agencyProfile.fields.headquartersCountry', 'Headquarters Country'),
      type: 'text',
    },
  ], [t])

  const groups = React.useMemo<CrudFormGroup[]>(() => [
    {
      id: 'company',
      title: t('partnerships.agencyProfile.groups.company', 'Company'),
      fields: ['description', 'team_size', 'founded_year', 'website', 'headquarters_city', 'headquarters_country'],
    },
    {
      id: 'profile',
      fields: ['services', 'industries', 'verticals'],
    },
  ], [t])

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const call = await apiCall<AgencyProfileResponse>('/api/partnerships/agency-profile')
      if (!cancelled && call.ok && call.result) {
        setOrganizationName(call.result.organizationName ?? null)
        setInitialValues(toFormValues(call.result.values))
      }
      if (!cancelled) setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (values: AgencyProfileFormValues) => {
    const call = await apiCall<AgencyProfileResponse>('/api/partnerships/agency-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: values as AgencyProfileEditableValuesInput }),
    })

    if (!call.ok || !call.result) {
      throw new Error('save_failed')
    }

    setOrganizationName(call.result.organizationName ?? null)
    setInitialValues(toFormValues(call.result.values))
    setFormKey((prev) => prev + 1)
    flash(t('partnerships.agencyProfile.saved', 'Agency profile updated'), 'success')
  }

  if (loading) {
    return (
      <Page>
        <PageBody>
          <div className="flex h-64 items-center justify-center">
            <Spinner className="h-8 w-8 text-muted-foreground" />
          </div>
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('partnerships.agencyProfile.title', 'Agency Profile')}
        description={organizationName
          ? t('partnerships.agencyProfile.subtitle', 'Update how your agency is presented in PRM', { organizationName })
          : t('partnerships.agencyProfile.subtitle', 'Update how your agency is presented in PRM')}
      />
      <PageBody>
        <CrudForm<AgencyProfileFormValues>
          key={formKey}
          fields={fields}
          groups={groups}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          embedded
          submitLabel={t('partnerships.agencyProfile.save', 'Save Profile')}
        />
      </PageBody>
    </Page>
  )
}
