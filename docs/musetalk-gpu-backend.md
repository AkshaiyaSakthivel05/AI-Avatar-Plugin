# MuseTalk GPU Backend — Implementation Guide

Photorealistic real-time lip-sync for the AI Avatar Plugin using MuseTalk as a GPU-backed
video generation service. The browser streams audio from ElevenLabs; the backend inpaints
the mouth region on a portrait photo frame-by-frame and streams JPEG frames back.

---

## Architecture Overview

```
ElevenLabs SDK (browser)
        │
        │  raw PCM audio chunks (Float32Array, 16kHz)
        ▼
FastAPI WebSocket  /api/musetalk/stream
        │
        │  per-chunk pipeline:
        │  1. WhisperX  →  mel-spectrogram features
        │  2. MuseTalk  →  inpaint mouth on portrait → RGB frame
        │  3. JPEG encode
        │
        │  JPEG bytes (pushed back over same WebSocket)
        ▼
Browser canvas  (ctx.drawImage on each received frame)
```

The ElevenLabs session remains entirely unchanged — we only tap the raw output audio
and send it to our own backend. The portrait never leaves the server after initial upload.

---

## 1. Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA RTX 3060 12 GB VRAM | RTX 4070 / 4080 |
| CPU | 6-core (AMD Ryzen 5 / Intel i5) | 8-core+ |
| RAM | 16 GB | 32 GB |
| Disk | 50 GB free | 100 GB (models + workspace) |
| OS | Ubuntu 20.04 LTS | Ubuntu 22.04 LTS |
| Network | — | Low-latency LAN if backend is separate machine |

> **macOS / Apple Silicon**: Not supported. CUDA is NVIDIA-only. No workaround exists.
>
> **Windows**: Works via WSL2 (Windows Subsystem for Linux) with CUDA passthrough.
> Native Windows support is possible but harder to maintain.

---

## 2. Software Prerequisites

### 2.1 NVIDIA Driver + CUDA Toolkit

```bash
# Verify GPU is detected
nvidia-smi

# Install CUDA 11.8 (if not already present)
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda_11.8.0_520.61.05_linux.run
sudo sh cuda_11.8.0_520.61.05_linux.run

# Add to PATH (append to ~/.bashrc)
export PATH=/usr/local/cuda-11.8/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda-11.8/lib64:$LD_LIBRARY_PATH

# Verify
nvcc --version
```

### 2.2 cuDNN 8.x

Download cuDNN 8.x for CUDA 11.8 from https://developer.nvidia.com/cudnn (free NVIDIA account required).

```bash
tar -xzvf cudnn-linux-x86_64-8.x.x.x_cuda11-archive.tar.xz
sudo cp cudnn-*-archive/include/cudnn*.h    /usr/local/cuda/include
sudo cp -P cudnn-*-archive/lib/libcudnn*   /usr/local/cuda/lib64
sudo chmod a+r /usr/local/cuda/include/cudnn*.h /usr/local/cuda/lib64/libcudnn*
```

### 2.3 System packages

```bash
sudo apt update && sudo apt install -y \
    git ffmpeg libgl1 libglib2.0-0 \
    python3.10 python3.10-venv python3-pip \
    build-essential cmake
```

### 2.4 Conda (recommended for MuseTalk environment isolation)

```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
source $HOME/miniconda3/etc/profile.d/conda.sh
conda init bash && source ~/.bashrc
```

---

## 3. MuseTalk Installation

```bash
# Clone MuseTalk
git clone https://github.com/TMElyralab/MuseTalk.git
cd MuseTalk

# Create isolated Python 3.10 environment
conda create -n musetalk python=3.10 -y
conda activate musetalk

# PyTorch with CUDA 11.8
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 \
    --index-url https://download.pytorch.org/whl/cu118

# MuseTalk dependencies
pip install -r requirements.txt

# mmlab packages (required for face detection)
pip install mmengine==0.10.1 mmcv==2.1.0 mmdet==3.1.0 mmpose==1.3.1 \
    -f https://download.openmmlab.com/mmcv/dist/cu118/torch2.0/index.html
```

### 3.1 Download Models (~8 GB total)

MuseTalk requires several pre-trained weights. The official repo includes a download script:

```bash
# From inside the MuseTalk directory
python scripts/download_weights.py
```

This downloads to `./models/`:

| Model | Size | Purpose |
|-------|------|---------|
| `musetalk/musetalk.json` + `.bin` | ~450 MB | Lip inpainting UNet |
| `dwpose/` | ~280 MB | DWPose body/face detection |
| `face-parse-bisenet/` | ~50 MB | Face region segmentation |
| `whisper/tiny.pt` | ~75 MB | Audio feature extraction |
| `sd-vae-ft-mse/` | ~335 MB | VAE encoder/decoder |

