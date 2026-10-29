# Redis 监控平台 · 前端

基于 Vue 2 + Element UI + ECharts 的 Redis 监控平台前端，接口完全对齐 `redis-monitor-platform`（平台端后端）。
执行器端运行在生产服务器上，自动向平台注册，注册成功后每 5 分钟上报采集数据、每 30 秒上报心跳；
本前端只访问平台端 HTTP 接口，不直接访问执行器。

## 运行与构建

```bash
npm install
npm run serve     # 开发环境，http://localhost:8080
npm run build     # 生产构建，产物在 dist/
```

> 本项目基于 Vue CLI 4（webpack 4）。如果使用 Node 17+ 构建出现
> `ERR_OSSL_EVP_UNSUPPORTED`，先设置 `NODE_OPTIONS=--openssl-legacy-provider` 再执行构建脚本。

开发环境通过 `vue.config.js` 中的 `devServer.proxy` 把 `/monitor`、`/alarm`、`/metric`、`/api`
转发到平台端 `http://localhost:8100`，因此本地启动平台端后无需额外配置跨域。

生产环境默认与平台端同源部署（由 Nginx 将上述前缀反向代理到平台端）；
如前后端分域部署，构建前设置环境变量指定平台端地址：

```bash
# .env.production
VUE_APP_BASE_API=http://platform-host:8100
```

> 构建入口为 `public/index.html`。

## 目录

```
src/
  api/
    index.js        统一出口（页面统一 import * as api from '@/api'）
    api.js          平台端接口封装，按 Controller 分组
  utils/format.js   时间/数值/状态格式化
  components/       Sidebar、Topbar
  views/            Dashboard、RealtimeMonitor、HistoryMonitor、AlarmRules、AlarmRecords
  router/index.js   路由
```

## 页面与平台端接口映射

| 页面 | 接口 | 平台端来源 |
| --- | --- | --- |
| 监控仪表 | `GET /monitor/redis/instances` | MonitorController#instances |
| 监控仪表 | `GET /alarm/rule/overview` | AlarmController#ruleOverview |
| 监控仪表 | `GET /alarm/rule/recent` | AlarmController#recent |
| 监控仪表 | `GET /monitor/realtime/current-values` | MonitorController#currentValues |
| 监控仪表 | `GET /monitor/realtime/trend` | MonitorController#trend |
| 监控仪表 | `GET /monitor/sentinel/topology` | MonitorController#topology |
| 监控仪表（操作日志） | `GET /api/audit/logs?pageNum=1&pageSize=5` | AuditController#logs |
| 实时监控 | `GET /monitor/redis/instances` | MonitorController#instances |
| 实时监控 | `GET /monitor/realtime/current-values` | MonitorController#currentValues |
| 实时监控 | `GET /monitor/realtime/trend` | MonitorController#trend |
| 实时监控 | `GET /monitor/sentinel/sentinels` | MonitorController#sentinels |
| 实时监控 | `GET /monitor/sentinel/nodes-status` | MonitorController#nodesStatus |
| 实时监控 | `GET /monitor/sentinel/topology` | MonitorController#topology |
| 历史监控 | `GET /monitor/realtime/trend` | MonitorController#trend |
| 历史监控 | `POST /monitor/report/query` | MonitorController#reportQuery |
| 历史监控 | `GET /monitor/report/export` | MonitorController#reportExport |
| 历史监控 | `GET /monitor/report/export/status`（3s 轮询） | MonitorController#exportStatus |
| 历史监控 | `GET /monitor/report/export/download` | MonitorController#exportDownload |
| 告警监控 | `GET /alarm/rule/overview` | AlarmController#ruleOverview |
| 告警监控 | `GET /alarm/rule/recent-unrecovered` | AlarmController#recentUnrecovered |
| 告警监控 | `GET /alarm/rule/list` | AlarmController#getAlarmRuleList |
| 告警监控 | `POST /alarm/rule/add`、`/update`、`/delete`、`/toggle-status` | AlarmController |
| 告警监控 | `POST /alarm/rule/trigger-check`、`/trigger-all-check` | AlarmController |
| 告警记录 | `GET /alarm/record/overview` | AlarmController#recordOverview |
| 告警记录 | `GET /alarm/record/page` | AlarmController#recordPage |
| 告警记录 | `GET /alarm/record/detail` | AlarmController#recordDetail |
| 告警记录 | `GET /alarm/record/metric-trend` | AlarmController#metricTrend |

