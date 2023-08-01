interface Window {
  __USE_SSR__?: boolean
  __INITIAL_DATA__?: any
  __INITIAL_PINIA_DATA__?: any
  STORE_CONTEXT?: any
  __USE_VITE__?: boolean
  prefix?: string
  clientPrefix?: string
  microApp?: any
  hashRouter: boolean
  ssrDevInfo: {
    manifest: Record<string, string>
    rootId: string
    fePort?: number
    https?: boolean
  }
}
declare module '_build/ssr-declare-routes' { }
declare module '_build/ssr-manual-routes' { }
declare module 'ssr-deepclone' {
  const deepClone: (obj: any) => any
}
declare module 'ssr-serialize-javascript'

declare const __isBrowser__: Boolean
