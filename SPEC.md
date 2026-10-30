# THE ABYSS — Product & Engineering Specification

**Status:** Initial specification / proposed architecture  
**Version:** 0.1.0  
**Date:** 2026-10-30  
**Type:** Public, web-hosted, persistent artificial-life observatory  
**Reference:** The supplied “ABYSSAL / The living abyss” visual (dark hydrothermal garden, luminous organisms, cinematic depth, restrained editorial UI)

> **North star:** Build a visually extraordinary living abyss that feels like a place worth observing. Validate its art direction and rendering performance **before** implementing the full ecology, user creation, learning, persistence, and interactions.

## 1. Product definition

**The Abyss** is an online, shared, persistent, bioluminescent ecosystem. Visitors observe autonomous artificial organisms interacting, learning, reproducing, mutating, and sometimes becoming extinct. A visitor may introduce **one original species per verified e-mail address**, defined by initial attributes, a feeding strategy, and limited special traits. After introduction, the creator cannot directly control organisms or guarantee their survival.

### 1.1 Product principles

1. **Art direction first:** Visual quality and atmosphere are a product requirement, not decorative polish.
2. **Observe rather than command:** Visitors watch and inspect the world; species creation is the principal permitted intervention.
3. **Consequences, not scripts:** Ecological stories should emerge from explicitly modeled mechanics, not manufactured narrative events.
4. **Persistent history:** Species, lineages, extinctions and significant world events remain discoverable over time.
5. **Explainable artificial intelligence:** Individual choices derive from observable state, memories, and learned policies.
6. **Bounded complexity:** The system must remain financially and operationally feasible for a solo-maintained public service.
7. **Accessible and resilient:** The experience must have a graceful visual fallback for devices without adequate graphics support.

### 1.2 Intended audience

- Visitors exploring an ambient, visually compelling digital world.
- Creators contributing a species once and returning to follow its fate.
- Technically curious viewers investigating emergent behaviors and ecological patterns.

This is an exploratory portfolio project; actual user demand is **unvalidated**. It is not a biology-accurate scientific simulator.

## 2. Scope and experience boundaries

### 2.1 In scope — ultimate product vision

- Shared, server-authoritative environment with one initial curated bioluminescent biome.
- Cinematic 3D observation, orbit/pan/zoom or carefully constrained camera navigation.
- Ambient flora, rocks, hydrothermal vents, particles, jellyfish-like forms and luminous fauna.
- Select and inspect species and individuals; view learned behaviors, trends and lineage histories.
- Email-only verification (no password or traditional account), one published species per verified address.
- Species blueprint: base attributes, a primary feeding strategy, up to two initial special traits (provisional limit).
- Initial founder population; autonomous survival, predation, communication, social behavior and learning.
- Mutation and inheritance across generations, including rare, prerequisite-constrained new traits.
- Persistent history and a grounded “while you were away” recap.

### 2.2 Out of scope for the first visual milestone

- Real user accounts, emails, forms that publish a species, databases, backend simulation, AI/learning, evolution, historical timelines and real-time multiplayer syncing.
- Biologically accurate hydrodynamics, fluid simulation, physically correct underwater light transport, full procedural anatomy, procedural unlimited worlds, realistic 3D collisions for all organisms.
- Multiple biomes, free roaming underwater gameplay, mobile parity with desktop fidelity.

**Important:** Placeholder organisms, animations and environmental sliders in the visual milestone must be explicitly labeled demo-only. They must not imply a functioning ecosystem or real persisted state.

## 3. Visual reference and art direction

### 3.1 Aesthetic target

The supplied reference demonstrates a cinematic underwater diorama with a nearly black/navy background, a detailed but strategically illuminated sea floor, emissive cyan and violet flora, subdued orange hydrothermal vents, translucent drifting organisms, subtle particulate matter, large negative space and low-profile editorial UI.

**Target feeling:** a quiet, mysterious, believable observatory at great ocean depth — not a brightly colored arcade aquarium or a realistic scuba simulator.

### 3.2 Visual pillars

