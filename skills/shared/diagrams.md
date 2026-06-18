# Diagram Catalog

Shared selection guide + tested recipes for the `visual-plan` and `visual-recap` skills. Every
recipe's `d2` is the dependable render floor; entries marked **editable: yes** also carry a
`mermaid` source so the optional Excalidraw upgrade produces an editable scene.

Pick the **fewest** diagrams that explain the change. One strong diagram beats three weak ones.
When 2–3 different lenses each add distinct value, present them in a `tabs` block rather than
forcing one. Ground every node label in real identifiers from the target repo.

## Selection guide

**Structure — what exists**
- *Dependency graph* — modules as nodes, imports as arrows; surfaces coupling and cycles. (This
  is also produced mechanically as the recap's `where-it-fits` diagram.)
- *Deployment / infra* — what runs where (ALB, ECS, RDS, Redis…).

**Behavior — what happens at runtime**
- *Sequence* — collaborators on lifelines, time downward; ONE scenario, multi-collaborator path.
- *State machine* — an entity in one of N bounded states with labeled transitions.

**Boundaries — what is separated**
- *Bounded-context map (DDD)* — domain boundaries and the contracts at their seams.
- *API surface* — what a service exposes / consumes. (Also a mechanical recap producer.)

**Data flow — how information moves**
- *Data-flow* — sources → transformations → sinks. (ETL/pipeline is the same shape staged.)
- *Event / pub-sub topology* — publishers, topics, subscribers.

**Operations — how things fail and recover**
- *CI / build pipeline* — commit → deploy stages.
- *Blast-radius / failure-mode* — what falls over if X dies.

**C4 ladder — zoom levels** (context → container → component). The *code* level (class diagram
for one component) is rarely worth drawing — use the `class` kind directly if ever needed.

**Journey — branching work**
- *Decomposition* — happy path as one flow, each major edge case branching off. Most-used.
- *Swimlane / activity* — lanes by actor (customer / frontend / backend / external).

**Tie-breakers**
- Branching driven by handoffs between actors → **swimlane**.
- Branching driven by an entity's bounded state → **state machine**.
- Genuinely tree-shaped with no rejoining paths → a state-machine/decomposition variant.

**Out of scope** (stakeholder/discovery formats, not engineering deliverables — do not attempt):
journey maps (UX phases/emotions), BPMN gateway notation, event storming sticky-notes.

## Authoring notes

- `d2` is required and is the floor. Quote any d2 key/value containing a dot or space.
- Only `flowchart`/`graph`, `sequenceDiagram`, and `classDiagram` mermaid convert to *editable*
  Excalidraw elements. `stateDiagram` and `erDiagram` rasterize — so author a **state machine as
  a mermaid `flowchart`** (states as nodes, transitions as labeled edges), never `stateDiagram`.
- An invalid diagram degrades to a visible placeholder rather than breaking the document.

<!-- catalog-entries-start -->

### Dependency graph
- **kind:** `architecture` — **editable:** yes
- **Use when:** showing how the changed module sits among its importers/imports; spotting cycles.
- **Avoid when:** the relationship is a runtime call sequence (use Sequence instead).
- Module-boundary diagrams (internal package/namespace seams) are the same shape at a finer grain.

```d2
direction: right
billing -> user
billing -> auth
auth -> user
```

```mermaid
flowchart LR
  billing --> user
  billing --> auth
  auth --> user
```

### Deployment / infra
- **kind:** `architecture` — **editable:** yes
- **Use when:** the change touches what runs where (a new queue, cache, managed service).
- **Avoid when:** nothing about the topology changed.

```d2
"ALB" -> "ECS service": HTTPS
"ECS service" -> "RDS (Postgres)": SQL
"ECS service" -> "Redis": cache
```

```mermaid
flowchart TD
  ALB --> ECS[ECS service]
  ECS --> RDS[(RDS Postgres)]
  ECS --> Redis[(Redis)]
```

### Sequence
- **kind:** `sequence` — **editable:** yes
- **Use when:** the change adds/alters a multi-collaborator runtime path (request flow, integration call chain).
- **Avoid when:** there is only one actor, or order doesn't matter.

```d2
shape: sequence_diagram
client -> api: captureOrder(id)
api -> paypal: capture(id)
paypal -> api: ok
api -> client: order
```

```mermaid
sequenceDiagram
  client->>api: captureOrder(id)
  api->>paypal: capture(id)
  paypal-->>api: ok
  api-->>client: order
```

### State machine
- **kind:** `flowchart` — **editable:** yes
- **Use when:** an entity moves through bounded states (subscription, checkout, signup).
- **Avoid when:** there are no real states, just a linear flow.
- Authored as a `flowchart` (NOT `stateDiagram`) so it stays editable.

```d2
direction: right
PENDING -> PAID: capture
PENDING -> CANCELLED: cancel
PAID -> REFUNDED: refund
```

```mermaid
flowchart LR
  PENDING -->|capture| PAID
  PENDING -->|cancel| CANCELLED
  PAID -->|refund| REFUNDED
```

### Bounded-context map
- **kind:** `architecture` — **editable:** yes
- **Use when:** showing domain boundaries and the contracts (ACL, shared kernel) at their seams.
- **Avoid when:** the system is a single context.

```d2
"Billing" -> "Identity": "customer id (ACL)"
"Catalog" -> "Billing": "price (shared kernel)"
```

```mermaid
flowchart LR
  Billing -->|customer id ACL| Identity
  Catalog -->|price shared kernel| Billing
```

### API surface
- **kind:** `architecture` — **editable:** yes
- **Use when:** showing what a service/router exposes and who consumes it.
- **Avoid when:** the recap's mechanical api-surface diagram already covers it.

```d2
"web app" -> "league router"
"league router": {
  list
  create
}
```

```mermaid
flowchart LR
  web[web app] --> league[league router]
  league --> list
  league --> create
```

### Data-flow
- **kind:** `architecture` — **editable:** yes
- **Use when:** tracing how data is sourced, transformed, and stored. ETL/streaming pipelines are
  the same shape with explicit stages.
- **Avoid when:** there is no transformation, just a single read/write.

```d2
"CSV upload" -> "validator" -> "normalizer" -> "Postgres"
"normalizer" -> "metrics sink"
```

```mermaid
flowchart LR
  CSV[CSV upload] --> V[validator] --> N[normalizer] --> DB[(Postgres)]
  N --> M[metrics sink]
```

### Event / pub-sub topology
- **kind:** `architecture` — **editable:** yes
- **Use when:** the change adds a publisher, topic, or subscriber.
- **Avoid when:** the call is synchronous (use Sequence).

```d2
"OrderService" -> "orders.created": publish
"orders.created" -> "EmailWorker": subscribe
"orders.created" -> "AnalyticsWorker": subscribe
```

```mermaid
flowchart LR
  OrderService -->|publish| T(orders.created)
  T -->|subscribe| EmailWorker
  T -->|subscribe| AnalyticsWorker
```

### CI / build pipeline
- **kind:** `flowchart` — **editable:** yes
- **Use when:** the change alters how code goes from commit to deploy.
- **Avoid when:** CI is unchanged.

```d2
direction: right
commit -> build -> test -> "deploy staging" -> "deploy prod"
```

```mermaid
flowchart LR
  commit --> build --> test --> staging[deploy staging] --> prod[deploy prod]
```

### Blast-radius / failure-mode
- **kind:** `architecture` — **editable:** yes
- **Use when:** explaining what fails downstream if a dependency dies.
- **Avoid when:** the change has no new failure dependency.

```d2
"Redis down" -> "session reads fail"
"Redis down" -> "rate limiter fails open"
"session reads fail" -> "users logged out"
```

```mermaid
flowchart TD
  R[Redis down] --> S[session reads fail]
  R --> L[rate limiter fails open]
  S --> U[users logged out]
```

### C4 context
- **kind:** `architecture` — **editable:** yes
- **Use when:** the highest zoom — the system as one box plus its users and external systems.

```d2
"Customer" -> "PPGL system": uses
"PPGL system" -> "PayPal": payments
"PPGL system" -> "Email provider": mail
```

```mermaid
flowchart TD
  Customer --> Sys[PPGL system]
  Sys --> PayPal
  Sys --> Email[Email provider]
```

### C4 container
- **kind:** `architecture` — **editable:** yes
- **Use when:** the separately-deployable things inside the system (web app, API, DB, worker).

```d2
"Web app (Next.js)" -> "API (tRPC)": "JSON/HTTPS"
"API (tRPC)" -> "Postgres": Prisma
"API (tRPC)" -> "Worker": queue
```

```mermaid
flowchart TD
  Web[Web app Next.js] --> API[API tRPC]
  API --> DB[(Postgres)]
  API --> Worker
```

### C4 component
- **kind:** `architecture` — **editable:** yes
- **Use when:** the major internal pieces of one container (controllers, services, repositories).

```d2
"league router" -> "LeagueService"
"LeagueService" -> "LeagueRepository"
"LeagueService" -> "PayPalClient"
```

```mermaid
flowchart TD
  R[league router] --> S[LeagueService]
  S --> Repo[LeagueRepository]
  S --> PP[PayPalClient]
```

### Decomposition
- **kind:** `flowchart` — **editable:** yes
- **Use when:** a journey with a happy path plus a few named edge cases.
- **Avoid when:** the branching is state-driven (use State machine) or actor-driven (use Swimlane).

```d2
direction: right
start -> validate -> charge -> confirm
validate -> "reject: invalid"
charge -> "retry: gateway error"
```

```mermaid
flowchart LR
  start --> validate --> charge --> confirm
  validate --> reject[reject: invalid]
  charge --> retry[retry: gateway error]
```

### Swimlane / activity
- **kind:** `flowchart` — **editable:** yes
- **Use when:** branching is driven by handoffs between actors.
- **Avoid when:** there's a single actor.

```d2
Customer.pay -> Frontend.submit
Frontend.submit -> Backend.capture
Backend.capture -> External.paypal
```

```mermaid
flowchart LR
  subgraph Customer
    pay[click pay]
  end
  subgraph Frontend
    submit[POST /checkout]
  end
  subgraph Backend
    capture[capture order]
  end
  pay --> submit --> capture
```

### ERD / schema
- **kind:** `erd` — **editable:** no
- **Use when:** showing entities and relations. (The recap produces this mechanically from a
  Prisma diff.) Stays static — ER mermaid rasterizes in Excalidraw, so no mermaid here.

```d2
User: {
  shape: sql_table
  id: int
  email: string
}
Order: {
  shape: sql_table
  id: int
  user_id: int
}
Order.user_id -> User.id
```
