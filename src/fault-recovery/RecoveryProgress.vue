<template>
  <section class="card progress-card" aria-labelledby="progress-title">
    <h2 id="progress-title">
      恢复进度
      <span class="progress-pill pill" :class="statusClass">{{ statusText }}</span>
    </h2>

    <div class="progressbody">
      <div v-if="task" class="taskinfo">
        任务编号：{{ task.taskNo || '--' }}
      </div>

      <div class="steps" aria-label="故障恢复执行流程">
        <div v-for="(step, index) in steps" :key="step" class="step" :class="stepClass(index)">
          <div class="circle">
            <span v-if="stepClass(index).completed">✓</span>
            <span v-else-if="stepClass(index).unknown">!</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          {{ step }}
        </div>
      </div>

      <div v-if="!task" class="message">⬡ 暂无进行中的任务</div>

      <div v-else-if="taskStatus === 'CREATED'" class="message running" role="status">
        任务已创建，正在等待执行器接收
      </div>

      <div v-else-if="taskStatus === 'RUNNING'" class="message running" role="status">
        {{ task.message || '正在执行故障恢复，平台每3秒自动更新任务状态' }}
      </div>

      <div v-else-if="taskStatus === 'SUCCESS'" class="message success" role="status">
        ✓ 故障恢复完成，Redis 与 Sentinel 已启动
      </div>

      <div v-else-if="taskStatus === 'FAILED'" class="message failed" role="alert">
        × 故障恢复失败：{{ failureReason }}
      </div>

      <div v-else-if="taskStatus === 'RESULT_UNKNOWN'" class="message unknown" role="alert">
        <span>⚠ 执行结果未知：{{ failureReason || '请登录服务器核实 Redis 与 Sentinel 状态' }}</span>
        <button type="button" class="btn warning action" @click="openManualDialog">人工结束任务</button>
      </div>

      <div v-else-if="taskStatus === 'MANUALLY_TERMINATED'" class="message terminated" role="status">
        ✓ 任务已人工结束：{{ task.terminationReason || '未填写处理说明' }}
      </div>

      <div v-if="task && (task.terminatedTime || task.endTime)" class="time">
        {{ task.terminatedBy || '' }} {{ task.terminatedTime || task.endTime }}
      </div>

      <p v-if="requestError" class="progress-error" role="alert">{{ requestError }}</p>
    </div>

    <div v-if="manualDialogVisible" class="modalwrap show" @click.self="closeManualDialog">
      <section ref="manualDialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div class="modalhead">
          <span id="manual-title">⚠ 人工结束任务</span>
          <button ref="closeButton" type="button" class="close" aria-label="关闭" @click="closeManualDialog">×</button>
        </div>

        <div class="modalnotice">⚠ 仅在已人工核实三台服务器状态后执行</div>

        <div class="field">
          <label for="manual-reason">处理说明</label>
          <textarea id="manual-reason" v-model.trim="terminationReason" maxlength="300" placeholder="填写人工核实结果"></textarea>
        </div>

        <div class="field manual-operator">
          <label for="manual-operator">操作人</label>
          <input id="manual-operator" :value="terminatedBy" disabled>
        </div>

        <label class="confirm">
          <input v-model="environmentConfirmed" type="checkbox">
          我已确认当前真实环境状态
        </label>

        <p v-if="manualError" class="modal-error" role="alert">{{ manualError }}</p>

        <div class="modalbuttons">
          <button type="button" class="btn neutral" @click="closeManualDialog">取消</button>
          <button type="button" class="btn warning" :disabled="terminating || !environmentConfirmed" @click="submitManualResult">
            {{ terminating ? '正在提交' : '确认人工结束' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script>
import { getCurrentOperator } from '../utils/currentUser'

export default {
  name: 'RecoveryProgress',

  props: {
    task: {
      type: Object,
      default: null
    },
    requestError: {
      type: String,
      default: ''
    },
    terminating: Boolean
  },

  data() {
    return {
      steps: ['停止Sentinel', '停止Redis', '恢复配置', '启动Redis', '启动Sentinel'],
      manualDialogVisible: false,
      terminationReason: '',
      terminatedBy: getCurrentOperator(),
      environmentConfirmed: false,
      manualError: '',
      manualDialogTrigger: null
    }
  },

  computed: {
    taskStatus() {
      if (!this.task) return ''
      return this.task.taskStatus || this.task.status || ''
    },

    statusText() {
      const labels = {
        CREATED: '等待执行',
        RUNNING: '执行中',
        SUCCESS: '恢复成功',
        FAILED: '恢复失败',
        RESULT_UNKNOWN: '结果未知',
        MANUALLY_TERMINATED: '人工结束'
      }
      return this.task ? (labels[this.taskStatus] || '状态未知') : '待执行'
    },

    statusClass() {
      const classes = {
        CREATED: 'waiting',
        RUNNING: 'running',
        SUCCESS: 'success',
        FAILED: 'danger',
        RESULT_UNKNOWN: 'warning',
        MANUALLY_TERMINATED: 'neutral'
      }
      return this.task ? (classes[this.taskStatus] || 'neutral') : 'neutral'
    },

    failureReason() {
      if (!this.task) return ''
      return this.task.failureReason || this.task.message || '平台未返回具体原因'
    },

    currentStepIndex() {
      if (!this.task) return -1
      if (this.taskStatus === 'SUCCESS') return this.steps.length

      const stepNo = Number(this.task.currentStepNo || this.task.stepNo || 0)
      if (stepNo > 0) return Math.min(stepNo - 1, this.steps.length - 1)
      return this.taskStatus === 'RUNNING' ? 0 : -1
    }
  },

  mounted() {
    window.addEventListener('keydown', this.handleKeydown)
  },

  beforeDestroy() {
    window.removeEventListener('keydown', this.handleKeydown)
  },

  methods: {
    stepClass(index) {
      return {
        completed: this.taskStatus === 'SUCCESS' || index < this.currentStepIndex,
        active: ['CREATED', 'RUNNING'].includes(this.taskStatus) && index === this.currentStepIndex,
        unknown: ['FAILED', 'RESULT_UNKNOWN'].includes(this.taskStatus) && index === this.currentStepIndex
      }
    },

    openManualDialog() {
      this.manualDialogTrigger = document.activeElement
      this.manualDialogVisible = true
      this.$nextTick(() => this.$refs.closeButton.focus())
    },

    closeManualDialog() {
      this.manualDialogVisible = false
      this.environmentConfirmed = false
      this.manualError = ''
      if (this.manualDialogTrigger) this.manualDialogTrigger.focus()
    },

    handleKeydown(event) {
      if (!this.manualDialogVisible) return
      if (event.key === 'Escape') this.closeManualDialog()
      if (event.key !== 'Tab') return

      const controls = this.$refs.manualDialog.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },

    submitManualResult() {
      this.manualError = ''

      if (!this.terminationReason) {
        this.manualError = '请填写人工处理说明'
        return
      }
      if (!this.terminatedBy) {
        this.manualError = '未获取到当前登录账号，请重新登录后再试'
        return
      }
      if (!this.environmentConfirmed) return

      this.$emit('manual-terminate', {
        terminationReason: this.terminationReason,
        terminatedBy: this.terminatedBy
      })
      this.closeManualDialog()
    }
  }
}
</script>