| Pillar | Specification |
|---|---|
| Composition | A hero-sized 3D stage; foreground, middle ground and distant silhouettes; asymmetrical focal points; uncluttered negative space |
| Palette | Near-black navy and blue-green shadows; restrained cyan/turquoise/violet emission; sparse warm orange vent accents |
| Lighting | Low ambient illumination, authored pools of light, emissive creatures and rocks, localized accent sources |
| Depth | Distance fog, layered silhouettes, particulate scale cues, soft movement parallax |
| Geometry | Stylized low-to-medium complexity; readable silhouettes over micro-detail |
| Materials | Soft translucency *where worthwhile*, emissive surfaces, subtle roughness variation, noise and gradient shading |
| Motion | Slow drift, subtle breathing/pulsing, tentacle/coral sway, shoal motion, particles carried by currents |
| Interface | Editorial serif display title + restrained technical sans/mono metadata, thin separators, unobtrusive transparent panels |
| Restraint | Bloom and distortion must not flatten contrast or destroy readability |

**Palette tokens (starting points, not final calibrated colors):** background `#020A10`, deep navy `#071821`, muted teal `#123C47`, bioluminescent cyan `#49D6D3`, violet `#8666C5`, thermal amber `#D8753B`, foreground text `#DCEBE8`.

### 3.3 Initial art-directed scene — Hydrothermal Garden

The **first and only required biome** for visual signoff:

- Authored seabed with shallow variation, isolated rocks and readable negative space.
- 2–4 vent formations, one principal hero formation with warm glow.
- 3–5 recognizable varieties of coral/branching flora and luminous ground growth.
- At least two clearly different prominent organism silhouettes (e.g. drifting bell-shaped organism and a compact swimming organism) plus an ambient shoal.
- Environmental particles at multiple depths; subtle currents and light pulsation.
- Camera boundaries that prevent revealing unfinished terrain or leaving the composed space.
- Small editorial overlay: world name, biome label, observation status, restrained environment data (initially clearly mock data).

The reference is **an artistic target**, not an asset library to clone. Build original meshes, materials, typography and scene composition.

### 3.4 Camera and UX tone

- Default camera starts in a hand-authored cinematic composition.
- Slow entry transition with an immediately useful still state; do not block the scene behind an excessive intro.
- Orbit and pan constrained; zoom/scroll should not accidentally hijack normal page scrolling.
- Labels appear only for meaningful focal points; avoid clutter.
- `prefers-reduced-motion` disables nonessential movement/transitions and offers stable observation.
- Provide a static or low-fidelity fallback for unsupported/underpowered devices.

## 4. Visual quality gate (V-GATE) — before simulation work

**The project cannot be declared visually ready merely because a Three.js scene runs.** Acceptance requires a reviewed capture against the provided reference at comparable aspect ratio and an interactive walkthrough.

### 4.1 Required artifacts

- A deployable, public-facing **visual-only** page.
- Original Blender assets and documented material / lighting choices.
- Captures of desktop hero and narrower viewport; short video showing camera and ambient motion.
- Device/browser performance notes with test hardware, browser, resolution, pixel ratio and settings.
- A list of deviations from the reference and approved design decisions.

### 4.2 Acceptance criteria

1. **Atmosphere:** Strong near-black abyss depth, with readable forms and deliberate negative space.
2. **Bioluminescence:** Luminous subjects read clearly without global overexposure; thermal accents remain subordinate.
3. **Composition:** Visible foreground/midground/background hierarchy and strong hero focal point.
4. **Organic motion:** At least three distinct types of slow procedural motion feel alive rather than mechanically looped.
5. **Visual consistency:** UI, typography, palette and labels share a cohesive visual language.
6. **Navigation:** Camera controls are understandable and remain within curated bounds.
7. **Responsiveness:** Smaller screens have a deliberate crop/layout and do not show broken UI.
8. **Resilience:** Graceful loading/error/fallback states and reduced-motion path.
9. **Performance:** Profile on a representative mid-range desktop and a weaker device. Initial **provisional target**: around 60 FPS at 1080p on a representative mid-range desktop, and a usable quality-reduced mode on less capable hardware. No claim of meeting this target until measurements exist.
10. **Explicit human approval:** The V-GATE requires visual approval; automated FPS or lint checks alone are insufficient.

