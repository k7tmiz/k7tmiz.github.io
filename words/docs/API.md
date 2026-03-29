# API 参考文档

> **说明**：本文档为公开 API 参考，仅包含用户侧公开接口。后端管理接口、运维相关内容请参考 `backend/BACKEND_CONTEXT.md`（私有）。
>
> 基础 URL：`https://api.k7tmiz.com`
>
> 所有接口均返回 JSON。无特殊说明时，`Content-Type: application/json` 请求头可选。

---

## 一、用户接口

由 `js/cloud.js`（浏览器端桥接层）调用，路径前缀 `/api/auth`、`/api/state` 和 `/api/email`。

### 1.1 用户注册

```
POST /api/auth/register
```

**状态**：已禁用

**说明**：为避免前端无门槛注册，直接注册入口已关闭。用户注册应改走邮箱验证码流程：

1. `POST /api/email/send-register-code`
2. `POST /api/email/register-with-code`

**错误响应**：
- 403：直接注册已禁用

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
  "email": "user@example.com",
  "password": "123456"
}
```

**成功响应**（200）：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1,
  "username": "testuser",
  "email": "user@example.com"
}
```

**错误响应**：
- 400：参数缺失
- 401：邮箱或密码错误
- 429：请求过于频繁
- 500：服务器内部错误

---

### 1.3 发送注册验证码

```
POST /api/email/send-register-code
```

**鉴权**：无（公开）

**Rate Limit**：同一 IP 1 小时内最多 5 次

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**行为**：
- 邮箱格式必须合法
- 已注册邮箱会静默返回成功，避免账号探测
- 同一邮箱 60 秒内不可重复发送

**成功响应**（200）：
```json
{
  "success": true
}
```

**错误响应**：
- 400：邮箱格式不合法
- 429：发送过于频繁
- 500：邮件发送失败或服务器内部错误

---

### 1.4 邮箱验证码注册

```
POST /api/email/register-with-code
```

**鉴权**：无（公开）

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "username": "testuser",
  "password": "123456"
}
```

| 字段 | 验证规则 |
|------|----------|
| `email` | 必填，合法邮箱 |
| `code` | 必填，6 位验证码 |
| `username` | 必填，3-32 字符 |
| `password` | 必填，最少 6 字符 |

**成功响应**（200）：
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "userId": 1,
  "username": "testuser",
  "email": "user@example.com"
}
```

**错误响应**：
- 400：参数缺失、邮箱格式错误、验证码无效或已过期
- 409：邮箱或用户名已存在
- 429：验证码错误次数过多，已锁定
- 500：服务器内部错误

---

### 1.5 发送重置密码验证码

```
POST /api/email/send-reset-code
```

**鉴权**：无（公开）

**Rate Limit**：同一 IP 1 小时内最多 5 次

**请求体**：
```json
{
  "email": "user@example.com"
}
```

**行为**：
- 邮箱格式必须合法
- 不存在的邮箱会静默返回成功，避免账号探测
- 同一邮箱 60 秒内不可重复发送

**成功响应**（200）：
```json
{
  "success": true
}
```

**错误响应**：
- 400：邮箱格式不合法
- 429：发送过于频繁
- 500：邮件发送失败或服务器内部错误

---

### 1.6 重置密码

```
POST /api/email/reset-password
```

**鉴权**：无（公开）

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "newpassword"
}
```

**成功响应**（200）：
```json
{
  "success": true
}
```

**错误响应**：
- 400：参数缺失、邮箱格式错误、验证码无效或已过期
- 429：验证码错误次数过多，已锁定
- 500：服务器内部错误

---

### 1.7 下载用户 State

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

### 1.8 上传用户 State

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
