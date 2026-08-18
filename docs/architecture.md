# 后端架构设计文档（模块化单体 · MVP）

## 1. 架构总览

### 1.1 架构风格
**Modular Monolith（模块化单体）**

- 单一部署单元，单一代码仓库，单一数据库实例
- 按业务域拆分为独立模块，模块间**逻辑隔离、物理共享**
- 每个模块内部采用统一分层结构，模块之间只能通过**显式接口**通信，不允许跨模块直接访问对方的数据表 / ORM Model

选择理由：业务域清晰（6 个核心域），但团队规模和流量都不足以承担微服务的运维复杂度。模块化单体可以先把"边界"划清楚，未来某个模块（例如 Requirement 或 Messaging）流量/团队独立增长时，再按模块拆出为独立服务。

### 1.2 分层结构（每个模块内部统一遵循）

```
module/
├── api/              # 接口层：Controller、DTO、参数校验、鉴权
├── application/       # 应用层：用例编排（Service），事务边界，跨模块调用发生在这里
├── domain/            # 领域层：实体、值对象、领域规则、状态机
└── infrastructure/    # 基础设施层：Repository 实现、外部服务、消息发布
```

约束：
- Controller 不直接调用 Repository，必须经过 Application Service
- 领域规则（如"申请状态只能从 PENDING → SHORTLISTED/REJECTED"）写在 domain 层，不写在 Controller 或 SQL 里
- 模块对外只暴露 `application` 层的接口（Public API of Module），其余一律 package-private / internal

### 1.3 模块间协作规则

| 场景 | 允许方式 | 禁止方式 |
|---|---|---|
| 模块 A 需要模块 B 的数据 | 调用 B 暴露的 Application Service 接口（进程内调用） | 直接 `SELECT` B 的表，或 import B 的 ORM Model |
| 模块 A 状态变化需要通知模块 B | 发布领域事件（Domain Event），B 订阅 | 在 A 的代码里直接写"顺手改一下 B 的表" |
| 跨模块数据关联 | 只存对方的主键 ID（如 `Post.author_id`） | 建跨模块外键约束（FK across module boundary） |

这条规则是模块化单体能不能演进成微服务的关键——现在不加跨模块 FK、不做跨模块 JOIN，未来拆分时数据库层面几乎不需要改造。

---

## 2. 模块设计详情

### 2.1 Identity 模块（原 User Domain）

**职责**：账号、资料、实名/企业认证

**实体**

```
User
- id: UUID (PK)
- phone / email: string (unique)
- password_hash: string
- status: enum(ACTIVE, DISABLED, PENDING)
- role: enum(NORMAL, PROFESSIONAL, ADMIN)  # 简单角色标记，非完整 RBAC
- created_at / updated_at: timestamp

UserProfile
- user_id: UUID (PK, FK -> User, 1:1)
- nickname: string
- avatar_url: string
- bio: text
- gender: enum
- location: string
- industry: string

Verification
- id: UUID (PK)
- user_id: UUID (FK -> User)
- type: enum(REAL_NAME, ENTERPRISE)
- status: enum(PENDING, APPROVED, REJECTED)
- payload: jsonb          # 提交的证件/资质信息
- reviewer_id: UUID (nullable)
- reviewed_at: timestamp (nullable)
- created_at: timestamp
```

**对外 API**

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh-token

GET    /api/v1/users/me
PUT    /api/v1/users/me/profile
GET    /api/v1/users/:id/profile        # 公开资料

