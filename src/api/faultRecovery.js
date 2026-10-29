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

/** 从平台读取当前已纳管的 Redis、Sentinel 拓扑及节点状态。 */
export async function getRecoveryEnvironment() {
  const responses = await Promise.all([
    request('/monitor/sentinel/topology', {}, [200]),
    request('/monitor/sentinel/nodes-status', {}, [200]),
    request('/monitor/sentinel/sentinels?managementStatus=1', {}, [200])
  ])
  const topology = responses[0] || { nodes: [] }

  return {
    topology: {
      ...topology,
      status: topology.status || topology.topologyStatus || '未知'
    },
    nodeStatuses: responses[1] || [],
    sentinels: responses[2] || []
  }
}

export async function createFaultRecovery(payload) {
  return request('/api/faultRecovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, [202])
}

export async function getFaultRecoveryStatus(taskNo) {
  const data = await request(`/api/faultRecovery/${encodeURIComponent(taskNo)}`, {}, [200])
  return { ...data, taskStatus: data.taskStatus || data.status }
}

export async function manuallyTerminateTask(taskNo, payload) {
  return request(`/api/task/${encodeURIComponent(taskNo)}/manualTerminate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, [200])
}
