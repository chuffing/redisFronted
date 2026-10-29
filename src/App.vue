<template>
  <div class="app-layout">
    <Sidebar />
    <div class="main-area">
      <Topbar :title="$route.meta.title" @refresh="handleRefresh" />
      <div class="page-content">
        <router-view ref="page" />
      </div>
    </div>
  </div>
</template>

<script>
import Sidebar from '@/components/Sidebar.vue'
import Topbar from '@/components/Topbar.vue'

export default {
  name: 'App',
  components: { Sidebar, Topbar },
  methods: {
    handleRefresh() {
      const page = this.$refs.page
      if (!page) return
      // 各页面统一优先调用 loadData，兼容历史页面方法名
      if (typeof page.loadData === 'function') {
        page.loadData()
      } else if (typeof page.loadRules === 'function') {
        page.loadRules()
      } else if (typeof page.loadRecords === 'function') {
        page.loadRecords()
      } else if (typeof page.loadInstances === 'function') {
        page.loadInstances()
      } else if (typeof page.loadEnvironment === 'function') {
        page.loadEnvironment()
        if (typeof page.loadPackages === 'function') {
          page.loadPackages()
        }
      }
    }
  }
}
</script>