POST   /api/v1/verifications
GET    /api/v1/verifications/:id
GET    /api/v1/verifications?status=PENDING   # 后台审核用
POST   /api/v1/verifications/:id/approve      # 后台
POST   /api/v1/verifications/:id/reject       # 后台
```

**对内暴露接口**（其他模块调用）

```
IdentityService.getUserBasicInfo(userId) -> { id, nickname, avatarUrl }
IdentityService.isVerified(userId) -> boolean
```

**发出的领域事件**：`VerificationApproved(userId, type)` — Networking 模块订阅，用于给 ProfessionalProfile 打认证标记。

---

### 2.2 Content 模块

**职责**：平台文章及互动

**实体**

```
Article
- id, author_id, title, content, cover_url
- status: enum(DRAFT, PUBLISHED, ARCHIVED)
- like_count / comment_count: int (冗余计数，写时更新)
- published_at, created_at, updated_at

ArticleLike
- id, article_id, user_id, created_at
- unique(article_id, user_id)

ArticleComment
- id, article_id, user_id, parent_id(nullable, 支持楼中楼)
- content, created_at
```

**对外 API**

```
GET    /api/v1/articles?page=&size=&status=
GET    /api/v1/articles/:id
POST   /api/v1/articles                     # 需登录
PUT    /api/v1/articles/:id
POST   /api/v1/articles/:id/likes
DELETE /api/v1/articles/:id/likes
GET    /api/v1/articles/:id/comments?page=&size=
POST   /api/v1/articles/:id/comments
DELETE /api/v1/articles/:id/comments/:commentId
```

**跨模块依赖**：调用 `IdentityService.getUserBasicInfo` 拼装作者昵称/头像，不做 JOIN。

---

### 2.3 Community 模块（原 Circle Domain）

**职责**：圈子、成员、圈内动态、活动

**实体**

```
Circle
- id, name, description, cover_url, owner_id
- member_count: int
- status: enum(ACTIVE, ARCHIVED)

CircleMember
- id, circle_id, user_id, role: enum(OWNER, ADMIN, MEMBER)
- joined_at
- unique(circle_id, user_id)

Post
- id, circle_id, author_id, content, images: jsonb
- like_count / comment_count: int
- created_at

PostLike / PostComment
- 结构同 ArticleLike / ArticleComment，替换外键为 post_id

Event
- id, circle_id, title, description, location
- start_at, end_at
- status: enum(UPCOMING, ONGOING, ENDED, CANCELLED)
```

**对外 API**

```
GET    /api/v1/circles/recommended
GET    /api/v1/circles/:id
POST   /api/v1/circles/:id/join
POST   /api/v1/circles/:id/leave
GET    /api/v1/circles/:id/members?page=&size=

GET    /api/v1/circles/:id/posts?page=&size=
POST   /api/v1/circles/:id/posts
POST   /api/v1/posts/:id/likes
DELETE /api/v1/posts/:id/likes
GET    /api/v1/posts/:id/comments
POST   /api/v1/posts/:id/comments

GET    /api/v1/circles/:id/events
POST   /api/v1/circles/:id/events
POST   /api/v1/events/:id/rsvp
```

**业务规则**：加入圈子前校验圈子是否需要审核（预留 `join_policy: OPEN | APPROVAL_REQUIRED` 字段，MVP 可先固定为 OPEN）。

---

### 2.4 Networking 模块

**职责**：专业人士目录、领域筛选、建联请求

**实体**

```
ProfessionalProfile
- user_id: UUID (PK, FK -> User)
- title: string          # 职称/头衔
- company_name: string
- years_of_experience: int
- verified: boolean       # 由 VerificationApproved 事件回填
- intro: text

Expertise
- id, name, category

UserExpertise  (中间表)
- user_id, expertise_id

ConnectionRequest   # 原 Connection，改名以明确是"请求"而非最终建立的关系
- id, from_user_id, to_user_id
- message: text
- status: enum(PENDING, ACCEPTED, DECLINED)
- created_at, responded_at
```

**对外 API**

```
GET    /api/v1/professionals?expertise=&keyword=&page=
GET    /api/v1/professionals/:userId

