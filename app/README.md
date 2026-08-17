# CineAssemble — AI Film Studio

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5-black)](https://expressjs.com/)

> **Turn a creative brief into a complete AI-generated film.**
> Scripts, images, voiceovers, animations, and final assembly — fully automated.

![CineAssemble Screenshot](docs/screenshot.png)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎬 **Script Generation** | AI writes scene-by-scene scripts with dialogue & narration |
| 🎨 **Character Consistency** | Upload references — the AI locks designs across every scene |
| 🗣️ **Dialogue & Lip-Sync** | Characters talk to each other with synced mouth movement |
| 🎥 **AI Video Animation** | Bring still images to life with Kling / LTX / local Ken Burns |
| 🔊 **Voice Synthesis** | 10+ voices, emotion-aware, child pitch-shifting |
| 🎞️ **Auto Assembly** | Concatenates scenes, color grades, burns subtitles |
| 📐 **Multi-Format** | 16:9, 9:16, 1:1 — landscape, vertical, square |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **MySQL 8+**
- **FFmpeg** (with libx264)
- **Python 3** (for Ken Burns fallback)
- API keys: **OpenAI**, **Replicate** (optional: **Fal.ai**)

### 1. Clone & Install

```bash
git clone https://github.com/yourname/cineassemble.git
cd cineassemble/app
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 3. Setup Database

```bash
npm run db:migrate
```

### 4. Run Development Servers

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Worker (renders films)
npm run dev:worker

# Terminal 3 — Frontend
npm run dev

# Or all at once:
npm run dev:full
```

### 5. Open Studio

Navigate to `http://localhost:3000`

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React UI  │────▶│  Express API│────▶│  MySQL DB   │
│  (Vite)     │     │  (Port 3001)│     │             │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Worker    │
                    │  (Pipeline) │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         OpenAI      Replicate      Fal.ai
         (Script)    (Video)        (Video)
              │            │            │
              └────────────┴────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   FFmpeg    │
                    │  (Assembly) │
                    └─────────────┘
```

---

## 🎬 Production Types

| Type | Best For | References |
|------|----------|------------|
| **Cinematic Story** | Character-driven narratives | Characters (up to 12) |
| **Product Promo** | Commercial ads | Products (up to 8) |
| **Reference Video** | Style-matched content | Characters + Style refs |
| **Cartoon Story** | Flat 2D animation | Characters |
| **Social Ad** | TikTok/Reels/Shorts | Optional |

---

## 🧩 Pipeline Stages

```
Draft → Script → Approve → Images → Audio → Video → Lip-Sync → Assembly → Done
```

Each stage is resumable. If video generation fails, the worker falls back to **local Ken Burns animation** automatically.

---

## ⚙️ Configuration

Key `.env` variables:

```env
# Required
OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
DATABASE_URL=mysql://user:pass@localhost:3306/cineassemble

# Optional (video providers)
FAL_KEY=...

# Pipeline tuning
SCENE_SECONDS_TARGET=9        # narration length per scene
CLIP_SECONDS=5                # default video clip length
ANIMATION_ENGINE=replicate    # replicate | fal | local
FALLBACK_TO_LOCAL=true        # degrade to Ken Burns on error

# Quality
OPENAI_IMAGE_QUALITY=high
UPSCALE_ENABLED=true
```

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `ENOENT: no such file or directory` | Worker crashed mid-render. Click **"Resume missing work"** |
| `422 Unprocessable Entity` (Replicate) | Duration must be 5 or 10 for Kling. Already handled automatically |
| `Script schema mismatch` | AI returned fewer scenes than expected. Increase `SCENE_SECONDS_TARGET` |
| `flagged as sensitive` | Scene prompt triggered safety filter. Falls back to local animation |
| Images look like gardens instead of kitchens | Add location words 3+ times in your brief |

---

## 💰 Monetization

This repo is **open-source** for learning and self-hosting.

If you want to run it as a SaaS:
- Set up PayPal subscriptions in `.env`
- Configure SMTP for email verification
- Deploy with Docker + reverse proxy

---

## 📜 License

MIT — free for personal and commercial use.

---

## ☕ Support

If this project saved you time:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/yourname)

---

**Built with:** React 19 · Express 5 · OpenAI · Replicate · FFmpeg · MySQL