**Stop condition:** If the quality gap is predominantly art/layout/lighting, continue art iteration rather than adding simulations or backend complexity to mask it.

## 5. Experience model after V-GATE

### 5.1 Core visitor journey

1. Open the public observatory; the scene presents current world state.
2. Observe organisms freely via constrained camera and discoverable labels.
3. Select an organism/species to inspect its identity, state, family, learned patterns and ecological interactions.
4. Optionally open “Introduce a Species” (the single contribution action).
5. Provide e-mail and species name, choose attributes/traits/feeding, review costs and limitations.
6. Verify e-mail using a short-lived one-time link; publish exactly one species per verified e-mail.
7. Return to the permanent public species page to see descendants, mutations, meaningful events and possible extinction.

Observation remains public; species creation does **not** convey administrative powers over the world.

### 5.2 User permissions

| Activity | Visitor | Verified creator | Service administrator |
|---|---:|---:|---:|
| Observe world and public species | Yes | Yes | Yes |
| Inspect organisms and public history | Yes | Yes | Yes |
| Draft species blueprint locally | Yes | Yes | Yes |
| Publish a species | After verification | Once per verified email | Operational override only |
| Directly steer organisms | No | No | No as ordinary gameplay |
| Edit published initial genetics | No | No | No (except audited repair/migration) |
| Administer system health | No | No | Yes |

### 5.3 Email-only creation policy

- **No account or password:** Verification via one-time, short-lived, single-use email link.
- **Uniqueness:** One *published species* per normalized verified email, enforced transactionally by a unique database constraint.
- **Privacy:** E-mail never exposed in public species data or logs; minimize retention and avoid storing unnecessary metadata.
- **Email limitations:** One email is not one person; do not claim otherwise.
- **Abuse controls:** Rate limits by network and email, CAPTCHA/Turnstile if necessary, generic responses against email enumeration, one-time token hashing, expiration, spam and sender reputation protections.
- **Publication:** Species blueprint is immutable once committed; extinction does not free its email slot by default.
- **Recovery:** Permanent public URL for watching; sensitive creator-only actions require fresh email verification.
- **Legal/privacy review:** Publish a privacy notice, retention/deletion policy, account for Brazilian LGPD where applicable, and clarify how a request to delete e-mail affects the one-species restriction.

## 6. Biological creation system

### 6.1 Core attributes (proposed)

| Attribute | Affects | Principal cost/trade-off |
|---|---|---|
| Mobility | Speed, acceleration, evasiveness | Movement energy consumption |
| Perception | Detection range/quality for food, threats and signals | Sensor maintenance, noise/false positives |
| Resilience | Damage tolerance, survival under environmental pressure | Mass and basal cost |
| Metabolic efficiency | Energy extraction/storage conversion | Specialization constraints, limited peak activity as modeled |
| Cognition | Memory, adaptation and decision flexibility | Continuous processing/energy cost |
| Sociability | Attention and response to nearby agents/signals | Crowd competition and detectability |

The attributes establish **potential**, not guaranteed actions or survival outcomes.

### 6.2 Feeding archetype (one primary selection)

Phototrophic (requires light), chemotrophic (chemical sources), filter-feeding (suspended nutrients), predatory (capture), detritivorous (waste), or omnivorous (flexibility at an explicit specialization cost).

The abyssal biome must provide physically consistent *fictional* resource sources. Phototrophy cannot be universally viable at great depth without localized or alternate energy sources defined by world rules.

### 6.3 Initial special traits (provisional max: two)

| Trait | Enables | Cost or vulnerability |
|---|---|---|
| Bioluminescence | Visual signaling and recognition | Energy and visibility to predators |
| Adaptive camouflage | Reduced visual detectability under conditions | Maintenance; reduced effectiveness during movement/light emission |
| Defensive spines | Contact defense | Structural mass, maneuver cost |
| Chemical signaling | Environmental trails and communication | Energy and interception by other species |
| Biological adhesion | Temporary attachment to surface/organism | Reduced mobility/exposure while attached |
| Collective sensitivity | Higher response to neighbor signals | Noise, false signaling and processing overhead |

Traits may be complementary, conflicting, or context-dependent. They provide **mechanisms**, not scripted strategies.

### 6.4 Costs and validity

