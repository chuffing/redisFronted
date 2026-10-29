<template>
  <div class="topology-initialization-page">
    <div class="initialization-heading">
      <div>
        <h1>首次纳管</h1>
        <p>选择三台已经完成注册和数据上报的生产服务器。</p>
      </div>
      <span class="initialization-tag">首次使用</span>
    </div>

    <section class="card initialization-card">
      <h2>候选服务器</h2>

      <div class="initialization-body">
        <div class="initialization-notice">
          平台只显示执行器在线，并且 Redis、Sentinel 信息完整的服务器。
          确认纳管前，请确保三台服务器对应的配置文件已经放入平台 current 目录。
        </div>

        <div v-if="loading" class="initialization-state">
          <span class="loading-ring" aria-hidden="true"></span>
          正在读取候选服务器
        </div>

        <div v-else-if="loadError" class="initialization-state error">
          <strong>候选服务器读取失败</strong>
          <span>{{ loadError }}</span>
          <button class="btn neutral" type="button" @click="loadData">重新加载</button>
        </div>

        <div v-else-if="candidates.length < requiredNodeCount" class="initialization-state warning">
          <strong>当前候选服务器不足三台</strong>
          <span>已找到 {{ candidates.length }} 台，请检查执行器注册、在线状态以及 Redis、Sentinel 数据是否完整。</span>
          <button class="btn neutral" type="button" @click="loadData">刷新候选服务器</button>
        </div>

        <template v-else>
          <div class="candidate-grid">
            <div
              v-for="(selectedHostIp, index) in selectedHostIps"
              :key="index"
              class="candidate-field"
            >
              <label :for="`candidate-${index}`">服务器 {{ index + 1 }}</label>
              <select
                :id="`candidate-${index}`"
                v-model="selectedHostIps[index]"
                :disabled="submitting"
              >
                <option value="">请选择服务器</option>
                <option
                  v-for="candidate in candidates"
                  :key="candidate.hostIp"
                  :value="candidate.hostIp"
                  :disabled="isSelectedByOther(candidate.hostIp, index)"
                >
                  {{ candidate.hostIp }} · 端口 {{ candidate.executorPort }}
                </option>
              </select>

              <div v-if="selectedCandidates[index]" class="candidate-details">
                <div>
                  <span>执行器状态</span>
                  <strong :class="{ 'online-status': selectedCandidates[index].executorStatus === '1' }">
                    {{ executorStatusText(selectedCandidates[index].executorStatus) }}
                  </strong>
                </div>
                <div>
                  <span>执行器端口</span>
                  <strong>{{ selectedCandidates[index].executorPort }}</strong>
                </div>
                <div>
                  <span>最近心跳</span>
                  <strong>{{ formatDateTime(selectedCandidates[index].lastHeartbeatTime) }}</strong>
                </div>
                <div>
                  <span>最近上报</span>
                  <strong>{{ formatDateTime(selectedCandidates[index].lastReportTime) }}</strong>
                </div>
              </div>
              <div v-else class="candidate-placeholder">
                选择后显示执行器信息
              </div>
            </div>
          </div>

          <div class="initialization-footer">
            <span v-if="submitError" class="submit-error">{{ submitError }}</span>
            <span v-else class="selection-summary">
              已选择 {{ selectedCount }}/{{ requiredNodeCount }} 台服务器
            </span>
            <button
              class="btn initialization-button"
              type="button"
              :disabled="!canSubmit"
              @click="confirmInitialization"
            >
              {{ submitting ? '正在纳管' : '确认纳管' }}
            </button>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script>
import {
  getInstances,
  getTopologyInitializationCandidates,
  initializeTopology
} from '@/api'
import { formatDateTime } from '@/utils/format'