If the download script fails, refer to the MuseTalk README for manual HuggingFace links.

### 3.2 Smoke-test MuseTalk

```bash
# Verify everything loads with a single test inference
conda activate musetalk
python -c "
from musetalk.utils.utils import load_all_model
audio_processor, vae, unet, pe = load_all_model()
print('MuseTalk loaded successfully')
"
```

---

## 4. Backend Integration

This section describes the new code to add to the existing FastAPI backend in this project.

### 4.1 Directory structure additions

```
backend/
  routes/
    musetalk_route.py       ← NEW: WebSocket endpoint + portrait upload
  services/
    musetalk_service.py     ← NEW: wraps MuseTalk inference pipeline
  models/
    requests.py             ← extend with PortraitUploadRequest
```

### 4.2 `backend/services/musetalk_service.py`

```python
"""
Wraps the MuseTalk inference pipeline.
Loaded once at startup (Singleton in the DI container) — model loading takes ~10s.
"""
from __future__ import annotations

import asyncio
import io
import logging
import time
from pathlib import Path
from typing import Iterator

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


class MuseTalkService:
    def __init__(self) -> None:
        self._ready = False
        self._audio_processor = None
        self._vae             = None
        self._unet            = None
        self._pe              = None

    def load_models(self) -> None:
        """Call once at app startup (lifespan). Blocks for ~10 s on first load."""
        try:
            from musetalk.utils.utils import load_all_model
            self._audio_processor, self._vae, self._unet, self._pe = load_all_model()
            self._ready = True
            logger.info("MuseTalk models loaded.")
        except Exception as exc:
            logger.error("MuseTalk failed to load: %s", exc)

    @property
    def ready(self) -> bool:
        return self._ready

    def infer_frames(
        self,
        portrait_path: Path,
        audio_pcm: np.ndarray,   # float32, 16 kHz, mono
        sample_rate: int = 16_000,
    ) -> Iterator[bytes]:
        """
        Yields JPEG-encoded frames (bytes) for each audio chunk.
        Runs synchronously — call from a thread pool in the async route.
        """
        if not self._ready:
            raise RuntimeError("MuseTalk models not loaded.")

        from musetalk.utils.utils import get_file_type, load_audio_model
        from musetalk.utils.blending import get_image_blending
        import torch
        import cv2

        # --- Audio features ---
        audio_features = self._audio_processor.audio2feat(audio_pcm, sample_rate)

        # --- Load + prepare portrait ---
        portrait = np.array(Image.open(portrait_path).convert("RGB"))
        h, w     = portrait.shape[:2]

        # Face detection → mouth bounding box (simplified; real implementation
        # uses DWPose to get the full face landmark set)
        from musetalk.utils.face_parsing import FaceParsing
        fp     = FaceParsing()
        coords = fp.get_mouth_coords(portrait)   # (x1, y1, x2, y2)

        x1, y1, x2, y2 = coords
        mouth_region = portrait[y1:y2, x1:x2]

        # --- Per-chunk inference ---
        for feat_chunk in self._chunk_audio_features(audio_features):
            with torch.no_grad():
                latent = self._vae.encode(
                    torch.from_numpy(mouth_region).float().permute(2,0,1).unsqueeze(0) / 127.5 - 1
                ).latent_dist.sample() * 0.18215

                audio_emb = self._pe(
                    torch.from_numpy(feat_chunk).unsqueeze(0)
                )

                pred_latent = self._unet(latent, audio_emb).sample
                pred_mouth  = self._vae.decode(pred_latent / 0.18215).sample
                pred_mouth  = ((pred_mouth.squeeze(0).permute(1,2,0).cpu().numpy() + 1) * 127.5).clip(0, 255).astype(np.uint8)

            # Paste inpainted mouth back onto portrait
            result = portrait.copy()
            blended = get_image_blending(portrait, pred_mouth, (x1, y1, x2, y2))
            result[y1:y2, x1:x2] = blended

            # JPEG encode
            _, buf = cv2.imencode(".jpg", cv2.cvtColor(result, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
            yield buf.tobytes()

    @staticmethod
    def _chunk_audio_features(features: np.ndarray, chunk_size: int = 8) -> Iterator[np.ndarray]:
        for i in range(0, len(features), chunk_size):
            yield features[i : i + chunk_size]
```

