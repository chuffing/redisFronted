<template>
  <section class="card topology-card" aria-labelledby="topology-title" :aria-busy="loading">
    <h2 id="topology-title">
      当前生产拓扑
      <span class="topology-actions">
        <span class="topology-state" :class="topologyStatusClass">{{ topologyStatus }}</span>
        <span v-if="refreshedAt" class="refresh-time">{{ refreshedAt }}</span>
        <button type="button" class="text-button" :disabled="loading" @click="$emit('refresh')">
          {{ loading ? '刷新中' : '刷新' }}
        </button>
      </span>
    </h2>

    <div v-if="loading && !hasNodes" class="topology topology-placeholder" role="status">
      <span class="loading-ring" aria-hidden="true"></span>
      <strong>正在读取生产拓扑</strong>
    </div>

    <div v-else-if="error && !hasNodes" class="topology topology-placeholder topology-error" role="alert">
      <strong>拓扑读取失败</strong>
      <span>{{ error }}</span>
      <button type="button" class="btn neutral" @click="$emit('refresh')">重新加载</button>
    </div>

    <div v-else-if="!hasNodes" class="topology topology-placeholder">
      <strong>暂无已纳管拓扑</strong>
      <span>完成首次纳管后将在这里显示生产节点。</span>
    </div>

    <div v-else class="topology">
      <p v-if="error" class="topology-refresh-error" role="alert">
        刷新失败：{{ error }}，当前显示上次获取的数据。
      </p>

      <div class="masterrow">
        <div v-if="masterNode" class="node" :class="{ abnormal: !nodeHealthy(masterNode) }">
          <div class="icon">
            <svg class="node-svg" viewBox="0 0 48 48" aria-hidden="true">
              <defs>
                <linearGradient id="dbGradMaster" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#73b7ff"/>
                  <stop offset="1" stop-color="#2563eb"/>
                </linearGradient>
              </defs>
              <ellipse cx="24" cy="12" rx="13" ry="6.5" fill="url(#dbGradMaster)"/>
              <path d="M11 12v9c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5v-9" fill="#4a93ed"/>
              <path d="M11 21v9c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5v-9" fill="#3078df"/>
              <path d="M11 21c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5M11 30c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5" stroke="#d9ecff" stroke-width="1.8" fill="none"/>
              <ellipse cx="24" cy="12" rx="13" ry="6.5" fill="none" stroke="#d4eaff" stroke-width="1.4"/>
            </svg>
          </div>
          <div>
            <div class="label">
              Master
              <span v-if="showVersion" class="version-pill">Redis {{ masterNode.redisVersion || '--' }}</span>
            </div>
            <div class="ip">{{ address(masterNode) }}</div>
          </div>
          <span class="check">{{ nodeHealthy(masterNode) ? '✓' : '!' }}</span>
        </div>
      </div>

      <div v-if="replicaNodes.length" class="branches" aria-hidden="true"></div>

      <div v-if="replicaNodes.length" class="replicas">
        <div
          v-for="(node, index) in replicaNodes"
          :key="node.instanceId || address(node)"
          class="node replica"
          :class="{ abnormal: !nodeHealthy(node) }"
        >
          <div class="icon">
            <svg class="node-svg" viewBox="0 0 48 48" aria-hidden="true">
              <defs>
                <linearGradient :id="'dbGradReplica' + index" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#73b7ff"/>
                  <stop offset="1" stop-color="#2563eb"/>
                </linearGradient>
              </defs>
              <ellipse cx="24" cy="12" rx="13" ry="6.5" :fill="'url(#dbGradReplica' + index + ')'"/>
              <path d="M11 12v9c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5v-9" fill="#4a93ed"/>
              <path d="M11 21v9c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5v-9" fill="#3078df"/>
              <path d="M11 21c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5M11 30c0 3.6 5.8 6.5 13 6.5s13-2.9 13-6.5" stroke="#d9ecff" stroke-width="1.8" fill="none"/>
              <ellipse cx="24" cy="12" rx="13" ry="6.5" fill="none" stroke="#d4eaff" stroke-width="1.4"/>
            </svg>
          </div>
          <div>
            <div class="label">
              Replica
              <span v-if="showVersion" class="version-pill">Redis {{ node.redisVersion || '--' }}</span>
            </div>
            <div class="ip">{{ address(node) }}</div>
          </div>
          <span class="check">{{ nodeHealthy(node) ? '✓' : '!' }}</span>
        </div>
      </div>

      <div class="sentinels">
        <div
          v-for="sentinel in sentinels"
          :key="sentinel.id || sentinel.sentinelId || sentinelAddress(sentinel)"
          class="sentinel"
          :class="{ abnormal: !sentinelHealthy(sentinel) }"
        >
          <span class="shield">
            <svg class="sentinel-svg" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M24 4 39 10v12c0 10-6.2 16.3-15 21C15.2 38.3 9 32 9 22V10L24 4Z" fill="#e7f1ff" stroke="#4e8de1" stroke-width="2" stroke-linejoin="round"/>
              <path d="M24 11 33 14.5v8c0 6.1-3.7 10.4-9 13.5-5.3-3.1-9-7.4-9-13.5v-8L24 11Z" fill="#ffffff"/>
              <path d="M24 17v13M17.5 23.5h13" stroke="#2771d5" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </span>
          <div class="details">
            <strong>Sentinel</strong>
            <small>{{ sentinelAddress(sentinel) }}</small>
          </div>
          <span class="state">{{ sentinelHealthy(sentinel) ? '✓' : '!' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'RecoveryTopology',

  props: {
    showVersion: Boolean,
    topology: {
      type: Object,
      default: () => ({ status: '未知', nodes: [] })
    },
    nodeStatuses: {
      type: Array,
      default: () => []
    },
    sentinels: {
      type: Array,
      default: () => []
    },
    loading: Boolean,
    error: {
      type: String,
      default: ''
    },
    refreshedAt: {
      type: String,
      default: ''
    }
  },

  computed: {
    nodes() {
      const statusById = {}
      this.nodeStatuses.forEach(item => {
        statusById[item.instanceId] = item
      })

      return (this.topology.nodes || []).map(node => ({
        ...node,
        runStatus: statusById[node.instanceId]
          ? statusById[node.instanceId].runStatus
          : node.runStatus
      }))
    },

    masterNode() {
      return this.nodes.find(node => String(node.role).toUpperCase() === 'MASTER')
    },

    replicaNodes() {
      return this.nodes.filter(node => String(node.role).toUpperCase() !== 'MASTER')
    },

    hasNodes() {
      return this.nodes.length > 0
    },

    topologyStatus() {
      return this.topology.status || '未知'
    },

    topologyStatusClass() {
      if (['健康', '正常'].includes(this.topologyStatus)) return 'success'
      if (['警告', '异常'].includes(this.topologyStatus)) return 'warning'
      return 'neutral'
    }
  },

  methods: {
    address(node) {
      return `${node.ip || node.hostIp || '--'}:${node.port || node.redisPort || '--'}`
    },

    sentinelAddress(sentinel) {
      return `${sentinel.sentinelIp || sentinel.nodeIp || '--'}:${sentinel.sentinelPort || sentinel.nodePort || '--'}`
    },

    nodeHealthy(node) {
      const runStatus = String(node.runStatus || '')
      const copyStatus = String(node.copyStatus || '')
      const unhealthyStatuses = ['严重', '离线', '异常', '0', '3']
      const delayedStatuses = ['延迟', '警告', '1', '2']
      return !unhealthyStatuses.includes(runStatus)
        && !delayedStatuses.includes(copyStatus)
    },

    sentinelHealthy(sentinel) {
      return ['1', '在线', '正常', 'ONLINE'].includes(String(sentinel.sentinelStatus).toUpperCase())
    }
  }
}
</script>



