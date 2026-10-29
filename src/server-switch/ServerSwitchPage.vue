<template>
  <div class="recovery-page server-switch-page">
    <a class="skip-link" href="#server-switch-main">跳到页面内容</a>
    <main id="server-switch-main" class="container" tabindex="-1">
      <div class="pagehead">
        <h1>服务器切换</h1>
      </div>

      <RecoveryTopology
        show-version
        :topology="topology"
        :node-statuses="nodeStatuses"
        :sentinels="sentinels"
        :loading="loadingEnvironment"
        :error="environmentError"
        :refreshed-at="refreshedAt"
        @refresh="loadEnvironment"
      />

      <section class="card target-card" aria-labelledby="target-title">
        <h2 id="target-title">目标服务器</h2>
        <div class="target-settings">
          <div class="target-version-row">
            <div class="field">
              <label for="switch-version">目标版本</label>
              <select
                id="switch-version"
                v-model="selectedPackageId"
                :disabled="taskLocked || loadingPackages || !packages.length"
              >
                <option v-if="!packages.length" value="">暂无可用版本</option>
                <option
                  v-for="item in packages"
                  :key="item.packageId"
                  :value="String(item.packageId)"
                >Redis {{ item.redisVersion }}</option>
              </select>
            </div>
          </div>

          <div class="target-node-grid">
            <div class="field" :class="{ invalid: fieldErrors.masterHostIp }">
              <label for="switch-master">主节点</label>
              <input
                id="switch-master"
                ref="masterInput"
                v-model.trim="masterHostIp"
                :disabled="taskLocked"
                maxlength="64"
                placeholder="请输入目标服务器 IP"
                @blur="validateHosts"
              >
              <span v-if="fieldErrors.masterHostIp" class="field-error">{{ fieldErrors.masterHostIp }}</span>
            </div>

            <div class="field" :class="{ invalid: fieldErrors.replicaOneHostIp }">
              <label for="switch-replica-one">从节点 1</label>
              <input
                id="switch-replica-one"
                v-model.trim="replicaOneHostIp"
                :disabled="taskLocked"
                maxlength="64"
                placeholder="请输入目标服务器 IP"
                @blur="validateHosts"
              >
              <span v-if="fieldErrors.replicaOneHostIp" class="field-error">{{ fieldErrors.replicaOneHostIp }}</span>
            </div>

            <div class="field" :class="{ invalid: fieldErrors.replicaTwoHostIp }">
              <label for="switch-replica-two">从节点 2</label>
              <input
                id="switch-replica-two"
                v-model.trim="replicaTwoHostIp"
                :disabled="taskLocked"
                maxlength="64"
                placeholder="请输入目标服务器 IP"
                @blur="validateHosts"
              >
              <span v-if="fieldErrors.replicaTwoHostIp" class="field-error">{{ fieldErrors.replicaTwoHostIp }}</span>
            </div>
          </div>

          <p v-if="packageError" class="section-error" role="alert">{{ packageError }}</p>
        </div>
      </section>

      <section class="card switch-operation-card" aria-labelledby="operation-title">
        <h2 id="operation-title">切换操作</h2>
        <div class="switch-operation">
          <div class="field operation-reason" :class="{ invalid: fieldErrors.operationReason }">
            <label for="switch-reason">操作原因</label>
            <input
              id="switch-reason"
              ref="reasonInput"
              v-model.trim="operationReason"
              :disabled="taskLocked"
              maxlength="200"
              placeholder="请输入操作原因"
              @blur="validateReason"
            >
            <span v-if="fieldErrors.operationReason" class="field-error">{{ fieldErrors.operationReason }}</span>
          </div>

          <div class="field operator-field">
            <label for="switch-operator">操作人</label>
            <input id="switch-operator" :value="createdBy" disabled>
          </div>

          <button
            type="button"
            class="btn primary switch-button"
            :disabled="switchDisabled"
            @click="openSwitchConfirmation"
          >{{ submitting ? '正在提交' : '执行服务器切换' }}</button>

          <div class="alert switch-alert" :class="{ blocked: submitError || blockedReason }">
            ⚠ {{ submitError || blockedReason || '新集群启动后将停止旧集群，请确认目标配置正确' }}
          </div>
        </div>
      </section>

      <section class="card switch-progress-card" aria-labelledby="switch-progress-title">
        <h2 id="switch-progress-title">
          切换进度
          <span class="progress-pill pill" :class="statusClass">{{ statusText }}</span>
        </h2>

        <div class="progressbody">
          <div v-if="task" class="taskinfo">
            任务编号：{{ task.taskNo || '--' }}
            <span v-if="task.targetVersion"> 目标版本：Redis {{ task.targetVersion }}</span>
            <span v-if="task.masterHostIp"> 目标主节点：{{ task.masterHostIp }}</span>
          </div>

          <div class="steps switch-steps" aria-label="服务器切换执行流程">
            <div
              v-for="(step, index) in steps"
              :key="step.label"
              class="step"
              :class="stepClass(index)"
            >
              <div class="circle">
                <span v-if="stepClass(index).done">✓</span>
                <span v-else-if="stepClass(index).unknown">!</span>
                <span v-else>{{ index + 1 }}</span>
              </div>
              {{ step.label }}
            </div>
          </div>

          <div v-if="!task" class="message">◇ 暂无进行中的任务</div>
          <div v-else-if="taskStatus === 'CREATED'" class="message running">任务已创建，正在等待执行器接收</div>
          <div v-else-if="taskStatus === 'RUNNING'" class="message running">{{ task.message || '正在执行服务器切换' }}</div>
          <div v-else-if="taskStatus === 'SUCCESS'" class="message success">✓ 服务器切换完成，已加载新的生产拓扑</div>
          <div v-else-if="taskStatus === 'FAILED'" class="message failed">× 服务器切换失败：{{ failureReason }}</div>
          <div v-else-if="taskStatus === 'RESULT_UNKNOWN'" class="message unknown">
            <span>⚠ 无法确认最终切换结果：{{ failureReason }}</span>
            <button type="button" class="btn warning action" @click="openManualDialog">人工结束任务</button>
          </div>
          <div v-else-if="taskStatus === 'MANUALLY_TERMINATED'" class="message terminated">
            ✓ 任务已人工结束：{{ task.terminationReason || '未填写处理说明' }}
          </div>

          <p v-if="taskError" class="progress-error" role="alert">{{ taskError }}</p>
        </div>
      </section>
    </main>

    <div v-if="confirmDialogVisible" class="modalwrap show" @click.self="closeSwitchConfirmation">
      <section class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="switch-modal-title">
        <div class="modalhead">
          <span id="switch-modal-title">⚠ 确认服务器切换</span>
          <button ref="confirmCloseButton" type="button" class="close" aria-label="关闭" @click="closeSwitchConfirmation">×</button>
        </div>
        <div class="modalnotice">平台将部署并启动新集群，随后停止当前生产集群。</div>
        <dl class="confirm-details">
          <div><dt>目标版本</dt><dd>Redis {{ selectedPackage ? selectedPackage.redisVersion : '--' }}</dd></div>
          <div><dt>目标主节点</dt><dd>{{ masterHostIp }}</dd></div>
          <div><dt>目标从节点</dt><dd>{{ replicaOneHostIp }}、{{ replicaTwoHostIp }}</dd></div>
          <div><dt>操作原因</dt><dd>{{ operationReason }}</dd></div>
          <div><dt>操作人</dt><dd>{{ createdBy }}</dd></div>
        </dl>
        <label class="confirm">
          <input v-model="switchConfirmed" type="checkbox">
          我已确认目标服务器、版本及平台上的对应配置文件
        </label>
        <div class="modalbuttons">
          <button type="button" class="btn neutral" @click="closeSwitchConfirmation">取消</button>
          <button type="button" class="btn warning" :disabled="!switchConfirmed" @click="submitSwitch">确认切换</button>
        </div>
      </section>
    </div>

    <div v-if="manualDialogVisible" class="modalwrap show" @click.self="closeManualDialog">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="manual-switch-title">
        <div class="modalhead">
          <span id="manual-switch-title">⚠ 人工结束任务</span>
          <button ref="manualCloseButton" type="button" class="close" aria-label="关闭" @click="closeManualDialog">×</button>
        </div>
        <div class="modalnotice">仅在已核实新旧服务器真实运行状态和纳管关系后执行</div>
        <div class="field">
          <label for="switch-manual-reason">处理说明</label>
          <textarea id="switch-manual-reason" v-model.trim="terminationReason" maxlength="300" placeholder="填写人工核实结果"></textarea>
        </div>
        <div class="field manual-operator">
          <label for="switch-manual-operator">操作人</label>
          <input id="switch-manual-operator" :value="createdBy" disabled>
        </div>
        <label class="confirm">
          <input v-model="environmentConfirmed" type="checkbox">
          我已确认当前真实环境状态
        </label>
        <p v-if="manualError" class="modal-error" role="alert">{{ manualError }}</p>
        <div class="modalbuttons">
          <button type="button" class="btn neutral" @click="closeManualDialog">取消</button>
          <button type="button" class="btn warning" :disabled="terminating || !environmentConfirmed" @click="submitManualTermination">
            {{ terminating ? '正在提交' : '确认人工结束' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script>
import RecoveryTopology from '../fault-recovery/RecoveryTopology.vue'
import { getCurrentOperator } from '../utils/currentUser'
import {
  createServerSwitch,
  getServerSwitchEnvironment,
  getServerSwitchStatus,
  listServerSwitchPackages,
  manuallyTerminateServerSwitch
} from '../api/serverSwitch'

const ACTIVE_TASK_KEY = 'redisOpsActiveServerSwitchTask'
const POLLING_STOP_STATUSES = ['SUCCESS', 'FAILED', 'RESULT_UNKNOWN', 'MANUALLY_TERMINATED']
const TASK_NUMBER_CLEAR_STATUSES = ['SUCCESS', 'FAILED', 'MANUALLY_TERMINATED']
const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

export default {
  name: 'ServerSwitchPage',

  components: {
    RecoveryTopology
  },

  data() {
    return {
      topology: { status: '未知', nodes: [] },
      nodeStatuses: [],
      sentinels: [],
      refreshedAt: '',
      // 首次绘制时直接显示稳定加载态，避免页面切换时短暂出现空拓扑。
      loadingEnvironment: true,
      environmentError: '',
      packages: [],
      loadingPackages: true,
      packageError: '',
      selectedPackageId: '',
      masterHostIp: '',
      replicaOneHostIp: '',
      replicaTwoHostIp: '',
      operationReason: '',
      createdBy: getCurrentOperator(),
      fieldErrors: {},
      submitting: false,
      submitError: '',
      task: null,
      taskError: '',
      pollingTimer: null,
      pollingPending: false,
      confirmDialogVisible: false,
      switchConfirmed: false,
      manualDialogVisible: false,
      terminationReason: '',
      environmentConfirmed: false,
      manualError: '',
      terminating: false,
      steps: [
        { label: '主机预检', start: 1, end: 1 },
        { label: '部署版本与配置', start: 2, end: 6 },
        { label: '启动新 Redis', start: 7, end: 8 },
        { label: '启动新 Sentinel', start: 9, end: 9 },
        { label: '停止旧集群并纳管', start: 10, end: 11 }
      ]
    }
  },

  computed: {
    selectedPackage() {
      return this.packages.find(
        item => String(item.packageId) === String(this.selectedPackageId)
      ) || null
    },

    taskStatus() {
      if (!this.task) return ''
      return this.task.taskStatus || this.task.status || ''
    },

    taskLocked() {
      return Boolean(this.task)
        && !TASK_NUMBER_CLEAR_STATUSES.includes(this.taskStatus)
    },

    blockedReason() {
      if (this.loadingEnvironment || this.loadingPackages) return '正在读取服务器切换环境'
      if (!this.createdBy) return '未获取到当前登录账号，请重新登录后再试'
      if ((this.topology.nodes || []).length !== 3) return '当前环境必须存在3台已纳管Redis节点'
      if (!this.packages.length) return '平台没有可用的Redis版本安装包'
      if (this.taskStatus === 'RESULT_UNKNOWN') return '请先人工处理结果未知的服务器切换任务'
      if (this.taskLocked) return '当前已有服务器切换任务正在执行'
      return ''
    },

    switchDisabled() {
      return this.submitting
        || Boolean(this.blockedReason)
        || !this.selectedPackage
        || !this.masterHostIp
        || !this.replicaOneHostIp
        || !this.replicaTwoHostIp
        || !this.operationReason
    },

    statusText() {
      const labels = {
        CREATED: '等待执行',
        RUNNING: '执行中',
        SUCCESS: '切换成功',
        FAILED: '切换失败',
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
      if (stepNo > 0) {
        const groupIndex = this.steps.findIndex(
          step => stepNo >= step.start && stepNo <= step.end
        )
        return groupIndex < 0 ? 0 : groupIndex
      }
      return this.taskStatus === 'RUNNING' ? 0 : -1
    }
  },

  async mounted() {
    window.addEventListener('keydown', this.handleKeydown)
    await Promise.all([this.loadEnvironment(), this.loadPackages()])

    const taskNo = window.localStorage.getItem(ACTIVE_TASK_KEY)
    if (!taskNo) return

    this.task = {
      taskNo,
      taskStatus: 'CREATED',
      message: '正在恢复服务器切换任务状态'
    }
    await this.pollTask()
    if (['CREATED', 'RUNNING'].includes(this.taskStatus)) this.startPolling()
  },

  beforeDestroy() {
    window.removeEventListener('keydown', this.handleKeydown)
    this.stopPolling()
  },

  methods: {
    async loadEnvironment() {
      this.loadingEnvironment = true
      this.environmentError = ''
      try {
        const environment = await getServerSwitchEnvironment()
        this.topology = environment.topology || { status: '未知', nodes: [] }
        this.nodeStatuses = environment.nodeStatuses || []
        this.sentinels = environment.sentinels || []
        this.refreshedAt = new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date())
      } catch (error) {
        this.environmentError = error.message || '服务器切换环境读取失败'
      } finally {
        this.loadingEnvironment = false
      }
    },

    async loadPackages() {
      this.loadingPackages = true
      this.packageError = ''
      try {
        this.packages = await listServerSwitchPackages() || []
        const selectedAvailable = this.packages.some(
          item => String(item.packageId) === String(this.selectedPackageId)
        )
        if (!selectedAvailable) {
          this.selectedPackageId = this.packages.length
            ? String(this.packages[0].packageId)
            : ''
        }
      } catch (error) {
        this.packages = []
        this.packageError = error.message || '可用版本读取失败'
      } finally {
        this.loadingPackages = false
      }
    },

    validateHosts() {
      const errors = { ...this.fieldErrors }
      const fields = [
        ['masterHostIp', this.masterHostIp],
        ['replicaOneHostIp', this.replicaOneHostIp],
        ['replicaTwoHostIp', this.replicaTwoHostIp]
      ]
      fields.forEach(([name, value]) => {
        if (!value) errors[name] = '请输入服务器 IP'
        else if (!IPV4_PATTERN.test(value)) errors[name] = '请输入正确的 IPv4 地址'
        else delete errors[name]
      })

      const values = fields.map(item => item[1]).filter(Boolean)
      if (values.length === 3 && new Set(values).size !== 3) {
        fields.forEach(([name]) => { errors[name] = '三台目标服务器 IP 不能重复' })
      }
      this.fieldErrors = errors
      return !fields.some(([name]) => errors[name])
    },

    validateReason() {
      const errors = { ...this.fieldErrors }
      if (!this.operationReason) errors.operationReason = '请输入操作原因'
      else delete errors.operationReason
      this.fieldErrors = errors
      return !errors.operationReason
    },

    openSwitchConfirmation() {
      this.submitError = ''
      const hostsValid = this.validateHosts()
      const reasonValid = this.validateReason()
      if (!hostsValid || !reasonValid) {
        this.submitError = '请先修正目标服务器和操作原因'
        this.$nextTick(() => {
          const firstInvalid = this.$el.querySelector('.field.invalid input')
          if (firstInvalid) firstInvalid.focus()
        })
        return
      }
      if (!this.selectedPackage) {
        this.submitError = '请选择可用的目标版本'
        return
      }
      this.switchConfirmed = false
      this.confirmDialogVisible = true
      this.$nextTick(() => this.$refs.confirmCloseButton.focus())
    },

    closeSwitchConfirmation() {
      this.confirmDialogVisible = false
      this.switchConfirmed = false
    },

    async submitSwitch() {
      if (!this.switchConfirmed || !this.selectedPackage) return
      this.submitting = true
      this.submitError = ''
      this.closeSwitchConfirmation()
      try {
        const createdTask = await createServerSwitch({
          packageId: this.selectedPackage.packageId,
          targetVersion: this.selectedPackage.redisVersion,
          masterHostIp: this.masterHostIp,
          replicaHostIps: [this.replicaOneHostIp, this.replicaTwoHostIp],
          operationReason: this.operationReason,
          createdBy: this.createdBy
        })
        this.task = {
          ...createdTask,
          targetVersion: createdTask.targetVersion || this.selectedPackage.redisVersion,
          masterHostIp: createdTask.masterHostIp || this.masterHostIp
        }
        window.localStorage.setItem(ACTIVE_TASK_KEY, createdTask.taskNo)
        this.startPolling()
      } catch (error) {
        this.submitError = error.message || '服务器切换任务创建失败'
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
      if (!this.task || !this.task.taskNo || this.pollingPending) return
      this.pollingPending = true
      this.taskError = ''
      try {
        const latestTask = await getServerSwitchStatus(this.task.taskNo)
        this.task = latestTask
        const status = latestTask.taskStatus || latestTask.status
        if (POLLING_STOP_STATUSES.includes(status)) this.stopPolling()
        if (TASK_NUMBER_CLEAR_STATUSES.includes(status)) {
          window.localStorage.removeItem(ACTIVE_TASK_KEY)
        }
        if (status === 'SUCCESS') {
          await this.loadEnvironment()
        }
      } catch (error) {
        this.taskError = error.message || '任务状态查询失败，将继续重试'
      } finally {
        this.pollingPending = false
      }
    },

    stepClass(index) {
      return {
        done: this.taskStatus === 'SUCCESS' || index < this.currentStepIndex,
        active: ['CREATED', 'RUNNING'].includes(this.taskStatus)
          && index === this.currentStepIndex,
        unknown: ['FAILED', 'RESULT_UNKNOWN'].includes(this.taskStatus)
          && index === this.currentStepIndex
      }
    },

    openManualDialog() {
      this.manualDialogVisible = true
      this.environmentConfirmed = false
      this.manualError = ''
      this.$nextTick(() => this.$refs.manualCloseButton.focus())
    },

    closeManualDialog() {
      this.manualDialogVisible = false
      this.environmentConfirmed = false
      this.manualError = ''
    },

    async submitManualTermination() {
      this.manualError = ''
      if (!this.terminationReason) {
        this.manualError = '请填写人工处理说明'
        return
      }
      if (!this.createdBy) {
        this.manualError = '未获取到当前登录账号，请重新登录后再试'
        return
      }
      if (!this.environmentConfirmed) return

      this.terminating = true
      try {
        await manuallyTerminateServerSwitch(this.task.taskNo, {
          terminationReason: this.terminationReason,
          terminatedBy: this.createdBy
        })
        this.task = await getServerSwitchStatus(this.task.taskNo)
        this.stopPolling()
        window.localStorage.removeItem(ACTIVE_TASK_KEY)
        this.closeManualDialog()
      } catch (error) {
        this.manualError = error.message || '人工结束任务失败'
      } finally {
        this.terminating = false
      }
    },

    handleKeydown(event) {
      if (event.key !== 'Escape') return
      if (this.confirmDialogVisible) this.closeSwitchConfirmation()
      if (this.manualDialogVisible) this.closeManualDialog()
    }
  }
}
</script>



