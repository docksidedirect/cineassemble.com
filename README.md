# CineAssemble — AI Film Studio

&gt; Turn creative briefs into complete animated films with AI-generated scripts, images, voiceovers, lip-sync, and video assembly.

![Studio Dashboard](https://github.com/user-attachments/assets/884c874d-7f6e-4c06-8c35-88ff900816a0)

## ✨ What It Does

CineAssemble is an automated film production pipeline that takes a simple text brief and generates:

- **Scripts** — AI-written scenes with narration and dialogue
- **Characters** — Consistent character designs from reference images
- **Images** — Cinematic scene frames via DALL-E / GPT-Image-1
- **Voiceovers** — Multi-character dialogue with distinct voices
- **Lip-sync** — Character mouth movement matched to audio
- **Video clips** — AI animation via Replicate (Kling, Stable Video Diffusion)
- **Final assembly** — FFmpeg concatenation with subtitles and BGM

## 🖼️ Screenshots

|                                           Script Editor                                           |                                           Character Library                                           |
| :-----------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------: |
| ![Script Editor](https://github.com/user-attachments/assets/4ef60453-cd83-4dcb-88d0-b1063d285c3e) | ![Character Library](https://github.com/user-attachments/assets/3a667269-c7a8-44fe-bff6-c02428f9c48e) |

|                                           Scene Preview                                           |                                           Final Output                                           |
| :-----------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------: |
| ![Scene Preview](https://github.com/user-attachments/assets/db832d78-05f3-4346-a3ba-7d8b0c52a8dd) | ![Final Output](https://github.com/user-attachments/assets/1d0e7b9f-4c7e-418c-92d7-8f71b0f0ba33) |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8+
- FFmpeg (with ffprobe)
- Python 3 (for upscaling)

### 1. Clone & Install

```bash
git clone https://github.com/docksidedirect/cineassemble.com.git
cd cineassemble.com
npm install
```
