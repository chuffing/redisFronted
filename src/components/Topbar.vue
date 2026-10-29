<template>
  <header class="topbar">
    <span class="crumb">首页 / <b>{{ title }}</b></span>
    <div class="topbar-right">
      <span class="refresh-text">{{ refreshText }}</span>
      <button class="refresh-btn" @click="onRefresh">立即刷新</button>
      <span class="user-info">{{ currentOperator || '未登录' }}</span>
    </div>
  </header>
</template>

<script>
import { getCurrentOperator } from '../utils/currentUser'

export default {
  name: 'Topbar',
  props: { title: { type: String, default: '' } },
  data() {
    return {
      refreshText: '每5min自动刷新',
      currentOperator: getCurrentOperator(),
      timer: null
    }
  },
  mounted() {
    // 与执行器 5min 上报周期对齐，自动刷新当前页数据
    this.timer = setInterval(() => {
      this.markRefreshed()
      this.$emit('refresh')
    }, 5 * 60 * 1000)
  },
  beforeDestroy() { clearInterval(this.timer) },
  methods: {
    onRefresh() {
      this.markRefreshed()
      this.$emit('refresh')
    },
    markRefreshed() {
      const now = new Date()
      const t = [now.getHours(), now.getMinutes(), now.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
      this.refreshText = `最近刷新：${t}｜每5min自动刷新`
    }
  }
}
</script>
