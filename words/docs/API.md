# API 参考文档

> **说明**：本文档为公开 API 参考，仅包含用户侧公开接口。后端管理接口、运维相关内容请参考 `backend/BACKEND_CONTEXT.md`（私有）。
>
> 基础 URL：`https://api.k7tmiz.com`
>
> 所有接口均返回 JSON。无特殊说明时，`Content-Type: application/json` 请求头可选。

---

## 一、用户接口

由 `js/cloud.js`（私有可选模块）调用，路径前缀 `/api/auth` 和 `/api/state`。

### 1.1 用户注册

```
POST /api/auth/register
```

**鉴权**：无（公开）

**Rate Limit**：同一 IP 15 分钟内最多 5 次

**请求体**：
```json
{
  "username": "testuser",
  "password": "123456"
}
```

| 字段 | 验证规则 |
|------|----------|
| `username` | 必填，3-32 字符 |
| `password` | 必填，最少 6 字符 |

**成功响应**（200）：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1
}
```

**错误响应**：
- 400：参数缺失或验证失败
- 409：用户名已存在
- 429：请求过于频繁
- 500：服务器内部错误

---

### 1.2 用户登录

```
POST /api/auth/login
```

**鉴权**：无（公开）

**Rate Limit**：同一 IP 15 分钟内最多 10 次

**请求体**：
```json
{
  "username": "testuser",
  "password": "123456"
}
```

**成功响应**（200）：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1
}
```

**错误响应**：
- 400：参数缺失
- 401：用户名或密码错误
- 429：请求过于频繁
- 500：服务器内部错误

---

### 1.3 下载用户 State

```
GET /api/state
```

**鉴权**：用户 JWT（Bearer Token）

**请求头**：
```
Authorization: Bearer <user_jwt_token>
```

**成功响应**（200）：
```json
{
  "success": true,
  "state": {
    "version": 2,
    "rounds": [],
    ...
  },
  "savedAt": "2026-03-27T12:00:00.000Z"
}
```

**错误响应**：
- 401：未提供 Token 或 Token 无效/过期
- 403：Token 不是用户 Token（role !== 'user'）
- 404：该用户尚未上传过 State
- 500：服务器内部错误

---

### 1.4 上传用户 State

```
POST /api/state
```

**鉴权**：用户 JWT（Bearer Token）

**请求头**：
```
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**请求体**：
```json
{
  "state": {
    "version": 2,
    "rounds": [...],
    ...
  }
}
```

**行为**：Upsert — 如果该用户已有 State 则覆盖，没有则新建。

**成功响应**（200）：
```json
{
  "success": true,
  "savedAt": "2026-03-27 12:00:00"
}
```

`savedAt` 为 MySQL 时间格式（`YYYY-MM-DD HH:MM:SS`）。

**错误响应**：
- 400：state 缺失或不是对象
- 401：未提供 Token 或 Token 无效/过期
- 403：Token 不是用户 Token
- 500：服务器内部错误

---

## 二、其他接口

### 2.1 健康检查

```
GET /health
```

**鉴权**：无（公开）

**成功响应**（200）：
```json
{ "status": "ok" }
```

---

## 三、错误响应格式

所有接口错误响应均为 JSON：

```json
{
  "success": false,
  "error": "错误描述信息"
}
```

触发限流时：
```json
{
  "success": false,
  "error": "注册过于频繁，请稍后再试"
}
```
