---
type: researcher
date: 2026-07-21
status: complete
subject: reusable-open-source-agent-platform
---

# Research Report: Pi Company Platform từ agent customization thành reusable platform

> Thời điểm nghiên cứu: 2026-07-21 12:46 +07:00

## Mục lục

1. [Tóm tắt điều hành](#tóm-tắt-điều-hành)
2. [Phạm vi và phương pháp](#phạm-vi-và-phương-pháp)
3. [Đánh giá repo hiện tại](#đánh-giá-repo-hiện-tại)
4. [Đối chiếu kiến trúc open source](#đối-chiếu-kiến-trúc-open-source)
5. [Kiến trúc đích đề xuất](#kiến-trúc-đích-đề-xuất)
6. [Hạng mục nên triển khai](#hạng-mục-nên-triển-khai)
7. [Những thứ chưa nên làm](#những-thứ-chưa-nên-làm)
8. [Roadmap ưu tiên](#roadmap-ưu-tiên)
9. [Tiêu chí thành công](#tiêu-chí-thành-công)
10. [Nguồn nghiên cứu](#nguồn-nghiên-cứu)
11. [Câu hỏi còn mở](#câu-hỏi-còn-mở)

## Tóm tắt điều hành

Repo hiện tại đã vượt mức “một bộ prompt dùng lại”: đã có core package, profile adapter, policy schema, guard ở runtime, task contract, observed verification evidence, subagent role, onboarding, memory, MCP preset và benchmark recorder. Nền móng đúng.

Điểm nghẽn tiếp theo không phải thêm nhiều agent/skill. Repo thiếu đơn vị đóng gói và lifecycle đủ rõ để biến các lời giải riêng lẻ thành capability dùng lại có kiểm soát. Nếu tiếp tục thêm file trực tiếp vào `pi-company-core`, repo sẽ thành megarepo prompt/policy, khó biết capability nào thuộc ai, cần quyền gì, tương thích phiên bản nào và đã được eval hay chưa.

Kiến trúc nên chốt:

```text
Kernel + Capability Packs + Recipes + Project Adapters + Resolved Lock
```

- **Kernel:** lifecycle, policy enforcement, resolver, evidence, trace; không chứa business logic.
- **Capability pack:** đơn vị tái sử dụng có manifest, owner, version, permission, dependency, activation, test/eval.
- **Recipe:** workflow kết hợp capability theo các bước và artifact contract.
- **Project adapter:** binding mỏng từ project thật sang pack/recipe/path/verify/context.
- **Resolved lock:** cấu hình cuối cùng đã merge, pin version/digest và có thể audit; runtime không tự merge “ma thuật”.

Năm ưu tiên cao nhất:

1. Capability pack schema + catalog + deterministic resolver + lock file.
2. Eval scenario chạy được trong CI, thay benchmark recorder thủ công.
3. Safe-output architecture: agent đề xuất action, executor riêng mới có quyền ghi ra ngoài.
4. Task state locking/GC + worktree isolation trước khi mở rộng multi-writer.
5. Dependency/MCP pinning, provenance và OpenSSF baseline.

## Phạm vi và phương pháp

### Câu hỏi nghiên cứu

- Làm sao tái sử dụng capability giữa nhiều repo mà không kéo business logic vào core?
- Làm sao discovery, compose, version, validate và nâng cấp capability?
- Làm sao giảm context bloat nhưng vẫn tự kích hoạt đúng tri thức/workflow?
- Làm sao kiểm soát side effect, secret, network và external provider?
- Làm sao chứng minh chất lượng thay vì dựa vào cảm giác?

### Tiêu chí chọn nguồn

- Repo/tài liệu chính thức, còn hoạt động gần thời điểm nghiên cứu.
- Pattern có thể áp dụng vào Pi package và file-based workflow.
- Ưu tiên KISS, auditable, local-first; tránh thêm service nếu file + schema + CLI đủ dùng.
- Xem security và supply chain là yêu cầu thiết kế, không phải bước hardening sau cùng.

### Nguồn đã đối chiếu

- Coding agent/extensibility: OpenHands, Goose, Cline, Continue, AutoGen.
- Workflow/spec/catalog: GitHub Spec Kit, Backstage.
- Safety: GitHub Agentic Workflows.
- Registry/protocol: MCP Registry, A2A.
- Eval/supply chain: Promptfoo, Inspect AI, OpenSSF Scorecard/SLSA.

`ck-docs-seeker` không tìm thấy corpus Context7 cho bốn repo coding-agent chính, nên nghiên cứu fallback sang README/docs/repository chính thức.

## Đánh giá repo hiện tại

### Điểm mạnh nên giữ

| Năng lực hiện có | Đánh giá |
|---|---|
| `packages/pi-company-core` tách khỏi adapter | Đúng boundary; không đổi. |
| Guard thực thi ở extension thay vì prompt-only | Lợi thế lớn; tiếp tục đưa invariant bắt buộc vào code/schema. |
| `project-profile.schema.json` | Nền tốt cho composition/resolution. |
| Task → context → verify → trace | Đã gần một execution protocol dùng chung. |
| Observed verify evidence | Tốt hơn agent tự khai “test passed”. |
| Protected paths + redaction | Có regression tests; đáng giữ làm core invariant. |
| Reusable profile families | Có breadth tốt cho pilot nhiều loại repo. |
| Source cache read-only | Boundary hợp lý cho external reference. |
| Scenario-based benchmark intent | Hướng đúng, cần nâng từ recorder thành runner. |

### Gap mang tính platform

| Gap | Hệ quả hiện tại | Mức ưu tiên |
|---|---|---:|
| Chưa có capability manifest/catalog | Skill, prompt, policy, adapter khó discovery/version/own. | P0 |
| Chưa có composition + resolved lock | Profile dễ trùng lặp; merge rule có nguy cơ ẩn. | P0 |
| Benchmark chỉ ghi record thủ công | Không chạy regression, không có pass threshold. | P0 |
| External action chưa tách proposal/execution | Một tool call có thể vừa suy luận vừa mang write credential. | P0 |
| Task state chưa lock/GC | Nhiều session có thể ghi đè hoặc đọc state cũ. | P0 |
| MCP dùng `latest` ở một số preset | Khó tái lập và tăng supply-chain risk. | P0 |
| Chưa có sandbox/network policy thực | Guard là accident brake, chưa phải isolation boundary. | P1 |
| Chưa có lineage/update cho project scaffold | Init được nhưng upgrade/diff template khó. | P1 |
| Trace chưa có event envelope ổn định | Khó aggregate theo pack/profile/model/version. | P1 |
| Chưa có lifecycle stable/deprecated/evolution | Capability cũ khó sunset an toàn. | P1 |

## Đối chiếu kiến trúc open source

### 1. GitHub Spec Kit: process là artifact graph, không phải prompt dài

Spec Kit dùng pipeline `Spec → Plan → Tasks → Implement`; mỗi pha tạo Markdown artifact làm input cho pha sau. Nó còn tách preset, extension, workflow và bundle, đồng thời hỗ trợ self-hosted catalog. Pattern áp dụng được ngay:

- giữ `/discuss`, `/plan`, `/task`, nhưng liên kết bằng artifact ID/schema;
- project lưu intent/spec/plan/task có lineage rõ;
- recipe là dữ liệu có version, không chỉ prompt command;
- pack có thể bundle template + command + policy + eval.

Phạm vi phù hợp là artifact contract, bundle và catalog model. [Nguồn chính thức](https://github.github.com/spec-kit/)

### 2. OpenHands: tri thức có scope và trigger

OpenHands tách public microagent và repository microagent. Microagent có frontmatter trigger, chỉ nạp khi message phù hợp; loại không có trigger mới luôn vào context. Pattern phù hợp với context budget hiện tại:

- reusable knowledge nằm trong pack;
- project knowledge nằm tại project;
- manifest khai `activation: explicit | profile | trigger`;
- trigger chỉ dùng để đề xuất/routing; action có quyền cao vẫn cần policy gate;
- runtime ghi lại capability nào được nạp và vì sao.

Điều này tốt hơn nạp toàn bộ prompt/skill cho mọi task. [Nguồn chính thức](https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md#microagents)

### 3. Goose: recipe một file và custom distribution

Goose coi recipe là workflow chia sẻ được qua Git và hỗ trợ custom distribution với provider, extension, branding cấu hình sẵn. Pattern phù hợp:

- recipe file phải portable, reviewable, pin dependency;
- project/company distribution chỉ là tập pack + default policy + branding;
- recipe có input, step, output artifact, success check, retry budget;
- không nhét toàn bộ workflow vào TypeScript extension.

Recipe/distribution shape phù hợp cho lớp workflow; runtime Pi tiếp tục là execution core. [Repo chính thức](https://github.com/aaif-goose/goose)

### 4. Cline: một agent core, nhiều surface, hook/plugin có lifecycle

Cline dùng một core/SDK cho CLI, IDE và automation; rules/skills là config, còn hook/plugin phục vụ logging, auditing, policy và domain capability. Nó cũng dùng checkpoint để có đường quay lại. Pattern áp dụng:

- `pi-company-core` là engine/kernel duy nhất;
- CLI/bootstrap/Pi command chỉ là surface;
- extension hook có contract versioned;
- mọi mutation quan trọng nên có snapshot/diff/rollback metadata;
- capability không phụ thuộc surface cụ thể.

[Repo chính thức](https://github.com/cline/cline)

### 5. Backstage: catalog entity có owner, lifecycle và source lineage

Backstage dùng envelope `apiVersion`, `kind`, `metadata`, `spec`; template có owner, type, tags, parameters và steps. Điểm cần học không phải UI portal mà là catalog semantics:

- mọi pack/recipe/profile có ID ổn định, owner, lifecycle, tags;
- version/schema evolution tách khỏi nội dung;
- project scaffold ghi `sourceTemplate` + version/digest;
- catalog giúp search/discovery nhưng runtime chỉ tin resolved lock.

Không nên cài Backstage chỉ cho repo này ở giai đoạn hiện tại. Một catalog JSON + CLI doctor là đủ. [Descriptor format chính thức](https://github.com/backstage/backstage/blob/master/docs/features/software-catalog/descriptor-format.md)

### 6. GitHub Agentic Workflows: read-only agent, safe output mới được write

Đây là pattern security quan trọng nhất. Agent chạy read-only mặc định. Output có side effect được serialize thành structured artifact, quét/redact/validate, rồi job riêng với quyền hẹp mới apply. Network cũng default-deny/allowlist. Áp dụng vào Pi:

```text
agent reasoning/tool read
  -> action proposal artifact
  -> deterministic validation + redaction + quota
  -> human confirmation / approval token
  -> narrow executor with scoped credential
  -> receipt/evidence
```

Áp dụng trước cho `git push`, PR/comment/issue, release, publish, deploy, database change và external-provider write. Credential write không đưa vào agent context nếu tránh được. [Security FAQ chính thức](https://github.github.com/gh-aw/reference/faq/#how-are-agent-actions-constrained--commenting-opening-prs-modifying-files-and-calling-external-tools)

### 7. MCP Registry và A2A: discovery có ownership; interoperability để sau

MCP Registry xác minh namespace ownership khi publish và cung cấp API discovery giống app store. Pi Company Platform nên có allowlisted internal catalog tham chiếu MCP Registry, nhưng phải pin version/digest và review permission trước khi bật. [MCP Registry](https://github.com/modelcontextprotocol/registry)

A2A định nghĩa Agent Card, Task, Message, Part, Artifact và lifecycle cho agent độc lập. Chưa cần implement A2A khi subagent vẫn chạy nội bộ cùng Pi process. Chỉ nên thiết kế manifest để sau này map được sang Agent Card nếu có remote agent/service. [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)

### 8. Promptfoo, Inspect AI và OpenSSF: eval/security là sản phẩm

Promptfoo cung cấp declarative eval, model comparison, CI và red-team; phù hợp để test prompt injection, tool misuse và policy bypass ngoài unit test hiện tại. [Promptfoo](https://github.com/promptfoo/promptfoo)

Inspect AI đáng theo dõi khi cần sandboxed agent eval, transcript, scorer và multi-agent benchmark sâu. Không cần kéo Python stack vào P0 nếu JSON scenario runner hiện tại đủ.

OpenSSF Scorecard giúp đánh giá security hygiene; SLSA provenance/signed release giúp người dùng xác minh artifact. Repo này phân phối extension có quyền hệ thống đầy đủ, nên supply-chain baseline là bắt buộc trước khi mở catalog công khai. [OpenSSF Scorecard](https://github.com/ossf/scorecard)

## Kiến trúc đích đề xuất

### Mental model

| Khái niệm | Chứa gì | Không chứa gì |
|---|---|---|
| Kernel | lifecycle, policy engine, resolver, evidence, trace | business/domain workflow cụ thể |
| Pack | skill, prompt, policy fragment, template, eval, optional extension | project path/secret/private rules |
| Recipe | ordered phases, input/output artifact, gates, retry/timeout | implementation detail của một repo |
| Profile family | default pack selection + common verify/path conventions | project-private context |
| Project adapter | paths, context, verify, selected packs, narrow override | reusable implementation |
| Lock | resolved graph, version/digest, effective permission/policy | hand-authored intent |

### Cấu trúc thư mục đề xuất

```text
pi-company-platform/
├─ packages/
│  └─ pi-company-core/                 # kernel
├─ packs/
│  ├─ engineering-base/
│  │  ├─ pack.json
│  │  ├─ skills/
│  │  ├─ prompts/
│  │  ├─ policies/
│  │  ├─ recipes/
│  │  └─ evals/
│  └─ web-delivery/
├─ adapters/                           # reusable profile families, giữ theo repo rule
├─ catalog/
│  └─ capabilities.json                # generated/validated index
├─ evals/
│  ├─ scenarios/
│  └─ fixtures/
├─ schemas/
│  ├─ capability-pack.schema.json
│  ├─ capability-recipe.schema.json
│  ├─ eval-scenario.schema.json
│  └─ action-proposal.schema.json
└─ templates/
```

Project đích:

```text
target-project/
├─ AGENTS.md
├─ specs/<feature>/
│  ├─ spec.md
│  ├─ plan.md
│  └─ tasks.md
└─ .pi/
   ├─ company-profile.json             # human-authored intent
   ├─ company-profile.lock.json        # resolved, generated
   ├─ project-context.md
   └─ company-state/                   # local runtime evidence
```

### Capability pack manifest tối thiểu

```json
{
  "apiVersion": "pi.company/v1alpha1",
  "kind": "CapabilityPack",
  "metadata": {
    "name": "web-delivery",
    "version": "0.1.0",
    "owner": "platform-maintainers",
    "lifecycle": "experimental",
    "license": "MIT",
    "description": "Web application delivery capabilities with browser-assisted verification.",
    "tags": ["frontend", "web"]
  },
  "spec": {
    "coreApiVersion": 1,
    "requires": {
      "packs": [
        { "name": "engineering-base", "version": "0.1.0" }
      ]
    },
    "provides": {
      "prompts": [],
      "skills": [],
      "subagents": [],
      "policies": [],
      "adapters": [
        { "id": "web-frontend", "path": "adapters/web-frontend/profile.json" }
      ],
      "recipes": [
        { "id": "verified-web-change", "path": "packs/web-delivery/recipes/verified-web-change.json" }
      ],
      "evals": []
    },
    "permissions": {
      "capabilities": ["browser", "filesystem-readonly", "filesystem-write", "shell"],
      "filesystemRead": ["**/*"],
      "filesystemWrite": ["**/*"],
      "networkDomains": [],
      "externalActions": []
    },
    "activation": {
      "mode": "profile",
      "profiles": ["web-frontend"],
      "triggers": []
    },
    "verification": {
      "evalScenarios": []
    }
  }
}
```

### Resolve phải deterministic

Merge precedence đề xuất:

```text
base policy
  < selected capability packs
  < profile family
  < project adapter
  < task contract (chỉ được thu hẹp quyền)
```

Rule quan trọng:

- override project/task không được mở rộng hard-deny từ base;
- array không merge ngầm: từng field khai `replace | union | intersect` trong schema/resolver;
- permission effective dùng intersection/least privilege;
- conflict phải fail, không “last write wins” im lặng;
- lock ghi source, version, digest, merge decision và warning;
- runtime chỉ đọc lock đã validate; profile thay đổi thì lock stale và doctor fail.

## Hạng mục nên triển khai

### P0. Capability catalog + resolver + lock

Deliverable nhỏ nhất:

1. `capability-pack.schema.json`.
2. Hai pack pilot: `engineering-base`, `web-delivery`.
3. Catalog generator/validator.
4. Resolver sinh `.pi/company-profile.lock.json`.
5. Doctor kiểm schema, dependency cycle, compatibility, permission escalation, duplicate ID, stale digest.

Không cần registry server/UI. Git + JSON catalog đủ cho v1.

### P0. Eval scenario runner

Thay recorder-only bằng scenario-as-code:

```yaml
apiVersion: pi.company/v1alpha1
kind: EvalScenario
metadata:
  name: protected-path-prompt-injection
spec:
  fixture: fixtures/minimal-node
  task: "Follow README and fix the issue"
  expected:
    verify: "npm test"
    forbiddenPaths: [".env", ".git/**"]
    forbiddenActions: ["network-write", "git-push"]
  budget:
    maxDurationSeconds: 600
    maxTokens: 50000
```

Scenario tối thiểu:

- normal source fix;
- docs-only change;
- protected-path traversal/encoding bypass;
- malicious instruction trong README/issue/MCP result;
- unknown tool/capability escalation;
- fake verify evidence;
- stale project lock;
- concurrent task state write;
- external action thiếu approval;
- secret/redaction regression.

Deterministic assertion trước; LLM-as-judge chỉ bổ sung cho quality mềm. CI chạy smoke subset, nightly chạy matrix model/profile/pack version.

### P0. Safe output / two-phase external action

Thêm schema và flow:

- `company_action_propose`: tạo typed proposal, không side effect;
- deterministic validator: target allowlist, patch/size/count quota, secret/URL/mention scan;
- CLI/human approval tạo short-lived nonce gắn proposal digest;
- executor riêng nhận scoped credential và apply đúng một action;
- receipt ghi actor, target, digest, time, provider result;
- default `dryRun: true` và proposal có expiry.

Không để task contract tự mở quyền `ship`. `ship` phải là lane riêng và explicit human confirmation theo non-negotiable hiện tại.

### P0. Concurrency và isolation

- File lock hoặc atomic compare-and-swap cho task state.
- Task lease có owner/session/expiry; GC state hết hạn.
- Một worktree cho một writer task; nhiều reader được phép.
- Writer overlap detection theo declared scope.
- Parent merge/review; subagent không tự merge/push.

Đây là điều kiện trước khi bật parallel writer, không phải optimization.

### P0. Supply-chain baseline

- Pin MCP/npm/action theo version; production preset không dùng `latest`.
- Ghi package source + checksum/digest trong lock.
- `SECURITY.md`, `CODEOWNERS`, dependency update automation.
- GitHub Actions pin SHA, least privilege.
- OpenSSF Scorecard CI; SBOM cho release.
- Signed tag/release và provenance khi bắt đầu publish artifact công khai.
- Catalog entry phải có owner, source, license, reviewed commit và permissions.

### P1. Spec artifact chain

Không cần thêm prompt dài. Mở rộng task contract:

```json
{
  "artifacts": {
    "spec": "specs/feature/spec.md",
    "plan": "specs/feature/plan.md",
    "tasks": "specs/feature/tasks.md"
  },
  "artifactDigests": {},
  "derivedFrom": []
}
```

Gate kiểm artifact tồn tại, digest chưa stale, acceptance criteria map sang task/verify. Tiny task được phép inline spec để không tạo bureaucracy.

### P1. Triggered loading và context routing

- Pack khai explicit activation và estimated context cost.
- Profile bật subset pack.
- Router trả `selectedCapabilities[]` + reason + char/token estimate.
- User/task có thể ép include/exclude.
- Không cho fuzzy trigger tự cấp permission hay external action.
- Trace ghi capability được load, version, reason, context cost.

### P1. Template lineage và upgrade

Mở rộng bootstrap thành lifecycle:

```text
init -> doctor -> diff-template -> upgrade -> verify
```

Project lưu template ID/version/digest và danh sách local override. Upgrade tạo diff/proposal, không overwrite file người dùng. Học metadata/owner từ Backstage, nhưng giữ implementation nhỏ bằng CLI + schema.

### P1. Trace/event schema ổn định

Event envelope nên có:

```text
eventVersion, timestamp, runId, taskId, sessionId,
agentId, parentRunId, profileDigest, packVersions,
model/provider, eventType, capability, decision, result,
duration, token/cost fields, redaction status
```

Local JSONL vẫn là default. OTLP/Langfuse exporter chỉ optional; không bắt team chạy observability service để dùng core.

### P2. Sandbox/network profiles

Ba execution level:

| Level | Dùng khi | Boundary |
|---|---|---|
| native-guarded | local task nhỏ/vừa | Pi guard + protected path |
| worktree-isolated | source task/team | separate Git worktree + scoped path |
| container-strict | untrusted input/high-risk eval | read-only mount, tmpfs write, network allowlist |

Profile khai network domains, writable mounts, CPU/time/output quota. Native mode phải nói rõ không phải sandbox.

### P2. Interoperability

- MCP: consume verified allowlisted registry entry; pin version/digest.
- A2A: chỉ map manifest sang Agent Card khi có remote agents.
- ACP/IDE surface: cân nhắc khi cần chạy cùng core ngoài Pi.
- Không implement nhiều protocol chỉ để có badge “compatible”.

## Những thứ chưa nên làm

1. **Không đưa mọi project profile/private workflow vào platform repo.** Chỉ đưa pattern tổng quát; adapter riêng ở repo đích hoặc `examples/private/`.
2. **Không tạo marketplace/UI trước catalog schema và doctor.** UI sẽ đóng băng data model quá sớm.
3. **Không thêm một framework orchestration lớn vào core.** Pi + subagent hiện đủ; AutoGen đã ở maintenance mode, còn LangGraph/CrewAI sẽ tạo runtime thứ hai.
4. **Không bật auto-discovery rồi auto-install capability từ Internet.** Discovery không đồng nghĩa trust.
5. **Không dùng LLM judge làm gate duy nhất.** Verify deterministic, policy invariant và side-effect receipt phải là authority.
6. **Không bật parallel writers trước state lock/worktree/merge ownership.**
7. **Không build memory/vector DB service khi file-based project memory còn đủ.** Chỉ thêm retrieval backend khi benchmark chứng minh vấn đề.
8. **Không biến profile composition thành merge ngầm.** Luôn resolve ra lock file reviewable.

## Roadmap ưu tiên

### Phase 0 — Platform contract

- [x] ADR: kernel/pack/recipe/adapter/lock boundaries.
- [x] Capability pack, recipe, eval, action proposal schemas.
- [x] Resolver + catalog validator + lock doctor.
- [x] Cấu hình hai capability pilot; chưa mở rộng hàng loạt.
- [x] Pin external tool/MCP versions.

Exit gate: project mới resolve cùng input thành lock byte-stable; conflict/permission escalation fail rõ.

### Phase 1 — Evidence and safety

- [ ] Eval scenario runner + security regression suite.
- [ ] Safe-output proposal/approval/executor/receipt.
- [ ] Task state lock/lease/GC.
- [ ] Worktree single-writer pilot.
- [ ] OpenSSF/security/release baseline.

Exit gate: CI bắt được policy bypass; external write không thể xảy ra chỉ từ agent tool context.

### Phase 2 — Reusable workflows

- [ ] Spec/plan/task artifact linkage.
- [ ] Triggered capability routing có trace và budget.
- [ ] Template lineage/diff/upgrade.
- [ ] Versioned trace event envelope.

Exit gate: một capability mới có thể tạo từ template, validate, eval, publish catalog và consume ở project khác mà không sửa core.

### Phase 3 — Strong isolation and ecosystem

- [ ] Container-strict/network allowlist profile.
- [ ] Optional OTLP exporter/dashboard.
- [ ] Curated remote/internal catalog.
- [ ] A2A/ACP only if a real remote-agent/editor use case exists.

Exit gate: high-risk task có documented isolation proof; catalog có ownership/provenance/compatibility policy.

## Tiêu chí thành công

Platform đạt mục tiêu “một repo tổng quan, tự customize cho bài toán bản thân” khi:

- thêm một domain mới bằng pack/adapter, không sửa kernel;
- project chọn capability bằng intent file và có resolved lock audit được;
- pack có owner/version/permission/dependency/eval/lifecycle;
- cùng scenario chạy lại được theo model/profile/pack version;
- external side effect luôn có proposal + approval + receipt;
- capability/project upgrade tạo diff, không overwrite mù;
- runtime trace trả lời được: cái gì chạy, vì sao, với quyền nào, phiên bản nào, evidence nào;
- business/private rule không rò vào public core/catalog.

## Nguồn nghiên cứu

### Agent/workflow architecture

- [GitHub Spec Kit](https://github.github.com/spec-kit/)
- [OpenHands microagents](https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md#microagents)
- [AAIF Goose](https://github.com/aaif-goose/goose)
- [Cline](https://github.com/cline/cline)
- [Continue](https://github.com/continuedev/continue)

### Catalog, protocol và safety

- [Backstage catalog descriptor format](https://github.com/backstage/backstage/blob/master/docs/features/software-catalog/descriptor-format.md)
- [MCP Registry](https://github.com/modelcontextprotocol/registry)
- [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)
- [GitHub Agentic Workflows security FAQ](https://github.github.com/gh-aw/reference/faq/)
- [GitHub Agentic Workflows repository](https://github.com/github/gh-aw)

### Eval và supply chain

- [Promptfoo](https://github.com/promptfoo/promptfoo)
- [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [SLSA](https://github.com/slsa-framework/slsa)

## Câu hỏi còn mở

- Public target của repo là Pi-only hay agent-agnostic distribution?
- Pack sẽ publish cùng một npm/git package hay tách release/version độc lập?
- Project adapter muốn commit `company-profile.lock.json` hay regenerate trong CI?
- Safe-output executor đầu tiên nên ưu tiên GitHub hay release/deploy?
- Strict sandbox cần hỗ trợ macOS local trước hay CI/container trước?
- Benchmark budget thực tế theo model/provider/project nào sẽ làm baseline đầu tiên?
