import Vue from 'vue'
import VueRouter from 'vue-router'
import { resetRequestCancelToken } from '@/api'
import FaultRecoveryPage from '@/fault-recovery/FaultRecoveryPage.vue'
import VersionUpgradePage from '@/version-upgrade/VersionUpgradePage.vue'
import ServerSwitchPage from '@/server-switch/ServerSwitchPage.vue'

Vue.use(VueRouter)

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '监控仪表' } },
  { path: '/realtime', name: 'Realtime', component: () => import('@/views/RealtimeMonitor.vue'), meta: { title: '实时监控' } },
  { path: '/history', name: 'History', component: () => import('@/views/HistoryMonitor.vue'), meta: { title: '历史监控' } },
  { path: '/alarm-rules', name: 'AlarmRules', component: () => import('@/views/AlarmRules.vue'), meta: { title: '告警监控' } },
  { path: '/alarm-records', name: 'AlarmRecords', component: () => import('@/views/AlarmRecords.vue'), meta: { title: '告警记录' } },
  { path: '/topology-initialization', name: 'TopologyInitialization', component: () => import('@/topology-initialization/TopologyInitializationPage.vue'), meta: { title: '首次纳管' } },
  { path: '/fault-recovery', name: 'FaultRecovery', component: FaultRecoveryPage, meta: { title: '故障恢复' } },
  { path: '/version-upgrade', name: 'VersionUpgrade', component: VersionUpgradePage, meta: { title: '版本升级' } },
  { path: '/server-switch', name: 'ServerSwitch', component: ServerSwitchPage, meta: { title: '服务器切换' } }
]

const router = new VueRouter({ routes })

// 路由切换时取消上一页尚未完成的 Axios 请求，避免慢响应回写已销毁页面。
router.beforeEach((to, from, next) => {
  resetRequestCancelToken()
  next()
})

export default router