Apply three distinct constraints:

1. **Creation budget** — provisional allocation points, with rising cost at high values.
2. **Structural compatibility** — prerequisites and mutually exclusive combinations where defensible.
3. **Ecological viability estimates** — energy demand, food dependency, hazards; these are **warnings**, not guaranteed survival percentages.

Model energy as a budget with basal, movement, perception, cognition and trait-activation costs. The numerical formula, cap and point budget remain **open for simulation-driven calibration**, not fixed requirements.

### 6.5 Preview

- Visual preview is available before publication.
- A future **isolated sandbox** could test behavior without modifying the shared world; results must be labeled scenarios, not guarantees.
- During V-GATE, preview/mock content is aesthetic-only.

## 7. Autonomy and emergent ecology

### 7.1 Agent decision loop

`Local perception → internal needs + memory → action valuation → action / movement → outcome → learning update`

Proposed mechanisms: bounded sensors, discrete/quantized state, utility-based selection and/or lightweight reinforcement-learning policies, steering behavior for movement, short episodic memory and learned action preferences. No LLM per organism.

### 7.2 Perception

- Light/motion sensing with limited field/range and possible occlusion.
- Chemical gradients with diffusion/decay/current transport.
- Local mechanical disturbances.
- Errors, noise and partial information are part of the model.

### 7.3 Activities

Seeking food, feeding, patrolling, investigating, escaping, chasing, abandoning pursuit, signaling, resting, reproducing. Actual options depend on a species’ capabilities and available energy.

### 7.4 Predation and communication

- Predators evaluate energy expenditure, capture odds, threats and alternative prey rather than simply killing on collision.
- Prey can detect, evade, hide or signal according to capabilities.
- Luminescent/chemical/mechanical signals are emitted and propagated by world rules; receivers may learn their reliability.
- Cooperation must be established through measurable effects (e.g. survival or energy) rather than inferred from proximity.

### 7.5 Learning vs evolution

- **Within one lifetime:** memory and learned action values/strategy changes.
- **At reproduction:** heritable genetic variation and rare mutations, including prerequisite-constrained functional traits.
- Learned preferences are **not** directly encoded as inherited DNA.
- Mutation does not imply progress; harmful/neutral variants and extinction are permitted.
- Separate authored founding species identity from evolving lineage classifications; a speciation threshold is unresolved.

### 7.6 Measurements of emergence

Population, energy budgets, births/deaths, successful and abandoned hunts, spatial clustering, effective signaling, lineage diversity and changes in policy preferences. Narratives or recaps must reference recorded events or measured trends, and mark uncertain causal explanations as hypotheses.

## 8. Persistence and continuity

### 8.1 Persistence contract

- World state and history survive page refreshes, server restarts and deployment.
- Observe mode never owns or advances the canonical simulation clock.
- The shared world has one logical simulation authority at a time.
- Save versioned world snapshots, organism state, learned policies, random state, schema/rules version and significant events.
- Add restart recovery and graceful snapshot flushing; test interruption and restoration.

### 8.2 Between visits: decision pending

Consider a **hybrid persistence model**:

- High-resolution deterministic fixed-step simulation when actively observed or within an approved active compute window.
- Low-rate/offline progression when unobserved, with explicit rules for approximate advancement.
- A recovery job at next observation if needed, with bounded work and consistent timestamps.

**Not equivalent:** approximated unattended progression must never be represented as a complete frame-by-frame history. If exact unattended evolution is a requirement, budget for a continuously running authoritative process and storage costs.

### 8.3 World safety

- Unique authority/lease or single-instance ownership; do not run two active tick loops for the same world.
- Bounded CPU, population and tick rate; fallback behaviors when overloaded.
- Separate world simulation time, wall clock, render interpolation and event timestamps.
- Deterministic seeds and versioned world rules for repeatable experimental runs, subject to engine-level determinism validation.

## 9. Technology decisions

### 9.1 Required core stack

