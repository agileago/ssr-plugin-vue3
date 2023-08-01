import { createRouter as create, createMemoryHistory, createWebHashHistory, createWebHistory } from 'vue-router'
import { createStore as createVuexStore } from 'vuex'
import { deepClone } from 'ssr-deepclone'
import type { RoutesType, VueRouterOptions } from '../types'
import { Routes } from './combine-router'

const { store, FeRoutes } = Routes as RoutesType
function createRouter(options: VueRouterOptions & { hashRouter?: boolean } = {}) {
  const base = options.base ?? '/'
  const { hashRouter } = options
  return create({
    history: __isBrowser__ ? (hashRouter ? createWebHashHistory(base) : createWebHistory(base)) : createMemoryHistory(),
    routes: FeRoutes as any,
  })
}

function createStore() {
  return createVuexStore<any>(deepClone(store))
}

export {
  createRouter,
  createStore,
}
