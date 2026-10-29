/**
 * 首次拓扑纳管接口。
 *
 * 该模块对应平台端 ResultBean，成功业务码为 200；监控模块使用的
 * BaseResponse 成功业务码为 0，因此这里单独处理，避免错误判定。
 */
async function request(path, options = {}) {
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

  const message = responseBody.msg
    || responseBody.message
    || '平台请求失败'

  if (!response.ok) {
    throw new Error(message)
  }

  if (responseBody.code !== undefined
      && Number(responseBody.code) !== 200) {
    throw new Error(message)
  }

  return responseBody.data
}

/** 查询可以参与首次纳管的候选服务器。 */
export function getTopologyInitializationCandidates() {
  return request('/api/topologyInitialization/candidates')
}

/** 将用户选择的三台服务器正式纳管。 */
export function initializeTopology(hostIps) {
  return request('/api/topologyInitialization', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ hostIps })
  })
}
