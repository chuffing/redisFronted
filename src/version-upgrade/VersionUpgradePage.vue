<template>
  <div class="recovery-page version-upgrade-page">
    <a class="skip-link" href="#version-upgrade-main">跳到页面内容</a>
    <main id="version-upgrade-main" class="container" tabindex="-1">
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

      <section class="card package-card" aria-labelledby="package-title">
        <h2 id="package-title">
          版本安装包
          <span class="card-actions">
            <button
              type="button"
              class="btn outline upload-button"
              :disabled="uploading || taskLocked"
              @click="$refs.packageInput.click()"
            >
              {{ uploading ? '正在上传' : '上传版本包' }}
            </button>
            <input
              ref="packageInput"
              type="file"
              accept=".tar.gz,application/gzip"
              hidden
              @change="handlePackageFile"
            >
          </span>
        </h2>

        <div class="package-section">
          <div v-if="loadingPackages" class="table-state">正在读取平台安装包</div>
          <div v-else-if="!packages.length" class="table-state">
            平台暂时没有安装包，请先上传 redis-{version}.tar.gz
          </div>
          <div v-else class="table-scroll">
            <table class="package-table">
              <thead>
                <tr>
                  <th>版本</th>
                  <th>文件名</th>
                  <th>文件大小</th>
                  <th>上传时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in packages" :key="item.packageId">
                  <td><strong>Redis {{ item.redisVersion }}</strong></td>
                  <td>{{ item.packageName }}</td>
                  <td>{{ formatBytes(item.packageSize) }}</td>
                  <td>{{ formatDate(item.createdTime) }}</td>
                  <td>
                    <span class="package-status" :class="{ disabled: !packageEnabled(item) }">
                      {{ packageEnabled(item) ? '可用' : '已禁用' }}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="package-action"
                      :class="{ enable: !packageEnabled(item) }"
                      :disabled="taskLocked || isPackageChanging(item)"
                      :title="packageActionTitle(item)"
                      :aria-busy="isPackageChanging(item) ? 'true' : 'false'"
                      @click="changePackageStatus(item)"
                    >
                      {{ packageActionLabel(item) }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="packagePage.total > 0" class="package-pagination">
            <span>共 {{ packagePage.total }} 个安装包</span>
            <div>
              <button
                type="button"
                :disabled="loadingPackages || packagePage.current <= 1"
                @click="changePackagePage(packagePage.current - 1)"
              >上一页</button>
              <strong>第 {{ packagePage.current }} / {{ packagePage.pages }} 页</strong>
              <button
                type="button"
                :disabled="loadingPackages || packagePage.current >= packagePage.pages"
                @click="changePackagePage(packagePage.current + 1)"
              >下一页</button>
            </div>
          </div>
          <p v-if="packageError" class="section-error" role="alert">{{ packageError }}</p>
          <p v-else-if="packageNotice" class="section-notice" role="status">{{ packageNotice }}</p>
        </div>
      </section>

      <section class="card settings-card" aria-labelledby="settings-title">
        <h2 id="settings-title">升级设置</h2>
        <div class="upgrade-settings">
          <div class="upgrade-form-grid">
            <div class="field">
              <label for="target-version">目标版本</label>
              <select
                id="target-version"
                v-model="selectedPackageId"
                :disabled="taskLocked || !availablePackages.length"
              >
                <option v-if="!availablePackages.length" value="">暂无可用版本</option>
                <option
                  v-for="item in availablePackages"
                  :key="item.packageId"
                  :value="String(item.packageId)"
                >
                  Redis {{ item.redisVersion }}
                </option>
              </select>
            </div>

            <div class="field">
              <label for="selected-package">安装包</label>
              <input
                id="selected-package"
                :value="selectedPackage ? selectedPackage.packageName + ' · 可用' : ''"
                disabled
                placeholder="选择目标版本后自动带出"
              >
            </div>

            <div class="field" :class="{ invalid: reasonError }">
              <label for="upgrade-reason">操作原因</label>
              <input
                id="upgrade-reason"
                ref="reasonInput"
                v-model.trim="operationReason"
                maxlength="200"
                :disabled="taskLocked"
                placeholder="请输入操作原因"
                @blur="validateReason"
              >
              <span v-if="reasonError" class="field-error">{{ reasonError }}</span>
            </div>

            <div class="field">
              <label for="upgrade-operator">操作人</label>
              <input id="upgrade-operator" :value="createdBy" disabled>
            </div>
          </div>

          <div class="settings-footer">
            <div class="alert" :class="{ blocked: submitError || blockedReason }">
              ⚠ {{ submitError || blockedReason || '升级期间服务将短暂中断' }}
            </div>
            <button
              type="button"
              class="btn primary execute-button"
              :disabled="upgradeDisabled"
              @click="openUpgradeConfirmation"
            >
              {{ submitting ? '正在提交' : '执行版本升级' }}
            </button>
          </div>
        </div>
      </section>

      <section class="card upgrade-progress-card" aria-labelledby="upgrade-progress-title">
        <h2 id="upgrade-progress-title">
          升级进度
          <span class="progress-pill pill" :class="statusClass">{{ statusText }}</span>
        </h2>

        <div class="progressbody">
          <div v-if="task" class="taskinfo">
            任务编号：{{ task.taskNo || '--' }}
            <span v-if="task.targetVersion"> 目标版本：Redis {{ task.targetVersion }}</span>
          </div>

          <div class="steps upgrade-steps" aria-label="版本升级执行流程">
            <div v-for="(step, index) in steps" :key="step" class="step" :class="stepClass(index)">
              <div class="circle">
                <span v-if="stepClass(index).done">✓</span>
                <span v-else-if="stepClass(index).unknown">!</span>
                <span v-else>{{ index + 1 }}</span>
              </div>
              {{ step }}
            </div>
          </div>

          <div v-if="!task" class="message">◇ 暂无进行中的任务</div>
          <div v-else-if="taskStatus === 'CREATED'" class="message running">任务已创建，正在等待执行器接收</div>
          <div v-else-if="taskStatus === 'RUNNING'" class="message running">{{ task.message || '正在执行版本升级' }}</div>
          <div v-else-if="taskStatus === 'SUCCESS'" class="message success">✓ 版本升级完成，当前拓扑正常</div>
          <div v-else-if="taskStatus === 'FAILED'" class="message failed">× 版本升级失败：{{ failureReason }}</div>
          <div v-else-if="taskStatus === 'RESULT_UNKNOWN'" class="message unknown">
            <span>⚠ 无法确认最终升级结果：{{ failureReason }}</span>
            <button type="button" class="btn warning action" @click="openManualDialog">人工结束任务</button>
          </div>
          <div v-else-if="taskStatus === 'MANUALLY_TERMINATED'" class="message terminated">
            ✓ 任务已人工结束：{{ task.terminationReason || '未填写处理说明' }}
          </div>

          <p v-if="taskError" class="progress-error" role="alert">{{ taskError }}</p>
        </div>
      </section>
    </main>

    <div v-if="upgradeDialogVisible" class="modalwrap show" @click.self="closeUpgradeConfirmation">
      <section ref="upgradeDialog" class="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
        <div class="modalhead">
          <span id="upgrade-modal-title">⚠ 确认版本升级</span>
          <button ref="upgradeCloseButton" type="button" class="close" aria-label="关闭" @click="closeUpgradeConfirmation">×</button>
        </div>
        <div class="modalnotice">
          Redis 将升级至 {{ selectedPackage ? selectedPackage.redisVersion : '--' }}，升级期间服务可能短暂中断。
        </div>
        <dl class="confirm-details">
          <div><dt>安装包</dt><dd>{{ selectedPackage ? selectedPackage.packageName : '--' }}</dd></div>
          <div><dt>操作原因</dt><dd>{{ operationReason }}</dd></div>
          <div><dt>操作人</dt><dd>{{ createdBy }}</dd></div>
        </dl>
        <label class="confirm">
          <input v-model="upgradeConfirmed" type="checkbox">
          我已确认目标版本和当前生产拓扑
        </label>
        <div class="modalbuttons">
          <button type="button" class="btn neutral" @click="closeUpgradeConfirmation">取消</button>
          <button type="button" class="btn warning" :disabled="!upgradeConfirmed" @click="submitUpgrade">确认升级</button>
        </div>
      </section>
    </div>

    <div v-if="manualDialogVisible" class="modalwrap show" @click.self="closeManualDialog">
      <section ref="manualDialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="manual-upgrade-title">
        <div class="modalhead">
          <span id="manual-upgrade-title">⚠ 人工结束任务</span>
          <button ref="manualCloseButton" type="button" class="close" aria-label="关闭" @click="closeManualDialog">×</button>
        </div>
        <div class="modalnotice">仅在已核实三台服务器真实版本和拓扑状态后执行</div>
        <div class="field">
          <label for="upgrade-manual-reason">处理说明</label>
          <textarea id="upgrade-manual-reason" v-model.trim="terminationReason" maxlength="300" placeholder="填写人工核实结果"></textarea>
        </div>
        <div class="field manual-operator">
          <label for="upgrade-manual-operator">操作人</label>
          <input id="upgrade-manual-operator" :value="createdBy" disabled>
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
  createVersionUpgrade,
  disableVersionPackage,
  enableVersionPackage,
  getVersionUpgradeEnvironment,
  getVersionUpgradeStatus,
  listEnabledVersionPackages,
  listVersionPackages,
  manuallyTerminateVersionTask,
  uploadVersionPackage
} from '../api/versionUpgrade'