> **Note:** The method bodies above are pseudocode scaffolding. The exact MuseTalk API calls
> (`load_all_model`, `audio2feat`, `FaceParsing`, `get_image_blending`) match the MuseTalk
> source but may differ slightly across MuseTalk versions. Always cross-reference with the
> installed version's source in `musetalk/utils/`.

### 4.3 `backend/routes/musetalk_route.py`

```python
"""
Two endpoints:
  POST /api/musetalk/portrait  — upload the avatar portrait (stored server-side)
  WS   /api/musetalk/stream    — bidirectional: browser sends PCM, server sends JPEG frames
"""
from __future__ import annotations

import asyncio
import io
import uuid
from pathlib import Path

import numpy as np
from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from PIL import Image

from backend.container import Container
from backend.services.musetalk_service import MuseTalkService

router     = APIRouter(prefix="/api/musetalk")
UPLOAD_DIR = Path("static/portraits")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/portrait")
@inject
async def upload_portrait(
    file: UploadFile,
    musetalk_service: MuseTalkService = Depends(Provide[Container.musetalk_service]),
) -> dict[str, str]:
    """Accept a portrait image and return a session portrait_id."""
    if not musetalk_service.ready:
        raise HTTPException(503, "MuseTalk models not loaded.")

    data = await file.read()
    img  = Image.open(io.BytesIO(data)).convert("RGB")

    portrait_id   = str(uuid.uuid4())
    portrait_path = UPLOAD_DIR / f"{portrait_id}.jpg"
    img.save(portrait_path, quality=95)

    return {"portrait_id": portrait_id}


@router.websocket("/stream/{portrait_id}")
@inject
async def stream_frames(
    websocket: WebSocket,
    portrait_id: str,
    musetalk_service: MuseTalkService = Depends(Provide[Container.musetalk_service]),
) -> None:
    """
    Protocol:
      browser → server : raw PCM bytes (float32-le, 16 kHz, mono)
      server → browser : JPEG frame bytes
    """
    portrait_path = UPLOAD_DIR / f"{portrait_id}.jpg"
    if not portrait_path.exists():
        await websocket.close(code=4004)
        return

    await websocket.accept()
    loop = asyncio.get_event_loop()

    try:
        while True:
            pcm_bytes = await websocket.receive_bytes()
            pcm_array = np.frombuffer(pcm_bytes, dtype=np.float32)

            # Run blocking inference in a thread pool to avoid blocking the event loop
            frames = await loop.run_in_executor(
                None,
                lambda: list(musetalk_service.infer_frames(portrait_path, pcm_array)),
            )

            for frame_jpeg in frames:
                await websocket.send_bytes(frame_jpeg)

    except WebSocketDisconnect:
        pass
```

### 4.4 Register in `backend/container.py`

Add MuseTalkService as a Singleton provider:

```python
from backend.services.musetalk_service import MuseTalkService

class Container(DeclarativeContainer):
    # ... existing providers ...

    musetalk_service = providers.Singleton(MuseTalkService)
```

### 4.5 Load models at startup in `backend/main.py`

```python
@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    container.wire(modules=[...])

    # Load MuseTalk models in background thread so startup is non-blocking
    import asyncio
    asyncio.get_event_loop().run_in_executor(
        None, container.musetalk_service().load_models
    )

    yield
```

### 4.6 Mount the new router in `backend/main.py`

```python
from backend.routes.musetalk_route import router as musetalk_router

app.include_router(musetalk_router)
```

---

## 5. Frontend Integration

Add a new `MuseTalkAvatar` module to `static/widget.js` and a new avatar mode.

### 5.1 Config additions

```javascript
MUSETALK_WS: (backend) => `${backend.replace('http', 'ws')}/api/musetalk/stream`,
```

### 5.2 MuseTalkAvatar module (new, in widget.js)

```javascript
const MuseTalkAvatar = (() => {
  let _canvas    = null;
  let _ctx       = null;
  let _ws        = null;
  let _portraitId = null;

  async function init(canvas, portraitUrl) {
    _canvas = canvas;
    _ctx    = canvas.getContext("2d");

    // 1. Upload portrait to backend, get portrait_id
    const blob = await fetch(portraitUrl).then(r => r.blob());
    const form = new FormData();
    form.append("file", blob, "portrait.jpg");

    const res = await fetch(`${Config.BACKEND}/api/musetalk/portrait`, {
      method: "POST", body: form,
    });
    if (!res.ok) throw new Error("Portrait upload failed");
    _portraitId = (await res.json()).portrait_id;
  }

  function startStreaming(getAudioChunkFn) {
    if (!_portraitId) return;

    const wsUrl = `${Config.BACKEND.replace("http", "ws")}/api/musetalk/stream/${_portraitId}`;
    _ws = new WebSocket(wsUrl);
    _ws.binaryType = "arraybuffer";

    _ws.onmessage = (evt) => {
      // Received a JPEG frame — draw it to canvas
      const blob = new Blob([evt.data], { type: "image/jpeg" });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();
      img.onload = () => {
        _ctx.drawImage(img, 0, 0, _canvas.width, _canvas.height);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    _ws.onopen = () => {
      // Poll ElevenLabs audio and forward to backend every ~40ms
      const interval = setInterval(() => {
        if (_ws.readyState !== WebSocket.OPEN) { clearInterval(interval); return; }
        const pcm = getAudioChunkFn();   // Float32Array from Conversation.getOutputFreqData
        if (pcm && pcm.length) _ws.send(pcm.buffer);
      }, 40);
    };
  }

  function stop() {
    if (_ws) { _ws.close(); _ws = null; }
  }

  return { init, startStreaming, stop };
})();
```

