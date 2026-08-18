## APP梳理 Domain
Backend

User Domain
├── User
├── Profile
└── Verification

Content Domain
├── Article
├── ArticleLike
└── ArticleComment

Circle Domain
├── Circle
├── CircleMember
├── Post
├── PostLike
├── PostComment
└── Event

Networking Domain
├── ProfessionalProfile
├── Expertise
└── Connection ?

Service Domain            
├── Company
├── ServiceCategory
└── CompanyService

Membership Domain
└── Membership

Messaging Domain ?
├── Conversation
└── Message

Requirement Domain
├── Requirement
├── RequirementAttachment
├── RequirementFavorite
├── RequirementApplication
└── RequirementInquiry ?

Learning Domain
├── Course
│   └── Lesson / VideoLesson
├── Book
├── Column
│   └── ColumnPost / ColumnArticle
└── Subscription

# Backend Architecture

## Architecture Style

Current proposal:

Modular Monolith

Reason:
The system contains multiple clear business domains, but the current
project scale does not justify microservices.

Each domain should be implemented as an independent module while
sharing one backend application and database initially.

---

## User Domain

Responsibilities:
- User accounts
- User profiles
- Identity verification

Entities:
- User
- UserProfile
- Verification

---

## Content Domain

Responsibilities:
- Platform articles
- Article interaction

Entities:
- Article
- ArticleLike
- ArticleComment

Possible APIs:

GET    /articles
GET    /articles/:id
POST   /articles/:id/likes
DELETE /articles/:id/likes
GET    /articles/:id/comments
POST   /articles/:id/comments

---

## Circle Domain

Responsibilities:
- Community circles
- Circle membership
- Circle posts
- Events

Entities:
- Circle
- CircleMember
- Post
- PostLike
- PostComment
- Event

Possible APIs:

GET  /circles/recommended
GET  /circles/:id
POST /circles/:id/join

GET  /circles/:id/members

GET  /circles/:id/posts
POST /circles/:id/posts

GET  /circles/:id/events

---

## Networking Domain

Responsibilities:
- Professional / entrepreneur directory
- Expertise filtering
- Business connections

Entities:
- ProfessionalProfile
- Expertise
- UserExpertise
- Connection

Possible APIs:

GET /professionals
GET /professionals?expertise=AI

POST /professionals/:id/contact-requests

Business Rule:

Only users with an active membership can initiate professional contact.

---

## Membership Domain

Responsibilities:
- Membership status
- Membership permissions

Entity:
- Membership

Current permission:

CONTACT_PROFESSIONAL

---

## Requirement Domain

APIs:
GET    /requirements
GET    /requirements/:id
POST   /requirements

POST   /requirements/:id/favorites
DELETE /requirements/:id/favorites

GET    /requirements/:id/attachments
POST   /requirements/:id/attachments
GET    /requirements/:id/attachments/:attachmentId/download

POST   /requirements/:id/applications
GET    /requirements/:id/applications

POST   /requirements/:id/applications/:applicationId/shortlist
POST   /requirements/:id/applications/:applicationId/reject

POST   /requirements/:id/inquiries ? 
GET    /requirements/:id/inquiries ?

## 最终MVP Domain
Backend
│
├── Identity
│   ├── User
│   ├── UserProfile
│   └── Verification
│
├── Content
│   ├── Article
│   ├── ArticleLike
│   └── ArticleComment
│
├── Community
│   ├── Circle
│   ├── CircleMember
│   ├── Post
│   ├── PostLike
│   ├── PostComment
│   └── Event
│
├── Networking
│   ├── ProfessionalProfile
│   ├── Expertise
│   └── ConnectionRequest
│
├── Company
│   ├── Company
│   └── CompanyMember
│
├── Requirement
│   ├── Requirement
│   ├── RequirementAttachment
│   ├── RequirementFavorite
│   └── RequirementApplication
│
└── Membership
    └── Membership