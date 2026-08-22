<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wordmark-dark.png">
  <img src="docs/brand/wordmark-light.png" width="340" alt="Worldsmith" />
</picture>

**An autonomous media production studio. One idea in — a complete, distribution-ready production out.**

*Google Cloud Agentic Cinema Hackathon — **Parallel** track*

[Live demo](https://getworldsmith.com) · [Demo video](#demo-video) · [Architecture](#architecture)

</div>

---

## The problem

Every AI video tool gives you a clip. None of them give you a *production*.

A real studio doesn't start with a prompt — it starts with research: what does the audience actually want right now? Then it builds a world, keeps every character on-model across every shot, quality-checks the footage, assembles it, narrates it, and ships a campaign to eight platforms.

That whole loop is the bottleneck. Worldsmith automates it end to end, and keeps creative context intact from the first market signal to the final post.

## What it does

Give it one sentence. A network of agents then:

| # | Stage | What happens |
|---|-------|--------------|
| 1 | **Discover** | **Parallel Search** scans live web signals for a real content opportunity |
| 2 | **Think** | Gemini turns those signals into a content angle and creative strategy |
| 3 | **Create** | Builds a persistent **World Bible** — characters, locations, visual rules |
| 4 | **Produce** | Generates frames → Veo video → **VLM continuity QC** → FFmpeg assembly |
| 5 | **Distribute** | One click: 8-platform campaign with on-model creatives and copy |
| 6 | **Learn** | Performance signals feed the next discovery cycle |

Expensive steps sit behind human approval gates, and every asset is costed in a transparent per-asset ledger.

Beyond the full pipeline, **10 standalone tools** work on their own — Text→Image, Text→Video, Image→Video, Voiceover+Images→Video, Text→Speech, Image→Prompt, Upscale, Social Post, YouTube Kit, and **Cast** (build a character once, reuse it in any scene).

## Partner track: Parallel

**Parallel Search is the first act of the pipeline**, not a bolt-on. Worldsmith's core claim — *"not a generator, a studio"* — depends on researching a real opportunity before a single frame is drawn. That research step is Parallel.

- **Where:** [`src/providers/parallel-research-provider.ts`](src/providers/parallel-research-provider.ts) — calls `https://api.parallel.ai` at runtime
- **Wired in:** [`src/providers/research-factory.ts`](src/providers/research-factory.ts)
- **Proof at runtime:** the Studio's **Research Signals** panel renders live results with source citations, and the header badge reads `RESEARCH · PARALLEL` straight from resolved config

## Google Cloud

Every model in the system is a Google model. There are no third-party AI providers — [`src/providers/factory.ts`](src/providers/factory.ts) resolves to Gemini, Gemini on Vertex AI, or an offline mock, and nothing else.

| Capability | Service |
|---|---|
| Reasoning / agents | Gemini on **Vertex AI** |
| Image generation | **Vertex AI** — `gemini-2.5-flash-image` |
| Video generation | **Veo 3.1** |
| Continuity QC | Gemini **VLM** |
| Narration | Gemini **TTS** |
| Auth + data | **Firebase** Auth / Firestore |

SDKs: `@google/genai`, `@google/generative-ai`, `firebase`, `firebase-admin`.

## Screenshots

| | |
|---|---|
| ![Landing](docs/screenshots/01-landing.png) **Landing** | ![Studio](docs/screenshots/02-studio-pipeline.png) **Studio — the production console** |
| ![Pipeline](docs/screenshots/03-parallel-signals.png) **The loop — Parallel signals through to distribution** | ![Assets](docs/screenshots/04-asset-gallery.png) **Every asset, autonomously produced** |
| ![Tools](docs/screenshots/05-text-to-image.png) **Text → Image** | ![Social](docs/screenshots/06-distribution.png) **Social posts, in native platform sizes** |

## Architecture

```
                    ┌──────────────── Parallel Search ── live web signals
                    ▼
  idea ──▶ Discover ──▶ Think ──▶ Create ──▶ Produce ──▶ Distribute ──▶ Learn
                          │          │          │            │
                       Gemini    World Bible   Veo 3.1    Gemini
                      (Vertex)   (Firestore)  + VLM QC   (8 platforms)
                                                  │
                                              FFmpeg assembly
```

| Path | Role |
|---|---|
| `src/core/` | Orchestrator, asset director, creative director, credits, TextKit |
| `src/providers/` | Swappable provider seams (LLM, image, video, VLM, audio, research) |
| `src/agents/` | Per-stage agent implementations |
| `src/store/` | Firestore + local project/asset stores |
| `src/app/studio/` | The autonomous pipeline UI |
| `src/app/tools/` | The 10 standalone tools |

Every provider sits behind an interface, so mock and real implementations are interchangeable — the whole pipeline runs offline in mock mode for development.

## Run it locally

**Prerequisites:** Node 20+, a Google Cloud project with Vertex AI enabled, a Firebase project, and a Parallel API key.

```bash
git clone <repo-url> && cd worldsmith
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

Required environment:

```bash
# Google Cloud / Vertex AI
VERTEX_PROJECT_ID=your-gcp-project
VERTEX_LOCATION=us-central1
VERTEX_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Providers — all Google, or "mock" to run fully offline
LLM_PROVIDER=vertex
IMAGE_PROVIDER=vertex
VIDEO_PROVIDER=vertex
VLM_PROVIDER=vertex
AUDIO_PROVIDER=vertex
DISTRIBUTION_PROVIDER=vertex

# Partner track
RESEARCH_PROVIDER=parallel
PARALLEL_API_KEY=your-parallel-key

# Firebase (client)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Owner-only admin (promo codes)
OWNER_EMAIL=you@example.com
```

Set every `*_PROVIDER` to `mock` to explore the full flow without spending anything.

**Verify the config:** open `/studio` — the badge row shows each resolved provider. All should read `VERTEX` / `VEO` / `PARALLEL`, with none on `MOCK`.

## Screenshot guide

The screenshots above regenerate from a locally running instance:

```bash
npm run dev
node docs/capture-screenshots.mjs
```

Targets live in `docs/screenshots.json`. Shots are taken signed-out, so no account
data ends up in the repo — which also means the Studio interior (a completed
timeline, the Research Signals panel with its citations, the distribution tabs)
is not covered. Capture those by hand from a signed-in session if you want them.

## Tech

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Firebase · FFmpeg · Dodo Payments · i18n in 9 languages

## License

All rights reserved.