### 5.3 Wire in App._initAvatar

```javascript
// After photoUrl is resolved and the mode is MuseTalk:
await MuseTalkAvatar.init(canvas, photoUrl);
// On conversation connect callback:
MuseTalkAvatar.startStreaming(Conversation.getOutputFreqData);
```

---

## 6. Audio / Video Sync

MuseTalk introduces ~200–400ms latency per chunk. Without buffering, the video will lag
behind the voice. Recommended strategy:

- ElevenLabs plays audio immediately (no delay).
- The canvas shows the inpainted frames as they arrive.
- Buffer 3–5 frames ahead using a `FrameBuffer` queue in JavaScript so playback is
  smoother even when GPU inference speed varies.

```javascript
// Simple frame queue
const _frameQueue = [];
let   _playing    = false;

function _enqueue(jpegBytes) {
  _frameQueue.push(jpegBytes);
  if (!_playing) _dequeue();
}

function _dequeue() {
  if (!_frameQueue.length) { _playing = false; return; }
  _playing = true;
  const frame = _frameQueue.shift();
  // draw frame ...
  setTimeout(_dequeue, 40);  // target 25 fps
}
```

---

## 7. Cloud GPU Deployment (No Local GPU)

If you don't own a GPU machine, rent one:

| Provider | Instance | VRAM | Cost (approx) |
|----------|----------|------|---------------|
| RunPod | RTX 4090 pod | 24 GB | ~$0.74/hr |
| Lambda Labs | A10 instance | 24 GB | ~$0.60/hr |
| Vast.ai | RTX 3090 | 24 GB | ~$0.35/hr |
| Google Colab Pro+ | A100 | 40 GB | ~$50/mo flat |

Steps:
1. Rent instance with Ubuntu 22.04 + CUDA 11.8 pre-installed image
2. Clone this project and follow Sections 2–4 above
3. Expose the backend via a public URL (RunPod assigns one automatically)
4. Set `data-backend-url="https://your-runpod-url"` on the widget script tag
5. Shut down the instance when not in use to avoid charges

> For production, put an nginx reverse proxy in front of the FastAPI server and enable
> TLS (HTTPS/WSS) — browsers block mixed-content WS connections from HTTPS pages.

---

## 8. End-to-End Checklist

- [ ] NVIDIA driver verified (`nvidia-smi` shows GPU)
- [ ] CUDA 11.8 + cuDNN 8.x installed (`nvcc --version`)
- [ ] MuseTalk conda env created and smoke-tested
- [ ] Model weights downloaded (~8 GB)
- [ ] `MuseTalkService` added to DI container
- [ ] `musetalk_route.py` mounted in FastAPI app
- [ ] Portrait upload tested via `POST /api/musetalk/portrait`
- [ ] WebSocket stream tested via `wscat` or browser console
- [ ] Frontend `MuseTalkAvatar` module wired in `App._initAvatar`
- [ ] Frame buffer tuned for smooth 25 fps playback
- [ ] Audio/video sync acceptable (< 500 ms drift at 25 fps)
- [ ] (Production) nginx + TLS configured for WSS

---

## 9. Expected Output Quality

With MuseTalk on a portrait photo:

- Mouth region inpainted per audio chunk — lips, teeth, and tongue move naturally
- Rest of the face is untouched (hair, eyes, skin stay pixel-perfect)
- ~25 fps at RTX 3060 / ~30 fps at RTX 4070
- Latency from audio to visible frame: ~200 ms (chunk pipeline) + network RTT

For full facial motion (head nod, eye movement, expressions) on top of MuseTalk,
layer **LivePortrait** on the output frames before JPEG encoding. That combination
is what commercial products like HeyGen use internally.
