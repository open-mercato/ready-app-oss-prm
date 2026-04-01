declare module 'react-markdown' {
  import type { ComponentType, JSX, ReactElement, ReactNode } from 'react'
  import type { Element, Parents } from 'hast'
  import type { PluggableList } from 'unified'
  import type { Options as RemarkRehypeOptions } from 'remark-rehype'

  export type AllowElement = (
    element: Readonly<Element>,
    index: number,
    parent: Readonly<Parents> | undefined,
  ) => boolean | null | undefined

  export type ExtraProps = {
    node?: Element | undefined
  }

  export type Components = {
    [Key in keyof JSX.IntrinsicElements]?:
      | ComponentType<JSX.IntrinsicElements[Key] & ExtraProps>
      | keyof JSX.IntrinsicElements
  }

  export type UrlTransform = (
    url: string,
    key: string,
    node: Readonly<Element>,
  ) => string | null | undefined

  export type Options = {
    allowElement?: AllowElement | null | undefined
    allowedElements?: ReadonlyArray<string> | null | undefined
    children?: string | null | undefined
    className?: string | undefined
    components?: Components | null | undefined
    disallowedElements?: ReadonlyArray<string> | null | undefined
    rehypePlugins?: PluggableList | null | undefined
    remarkPlugins?: PluggableList | null | undefined
    remarkRehypeOptions?: Readonly<RemarkRehypeOptions> | null | undefined
    skipHtml?: boolean | null | undefined
    unwrapDisallowed?: boolean | null | undefined
    urlTransform?: UrlTransform | null | undefined
  }

  export type HooksOptions = Options & {
    fallback?: ReactNode | null | undefined
  }

  export default function Markdown(options: Readonly<Options>): ReactElement
  export function MarkdownAsync(options: Readonly<Options>): Promise<ReactElement>
  export function MarkdownHooks(options: Readonly<HooksOptions>): ReactNode
  export function defaultUrlTransform(value: string): string
}
