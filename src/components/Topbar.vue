<template>
  <header class="topbar">
    <span class="crumb">首页 / <b>{{ title }}</b></span>
    <div class="topbar-right">
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
      currentOperator: getCurrentOperator()
    }
  }
}
</script>