| Layer | Choice | Role |
|---|---|---|
| 3D runtime | **Three.js + React Three Fiber** | Immersive underwater scene and camera |
| Web UI | **React + TypeScript + Vite** | Editorial interface, species editor, inspection views |
| 3D asset creation | **Blender** | Original meshes, rigs, animation, low-complexity scenes |
| Asset interchange | **glTF / GLB** | Compressed, portable runtime assets |
| Rendering effects | **Three.js postprocessing + custom shaders** | Bloom, fog, surface animation and bioluminescence |
| Backend | **Elixir + Phoenix + OTP** | World authority, API, user verification, simulation coordination |
| Realtime | **Phoenix Channels / PubSub** | Stream world updates and events |
| Database | **PostgreSQL + Ecto** | World metadata, species, creator mapping, snapshots and events |
| Mail | **Transactional email provider via Phoenix/Swoosh** | One-time verification delivery |
| Infra | **Docker / Docker Compose** | Reproducible backend deployment |
| CI/CD | **GitHub Actions** | Validation and deployment |

**Not required initially:** MongoDB, Kafka, Kubernetes, Redis, separate microservices, per-organism actor processes, Unity, Unreal, or a separate GPU server. Their introduction would require evidence of a concrete need.

### 9.2 3D renderer selection

- **Initial baseline:** Three.js WebGL rendering for compatibility and mature postprocessing; benchmark actual target browsers.
- **Future experiment:** WebGPU/TSL where justified by capabilities and support. Do not bind the art milestone to an immature or unsupported GPU feature.
- R3F owns lifecycle/composition; high-frequency visual updates should avoid React state rerendering every frame.
- Use asset instancing, batching, LOD/culling, compressed textures/geometry and adaptive resolution when measured bottlenecks justify them.

### 9.3 Frontend/backend boundary

- Rendering-only animations and noncanonical particles run in the browser.
- Decisions, reproduction, ecology, canonical positions and learned policies belong to the server once simulation begins.
- Client receives snapshots/deltas at controlled rates, interpolates visually, and never sends authoritative organism positions.
- Client input permitted: observe/select and verified species-creation commands.
- Avoid using LiveView to diff the 3D scene. Use React/R3F for immersive rendering; Phoenix HTTP API + Channels for server communication. LiveView is **optional** for a separately built internal operations dashboard, not mandatory in the visitor frontend.

## 10. Online infrastructure and operations

### 10.1 Topology — recommended starting point

```text
Visitors
   │ HTTPS
   ▼
Cloudflare CDN / frontend hosting (static Vite build, 3D asset delivery)
   │             │
   │             └── Versioned static GLB/textures/shaders
   ▼
api.<domain> (TLS reverse proxy)
   ▼
Phoenix / Elixir container on a small VPS
   ├── Phoenix HTTP API + Channels
   ├── Auth / email verification
   ├── World runtime (later, single active authority)
   └── Snapshot / telemetry jobs
   ▼
PostgreSQL (isolated service or managed database)
   └── Encrypted backups / recoverable snapshots
```

Cloudflare Pages is a valid static deployment choice for the front end; Cloudflare currently positions Workers as its primary platform for new full-stack apps. Here, neither Pages nor Workers needs to execute the authoritative Elixir server.

### 10.2 Hosting stages and cost control

**Visual-only public stage:** Deploy static scene on Cloudflare Pages (or static Workers assets), no VPS or database needed. This keeps the earliest visual milestone inexpensive and reduces operational moving parts.

**Backend integration:** Provision an affordable VPS with sufficient RAM for Elixir/Phoenix + PostgreSQL or use a managed Postgres provider. Size based on measured usage; do not assume a very small VPS can run an always-on multi-species simulation. If available RAM is tight, separate managed PostgreSQL may be operationally safer but can cost more.

**Persistent public simulation:** Reassess CPU/RAM consumption, concurrency, storage growth and background compute before enabling 24/7 progression. A rough earlier personal hosting goal of R$30–60/month is a **budget preference, not a validated deployment cost**; currency, renewals, email, storage, managed DB, backups and domain are additional variables. No provider quote is assumed.

**Vendor alternatives:** Fly.io supports official Elixir deployment workflows; a VPS + Compose is simpler to control cost at small scale but creates responsibility for security, updates, backups and monitoring.

### 10.3 Mandatory infrastructure safeguards

