async function request(path, options, acceptedCodes) {
  const response = await fetch(path, options)
  const responseText = await response.text()
  let responseBody = {}
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText)
    } catch (error) {
      throw new Error('平台返回的数据格式不正确')
    }
  }
  const message = responseBody.msg || responseBody.message || '平台请求失败'
  if (!response.ok) throw new Error(message)
  const businessCode = Number(responseBody.code)
  if (responseBody.code !== undefined && !acceptedCodes.includes(businessCode)) {
    throw new Error(message)
  }
  return responseBody.data
}

/** 读取当前正式纳管拓扑，并补充 Redis 实例中的版本信息。 */
export async function getServerSwitchEnvironment() {
  const responses = await Promise.all([
    request('/monitor/sentinel/topology', {}, [200]),
    request('/monitor/sentinel/nodes-status', {}, [200]),
    request('/monitor/sentinel/sentinels?managementStatus=1', {}, [200]),
    request('/monitor/redis/instances?managementStatus=1', {}, [200])
  ])
  const topology = responses[0] || { nodes: [] }
  const instanceById = {}
  ;(responses[3] || []).forEach(instance => {
    instanceById[instance.instanceId] = instance
  })
  return {
    topology: {
      ...topology,
      status: topology.status || topology.topologyStatus || '未知',
      nodes: (topology.nodes || []).map(node => ({
        ...node,
        redisVersion: instanceById[node.instanceId]
          ? instanceById[node.instanceId].redisVersion
          : ''
      }))
    },
    nodeStatuses: responses[1] || [],
    sentinels: responses[2] || []
  }
}

export async function listServerSwitchPackages() {
  return request('/api/versionPackage/enabledList', {}, [200])
}

export async function createServerSwitch(payload) {
  return request('/api/serverSwitch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId: payload.packageId,
      masterHostIp: payload.masterHostIp,
      replicaHostIps: payload.replicaHostIps,
      operationReason: payload.operationReason,
      createdBy: payload.createdBy
    })
  }, [202])
}

export async function getServerSwitchStatus(taskNo) {
  return request(`/api/serverSwitch/${encodeURIComponent(taskNo)}`, {}, [200])
}

export async function manuallyTerminateServerSwitch(taskNo, payload) {
  return request(`/api/task/${encodeURIComponent(taskNo)}/manualTerminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, [200])
}
