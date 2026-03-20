// Pipeline constants
export const PRM_SQL_STAGE_ORDER = 3;
export const PRM_PIPELINE_NAME = 'PRM Pipeline';

export const PRM_PIPELINE_STAGES = [
  { name: 'New', value: 'new', order: 0 },
  { name: 'Contacted', value: 'contacted', order: 1 },
  { name: 'Qualified', value: 'qualified', order: 2 },
  { name: 'SQL', value: 'sql', order: 3 },
  { name: 'Proposal', value: 'proposal', order: 4 },
  { name: 'Won', value: 'won', order: 5 },
  { name: 'Lost', value: 'lost', order: 6 },
] as const;

// Dictionary options
export const SERVICES_OPTIONS = [
  'Software Development',
  'Consulting',
  'Implementation',
  'Training',
  'Support',
  'Integration',
] as const;

export const INDUSTRIES_OPTIONS = [
  'Finance',
  'Healthcare',
  'Retail',
  'Manufacturing',
  'Technology',
  'Education',
  'Government',
  'Energy',
  'Logistics',
] as const;

export const TECHNOLOGIES_OPTIONS = [
  'React',
  'Node.js',
  'Python',
  'TypeScript',
  'PostgreSQL',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
] as const;

export const VERTICALS_OPTIONS = [
  'FinTech',
  'HealthTech',
  'RetailTech',
  'EdTech',
  'GovTech',
  'CleanTech',
] as const;

export const BUDGET_BUCKET_OPTIONS = [
  '<10k',
  '10k-50k',
  '50k-200k',
  '200k-500k',
  '500k+',
] as const;

export const DURATION_BUCKET_OPTIONS = [
  '<1 month',
  '1-3 months',
  '3-6 months',
  '6-12 months',
  '12+ months',
] as const;

// Field definition type
type FieldDefinition = {
  key: string;
  type: string;
  label: string;
  required?: boolean;
  hidden?: boolean;
  options?: string[];
};

// Company profile custom fields (entity: customers:customer_company_profile)
export const COMPANY_PROFILE_FIELDS: FieldDefinition[] = [
  {
    key: 'services',
    type: 'multi_select',
    label: 'Services',
    options: [...SERVICES_OPTIONS],
  },
  {
    key: 'industries',
    type: 'multi_select',
    label: 'Industries',
    options: [...INDUSTRIES_OPTIONS],
  },
  {
    key: 'technologies',
    type: 'multi_select',
    label: 'Technologies',
    options: [...TECHNOLOGIES_OPTIONS],
  },
  {
    key: 'verticals',
    type: 'multi_select',
    label: 'Verticals',
    options: [...VERTICALS_OPTIONS],
  },
  {
    key: 'team_size',
    type: 'select',
    label: 'Team Size',
    options: ['1-5', '6-20', '21-50', '51-200', '200+'],
  },
  {
    key: 'founded_year',
    type: 'number',
    label: 'Founded Year',
  },
  {
    key: 'website',
    type: 'text',
    label: 'Website',
  },
  {
    key: 'headquarters_city',
    type: 'text',
    label: 'Headquarters City',
  },
  {
    key: 'headquarters_country',
    type: 'text',
    label: 'Headquarters Country',
  },
  {
    key: 'partnership_start_date',
    type: 'date',
    label: 'Partnership Start Date',
  },
  {
    key: 'primary_contact_name',
    type: 'text',
    label: 'Primary Contact Name',
  },
  {
    key: 'primary_contact_email',
    type: 'text',
    label: 'Primary Contact Email',
  },
  {
    key: 'description',
    type: 'long_text',
    label: 'Description',
  },
];

// Case study custom fields (entity: partnerships:case_study)
export const CASE_STUDY_FIELDS: FieldDefinition[] = [
  {
    key: 'title',
    type: 'text',
    label: 'Title',
    required: true,
  },
  {
    key: 'industry',
    type: 'multi_select',
    label: 'Industry',
    required: true,
    options: [...INDUSTRIES_OPTIONS],
  },
  {
    key: 'technologies',
    type: 'multi_select',
    label: 'Technologies',
    required: true,
    options: [...TECHNOLOGIES_OPTIONS],
  },
  {
    key: 'budget_bucket',
    type: 'select',
    label: 'Budget Bucket',
    required: true,
    options: [...BUDGET_BUCKET_OPTIONS],
  },
  {
    key: 'duration_bucket',
    type: 'select',
    label: 'Duration Bucket',
    required: true,
    options: [...DURATION_BUCKET_OPTIONS],
  },
  {
    key: 'client_name',
    type: 'text',
    label: 'Client Name',
  },
  {
    key: 'client_industry',
    type: 'text',
    label: 'Client Industry',
  },
  {
    key: 'project_type',
    type: 'select',
    label: 'Project Type',
    options: [...SERVICES_OPTIONS],
  },
  {
    key: 'team_size',
    type: 'number',
    label: 'Team Size',
  },
  {
    key: 'start_date',
    type: 'date',
    label: 'Start Date',
  },
  {
    key: 'end_date',
    type: 'date',
    label: 'End Date',
  },
  {
    key: 'description',
    type: 'long_text',
    label: 'Description',
  },
  {
    key: 'challenges',
    type: 'long_text',
    label: 'Challenges',
  },
  {
    key: 'solution',
    type: 'long_text',
    label: 'Solution',
  },
  {
    key: 'results',
    type: 'long_text',
    label: 'Results',
  },
  {
    key: 'testimonial',
    type: 'long_text',
    label: 'Testimonial',
  },
  {
    key: 'is_public',
    type: 'boolean',
    label: 'Is Public',
  },
  {
    key: 'attachments_count',
    type: 'number',
    label: 'Attachments Count',
  },
  {
    key: 'organization_id',
    type: 'text',
    label: 'Organization ID',
  },
];

// WIP registered at field (entity: customers:deal)
export const WIP_REGISTERED_AT_FIELD: FieldDefinition = {
  key: 'wip_registered_at',
  type: 'date_time',
  label: 'WIP Registered At',
  required: false,
  hidden: true,
};