const ACTIVE_TASK_KEY = 'redisOpsActiveVersionUpgradeTask'
const POLLING_STOP_STATUSES = ['SUCCESS', 'FAILED', 'RESULT_UNKNOWN', 'MANUALLY_TERMINATED']
const TASK_NUMBER_CLEAR_STATUSES = ['SUCCESS', 'FAILED', 'MANUALLY_TERMINATED']

export default {
  name: 'VersionUpgradePage',

  components: {
    RecoveryTopology
  },

  data() {
    return {
      topology: { status: '未知', nodes: [] },
      nodeStatuses: [],
      sentinels: [],
      refreshedAt: '',
      // 首次绘制时保留稳定的加载区域，避免空内容、加载态和真实数据连续闪烁。
      loadingEnvironment: true,
      environmentError: '',
      packages: [],
      enabledPackages: [],
      packagePage: {
        total: 0,
        current: 1,
        size: 3,
        pages: 0
      },
      loadingPackages: true,
      loadingEnabledPackages: true,
      uploading: false,
      changingPackageIds: [],
      packageError: '',
      packageNotice: '',
      selectedPackageId: '',
      operationReason: '',
      reasonError: '',
      createdBy: getCurrentOperator(),
      submitting: false,
      submitError: '',
      task: null,
      taskError: '',
      pollingTimer: null,
      pollingPending: false,
      upgradeDialogVisible: false,
      upgradeConfirmed: false,
      manualDialogVisible: false,
      terminationReason: '',
      environmentConfirmed: false,
      manualError: '',
      terminating: false,
      steps: ['部署版本', '停止Sentinel', '停止Redis', '恢复配置', '切换版本', '启动Redis', '启动Sentinel']
    }
  },

  computed: {
    availablePackages() {
      return this.enabledPackages
    },

    selectedPackage() {
      return this.availablePackages.find(
        item => String(item.packageId) === String(this.selectedPackageId)
      ) || null
    },

    taskStatus() {
      if (!this.task) return ''
      return this.task.taskStatus || this.task.status || ''
    },

    taskLocked() {
      return Boolean(this.task) && !TASK_NUMBER_CLEAR_STATUSES.includes(this.taskStatus)
    },

    blockedReason() {
      if (this.loadingEnvironment || this.loadingEnabledPackages) return '正在读取版本升级环境'
      if (!this.createdBy) return '未获取到当前登录账号，请重新登录后再试'
      if ((this.topology.nodes || []).length !== 3) return '当前环境必须存在3台已纳管Redis节点'
      if (!this.availablePackages.length) return '平台没有可用的Redis版本安装包'
      if (this.taskStatus === 'RESULT_UNKNOWN') return '请先人工处理结果未知的版本升级任务'
      if (this.taskLocked) return '当前已有版本升级任务正在执行'
      return ''
    },

    upgradeDisabled() {
      return this.submitting
        || this.uploading
        || Boolean(this.blockedReason)
        || !this.selectedPackage
    },

    statusText() {
      const labels = {
        CREATED: '等待执行',
        RUNNING: '执行中',
        SUCCESS: '升级成功',
        FAILED: '升级失败',
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

  async mounted() {
    window.addEventListener('keydown', this.handleKeydown)
    await Promise.all([
      this.loadEnvironment(),
      this.loadPackages(1),
      this.loadEnabledPackages()
    ])

    const taskNo = window.localStorage.getItem(ACTIVE_TASK_KEY)
    if (!taskNo) return

    this.task = {
      taskNo,
      taskStatus: 'CREATED',
      message: '正在恢复版本升级任务状态'
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
        const environment = await getVersionUpgradeEnvironment()
        this.topology = environment.topology || { status: '未知', nodes: [] }
        this.nodeStatuses = environment.nodeStatuses || []
        this.sentinels = environment.sentinels || []
        this.refreshedAt = new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(new Date())
      } catch (error) {
        this.environmentError = error.message || '版本升级环境读取失败'
      } finally {
        this.loadingEnvironment = false
      }
    },

    async loadPackages(pageNum = this.packagePage.current, options = {}) {
      const { showError = true } = options
      this.loadingPackages = true
      if (showError) this.packageError = ''
      try {
        const result = await listVersionPackages(pageNum, 3) || {}
        this.packages = result.records || []
        this.packagePage = {
          total: Number(result.total || 0),
          current: Number(result.current || pageNum),
          size: Number(result.size || 3),
          pages: Number(result.pages || 0)
        }
        return true
      } catch (error) {
        if (showError) this.packageError = error.message || '安装包列表读取失败'
        return false
      } finally {
        this.loadingPackages = false
      }
    },

    async loadEnabledPackages(options = {}) {
      const { showError = true } = options
      this.loadingEnabledPackages = true
      try {
        this.enabledPackages = await listEnabledVersionPackages() || []
        this.syncSelectedPackage()
        return true
      } catch (error) {
        if (showError) {
          this.enabledPackages = []
          this.packageError = error.message || '可用安装包读取失败'
        }
        return false
      } finally {
        this.loadingEnabledPackages = false
      }
    },

    changePackagePage(pageNum) {
      if (pageNum < 1 || pageNum > this.packagePage.pages) return
      this.loadPackages(pageNum)
    },

    async changePackageStatus(item) {
      if (this.taskLocked || this.isPackageChanging(item)) return

      const wasEnabled = this.packageEnabled(item)
      if (wasEnabled) {
        try {
          await this.$confirm(
            `禁用 Redis ${item.redisVersion} 后，该版本将不能再被选为升级目标。是否继续？`,
            '确认禁用安装包',
            {
              type: 'warning',
              confirmButtonText: '确认禁用',
              cancelButtonText: '取消',
              closeOnClickModal: false
            }
          )
        } catch (action) {
          return
        }
      }

      this.packageError = ''
      this.packageNotice = ''
      this.changingPackageIds = [...this.changingPackageIds, String(item.packageId)]
      try {
        let updatedPackage
        if (wasEnabled) {
          updatedPackage = await disableVersionPackage(item.packageId)
        } else {
          updatedPackage = await enableVersionPackage(item.packageId)
        }

        this.applyPackageUpdate(updatedPackage || {
          ...item,
          packageStatus: wasEnabled ? 'DISABLED' : 'ENABLED'
        })

        const successMessage = `Redis ${item.redisVersion} 已${wasEnabled ? '禁用' : '启用'}`
        this.packageNotice = successMessage

        const refreshResults = await Promise.all([
          this.loadPackages(this.packagePage.current, { showError: false }),
          this.loadEnabledPackages({ showError: false })
        ])
        if (refreshResults.some(refreshed => !refreshed)) {
          this.packageNotice = `${successMessage}，但列表刷新失败，请稍后点击“立即刷新”`
        }
      } catch (error) {
        this.packageError = error.message || '安装包状态修改失败'
      } finally {
        this.changingPackageIds = this.changingPackageIds.filter(
          packageId => packageId !== String(item.packageId)
        )
      }
    },

    applyPackageUpdate(updatedPackage) {
      const packageId = String(updatedPackage.packageId)
      this.packages = this.packages.map(item => (
        String(item.packageId) === packageId
          ? { ...item, ...updatedPackage }
          : item
      ))

      if (this.packageEnabled(updatedPackage)) {
        const enabledIndex = this.enabledPackages.findIndex(
          item => String(item.packageId) === packageId
        )
        if (enabledIndex >= 0) {
          this.enabledPackages.splice(enabledIndex, 1, {
            ...this.enabledPackages[enabledIndex],
            ...updatedPackage
          })
        } else {
          this.enabledPackages = [...this.enabledPackages, updatedPackage]
        }
      } else {
        this.enabledPackages = this.enabledPackages.filter(
          item => String(item.packageId) !== packageId
        )
      }
      this.syncSelectedPackage()
    },

    syncSelectedPackage() {
      const selectedAvailable = this.availablePackages.some(
        item => String(item.packageId) === String(this.selectedPackageId)
      )
      if (!selectedAvailable) {
        this.selectedPackageId = this.availablePackages.length
          ? String(this.availablePackages[0].packageId)
          : ''
      }
    },

    isPackageChanging(item) {
      return this.changingPackageIds.includes(String(item.packageId))
    },

    packageActionLabel(item) {
      if (this.isPackageChanging(item)) {
        return this.packageEnabled(item) ? '正在禁用' : '正在启用'
      }
      return this.packageEnabled(item) ? '禁用' : '启用'
    },

    packageActionTitle(item) {
      if (this.taskLocked) return '运维任务执行期间不能修改安装包状态'
      if (this.isPackageChanging(item)) return this.packageActionLabel(item)
      return this.packageEnabled(item)
        ? `禁用 Redis ${item.redisVersion} 安装包`
        : `启用 Redis ${item.redisVersion} 安装包`
    },

    packageEnabled(item) {
      const status = String(item.packageStatus || '').toUpperCase()
      return ['ENABLED', 'ACTIVE', '1', '可用', '启用'].includes(status)
    },

    async handlePackageFile(event) {
      const file = event.target.files[0]
      event.target.value = ''
      if (!file) return

      this.packageError = ''
      this.packageNotice = ''
      if (!this.createdBy) {
        this.packageError = '未获取到当前登录账号，请重新登录后再试'
        return
      }
      if (!/^redis-\d+\.\d+\.\d+\.tar\.gz$/.test(file.name)) {
        this.packageError = '安装包文件名必须符合 redis-{version}.tar.gz'
        return
      }

      this.uploading = true
      try {
        const uploaded = await uploadVersionPackage(file, this.createdBy)
        await Promise.all([
          this.loadPackages(1),
          this.loadEnabledPackages()
        ])
        this.selectedPackageId = String(uploaded.packageId)
        this.packageNotice = uploaded.reusedExisting
          ? '平台已存在相同安装包，已直接复用'
          : `安装包 ${uploaded.packageName} 上传成功`
      } catch (error) {
        this.packageError = error.message || '安装包上传失败'
      } finally {
        this.uploading = false
      }
    },

    validateReason() {
      this.reasonError = this.operationReason ? '' : '请输入操作原因'
      return !this.reasonError
    },

    openUpgradeConfirmation() {
      this.submitError = ''
      if (!this.validateReason()) {
        this.submitError = '请输入操作原因'
        this.$refs.reasonInput.focus()
        return
      }
      if (!this.selectedPackage) {
        this.submitError = '请选择可用的目标版本'
        return
      }
      this.upgradeConfirmed = false
      this.upgradeDialogVisible = true
      this.$nextTick(() => this.$refs.upgradeCloseButton.focus())
    },

    closeUpgradeConfirmation() {
      this.upgradeDialogVisible = false
      this.upgradeConfirmed = false
    },

    async submitUpgrade() {
      if (!this.upgradeConfirmed || !this.selectedPackage) return
      this.submitting = true
      this.submitError = ''
      this.closeUpgradeConfirmation()
      try {
        const createdTask = await createVersionUpgrade({
          packageId: this.selectedPackage.packageId,
          targetVersion: this.selectedPackage.redisVersion,
          operationReason: this.operationReason,
          createdBy: this.createdBy
        })
        this.task = {
          ...createdTask,
          targetVersion: createdTask.targetVersion || this.selectedPackage.redisVersion
        }
        window.localStorage.setItem(ACTIVE_TASK_KEY, createdTask.taskNo)
        this.startPolling()
      } catch (error) {
        this.submitError = error.message || '版本升级任务创建失败'
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
        const latestTask = await getVersionUpgradeStatus(this.task.taskNo)
        this.task = latestTask
        const status = latestTask.taskStatus || latestTask.status
        if (POLLING_STOP_STATUSES.includes(status)) this.stopPolling()
        if (TASK_NUMBER_CLEAR_STATUSES.includes(status)) {
          window.localStorage.removeItem(ACTIVE_TASK_KEY)
        }
        if (status === 'SUCCESS') {
          await Promise.all([this.loadEnvironment(), this.loadPackages()])
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
        active: ['CREATED', 'RUNNING'].includes(this.taskStatus) && index === this.currentStepIndex,
        unknown: ['FAILED', 'RESULT_UNKNOWN'].includes(this.taskStatus) && index === this.currentStepIndex
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
        await manuallyTerminateVersionTask(this.task.taskNo, {
          terminationReason: this.terminationReason,
          terminatedBy: this.createdBy
        })
        this.task = await getVersionUpgradeStatus(this.task.taskNo)
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
      if (this.upgradeDialogVisible) this.closeUpgradeConfirmation()
      if (this.manualDialogVisible) this.closeManualDialog()
    },

    formatBytes(bytes) {
      const value = Number(bytes || 0)
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      return `${(value / 1024 / 1024).toFixed(1)} MB`
    },

    formatDate(value) {
      if (!value) return '--'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString('zh-CN', { hour12: false })
    }
  }
}
</script>




