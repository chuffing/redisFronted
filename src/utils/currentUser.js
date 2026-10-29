/**
 * 获取当前登录账号。
 *
 * 行内统一认证接入后，可以在页面启动时将账号写入
 * window.__CURRENT_USER__，现有运维页面无需再逐个修改。
 */
export function getCurrentOperator() {
  const currentUser = window.__CURRENT_USER__
  const injectedAccount = typeof currentUser === 'string'
    ? currentUser
    : currentUser && (currentUser.account || currentUser.userId || currentUser.username)

  const account = injectedAccount
    || window.localStorage.getItem('redisOpsOperator')
    || process.env.VUE_APP_CURRENT_OPERATOR

  if (account && String(account).trim()) {
    return String(account).trim()
  }

  // 行内统一认证尚未接入时，本地开发环境使用固定测试账号。
  // 生产构建不设置默认值，仍然要求认证系统注入真实账号。
  if (process.env.NODE_ENV === 'development') {
    return 'admin'
  }

  return ''
}
