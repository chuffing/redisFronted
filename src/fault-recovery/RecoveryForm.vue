<template>
  <section class="card operation-card" aria-labelledby="operation-title">
    <h2 id="operation-title">恢复操作</h2>

    <div class="operation">
      <div class="field" :class="{ invalid: reasonError }">
        <label for="recovery-reason">操作原因</label>
        <input
          id="recovery-reason"
          ref="reasonInput"
          v-model.trim="operationReason"
          maxlength="200"
          placeholder="请输入操作原因"
          :disabled="submitting"
          @blur="validateReason"
          @keyup.enter="openConfirmation"
        >
        <span v-if="reasonError" class="field-error">{{ reasonError }}</span>
      </div>

      <div class="field">
        <label for="recovery-operator">操作人</label>
        <input id="recovery-operator" :value="createdBy" disabled>
      </div>

      <button
        type="button"
        class="btn primary"
        :disabled="disabled || submitting"
        @click="openConfirmation"
      >
        {{ submitting ? '正在提交' : '执行故障恢复' }}
      </button>

      <div class="alert" :class="{ blocked: blockedReason || requestError || formError }" role="status">
        ⚠ {{ requestError || formError || blockedReason || '恢复期间服务将短暂中断' }}
      </div>
    </div>

    <div v-if="confirmationVisible" class="modalwrap show" @click.self="closeConfirmation">
      <section
        ref="confirmDialog"
        class="modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-recovery-title"
      >
        <div class="modalhead">
          <span id="confirm-recovery-title">⚠ 确认执行故障恢复</span>
          <button ref="closeButton" type="button" class="close" aria-label="关闭" @click="closeConfirmation">×</button>
        </div>

        <div class="modalnotice">⚠ 任务提交后会依次停止并重启 Redis 与 Sentinel 服务</div>

        <dl class="confirm-details">
          <div>
            <dt>操作原因</dt>
            <dd>{{ operationReason }}</dd>
          </div>
          <div>
            <dt>操作人</dt>
            <dd>{{ createdBy }}</dd>
          </div>
        </dl>

        <div class="confirm-node-list">
          <span v-for="node in nodes" :key="node.instanceId || node.id || node.ip">
            {{ node.ip || node.hostIp }}:{{ node.port || node.redisPort }}
          </span>
        </div>

        <label class="confirm">
          <input v-model="impactConfirmed" type="checkbox">
          我已确认恢复期间可能发生服务中断
        </label>

        <div class="modalbuttons">
          <button type="button" class="btn neutral" @click="closeConfirmation">取消</button>
          <button type="button" class="btn warning" :disabled="!impactConfirmed" @click="confirmRecovery">确认执行</button>
        </div>
      </section>
    </div>
  </section>
</template>

<script>
import { getCurrentOperator } from '../utils/currentUser'

export default {
  name: 'RecoveryForm',

  props: {
    nodes: {
      type: Array,
      default: () => []
    },
    disabled: Boolean,
    submitting: Boolean,
    blockedReason: {
      type: String,
      default: ''
    },
    requestError: {
      type: String,
      default: ''
    }
  },

  data() {
    return {
      operationReason: '',
      createdBy: getCurrentOperator(),
      reasonError: '',
      formError: '',
      confirmationVisible: false,
      impactConfirmed: false,
      confirmationTrigger: null
    }
  },

  mounted() {
    window.addEventListener('keydown', this.handleKeydown)
  },

  beforeDestroy() {
    window.removeEventListener('keydown', this.handleKeydown)
  },

  methods: {
    validateReason() {
      this.reasonError = this.operationReason ? '' : '请输入操作原因'
      return !this.reasonError
    },

    openConfirmation() {
      this.formError = ''

      if (!this.validateReason()) {
        this.formError = '请输入操作原因'
        this.$refs.reasonInput.focus()
        return
      }

      if (!this.createdBy) {
        this.formError = '未获取到当前登录账号，请重新登录后再试'
        return
      }

      this.impactConfirmed = false
      this.confirmationTrigger = document.activeElement
      this.confirmationVisible = true
      this.$nextTick(() => this.$refs.closeButton.focus())
    },

    closeConfirmation() {
      this.confirmationVisible = false
      this.impactConfirmed = false
      if (this.confirmationTrigger) this.confirmationTrigger.focus()
    },

    confirmRecovery() {
      if (!this.impactConfirmed) return

      this.$emit('submit', {
        operationReason: this.operationReason,
        createdBy: this.createdBy
      })
      this.closeConfirmation()
    },

    handleKeydown(event) {
      if (!this.confirmationVisible) return
      if (event.key === 'Escape') this.closeConfirmation()
      if (event.key !== 'Tab') return

      const controls = this.$refs.confirmDialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}
</script>



