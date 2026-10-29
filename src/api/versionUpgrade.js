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
export async function getVersionUpgradeEnvironment() {
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

export async function listVersionPackages(pageNum = 1, pageSize = 3) {
  return request(`/api/versionPackage/list?pageNum=${pageNum}&pageSize=${pageSize}`, {}, [200])
}

export async function listEnabledVersionPackages() {
  return request('/api/versionPackage/enabledList', {}, [200])
}

export async function enableVersionPackage(packageId) {
  return changeVersionPackageStatus(packageId, 'enable')
}

export async function disableVersionPackage(packageId) {
  return changeVersionPackageStatus(packageId, 'disable')
}

async function changeVersionPackageStatus(packageId, action) {
  return request(`/api/versionPackage/${encodeURIComponent(packageId)}/${action}`, { method: 'PUT' }, [200])
}

export async function uploadVersionPackage(file, uploadedBy) {
  const formData = new FormData()
  formData.append('uploadedBy', uploadedBy)
  formData.append('file', file)
  return request('/api/versionPackage/upload', { method: 'POST', body: formData }, [200])
}

export async function createVersionUpgrade(payload) {
  return request('/api/versionUpgrade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packageId: payload.packageId,
      operationReason: payload.operationReason,
      createdBy: payload.createdBy
    })
  }, [202])
}

export async function getVersionUpgradeStatus(taskNo) {
  return request(`/api/versionUpgrade/${encodeURIComponent(taskNo)}`, {}, [200])
}

export async function manuallyTerminateVersionTask(taskNo, payload) {
  return request(`/api/task/${encodeURIComponent(taskNo)}/manualTerminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, [200])
}
