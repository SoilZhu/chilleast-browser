export interface Env {
  /**
   * 凭据密封主密钥（base64 编码的 32 字节 AES-256 密钥）。
   * 用于无状态将用户的账号凭据在客户端与服务端之间以 AES-GCM 密文传递。
   */
  SESSION_KEY?: string;

  /**
   * 凭据指纹的 HMAC 密钥（base64，32 字节）。
   * 用于单实例 RAM 会话防抖缓存隔离。
   */
  ACCOUNT_PEPPER?: string;

  /**
   * 课表 ICS 订阅服务的写入密钥（即原版 `ics.chilleast.soilzhu.su` 那个
   * Worker 的 `WORKER_API_KEY`）。
   *
   * 订阅文件本身是公开可读的（日历客户端要能匿名拉取），但 **PUT/DELETE 必须带
   * 这把钥匙**，否则任何人拿到 uuid 就能覆盖别人的课表。因此本 Worker 只把密钥
   * 留在服务端，前端永远看不到它。
   *
   * 未配置时上传/删除会直接返回 500 —— 宁可报错，也不要不带鉴权去写别人的订阅。
   */
  ICS_API_KEY?: string;

  /**
   * ICS 订阅服务地址，默认 `https://ics.chilleast.soilzhu.su`。
   * 抽成变量是为了能在本地/测试环境指向 mock 服务。
   */
  ICS_BASE_URL?: string;

  /**
   * 静态前端资产（Worker Assets 模式可选）
   */
  ASSETS?: Fetcher;
}