## 与平台端的字段约定

- **统一响应**：`{ code, data, message }`，`code === 0` 为成功；业务异常同样返回 HTTP 200，因此
  `src/api/api.js` 在响应拦截器中按 `code` 解包并抛出 `message`。
- **时间**：平台端 `LocalDateTime` 默认返回 ISO 格式，页面统一用 `utils/format.js` 的
  `formatDateTime` 转为 `yyyy-MM-dd HH:mm:ss`；查询参数（`startTime`/`endTime`）必须是
  `yyyy-MM-dd HH:mm:ss`。
- **状态值**：平台端 `runStatus`/`sentinelStatus`/`metricStatus`/`copyStatus` 返回中文描述
  （正常/警告/严重/离线/在线/延迟/无数据）；`alarmLevel`、`recoverStatus`、`enableStatus`、
  `scopeType` 返回数字字符串，页面在 `normalize*` 中统一转 `Number` 后再比较。
- **告警级别**：`1=提示`、`2=警告`、`3=严重`。
- **告警记录 id**：详情/指标曲线接口的入参是告警记录主键 `alarmRecordId`，不是展示用的
  `alarmNo`。平台端 `RecordItemResponse` 已补充返回 `alarmRecordId`。
- **告警规则 `duration`**：平台端单位是「采集周期个数」（默认 1），不是秒；
  `silenceDuration` 单位是秒（默认 1800），`collectInterval` 单位是秒（默认 300）。
  因此页面表单中该字段展示为「持续周期数」，提交时按字符串发送。
- **告警记录概览**：平台端返回扁平字段 `infoCount/alarmCount/severityCount`，页面在
  `loadOverview` 中组装为模板使用的 `alarmLevelCount.{info,alarm,severity}`。
- **网络带宽趋势**：`metricKey` 为 `netInputBandwidth` / `netOutputBandwidth` 时，平台端会同时
  返回入/出两条子序列，通过 `seriesList[].metricKey` 区分。

## 已补充/修正的前端能力

1. 新增 `src/api/index.js`，修复页面 `import * as api from '@/api'` 无法解析的问题。
2. 接口层补齐操作审计、告警人工恢复（`recoverRecord`）、导出下载地址等封装，并统一错误提示。
3. 仪表盘「操作日志」由写死的模拟数据改为平台端操作审计接口（最近 5 条）。
4. 告警记录页修正概览分级字段、详情/曲线入参（`alarmRecordId`）、实例地址字段
   （`hostIp`/`redisPort`）、时间格式与阈值线处理。
5. 告警监控页修正「启用状态」筛选项绑定字段（原 `enabledFlag` 未生效）、新增/编辑弹窗表单复用
   残留数据、分页与查询联动、`duration` 单位语义。
6. 历史监控页补全日报/周报与事件列表刷新、导出轮询定时器清理、事件状态（已恢复/成功）样式。
7. 实时监控页补全拓扑状态展示，修复首次进入时 ECharts 容器未渲染导致趋势图为空的问题。
8. 顶栏「立即刷新 / 每 5min 自动刷新」统一调用各页面 `loadData()`，并同步刷新时间文案；
   页面销毁时释放 ECharts 实例与定时器。

## 平台端能力（前端暂未提供入口）

- `POST /alarm/record/recover`：告警人工确认恢复，已在 `api.js` 暴露 `recoverRecord`，
  如需在告警详情弹窗中增加「确认恢复」操作可直接调用。
- `GET /api/audit/logs`：操作审计分页查询，当前仅在仪表盘展示最近 5 条。
