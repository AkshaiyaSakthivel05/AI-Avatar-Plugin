/**
 * AI Avatar Plugin — 3D human face with real-time lip sync
 * Powered by ElevenLabs Agents + Three.js (procedural face, no external GLB)
 *
 * <script src="http://your-server/widget.js"
 *   data-backend-url="http://localhost:8000"
 *   data-position="bottom-right"
 *   data-name="AI Assistant">
 * </script>
 */
(function () {
  "use strict";

  // ── Config ──────────────────────────────────────────────────────────────────
  const _script =
    document.currentScript ||
    document.querySelector("script[src*='widget.js']");

  const BACKEND =
    (_script && _script.getAttribute("data-backend-url")) ||
    window.AI_AVATAR_BACKEND ||
    "http://localhost:8000";

  const POSITION =
    (_script && _script.getAttribute("data-position")) || "bottom-right";

  const DISPLAY_NAME =
    (_script && _script.getAttribute("data-name")) || null;

  const THREE_CDN =
    "https://esm.sh/three@0.169.0";
  const GLTF_CDN =
    "https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

  // Optional RPM avatar URL override — if set, loads GLB instead of procedural face
  const AVATAR_URL =
    (_script && _script.getAttribute("data-avatar-url")) || null;

  // ── State ───────────────────────────────────────────────────────────────────
  let _conversation = null;
  let _mode = "idle";
  let _isOpen = false;
  let _isMuted = false;
  let _sources = {};
  let _agentName = DISPLAY_NAME || "AI Assistant";

  // Three.js handles
  let _renderer = null;
  let _scene = null;
  let _camera = null;
  let _clock = null;
  let _rafId = null;
  let _threeReady = false;

  // Face animation handles
  let _jawGroup = null;       // rotates down for speech
  let _headGroup = null;      // subtle idle sway
  let _leftLid = null;        // eyelid mesh (scales Y for blink)
  let _rightLid = null;
  let _headMesh = null;       // RPM mesh with morph targets (optional)

  // Lip sync state
  let _lipAmp = 0;
  let _lipTarget = 0;
  let _lipPhase = 0;

  // Blink state
  let _blinkTimer = 0;
  let _nextBlink = 3;
  let _blinking = false;

  // Idle sway
  let _idleTime = 0;

  // ── Viseme names for RPM/Oculus avatars ────────────────────────────────────
  const VISEMES = [
    "viseme_sil", "viseme_PP", "viseme_FF", "viseme_TH", "viseme_DD",
    "viseme_kk", "viseme_CH", "viseme_SS", "viseme_nn", "viseme_RR",
    "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
  ];

  // ── Public API ──────────────────────────────────────────────────────────────
  window.AiAvatar = {
    registerSource(name, getFn, opts) {
      _sources[name] = { name, getFn, opts: opts || {} };
    },
    open:   () => _setOpen(true),
    close:  () => _setOpen(false),
    toggle: () => _setOpen(!_isOpen),
  };

  // ── Status labels ───────────────────────────────────────────────────────────
  const STATUS_LABELS = {
    idle:       "Click to start",
    connecting: "Connecting…",
    listening:  "Listening…",
    thinking:   "Thinking…",
    speaking:   "Speaking…",
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const STYLES = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .av-wrapper {
      position: fixed;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 14px;
    }
    .av-wrapper.bottom-right { bottom: 24px; right: 24px; }
    .av-wrapper.bottom-left  { bottom: 24px; left: 24px; align-items: flex-start; }
    .av-wrapper.top-right    { top: 24px; right: 24px; }
    .av-wrapper.top-left     { top: 24px; left: 24px; align-items: flex-start; }

    /* ── Panel ── */
    .av-panel {
      width: 340px;
      height: 530px;
      background: #09090D;
      border: 1px solid #1C1C2E;
      border-radius: 20px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow:
        0 32px 80px rgba(0,0,0,0.8),
        0 0 0 1px rgba(255,255,255,0.03);
      transform: scale(0.94) translateY(14px);
      opacity: 0;
      pointer-events: none;
      transition:
        transform 0.28s cubic-bezier(0.34,1.56,0.64,1),
        opacity 0.2s ease;
    }
    .av-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* gradient top bar */
    .av-top-bar {
      height: 3px;
      flex-shrink: 0;
      background: linear-gradient(90deg,
        #6366f1 0%, #3b82f6 35%, #0ea5e9 65%, #14b8a6 100%);
    }

    /* Header */
    .av-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px 9px;
      flex-shrink: 0;
    }
    .av-header-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.3s;
    }
    .av-header-dot.idle       { background: #2d2d50; }
    .av-header-dot.connecting { background: #f59e0b; animation: av-pulse 1s infinite; }
    .av-header-dot.listening  { background: #60a5fa; animation: av-pulse 0.8s infinite; }
    .av-header-dot.thinking   { background: #a78bfa; animation: av-pulse 0.6s infinite; }
    .av-header-dot.speaking   { background: #14b8a6; animation: av-pulse 0.5s infinite; }
    .av-header-name {
      flex: 1;
      font-size: 13px;
      font-weight: 600;
      color: #E2E2F0;
      letter-spacing: 0.01em;
    }
    .av-close-btn {
      width: 28px; height: 28px;
      background: none; border: none; cursor: pointer;
      color: #3A3A5C; font-size: 15px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .av-close-btn:hover { color: #E2E2F0; background: #1C1C2E; }

    /* ── 3D avatar canvas zone ── */
    .av-avatar-zone {
      position: relative;
      height: 228px;
      flex-shrink: 0;
      overflow: hidden;
      cursor: pointer;
      background: radial-gradient(ellipse at 50% 40%,
        #0d0d22 0%, #06060e 100%);
    }
    .av-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Loading overlay (orb shown while Three.js initialises) */
    .av-loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: opacity 0.6s ease;
    }
    .av-loading.hidden { opacity: 0; pointer-events: none; }
    .av-orb-fb {
      width: 72px; height: 72px;
      border-radius: 50%;
      background: radial-gradient(circle at 36% 30%,
        #818cf8 0%, #3b82f6 28%, #0ea5e9 58%, #14b8a6 100%);
      box-shadow:
        0 8px 28px rgba(59,130,246,0.4),
        0 0 50px rgba(20,184,166,0.14);
      animation: av-breathe 3.2s ease-in-out infinite;
    }
    .av-load-txt {
      font-size: 10.5px;
      color: #2a2a45;
      letter-spacing: 0.05em;
    }

    /* Avatar click hint */
    .av-avatar-hint {
      position: absolute;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: #282845;
      letter-spacing: 0.05em;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    .av-avatar-hint.hidden { opacity: 0; }

    /* ── Status bar ── */
    .av-status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 5px 14px 5px;
      flex-shrink: 0;
      border-bottom: 1px solid #0f0f1a;
    }
    .av-wave {
      display: flex;
      align-items: center;
      gap: 2.5px;
      height: 14px;
    }
    .av-wave-bar {
      width: 2.5px; border-radius: 2px;
      background: linear-gradient(to top, #3b82f6, #14b8a6);
      height: 3px; opacity: 0.14;
      transition: opacity 0.3s;
    }
    .av-wave.active .av-wave-bar { opacity: 1; }
    .av-wave.active .av-wave-bar:nth-child(1) { animation: av-bar 0.9s 0.00s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(2) { animation: av-bar 0.9s 0.12s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(3) { animation: av-bar 0.9s 0.06s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(4) { animation: av-bar 0.9s 0.18s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(5) { animation: av-bar 0.9s 0.03s ease-in-out infinite; }
    .av-status-label {
      font-size: 11px; font-weight: 500;
      color: #404060; letter-spacing: 0.04em;
    }
    .av-status-label.active {
      background: linear-gradient(90deg, #6366f1, #3b82f6, #0ea5e9, #14b8a6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; background-size: 200% auto;
      animation: av-gradient 2.4s linear infinite;
    }

    /* ── Transcript ── */
    .av-transcript {
      flex: 1; overflow-y: auto;
      padding: 8px 14px;
      display: flex; flex-direction: column; gap: 6px;
      scroll-behavior: smooth;
    }
    .av-transcript::-webkit-scrollbar { width: 4px; }
    .av-transcript::-webkit-scrollbar-track { background: transparent; }
    .av-transcript::-webkit-scrollbar-thumb { background: #1C1C2E; border-radius: 2px; }
    .av-msg {
      max-width: 85%; padding: 7px 11px; border-radius: 14px;
      font-size: 12.5px; line-height: 1.52; word-break: break-word;
      animation: av-msg-in 0.18s ease;
    }
    .av-msg.user {
      background: linear-gradient(135deg, #3b4fd8, #2563eb);
      color: #fff; align-self: flex-end; border-bottom-right-radius: 4px;
    }
    .av-msg.assistant {
      background: #0E0E1A; color: #C4C4DC; align-self: flex-start;
      border-bottom-left-radius: 4px; border: 1px solid #1C1C2E;
    }
    .av-msg.system {
      background: transparent; color: #38385A; font-size: 11px;
      align-self: center; font-style: italic;
    }
    .av-typing {
      display: flex; gap: 4px; align-items: center;
      padding: 7px 11px; align-self: flex-start;
    }
    .av-typing span {
      width: 5px; height: 5px; border-radius: 50%; background: #3b82f6;
      animation: av-bounce 1.2s infinite;
    }
    .av-typing span:nth-child(2) { animation-delay: 0.2s; }
    .av-typing span:nth-child(3) { animation-delay: 0.4s; }

    /* ── Controls ── */
    .av-controls {
      padding: 8px 12px 14px;
      display: flex; align-items: center; gap: 8px;
      flex-shrink: 0; border-top: 1px solid #1C1C2E;
    }
    .av-mute-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid #1C1C2E; background: #0E0E1A;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s, border-color 0.15s;
    }
    .av-mute-btn:hover { background: #1C1C2E; }
    .av-mute-btn.muted { background: #1A1A40; border-color: #4f46e5; }
    .av-input {
      flex: 1; background: #0E0E1A; border: 1px solid #1C1C2E;
      border-radius: 24px; padding: 8px 14px; font-size: 13px;
      color: #E2E2F0; outline: none; transition: border-color 0.15s;
    }
    .av-input::placeholder { color: #28284A; }
    .av-input:focus { border-color: #3b82f6; }
    .av-mic-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      background: linear-gradient(135deg, #4f46e5, #0ea5e9);
      box-shadow: 0 4px 16px rgba(79,70,229,0.4);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .av-mic-btn:hover  { transform: scale(1.06); box-shadow: 0 6px 22px rgba(79,70,229,0.5); }
    .av-mic-btn:active { transform: scale(0.93); }
    .av-mic-btn.active {
      background: linear-gradient(135deg, #dc2626, #ef4444);
      box-shadow: 0 4px 16px rgba(220,38,38,0.45);
      animation: av-pulse 1s infinite;
    }

    /* ── Floating bubble ── */
    .av-bubble {
      width: 64px; height: 64px; border-radius: 50%;
      cursor: pointer; position: relative; flex-shrink: 0;
      transition: transform 0.2s;
    }
    .av-bubble:hover  { transform: scale(1.07); }
    .av-bubble:active { transform: scale(0.94); }
    .av-bubble-orb {
      position: absolute; inset: 0; border-radius: 50%;
      background: radial-gradient(circle at 36% 30%,
        #818cf8 0%, #3b82f6 28%, #0ea5e9 58%, #14b8a6 100%);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,0.09),
        0 6px 24px rgba(59,130,246,0.45),
        0 0 40px rgba(20,184,166,0.15);
      animation: av-breathe 3.2s ease-in-out infinite;
      overflow: hidden;
    }
    .av-bubble-orb::after {
      content: ''; position: absolute;
      top: 14%; left: 18%; width: 28%; height: 20%;
      background: rgba(255,255,255,0.22); border-radius: 50%; filter: blur(3px);
    }
    .av-bubble-ring {
      position: absolute; inset: -5px; border-radius: 50%;
      border: 1.5px solid rgba(99,102,241,0.25);
      animation: av-ring 3s ease-out infinite; opacity: 0;
    }
    .av-bubble.listening .av-bubble-orb  { box-shadow: 0 6px 24px rgba(96,165,250,0.55), 0 0 40px rgba(96,165,250,0.25); }
    .av-bubble.listening .av-bubble-ring { border-color: rgba(96,165,250,0.5); animation-duration: 1.4s; }
    .av-bubble.speaking  .av-bubble-orb  { box-shadow: 0 6px 24px rgba(20,184,166,0.55), 0 0 40px rgba(20,184,166,0.28); }
    .av-bubble.speaking  .av-bubble-ring { border-color: rgba(20,184,166,0.5); animation-duration: 0.9s; }
    .av-bubble.thinking  .av-bubble-ring { border-color: rgba(167,139,250,0.4); animation-duration: 1.8s; }

    /* ── Keyframes ── */
    @keyframes av-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
    @keyframes av-ring    { 0%{transform:scale(1);opacity:0.5} 100%{transform:scale(1.75);opacity:0} }
    @keyframes av-bar     { 0%,100%{height:3px} 50%{height:13px} }
    @keyframes av-gradient{ 0%{background-position:0% center} 100%{background-position:200% center} }
    @keyframes av-pulse   { 0%,100%{opacity:1} 50%{opacity:0.6} }
    @keyframes av-bounce  { 0%,80%,100%{transform:scale(0.6);opacity:0.35} 40%{transform:scale(1);opacity:1} }
    @keyframes av-msg-in  { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
  `;

  // ── DOM handles ─────────────────────────────────────────────────────────────
  let _shadow, _wrapper, _bubble, _panel, _canvas, _loadingOverlay,
      _avatarHint, _wave, _statusLabel, _transcript,
      _headerDot, _micBtn, _muteBtn, _input;

  // ── Build UI ────────────────────────────────────────────────────────────────
  function _buildUI() {
    const host = document.createElement("div");
    host.id = "ai-avatar-plugin-host";
    document.body.appendChild(host);

    _shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    _shadow.appendChild(style);

    _wrapper = document.createElement("div");
    _wrapper.className = `av-wrapper ${POSITION}`;
    _shadow.appendChild(_wrapper);

    // Panel
    _panel = document.createElement("div");
    _panel.className = "av-panel";
    _panel.innerHTML = `
      <div class="av-top-bar"></div>
      <div class="av-header">
        <div class="av-header-dot idle" id="av-hd"></div>
        <span class="av-header-name" id="av-agent-name">${_escHtml(_agentName)}</span>
        <button class="av-close-btn" id="av-close">✕</button>
      </div>
      <div class="av-avatar-zone" id="av-zone">
        <canvas class="av-canvas" id="av-canvas"></canvas>
        <div class="av-loading" id="av-loading">
          <div class="av-orb-fb"></div>
          <span class="av-load-txt">Initialising…</span>
        </div>
        <span class="av-avatar-hint" id="av-hint">Click to start voice</span>
      </div>
      <div class="av-status-bar">
        <div class="av-wave" id="av-wave">
          <div class="av-wave-bar"></div>
          <div class="av-wave-bar"></div>
          <div class="av-wave-bar"></div>
          <div class="av-wave-bar"></div>
          <div class="av-wave-bar"></div>
        </div>
        <span class="av-status-label" id="av-status">${STATUS_LABELS.idle}</span>
      </div>
      <div class="av-transcript" id="av-transcript"></div>
      <div class="av-controls">
        <button class="av-mute-btn" id="av-mute" title="Toggle mute">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#404060" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          </svg>
        </button>
        <input class="av-input" id="av-input" type="text"
          placeholder="Ask anything…" autocomplete="off"/>
        <button class="av-mic-btn" id="av-mic" title="Start voice">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8"  y1="23" x2="16" y2="23"/>
          </svg>
        </button>
      </div>
    `;
    _wrapper.appendChild(_panel);

    // Floating bubble
    _bubble = document.createElement("div");
    _bubble.className = "av-bubble";
    _bubble.title = _agentName;
    _bubble.innerHTML = `<div class="av-bubble-ring"></div><div class="av-bubble-orb"></div>`;
    _wrapper.appendChild(_bubble);

    // Cache refs
    _headerDot     = _shadow.getElementById("av-hd");
    _canvas        = _shadow.getElementById("av-canvas");
    _loadingOverlay= _shadow.getElementById("av-loading");
    _avatarHint    = _shadow.getElementById("av-hint");
    _wave          = _shadow.getElementById("av-wave");
    _statusLabel   = _shadow.getElementById("av-status");
    _transcript    = _shadow.getElementById("av-transcript");
    _micBtn        = _shadow.getElementById("av-mic");
    _muteBtn       = _shadow.getElementById("av-mute");
    _input         = _shadow.getElementById("av-input");

    // Events
    _bubble.addEventListener("click", () => _setOpen(!_isOpen));
    _shadow.getElementById("av-close").addEventListener("click", () => _setOpen(false));
    _shadow.getElementById("av-zone").addEventListener("click", _handleMicClick);
    _micBtn.addEventListener("click", (e) => { e.stopPropagation(); _handleMicClick(); });
    _muteBtn.addEventListener("click", _toggleMute);
    _input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _handleSend(); }
    });
    _input.addEventListener("click", (e) => e.stopPropagation());
    _muteBtn.addEventListener("click", (e) => e.stopPropagation());
  }

  // ── Three.js init ───────────────────────────────────────────────────────────
  async function _initThree() {
    if (_threeReady || !_canvas) return;

    try {
      const THREE = await import(THREE_CDN);

      const zone  = _shadow.getElementById("av-zone");
      const W = zone.clientWidth  || 340;
      const H = zone.clientHeight || 228;

      _renderer = new THREE.WebGLRenderer({ canvas: _canvas, alpha: true, antialias: true });
      _renderer.setSize(W, H);
      _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      _renderer.outputColorSpace = THREE.SRGBColorSpace;
      _renderer.shadowMap.enabled = true;

      _scene  = new THREE.Scene();
      _camera = new THREE.PerspectiveCamera(26, W / H, 0.01, 20);
      _clock  = new THREE.Clock();

      _setupLighting(THREE);

      // Try RPM avatar if URL is provided, else build procedural face
      if (AVATAR_URL) {
        await _loadRpmAvatar(THREE);
      } else {
        _buildProceduralFace(THREE);
      }

      _threeReady = true;
      _loadingOverlay.classList.add("hidden");
      _startRenderLoop(THREE);

    } catch (err) {
      console.warn("[AiAvatar] Three.js init failed:", err);
      // Orb fallback stays visible
      const txt = _loadingOverlay.querySelector(".av-load-txt");
      if (txt) txt.textContent = "";
    }
  }

  function _setupLighting(THREE) {
    _scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const key = new THREE.DirectionalLight(0xfff4e8, 1.3);
    key.position.set(0.6, 1.5, 2);
    key.castShadow = true;
    _scene.add(key);

    const fill = new THREE.DirectionalLight(0xd0e0ff, 0.5);
    fill.position.set(-1.5, 0.5, 1);
    _scene.add(fill);

    const rim = new THREE.DirectionalLight(0x8899ff, 0.25);
    rim.position.set(0, 0.5, -2);
    _scene.add(rim);

    const under = new THREE.DirectionalLight(0xff8844, 0.08);
    under.position.set(0, -2, 1);
    _scene.add(under);
  }

  // ── Procedural face ─────────────────────────────────────────────────────────
  function _buildProceduralFace(THREE) {
    const SKIN   = 0xf0b890;
    const SKIN_D = 0xe0a070;
    const EYE_W  = 0xfafafa;
    const IRIS   = 0x224488;
    const PUPIL  = 0x080808;
    const LIP    = 0xcc6655;
    const BROW   = 0x2a1a0a;
    const HAIR   = 0x1a0f05;
    const TEETH  = 0xf8f4e8;

    function mat(color, roughness = 0.82, metalness = 0.01) {
      return new THREE.MeshStandardMaterial({ color, roughness, metalness });
    }

    const root = new THREE.Group();

    // ── Hair ──
    const hairGeo = new THREE.SphereGeometry(0.52, 36, 36,
      0, Math.PI * 2, 0, Math.PI * 0.54);
    const hair = new THREE.Mesh(hairGeo, mat(HAIR, 0.9));
    hair.position.y = 0.02;
    root.add(hair);

    // Side hair bulk
    [-1, 1].forEach(side => {
      const sideHair = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 14),
        mat(HAIR, 0.9)
      );
      sideHair.scale.set(0.55, 1.1, 0.6);
      sideHair.position.set(side * 0.44, -0.12, -0.15);
      root.add(sideHair);
    });

    // ── Head ──
    const headGeo = new THREE.SphereGeometry(0.5, 48, 48);
    const headMesh = new THREE.Mesh(headGeo, mat(SKIN));
    headMesh.scale.set(1, 1.18, 0.94);
    root.add(headMesh);
    _headGroup = root;

    // ── Neck ──
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.155, 0.175, 0.22, 24),
      mat(SKIN)
    );
    neck.position.y = -0.54;
    root.add(neck);

    // ── Eyes ──
    function makeEye(xSide) {
      const g = new THREE.Group();
      g.position.set(xSide * 0.165, 0.1, 0.43);

      // sclera
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.072, 22, 22), mat(EYE_W, 0.15, 0.0)));

      // iris
      const irisM = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 18), mat(IRIS, 0.22, 0.08));
      irisM.position.z = 0.038;
      g.add(irisM);

      // pupil
      const pupM = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 14), mat(PUPIL, 0.05, 0.05));
      pupM.position.z = 0.054;
      g.add(pupM);

      // highlight
      const hiM = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.4 })
      );
      hiM.position.set(0.01, 0.01, 0.065);
      g.add(hiM);

      // eyelid (closes down for blink — scale Y from 0→1)
      const lidGeo = new THREE.SphereGeometry(0.078, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const lid = new THREE.Mesh(lidGeo, mat(SKIN, 0.85));
      lid.rotation.x = Math.PI; // flip so it covers top half
      lid.position.set(0, 0.003, 0.008);
      lid.scale.y = 0; // 0 = open, 1 = closed
      g.add(lid);

      root.add(g);
      return lid;
    }

    _leftLid  = makeEye(-1);
    _rightLid = makeEye(1);

    // ── Eyebrows ──
    [-1, 1].forEach(side => {
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.025, 0.038),
        mat(BROW, 0.88)
      );
      brow.position.set(side * 0.165, 0.245, 0.435);
      brow.rotation.z = side * -0.12;
      root.add(brow);
    });

    // ── Nose ──
    const noseBridge = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 16, 12),
      mat(SKIN_D, 0.85)
    );
    noseBridge.scale.set(0.7, 1.8, 0.9);
    noseBridge.position.set(0, 0.01, 0.48);
    root.add(noseBridge);

    const noseTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 18, 14),
      mat(SKIN_D, 0.85)
    );
    noseTip.scale.set(1, 0.72, 0.8);
    noseTip.position.set(0, -0.055, 0.485);
    root.add(noseTip);

    // nostrils
    [-1, 1].forEach(side => {
      const n = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 12, 10),
        mat(0xc07050, 0.9)
      );
      n.scale.set(0.85, 0.7, 0.75);
      n.position.set(side * 0.044, -0.065, 0.475);
      root.add(n);
    });

    // ── Upper lip (static) ──
    const upLip = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mat(LIP, 0.72)
    );
    upLip.scale.set(1.2, 0.65, 0.55);
    upLip.position.set(0, -0.175, 0.455);
    upLip.rotation.x = Math.PI;
    root.add(upLip);

    // ── Jaw group (animated for lip sync) ──
    _jawGroup = new THREE.Group();
    _jawGroup.position.set(0, -0.195, 0.01);

    // Lower lip
    const loLip = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mat(LIP, 0.72)
    );
    loLip.scale.set(1.15, 0.62, 0.52);
    loLip.position.set(0, 0.005, 0.45);
    _jawGroup.add(loLip);

    // Teeth (barely visible when mouth closed, revealed when open)
    const teethTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.028, 0.04),
      mat(TEETH, 0.35, 0.0)
    );
    teethTop.position.set(0, 0.028, 0.44);
    _jawGroup.add(teethTop);

    const teethBot = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.025, 0.04),
      mat(TEETH, 0.35, 0.0)
    );
    teethBot.position.set(0, -0.002, 0.44);
    _jawGroup.add(teethBot);

    // Chin
    const chin = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 28, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      mat(SKIN, 0.84)
    );
    chin.scale.set(1, 0.55, 0.86);
    chin.position.set(0, 0.01, 0.12);
    _jawGroup.add(chin);

    root.add(_jawGroup);

    // ── Ears ──
    [-1, 1].forEach(side => {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 18, 14),
        mat(SKIN_D, 0.85)
      );
      ear.scale.set(0.42, 0.75, 0.45);
      ear.position.set(side * 0.495, 0.02, -0.01);
      root.add(ear);
    });

    // ── Cheekbone highlight ──
    [-1, 1].forEach(side => {
      const cheek = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xffccaa, roughness: 0.95, transparent: true, opacity: 0.18 })
      );
      cheek.scale.set(1.1, 0.65, 0.5);
      cheek.position.set(side * 0.28, 0.02, 0.41);
      root.add(cheek);
    });

    // Position scene: camera aimed at face center
    root.position.set(0, 0, 0);
    _scene.add(root);

    // Camera for close portrait shot
    _camera.position.set(0, 0.04, 1.52);
    _camera.lookAt(0, 0, 0);
  }

  // ── RPM avatar (optional, via data-avatar-url) ──────────────────────────────
  async function _loadRpmAvatar(THREE) {
    try {
      const { GLTFLoader } = await import(GLTF_CDN);
      const loader = new GLTFLoader();

      return new Promise((resolve, reject) => {
        loader.load(
          AVATAR_URL,
          (gltf) => {
            const avatar = gltf.scene;
            _scene.add(avatar);

            // find head mesh with viseme morph targets
            avatar.traverse((node) => {
              if (node.isMesh && node.morphTargetDictionary) {
                const keys = Object.keys(node.morphTargetDictionary);
                if (keys.some(k => k.startsWith("viseme_"))) {
                  _headMesh = node;
                }
              }
            });

            // Camera for RPM full-body avatars (head shot)
            _camera.position.set(0, 1.65, 0.7);
            _camera.lookAt(0, 1.52, 0);

            resolve();
          },
          undefined,
          (err) => {
            console.warn("[AiAvatar] RPM avatar load failed, using procedural face:", err);
            _buildProceduralFace(THREE);
            resolve();
          }
        );
      });
    } catch (err) {
      console.warn("[AiAvatar] GLTFLoader import failed:", err);
      _buildProceduralFace(THREE);
    }
  }

  // ── Render loop ─────────────────────────────────────────────────────────────
  function _startRenderLoop(THREE) {
    const tick = () => {
      _rafId = requestAnimationFrame(tick);
      const dt = Math.min(_clock.getDelta(), 0.05); // clamp to 50ms
      _idleTime += dt;

      _updateLipSync(dt);
      _updateIdle(dt);

      _renderer.render(_scene, _camera);
    };
    tick();
  }

  // ── Lip sync ─────────────────────────────────────────────────────────────────
  function _updateLipSync(dt) {
    const speaking = _mode === "speaking";

    if (speaking) {
      // Syllable oscillation ~4.5 per second for natural speech rhythm
      _lipPhase += dt * 28.5;
      const syllable = Math.max(0, Math.sin(_lipPhase));
      const noise = (Math.random() - 0.5) * 0.18;
      _lipTarget = 0.22 + syllable * 0.62 + noise;
      _lipTarget = Math.min(1, Math.max(0, _lipTarget));
      _lipAmp += (_lipTarget - _lipAmp) * Math.min(1, dt * 20);
    } else {
      // Fade out fast on stop
      _lipAmp = Math.max(0, _lipAmp - dt * 12);
    }

    // Apply to procedural jaw
    if (_jawGroup) {
      // jaw rotates on X axis: 0 = closed, positive = opens downward
      _jawGroup.rotation.x = _lipAmp * 0.28;
    }

    // Apply to RPM morph targets (if loaded)
    if (_headMesh) {
      const dict = _headMesh.morphTargetDictionary;
      const infl = _headMesh.morphTargetInfluences;

      VISEMES.forEach(v => {
        const i = dict[v];
        if (i !== undefined) infl[i] = 0;
      });

      if (_lipAmp > 0.01) {
        const aaI = dict["viseme_aa"];
        if (aaI !== undefined) infl[aaI] = _lipAmp * 0.88;

        // Cycle secondary vowel
        const vowels = ["viseme_E", "viseme_I", "viseme_O", "viseme_U"];
        const vSel = vowels[Math.floor((_lipPhase * 0.25) % vowels.length)];
        const vI = dict[vSel];
        if (vI !== undefined) infl[vI] = _lipAmp * 0.3;
      }
    }
  }

  // ── Idle animation ───────────────────────────────────────────────────────────
  function _updateIdle(dt) {
    // Subtle head sway
    if (_headGroup) {
      _headGroup.rotation.y = Math.sin(_idleTime * 0.22) * 0.04;
      _headGroup.rotation.z = Math.sin(_idleTime * 0.17) * 0.022;
      _headGroup.position.y = Math.sin(_idleTime * 0.35) * 0.008; // breathing
    }

    // Head bone sway for RPM avatar
    if (_headMesh) {
      const head = _headMesh.parent;
      if (head) {
        head.rotation.y = Math.sin(_idleTime * 0.22) * 0.04;
        head.rotation.z = Math.sin(_idleTime * 0.17) * 0.018;
      }
    }

    // Blink timing
    _blinkTimer += dt;
    if (!_blinking && _blinkTimer > _nextBlink) {
      _blinkTimer = 0;
      _nextBlink = 2.8 + Math.random() * 4.0;
      _triggerBlink();
    }
  }

  function _triggerBlink() {
    _blinking = true;
    const DURATION = 150; // ms total
    const start = performance.now();

    const step = () => {
      const p = (performance.now() - start) / DURATION;
      const v = p < 0.45 ? p / 0.45 : p < 1 ? 1 - (p - 0.45) / 0.55 : 0;

      // Procedural face eyelids
      if (_leftLid)  _leftLid.scale.y  = v;
      if (_rightLid) _rightLid.scale.y = v;

      // RPM morph blink
      if (_headMesh) {
        const dict = _headMesh.morphTargetDictionary;
        const infl = _headMesh.morphTargetInfluences;
        const lI = dict["eyeBlinkLeft"]  ?? dict["blink_left"];
        const rI = dict["eyeBlinkRight"] ?? dict["blink_right"];
        if (lI !== undefined) infl[lI] = v;
        if (rI !== undefined) infl[rI] = v;
      }

      if (p < 1) requestAnimationFrame(step);
      else _blinking = false;
    };
    requestAnimationFrame(step);
  }

  // ── UI state ─────────────────────────────────────────────────────────────────
  function _setOpen(val) {
    _isOpen = val;
    if (val) {
      _panel.classList.add("open");
      _fetchConfig();
      if (!_threeReady) setTimeout(_initThree, 120);
    } else {
      _panel.classList.remove("open");
    }
  }

  function _setMode(mode) {
    _mode = mode;

    if (_headerDot) _headerDot.className = `av-header-dot ${mode}`;

    const bubbleState = ["listening", "speaking", "thinking"].includes(mode) ? mode : "";
    if (_bubble) _bubble.className = `av-bubble ${bubbleState}`;

    const waveActive = mode === "listening" || mode === "speaking";
    if (_wave) _wave.className = `av-wave${waveActive ? " active" : ""}`;

    if (_statusLabel) {
      _statusLabel.textContent = STATUS_LABELS[mode] || mode;
      _statusLabel.className = `av-status-label${mode !== "idle" ? " active" : ""}`;
    }

    // Hide hint once a conversation starts
    if (_avatarHint && mode !== "idle") _avatarHint.classList.add("hidden");

    if (_micBtn) _micBtn.classList.toggle("active", _conversation !== null);
  }

  function _toggleMute() {
    _isMuted = !_isMuted;
    _muteBtn.classList.toggle("muted", _isMuted);
    if (_conversation) _conversation.setVolume({ volume: _isMuted ? 0 : 1 });
  }

  function _addMessage(role, text) {
    const el = document.createElement("div");
    el.className = `av-msg ${role}`;
    el.textContent = text;
    _transcript.appendChild(el);
    _transcript.scrollTop = _transcript.scrollHeight;
  }

  function _showTyping() {
    const el = document.createElement("div");
    el.className = "av-typing";
    el.id = "av-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    _transcript.appendChild(el);
    _transcript.scrollTop = _transcript.scrollHeight;
  }

  function _hideTyping() {
    const el = _shadow.getElementById("av-typing");
    if (el) el.remove();
  }

  // ── Page context ─────────────────────────────────────────────────────────────
  function _getPageContext() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const el = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          const tag = el.tagName.toLowerCase();
          if (["script", "style", "noscript", "meta", "head"].includes(tag))
            return NodeFilter.FILTER_REJECT;
          const s = window.getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden")
            return NodeFilter.FILTER_SKIP;
          return node.textContent.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      }
    );
    const texts = [];
    let node;
    while ((node = walker.nextNode())) texts.push(node.textContent.trim());
    return texts.join(" ").replace(/\s+/g, " ").trim();
  }

  async function _collectExtra() {
    const extra = {};
    for (const [name, src] of Object.entries(_sources)) {
      try { extra[name] = await Promise.resolve(src.getFn()); } catch (_) {}
    }
    return Object.keys(extra).length ? extra : null;
  }

  // ── Token fetch ──────────────────────────────────────────────────────────────
  async function _getToken() {
    const content = _getPageContext();
    const extra = await _collectExtra();
    const res = await fetch(`${BACKEND}/api/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url:     window.location.href,
        title:   document.title,
        content: content.slice(0, 8000),
        extra,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Token request failed (${res.status})`);
    }
    return res.json();
  }

  // ── Config fetch ─────────────────────────────────────────────────────────────
  async function _fetchConfig() {
    try {
      const res = await fetch(`${BACKEND}/api/config`);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.agent_name && !DISPLAY_NAME) {
          _agentName = cfg.agent_name;
          const nameEl = _shadow.getElementById("av-agent-name");
          if (nameEl) nameEl.textContent = _agentName;
          if (_bubble) _bubble.title = _agentName;
        }
        if (!cfg.ready) {
          _addMessage("system", "Backend not ready — check server setup.");
        }
      }
    } catch (_) {}
  }

  // ── ElevenLabs conversation ──────────────────────────────────────────────────
  async function _startConversation() {
    if (_conversation) return;
    _setMode("connecting");

    try {
      const { Conversation } = await import(
        "https://cdn.jsdelivr.net/npm/@elevenlabs/client@latest/+esm"
      );

      const { token, dynamic_variables } = await _getToken();
      _showTyping();

      _conversation = await Conversation.startSession({
        conversationToken: token,
        dynamicVariables: dynamic_variables,

        onConnect: () => {
          _hideTyping();
          _setMode("listening");
        },

        onDisconnect: () => {
          _setMode("idle");
          _conversation = null;
          _addMessage("system", "Conversation ended.");
          if (_micBtn) _micBtn.classList.remove("active");
          if (_avatarHint) _avatarHint.classList.remove("hidden");
        },

        onMessage: ({ message, source }) => {
          _hideTyping();
          _addMessage(source === "ai" ? "assistant" : "user", message);
        },

        onError: (msg) => {
          _hideTyping();
          _setMode("idle");
          _addMessage("system", `Error: ${msg}`);
          _conversation = null;
          if (_micBtn) _micBtn.classList.remove("active");
        },

        onModeChange: ({ mode }) => {
          if (mode === "listening")       _setMode("listening");
          else if (mode === "speaking")   _setMode("speaking");
          else if (mode === "processing") _setMode("thinking");
        },
      });

      if (_isMuted) _conversation.setVolume({ volume: 0 });

    } catch (err) {
      _hideTyping();
      _setMode("idle");
      _addMessage("system", `Could not start: ${err.message}`);
    }
  }

  async function _endConversation() {
    if (_conversation) {
      await _conversation.endSession();
      _conversation = null;
    }
    _setMode("idle");
  }

  async function _handleMicClick() {
    if (_conversation) {
      await _endConversation();
    } else {
      if (!_isOpen) _setOpen(true);
      await _startConversation();
    }
  }

  async function _handleSend() {
    const text = _input.value.trim();
    if (!text) return;
    _input.value = "";

    if (!_conversation) {
      if (!_isOpen) _setOpen(true);
      _addMessage("user", text);
      _addMessage("system", "Starting voice session…");
      await _startConversation();
      return;
    }

    try {
      await _conversation.sendFeedback({ text });
    } catch (_) {
      _addMessage("user", text);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _escHtml(s) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _buildUI);
  } else {
    _buildUI();
  }
})();