- TLS, production domains, strict CORS/origin and WebSocket origin checks.
- Secrets in encrypted deployment environment; never commit mail/API/database credentials.
- Database not publicly exposed; least-privilege access and network restrictions.
- Scheduled encrypted backups with off-host retention and tested restore procedure.
- Health/readiness checks, structured logs, crash monitoring, metrics, alerting and audit logs for administrative operations.
- Container resource limits, restart policy, uptime checks, graceful shutdown for snapshot consistency.
- Rate limiting and abuse protection on verification and publish endpoints.
- Limits on world updates per visitor, connection counts, message sizes, snapshot sizes and species blueprint payload.
- Controlled DB migrations and rollback-ready application deployments.
- Public privacy policy, data retention/deletion procedure and basic accessibility review.

## 11. Performance and scalability requirements

### 11.1 Visual performance

- Establish repeatable measurements: device/GPU, viewport, DPR, browser, asset bundle, frame-time p50/p95, draw calls and GPU memory where measurable.
- Set a provisional target for the hero at desktop 1080p; degrade particles, shaders, shadows, resolution and postprocessing under load.
- Cap DPR and avoid long synchronous asset parse/main-thread stalls.
- Progressive loading and meaningful poster/fallback for browser incompatibility.
- Accessibility: keyboard-operable non-3D controls, sufficient UI contrast, reduced-motion fallback, no essential information conveyed solely by color.

### 11.2 Simulation performance

- Fixed-step server ticks independent of client FPS; example rates are **to be benchmarked**, not guaranteed.
- Organisms represented as data in worlds/batches, not one OTP process per organism by default.
- Spatial partitioning for near-neighbor queries.
- Bound memory/learning state per organism; record events instead of every position change.
- Profile actual workload before adding Rust NIFs or horizontal scaling.
- Measure species count, active organisms, CPU/tick, memory/world, event throughput and state serialization costs.

## 12. Data model (conceptual)

- `creators`: verified normalized email / verification state / private identifiers.
- `species_blueprints`: creator, public slug, immutable attributes, selected feeding and special traits, ruleset version.
- `lineages`: parent lineage/species references, origin event, classification state.
- `organisms`: unique IDs, birth/death, genome, current state or snapshot reference.
- `learned_policies`: compact learned values and bounded episodic memory (stored with or linked to snapshots).
- `worlds`: authority and simulated time, environmental settings and ruleset.
- `world_snapshots`: versioned consistent state blob, simulation timestamp, checksum and random-generator state.
- `world_events`: births/deaths, major hunts, mutation, extinction, migration, discovery and meaningful changes.
- `verification_tokens`: hashed, expiring, single-use.

Schema shape (JSONB vs normalized columns, frequency of snapshotting, archives) is deferred until state-size/queries are measured. E-mail uniqueness must be an actual DB invariant, not only an API check.

## 13. Project structure (suggested)

```text
the-abyss/
├── apps/
│   ├── web/                    # Vite + React + R3F; visual-first
│   │   ├── src/scene/          # cameras, lights, fog, materials, environment
│   │   ├── src/organisms/      # visual-only during V-GATE
│   │   ├── src/ui/             # editorial overlays
│   │   └── src/services/       # eventual API / channel client
│   └── api/                    # Elixir Phoenix (introduced after V-GATE)
├── assets/
│   ├── blender/                # source .blend files
│   ├── models/                 # distributable glTF/GLB
│   ├── textures/
│   └── references/             # attributed internal art references, licensing checked
├── docs/
│   ├── SPEC.md
│   ├── ART_DIRECTION.md
│   ├── VISUAL_ACCEPTANCE.md
│   ├── ARCHITECTURE.md
│   └── DECISIONS.md
├── infra/
│   ├── compose/
│   └── deployment/
└── .github/workflows/
```

Keep simulation engine concepts specified now but **do not scaffold a complex backend before visual approval**.

## 14. Delivery gates, not an implementation roadmap

The following are **dependency/acceptance gates**, not a calendar or sprint plan.

