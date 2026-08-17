

## 🔐 API Credentials (BYOK — Bring Your Own Keys)

**CineAssemble does NOT provide free AI credits.** Every user must configure their own API keys in `.env`:

| Service | Purpose | Get Key |
|---------|---------|---------|
| **OpenAI** | Script writing, image generation, voice synthesis | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Replicate** | Video animation (Kling, etc.) | [replicate.com](https://replicate.com/account/api-tokens) |
| **Fal.ai** | Alternative video provider (optional) | [fal.ai](https://fal.ai/dashboard/keys) |

### Cost estimate per 1-minute film

| Component | Cost |
|-----------|------|
| Script (OpenAI) | ~$0.01 |
| Images (OpenAI) | ~$0.50–1.50 |
| Video clips (Replicate) | ~$1.00–2.00 |
| Voiceover (OpenAI) | ~$0.05 |
| **Total** | **~$2–4 per minute** |

> 💡 Set `ANIMATION_ENGINE=local` in `.env` to use free Ken Burns animation instead of paid AI models.

### Support the project

If this tool saves you money vs. hiring animators, consider supporting development:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/wanis.online)
