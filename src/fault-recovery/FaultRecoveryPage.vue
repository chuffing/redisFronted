<template>
  <div class="recovery-page">
    <a class="skip-link" href="#recovery-main">跳到页面内容</a>

    <main id="recovery-main" class="container" tabindex="-1">
      <RecoveryTopology
        :topology="topology"
        :node-statuses="nodeStatuses"
        :sentinels="sentinels"
        :loading="loadingEnvironment"
        :error="environmentError"
        :refreshed-at="refreshedAt"
        @refresh="loadEnvironment"
      />

      <RecoveryForm
        :nodes="nodes"
        :disabled="recoveryDisabled"
        :submitting="submitting"
        :blocked-reason="blockedReason"
        :request-error="submissionError"
        @submit="submitRecovery"
      />

      <RecoveryProgress
        :task="task"
        :request-error="taskRequestError || submissionError"
        :terminating="terminating"
        @manual-terminate="handleManualTerminate"
      />
    </main>
  </div>
</template>

<script>
import RecoveryForm from './RecoveryForm.vue'
import RecoveryProgress from './RecoveryProgress.vue'
import RecoveryTopology from './RecoveryTopology.vue'
import {
  createFaultRecovery,
  getFaultRecoveryStatus,
  getRecoveryEnvironment,
  manuallyTerminateTask
} from '../api/faultRecovery'

const ACTIVE_TASK_KEY = 'redisOpsActiveRecoveryTask'
const POLLING_STOP_STATUSES = [
  'SUCCESS',
  'FAILED',
  'RESULT_UNKNOWN',
  'MANUALLY_TERMINATED'
]
const TASK_NUMBER_CLEAR_STATUSES = [
  'SUCCESS',
  'FAILED',
  'MANUALLY_TERMINATED'
]

export default {
  name: 'FaultRecoveryPage',

  components: {
    RecoveryForm,
    RecoveryProgress,
    RecoveryTopology
  },

  data() {
    return {
      topology: { status: '未知', nodes: [] },
      nodeStatuses: [],
      sentinels: [],
      // 页面首次绘制时直接进入加载态，避免先显示空拓扑再闪成加载状态。
      loadingEnvironment: true,
      environmentError: '',
      refreshedAt: '',
      submitting: false,
      submissionError: '',
      task: null,
      taskRequestError: '',
      taskRequestPending: false,
      pollingTimer: null,
      terminating: false
    }
  },

  computed: {
    nodes() {
      return this.topology.nodes || []
    },

    taskStatus() {
      if (!this.task) return ''
      return this.task.taskStatus || this.task.status || ''
    },

    taskUnresolved() {
      return Boolean(this.task)
        && !TASK_NUMBER_CLEAR_STATUSES.includes(this.taskStatus)
    },

    taskNeedsPolling() {
      return ['CREATED', 'RUNNING'].includes(this.taskStatus)
    },

    recoveryDisabled() {
      return this.loadingEnvironment
        || this.nodes.length !== 3
        || this.taskUnresolved
    },

    blockedReason() {
      if (this.loadingEnvironment) return '正在读取当前生产拓扑'
      if (this.nodes.length !== 3) return '当前环境必须存在3台已纳管Redis节点'
      if (this.taskStatus === 'RESULT_UNKNOWN') return '请先处理结果未知的任务'
      if (this.taskUnresolved) return '当前已有故障恢复任务正在执行'
      return ''
    }
  },

  async mounted() {
    await this.loadEnvironment()

    const taskNo = window.localStorage.getItem(ACTIVE_TASK_KEY)
    if (!taskNo) return

    this.task = {
      taskNo,
      taskStatus: 'CREATED',
      message: '正在恢复任务状态'
    }
    await this.pollTask()

    if (this.taskNeedsPolling) {
      this.startPolling()
    }
  },

  beforeDestroy() {
    this.stopPolling()
  },

  methods: {
    async loadEnvironment() {
      this.loadingEnvironment = true
      this.environmentError = ''

      try {
        const environment = await getRecoveryEnvironment()
        this.topology = environment.topology || { status: '未知', nodes: [] }
        this.nodeStatuses = environment.nodeStatuses || []
        this.sentinels = environment.sentinels || []
        this.refreshedAt = new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(new Date())
      } catch (error) {
        this.environmentError = error.message || '生产拓扑读取失败'
      } finally {
        this.loadingEnvironment = false
      }
    },

    async submitRecovery(payload) {
      this.submitting = true
      this.submissionError = ''
      this.taskRequestError = ''

      try {
        const createdTask = await createFaultRecovery(payload)
        this.task = createdTask
        window.localStorage.setItem(ACTIVE_TASK_KEY, createdTask.taskNo)
        this.startPolling()
      } catch (error) {
        this.submissionError = error.message || '故障恢复任务创建失败'
      } finally {
        this.submitting = false
      }
    },

    startPolling() {
      this.stopPolling()
      this.pollTask()
      this.pollingTimer = window.setInterval(this.pollTask, 3000)
    },

    stopPolling() {
      if (!this.pollingTimer) return
      window.clearInterval(this.pollingTimer)
      this.pollingTimer = null
    },

    async pollTask() {
      if (!this.task || !this.task.taskNo || this.taskRequestPending) return

      this.taskRequestPending = true
      this.taskRequestError = ''

      try {
        const latestTask = await getFaultRecoveryStatus(this.task.taskNo)
        this.task = latestTask
        const status = latestTask.taskStatus || latestTask.status

        if (POLLING_STOP_STATUSES.includes(status)) {
          this.stopPolling()
        }

        if (TASK_NUMBER_CLEAR_STATUSES.includes(status)) {
          window.localStorage.removeItem(ACTIVE_TASK_KEY)
        }

        if (status === 'SUCCESS') {
          await this.loadEnvironment()
        }
      } catch (error) {
        this.taskRequestError = error.message || '任务状态查询失败，将继续重试'
      } finally {
        this.taskRequestPending = false
      }
    },

    async handleManualTerminate(payload) {
      if (!this.task || !this.task.taskNo) return

      this.terminating = true
      this.taskRequestError = ''

      try {
        await manuallyTerminateTask(this.task.taskNo, payload)
        this.task = await getFaultRecoveryStatus(this.task.taskNo)
        this.stopPolling()
        window.localStorage.removeItem(ACTIVE_TASK_KEY)
      } catch (error) {
        this.taskRequestError = error.message || '人工结束任务失败'
      } finally {
        this.terminating = false
      }
    }
  }
}
</script>