export default {
  name: 'TopologyInitializationPage',
  data() {
    return {
      requiredNodeCount: 3,
      candidates: [],
      selectedHostIps: ['', '', ''],
      loading: false,
      submitting: false,
      loadError: '',
      submitError: ''
    }
  },
  computed: {
    selectedCount() {
      return this.selectedHostIps.filter(Boolean).length
    },
    selectedCandidates() {
      return this.selectedHostIps.map(hostIp => (
        this.candidates.find(candidate => candidate.hostIp === hostIp)
        || null
      ))
    },
    canSubmit() {
      const selected = this.selectedHostIps.filter(Boolean)
      return !this.submitting
        && selected.length === this.requiredNodeCount
        && new Set(selected).size === this.requiredNodeCount
    }
  },
  mounted() {
    this.loadData()
  },
  methods: {
    async loadData() {
      this.loading = true
      this.loadError = ''
      this.submitError = ''

      try {
        // 已经存在正式纳管实例时，不允许再次进入首次纳管流程。
        try {
          const managedInstances = await getInstances()
          if (managedInstances && managedInstances.length > 0) {
            await this.$router.replace('/dashboard')
            return
          }
        } catch (error) {
          // 状态预检查失败时仍继续读取候选服务器。
          // 候选接口的结果可以更准确地告诉用户当前是否具备首次纳管条件。
        }

        const candidates = await getTopologyInitializationCandidates()
        this.candidates = (candidates || []).slice().sort((left, right) => (
          String(left.hostIp).localeCompare(String(right.hostIp))
        ))

        // 刷新候选数据后，清除已经不再可用的选择。
        this.selectedHostIps = this.selectedHostIps.map(hostIp => (
          this.candidates.some(candidate => candidate.hostIp === hostIp)
            ? hostIp
            : ''
        ))
      } catch (error) {
        this.loadError = error.message || '候选服务器读取失败'
      } finally {
        this.loading = false
      }
    },
    isSelectedByOther(hostIp, currentIndex) {
      return this.selectedHostIps.some((selectedHostIp, index) => (
        index !== currentIndex && selectedHostIp === hostIp
      ))
    },
    formatDateTime(value) {
      return value ? formatDateTime(value) : '--'
    },
    executorStatusText(status) {
      if (String(status) === '1') return '在线'
      if (String(status) === '0') return '离线'
      return status || '未知'
    },
    async confirmInitialization() {
      if (!this.canSubmit) return

      const hostIps = this.selectedHostIps.slice()
      try {
        await this.$confirm(
          `确认将 ${hostIps.join('、')} 作为当前生产拓扑正式纳管？`,
          '确认首次纳管',
          {
            confirmButtonText: '确认纳管',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch (error) {
        return
      }

      this.submitting = true
      this.submitError = ''
      try {
        const result = await initializeTopology(hostIps)
        this.$message.success((result && result.message) || '首次纳管完成')
        await this.$router.replace('/dashboard')
      } catch (error) {
        this.submitError = error.message || '首次纳管失败'
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.topology-initialization-page {
  max-width: 1320px;
  margin: 0 auto;
}

.initialization-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.initialization-heading h1 {
  margin: 0;
  color: #172b4d;
  font-size: 28px;
  line-height: 1.25;
}

.initialization-heading p {
  margin: 5px 0 0;
  color: #71839d;
  font-size: 13px;
}

.initialization-tag {
  align-self: flex-start;
  margin-top: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  color: #2867c7;
  background: #eaf3ff;
  font-size: 12px;
  font-weight: 700;
}

.initialization-card h2 {
  position: relative;
  margin: 0;
  padding: 13px 20px 13px 39px;
  border-bottom: 1px solid #e7edf6;
  color: #18365e;
  font-size: 17px;
}

.initialization-card h2::before {
  position: absolute;
  top: 50%;
  left: 20px;
  width: 4px;
  height: 18px;
  border-radius: 4px;
  background: #2d7cf4;
  content: '';
  transform: translateY(-50%);
}

.initialization-body {
  padding: 18px 20px 20px;
}

.initialization-notice {
  margin-bottom: 16px;
  padding: 10px 13px;
  border: 1px solid #d8e7fa;
  border-radius: 7px;
  color: #4e6d94;
  background: #f4f8fe;
  font-size: 12px;
  line-height: 1.7;
}

.candidate-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.candidate-field {
  min-width: 0;
  padding: 15px;
  border: 1px solid #dde6f2;
  border-radius: 9px;
  background: #fbfcfe;
}

.candidate-field > label {
  display: block;
  margin-bottom: 7px;
  color: #415c80;
  font-size: 13px;
  font-weight: 700;
}

.candidate-field select {
  width: 100%;
  min-height: 40px;
  padding: 8px 34px 8px 11px;
  border: 1px solid #cfdbeb;
  border-radius: 7px;
  outline: none;
  color: #244568;
  background: #fff;
  font: inherit;
}

.candidate-field select:focus {
  border-color: #4f91f3;
  box-shadow: 0 0 0 3px #e3efff;
}

.candidate-details {
  margin-top: 13px;
  border-top: 1px solid #e6ecf4;
}

.candidate-details > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 35px;
  border-bottom: 1px solid #edf1f6;
  font-size: 12px;
}

.candidate-details span {
  color: #7b8ba2;
}

.candidate-details strong {
  overflow: hidden;
  color: #304f73;
  font-weight: 600;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-details .online-status {
  color: #0a9664;
}

.candidate-placeholder {
  display: grid;
  min-height: 143px;
  margin-top: 13px;
  place-items: center;
  border-top: 1px solid #e6ecf4;
  color: #9aa7b9;
  font-size: 12px;
}

.initialization-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  margin-top: 17px;
  padding-top: 15px;
  border-top: 1px solid #e7edf5;
}

.selection-summary {
  color: #71839d;
  font-size: 12px;
}

.submit-error {
  color: #c94f5c;
  font-size: 12px;
  font-weight: 600;
}

.initialization-button {
  min-width: 142px;
  color: #fff;
  background: #256fe7;
}

.initialization-button:hover:not(:disabled) {
  background: #1d61cf;
}

.initialization-state {
  display: flex;
  min-height: 250px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: #74859e;
  text-align: center;
}

.initialization-state strong {
  color: #29496d;
  font-size: 16px;
}

.initialization-state.error strong {
  color: #c64e5a;
}

.initialization-state.warning strong {
  color: #a66b13;
}

@media(max-width: 900px) {
  .candidate-grid {
    grid-template-columns: 1fr;
  }

  .candidate-placeholder {
    min-height: 72px;
  }
}

@media(max-width: 600px) {
  .initialization-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .initialization-heading h1 {
    font-size: 24px;
  }

  .initialization-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .initialization-button {
    width: 100%;
  }
}
</style>
