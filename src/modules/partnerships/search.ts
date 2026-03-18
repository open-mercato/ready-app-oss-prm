import type { SearchModuleConfig } from '@open-mercato/shared/modules/search'

export const config: SearchModuleConfig = {
  sources: [],
  formatResult: ({ doc }) => ({
    title: doc.display_name ?? doc.label ?? doc.title ?? 'Partner',
    subtitle: doc.status ?? doc.key ?? '',
    icon: 'handshake',
    link: { href: `/backend/partnerships` },
  }),
}

export const searchConfig = config

export default config