POST   /api/v1/professionals/:userId/connection-requests
GET    /api/v1/connection-requests?direction=sent|received&status=
POST   /api/v1/connection-requests/:id/accept
POST   /api/v1/connection-requests/:id/decline
```

**关键业务规则（跨模块）**

```
在 ConnectionRequestApplicationService.create() 内：
1. 调用 MembershipService.hasPermission(fromUserId, 'CONTACT_PROFESSIONAL')
2. 若无权限 -> 抛出 403 业务异常（前端引导去开通会员）
3. 若有权限 -> 创建 ConnectionRequest 并发布事件通知 to_user
```

这是模块化单体里"模块间协作"的典型例子：Networking 不直接查 Membership 的表，而是调用其暴露的 `hasPermission` 接口。

---

### 2.5 Company 模块

**职责**：企业主体及成员管理（原 Service Domain 简化而来，MVP 阶段不含 CompanyService 目录/服务分类，先支撑"谁代表哪家公司发布需求"这一最小闭环）

**实体**

```
Company
- id, name, logo_url, industry, description
- verified: boolean
- created_at

CompanyMember
- id, company_id, user_id
- role: enum(OWNER, MEMBER)
- unique(company_id, user_id)
```

**对外 API**

```
POST   /api/v1/companies
GET    /api/v1/companies/:id
PUT    /api/v1/companies/:id
POST   /api/v1/companies/:id/members
GET    /api/v1/companies/:id/members
DELETE /api/v1/companies/:id/members/:userId
```

> 注：原设计里的 `ServiceCategory` / `CompanyService` 在 MVP 中裁掉了，如果后续要恢复"企业服务目录"能力，建议作为 Company 模块下的子聚合，而不是独立模块（避免过度拆分）。

---

### 2.6 Requirement 模块

**职责**：需求发布、收藏、附件、申请

**实体**

```
Requirement
- id, publisher_id, company_id(nullable)
- title, description, budget_range, deadline
- status: enum(OPEN, IN_PROGRESS, CLOSED)
- created_at

RequirementAttachment
- id, requirement_id, file_url, file_name, file_size

RequirementFavorite
- id, requirement_id, user_id
- unique(requirement_id, user_id)

RequirementApplication
- id, requirement_id, applicant_id
- proposal: text
- status: enum(PENDING, SHORTLISTED, REJECTED)
- created_at, decided_at
```

**状态机（明确写进 domain 层，不要散落在 Controller）**

```
RequirementApplication.status:
  PENDING --shortlist--> SHORTLISTED
  PENDING --reject-----> REJECTED
  SHORTLISTED, REJECTED 均为终态，不可再流转
```

**对外 API**

```
GET    /api/v1/requirements?status=&page=
GET    /api/v1/requirements/:id
POST   /api/v1/requirements

POST   /api/v1/requirements/:id/favorites
DELETE /api/v1/requirements/:id/favorites

POST   /api/v1/requirements/:id/attachments
GET    /api/v1/requirements/:id/attachments
GET    /api/v1/requirements/:id/attachments/:attachmentId/download

POST   /api/v1/requirements/:id/applications
GET    /api/v1/requirements/:id/applications         # 仅发布者可见
POST   /api/v1/requirements/:id/applications/:appId/shortlist
POST   /api/v1/requirements/:id/applications/:appId/reject
```

> `RequirementInquiry`（原设计中带 `?`）建议 MVP 阶段不做独立实体，先复用 Messaging 模块（若上线）或者简化为 Application 下的一条留言字段，避免为一个不确定的功能单独建模块。

---

### 2.7 Membership 模块

**职责**：会员状态与权限判定

**实体**

```
Membership
- user_id: UUID (PK, FK -> User)
- plan: enum(FREE, PRO, ENTERPRISE)
- status: enum(ACTIVE, EXPIRED)
- start_at, expire_at

MembershipPermission (可先做成配置表而非数据库表，MVP 用代码常量即可)
- plan -> [permission_code...]
  PRO -> [CONTACT_PROFESSIONAL, ...]