| Gate | Outcome | Allowed complexity | Exit evidence |
|---|---|---|---|
| **V0 — Art prototype** | One evocative original underwater composition | Static assets and authored camera | Design review of comparable still captures |
| **V1 — Living visual stage** | Cinematic motion, curated controls, responsive UI | Noncanonical procedural visual animation | Approved video + visual acceptance + profiling |
| **V-GATE — Visual signoff** | Reference-level direction established | No full ecology required | Explicit visual approval and documented deviations |
| **I — Observation** | Inspect/follow actual entities | Initial server-authoritative state and API | Selection and state consistency tests |
| **S — Species Genesis** | Email-verified once-only species publication | Validation, auth, DB, moderated contribution | Constraint and abuse tests |
| **E — Ecology and learning** | Autonomous interactions and mutation | Bounded simulation + tests | Repeatable ecological experiment results |
| **P — Persistence** | Continuous service and meaningful return visits | Snapshots, authority, backups, progression | Restart/recovery and time-advance evidence |
| **O — Operational hardening** | Reliable public service | Monitoring, security, budget checks | Recoverability and operational review |

Gates I/S/E/P may need internal reordering once their dependency tests are specified. Their ordering here is conceptual only; visual signoff remains the non-negotiable prerequisite for broad feature expansion.

## 15. Verification strategy

### Visual

- Reference comparison at matched desktop ratio plus mobile crop.
- Scene stills and camera walkthrough; assess silhouettes, lighting hierarchy, glow clipping, depth and UI restraint.
- Automated screenshot regressions for stable visual scenes where possible; human art signoff remains authoritative.

### Behavioral (later)

- Fixed-seed tests of energy conservation/bookkeeping (within defined model), feeding, capture and mortality.
- Controlled experiments for predation, collective signaling, learning preference changes, mutations and extinction.
- Avoid claims of emergent intelligence without measurable evidence.

### Operational (later)

- Browser reload, reconnect and duplicate WebSocket prevention.
- Simulated deployment interruption and snapshot restoration.
- Two-server authority collision test before horizontal expansion.
- One-species-per-verified-email concurrency test; expired-token and replay prevention tests.
- Backup restoration drill, mail-provider failure behavior, load tests with controlled connection counts.

## 16. Open decisions / hypotheses

1. **World progression:** Continuous server runtime vs lower-rate unattended progression; acceptable approximation boundary.
2. **Species definition:** When a mutated lineage counts as a new species without consuming a second user creation slot.
3. **Founder population size:** Provisional small cohort; depends on reproductive mechanics.
4. **Trait cap and point formula:** Two starting traits and finite points are provisional.
5. **Renderer effects:** WebGL pass pipeline and mobile degradation require validation on target hardware.
6. **Look and feel:** Exact fonts, camera coordinates, color grade and asset count decided by V-GATE comparison.
7. **Host provider and budget:** Compare actual quotes incl. renewals, bandwidth, backups, e-mail and domain before deployment.
8. **Email deletion:** How to satisfy deletion obligations while preserving one-creation integrity without keeping identifying data longer than necessary.
9. **Moderation:** Public species names, offensive content, impersonation and automated submission abuse.
10. **Complexity envelope:** Max organisms/world and observer connections supported by measured server budget.

## 17. Definition of a successful initial deliverable

The **first deliverable** is a publicly accessible, visually polished *Hydrothermal Garden* experience with original assets, a compelling bioluminescent stage, credible ambient movement, deliberate camera controls, refined UI, fallback behavior, and explicit design review evidence. It **does not** falsely imply functioning machine learning, autonomous ecology or persistent real species.

Only after the visual direction is approved should the project progressively become the full shared, persistent ecosystem described in this specification.

---

## 18. Reference documentation consulted (October 2026)

- Three.js — renderer and WebGPU/WebGL fallback: https://threejs.org/manual/pages/webgpurenderer
- Three.js — post-processing: https://threejs.org/manual/pages/post-processing.html
- Three.js — WebGPU postprocessing pipeline: https://threejs.org/manual/pages/webgpu-postprocessing.html
- Phoenix releases: https://github.com/phoenixframework/phoenix/releases
- Phoenix LiveView releases: https://github.com/phoenixframework/phoenix_live_view/releases
- Cloudflare Pages official overview: https://developers.cloudflare.com/pages/
- Fly.io Elixir documentation: https://fly.io/docs/elixir/

**Note:** These are references for technical direction, not validation of a deployed system or proof of performance/cost.
