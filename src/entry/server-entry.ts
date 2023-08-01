import type { VNode } from 'vue'
import { createSSRApp, h, renderSlot } from 'vue'
import {
  appLocalStoreageWrapper, checkRoute, findRoute, getAsyncCssChunk, getAsyncJsChunk, getInlineCss,
  getManifest, getStaticConfig, getUserScriptVue, localStorageWrapper,
  logGreen, normalizePath, remInitial, splitPageInfo,
} from 'ssr-common-utils'
import type { IConfig, ISSRContext } from 'ssr-types'
import { createPinia } from 'pinia'
import { serialize } from 'ssr-serialize-javascript'
import { renderToNodeStream, renderToString } from '@vue/server-renderer'
import type { IFeRouteItem, vue3AppParams } from '../types'
import { Routes } from './combine-router'
import { createRouter, createStore } from './create'

const { FeRoutes, App, layoutFetch, Layout } = Routes
const staticConfig = getStaticConfig()

async function serverRender(ctx: ISSRContext, config: IConfig) {
  const { mode, customeHeadScript, customeFooterScript, parallelFetch, prefix, isVite, isDev, clientPrefix, stream, fePort, https, rootId, bigpipe } = config
  const store = createStore()
  const router = createRouter()
  const pinia = createPinia()
  const rawPath = ctx.request.path ?? ctx.request.url
  const [path, url] = [normalizePath(rawPath, prefix), normalizePath(ctx.request.url, prefix)]
  const routeItem = findRoute<IFeRouteItem>(FeRoutes, path)
  checkRoute({ routeItem, path })

  const getApp = ({
    combineAysncData,
    state,
    layoutFetchData,
    asyncData,
    manifest,
    isCsr,
    jsInject,
    cssInject,
    inlineCss,
    rootId,
  }: vue3AppParams) => {
    const app = createSSRApp({
      render() {
        const ssrDevInfo = { manifest: isDev ? manifest : '', rootId, fePort: isDev ? fePort : '', https: isDev ? https : '' }
        const innerHTML = splitPageInfo({
          'window.__USE_SSR__': !isCsr,
          'window.__INITIAL_DATA__': isCsr ? {} : serialize(state),
          'window.__INITIAL_PINIA_DATA__': isCsr ? {} : serialize(pinia.state.value),
          'window.__USE_VITE__': isVite,
          'window.prefix': `"${prefix}"`,
          'window.clientPrefix': `"${clientPrefix ?? ''}"`,
          'window.ssrDevInfo': JSON.stringify(ssrDevInfo),
        })
        const initialData = h('script', { innerHTML })
        const children = bigpipe ? '' : h(App, { ctx, config, asyncData, fetchData: combineAysncData, reactiveFetchData: { value: combineAysncData }, ssrApp: app })
        const customeHeadScriptArr: VNode[] = getUserScriptVue({ script: customeHeadScript, ctx, h, type: 'vue3', position: 'header', staticConfig }).concat(inlineCss ?? [])
        const customeFooterScriptArr: VNode[] = getUserScriptVue({ script: customeFooterScript, ctx, h, type: 'vue3', position: 'footer', staticConfig })

        return h(Layout,
          { ctx, config, asyncData, fetchData: layoutFetchData, reactiveFetchData: { value: layoutFetchData } },
          {
            remInitial: () => h('script', { innerHTML: remInitial }),

            customeHeadScript: () => customeHeadScriptArr,

            customeFooterScript: () => customeFooterScriptArr,

            children: () => children,

            initialData: () => initialData,

            cssInject: () => cssInject,

            jsInject: () => jsInject,

            injectHeader: () => [
              customeHeadScriptArr,
              cssInject,
            ],

            content: () => [
              h('div', {
                id: rootId.replace('#', ''),
              }, renderSlot(this.$slots, 'default', {}, () => [children])),
              initialData,
              customeFooterScriptArr,
              jsInject,
            ],
          },
        )
      },
    })
    return app
  }

  const fn = async () => {
    const { fetch, webpackChunkName } = routeItem
    const dynamicCssOrder = await getAsyncCssChunk(ctx, webpackChunkName, config)
    const dynamicJsOrder = await getAsyncJsChunk(ctx, webpackChunkName, config)
    const manifest = await getManifest(config)
    const [inlineCss, extraCssOrder] = await getInlineCss({ dynamicCssOrder, manifest, h, config, type: 'vue3' })
    const isCsr = !!(mode === 'csr' || ctx.request.query?.csr)

    const cssInject = ((isVite && isDev)
      ? [h('script', {
          type: 'module',
          src: '/@vite/client',
        })]
      : extraCssOrder.map(css => manifest[css]).filter(Boolean).map(css => h('link', {
        rel: 'stylesheet',
        href: css,
      }))).concat((isVite && isDev)
      ? []
      : dynamicJsOrder.map(js => manifest[js]).filter(Boolean).map(js => h('link', {
        href: js,
        as: 'script',
        rel: isVite ? 'modulepreload' : 'preload',
      })))

    const jsInject = (isVite && isDev)
      ? [h('script', {
          type: 'module',
          src: '/node_modules/ssr-plugin-vue3/esm/entry/client-entry.js',
        })]
      : dynamicJsOrder.map(js => manifest[js]).filter(Boolean).map(js =>
        h('script', {
          src: js,
          type: isVite ? 'module' : 'text/javascript',
        }),
      )
    let [layoutFetchData, fetchData] = [{}, {}]
    if (!isCsr && !bigpipe) {
      // not fetch when generate <head>
      router.push(url)
      await router.isReady()
      const currentFetch = fetch ? (await fetch()).default : null
      const { value } = router.currentRoute
      const lF = layoutFetch ? layoutFetch({ store, router: value, ctx, pinia }, ctx) : Promise.resolve({})
      const CF = currentFetch ? currentFetch({ store, router: value, ctx, pinia }, ctx) : Promise.resolve({});
      [layoutFetchData, fetchData] = parallelFetch ? await Promise.all([lF, CF]) : [await lF, await CF]
    }
    else {
      logGreen(`Current path ${path} use csr render mode`)
    }
    const combineAysncData = Object.assign({}, layoutFetchData ?? {}, fetchData ?? {})

    const asyncData = {
      value: combineAysncData,
    }

    const state = Object.assign({}, store.state ?? {}, asyncData.value)

    const app = getApp({
      state,
      asyncData,
      layoutFetchData,
      combineAysncData,
      manifest,
      jsInject,
      cssInject,
      isCsr,
      inlineCss,
      rootId,
    })
    app.use(router)
    app.use(store)
    app.use(pinia)

    const res = await appLocalStoreageWrapper.run({
      app,
    }, async () => {
      if (stream) {
        return renderToNodeStream(app)
      }
      else {
        const teleportsContext: {
          teleports?: Record<string, string>
        } = {}
        const html = await renderToString(app, teleportsContext)
        return ({
          html,
          teleportsContext,
        })
      }
    })
    return res
  }
  const res = await localStorageWrapper.run({
    pinia,
    store,
  }, fn)
  return res
}

export {
  serverRender,
  Routes,
}