```

**对内暴露接口**（这是本模块唯一真正重要的产出）

```
MembershipService.hasPermission(userId, permissionCode) -> boolean
MembershipService.getStatus(userId) -> { plan, status, expireAt }
```

**对外 API**

```
GET    /api/v1/memberships/me
POST   /api/v1/memberships/subscribe
POST   /api/v1/memberships/cancel
```

---

## 3. 数据库策略

- **单库**，按模块加表前缀：`identity_users`、`content_articles`、`community_circles`、`networking_connection_requests`、`company_companies`、`requirement_requirements`、`membership_memberships` ...
- **禁止跨模块外键约束**。同模块内可以正常加 FK（如 `UserProfile.user_id -> User.id` 在同一模块内例外，因为 Identity 内部本就紧耦合）；跨模块引用（如 `Post.author_id -> User.id`）只存 UUID，不加 DB 级约束，一致性由应用层保证
- 高频冗余字段（`like_count`、`comment_count`、`member_count`）采用写时更新 + 定期对账任务兜底，不做实时 COUNT 聚合查询
- 未来若某模块拆分为独立服务，只需把对应前缀的表整体迁走，不影响其他模块的表结构

---

## 4. API 设计规范

- 统一前缀：`/api/v1/{resource}`（资源名对应模块内的聚合根，不强制在 URL 里体现模块名）
- 统一响应结构：

```json
{
  "code": 0,
  "message": "OK",
  "data": { }
}
```

- 分页统一使用 `page` / `size`，响应内 `data` 结构为 `{ items: [...], total, page, size }`
- 鉴权：JWT，网关/中间件层解析出 `userId` 注入到 Controller 上下文，业务代码不直接解析 token
- 错误码：跨模块的业务异常（如 Networking 调用 Membership 抛出的权限异常）应有统一错误码段，避免各模块自定义互相冲突的 code

---

## 5. 建议的代码目录结构（以 NestJS / Spring 多模块风格为例）

```
src/
├── modules/
│   ├── identity/
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   ├── content/
│   ├── community/
│   ├── networking/
│   ├── company/
│   ├── requirement/
│   └── membership/
├── shared/
│   ├── events/          # 领域事件总线
│   ├── auth/             # JWT / 鉴权中间件
│   └── common/           # 统一响应结构、异常过滤器
└── main.ts
```

技术栈建议（按团队熟悉度二选一，非强制）：
- **Node.js + NestJS**：内置 Module 系统天然贴合模块化单体，依赖注入方便做"跨模块只暴露 Service 接口"的约束
- **Java + Spring Boot（Maven 多模块）**：每个业务模块一个 Maven module，编译期就能强制模块边界，不怕运行时被"抄近道"直接 import

---

## 6. 后续演进到微服务的信号

当出现以下任一情况，再考虑把某个模块拆出：

1. 该模块的读写流量显著高于其他模块（典型候选：Community 的 Feed / Requirement 的搜索）
2. 该模块有独立团队 owner，发布节奏和其他模块冲突频繁
3. 该模块需要独立的技术选型（如 Messaging 需要长连接 / WebSocket，和其他模块的无状态 REST 不一样）

拆分顺序建议：先拆 **Messaging**（如果启用），再看 **Requirement**（业务相对独立、状态机清晰、天然适合单独服务）。

---

## 7. 待确认事项（原文档中带 `?` 的部分）

| 项 | 建议 |
|---|---|
| Networking.Connection | 已重命名为 `ConnectionRequest`，明确其"待处理请求"语义，避免和"已建立的人脉关系"混淆 |
| Messaging Domain 是否入 MVP | 建议先不做，用 ConnectionRequest 里的 `message` 字段 + 站内通知代替一对一沟通，观察是否有强需求再建模块 |
| RequirementInquiry | 建议不单独建实体，MVP 阶段并入 Application 的留言，或等 Messaging 上线后复用 |
| ServiceCategory / CompanyService | MVP 已裁剪，如需恢复放在 Company 模块下作为子聚合 |