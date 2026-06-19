/**
 * AI Avatar Plugin — Right-side panel with human-like avatar and lip sync.
 *
 * Embed on any page with a single script tag:
 *   <script src="http://your-server/widget.js"
 *     data-backend-url="http://localhost:8000"
 *     data-name="AI Assistant"
 *     data-avatar-image="https://your-cdn/portrait.jpg"   <!-- optional photo -->
 *     data-avatar-url="https://models.readyplayer.me/..."  <!-- optional RPM GLB -->
 *   ></script>
 *
 * Internal architecture (all inside one IIFE, no build step required):
 *   Config          — reads data-* attributes, constants
 *   State           — single observable state atom + event bus
 *   Styles          — all CSS for the Shadow DOM
 *   DOMBuilder      — creates the Shadow DOM structure
 *   PhotoAvatar     — portrait drawn on canvas with mouth-warp lip sync, blink, sway
 *   ThreeAvatar     — Three.js procedural face with jaw lip-sync
 *   LipSyncEngine   — drives whichever avatar is active
 *   PageScraper     — collects page context + registered sources
 *   TokenService    — fetches ElevenLabs WebRTC token from backend
 *   Conversation    — manages ElevenLabs Agent session lifecycle
 *   App             — orchestrates all modules, exposes public API
 */
(function () {
  "use strict";

  // Idempotency guard — React Strict Mode (and any other double-load scenario)
  // causes this IIFE to run twice. Bail out if the widget host already exists.
  if (document.getElementById("ai-avatar-plugin-host")) return;

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: Config
  // ════════════════════════════════════════════════════════════════════════════
  const _scriptEl =
    document.currentScript ||
    document.querySelector("script[src*='widget.js']");

  const Config = Object.freeze({
    BACKEND:
      (_scriptEl && _scriptEl.getAttribute("data-backend-url")) ||
      window.AI_AVATAR_BACKEND ||
      "http://localhost:8000",

    DISPLAY_NAME: (_scriptEl && _scriptEl.getAttribute("data-name")) || null,

    AVATAR_IMAGE:
      (_scriptEl && _scriptEl.getAttribute("data-avatar-image")) || null,

    AVATAR_URL:
      (_scriptEl && _scriptEl.getAttribute("data-avatar-url")) || null,

    THREE_CDN:        "https://esm.sh/three@0.169.0",
    GLTF_CDN:         "https://esm.sh/three@0.169.0/examples/jsm/loaders/GLTFLoader.js",
    VRM_CDN:          "https://esm.sh/@pixiv/three-vrm@2?deps=three@0.169.0",
    ELEVENLABS_CDN:   "https://cdn.jsdelivr.net/npm/@elevenlabs/client@latest/+esm",
    MEDIAPIPE_CDN:    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm",
    MEDIAPIPE_WASM:   "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    MP_MODEL_URL:     "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

    STATUS_LABELS: Object.freeze({
      idle:         "Click to start",
      connecting:   "Connecting…",
      listening:    "Listening…",
      thinking:     "Thinking…",
      speaking:     "Speaking…",
      "text-idle":  "Type a message",
      "text-busy":  "Thinking…",
    }),

    // Text-chat mode config — configurable per-dashboard via data-* attributes.
    // data-chat-mode="false"    → disable text mode entirely (voice only)
    // data-default-mode="text"  → open in text mode by default
    CHAT_ENABLED: (_scriptEl && _scriptEl.getAttribute("data-chat-mode")) !== "false",
    DEFAULT_INPUT_MODE: (_scriptEl && _scriptEl.getAttribute("data-default-mode")) === "text"
      ? "text" : "voice",
    // Optional per-embed model override (data-chat-model="cohere/north-mini-code:free").
    // If unset, the widget uses whatever the backend returns as chat_default_model.
    DEFAULT_CHAT_MODEL: (_scriptEl && _scriptEl.getAttribute("data-chat-model")) || null,

    PANEL_WIDTH: "clamp(280px, 25vw, 400px)",
    TAB_WIDTH:   "44px",
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: State  (single observable atom)
  // ════════════════════════════════════════════════════════════════════════════
  const State = (() => {
    const _data = {
      isOpen:     false,
      isMuted:    false,
      mode:       "idle",         // idle | connecting | listening | thinking | speaking
      inputMode:  Config.DEFAULT_INPUT_MODE,  // "voice" | "text"
      agentName:  Config.DISPLAY_NAME || "AI Assistant",
      lipAmp:     0,
      lipTarget:  0,
      lipPhase:   0,
      blinkTimer: 0,
      nextBlink:  3,
      blinking:   false,
      idleTime:   0,
    };
    const _listeners = {};

    return {
      get(key)        { return _data[key]; },
      set(key, value) {
        if (_data[key] === value) return;
        _data[key] = value;
        (_listeners[key] || []).forEach(fn => fn(value));
      },
      on(key, fn) {
        (_listeners[key] = _listeners[key] || []).push(fn);
      },
    };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: Styles
  // ════════════════════════════════════════════════════════════════════════════
  const STYLES = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Outer host — fixed right-side container ── */
    .av-host {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      z-index: 2147483647;
      display: flex;
      flex-direction: row;
      align-items: stretch;
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
      will-change: transform;
    }
    /* When collapsed: slide right, leaving only the tab visible */
    .av-host.collapsed {
      transform: translateX(calc(100% - ${Config.TAB_WIDTH}));
    }

    /* ── Collapse tab — always on left edge of host ── */
    .av-tab {
      width: ${Config.TAB_WIDTH};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      background: #09090D;
      border: 1px solid #1C1C2E;
      border-right: none;
      border-radius: 12px 0 0 12px;
      flex-shrink: 0;
      transition: background 0.15s;
      padding: 12px 0;
      user-select: none;
    }
    .av-tab:hover { background: #0F0F1A; }

    .av-tab-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #2d2d50;
      transition: background 0.3s;
      flex-shrink: 0;
    }
    .av-tab-dot.connecting { background: #f59e0b; animation: av-pulse 1s infinite; }
    .av-tab-dot.listening  { background: #60a5fa; animation: av-pulse 0.8s infinite; }
    .av-tab-dot.thinking   { background: #a78bfa; animation: av-pulse 0.6s infinite; }
    .av-tab-dot.speaking   { background: #14b8a6; animation: av-pulse 0.5s infinite; }

    .av-tab-arrow {
      color: #3A3A5C;
      font-size: 13px;
      line-height: 1;
      transition: color 0.15s, transform 0.35s;
    }
    .av-host.collapsed .av-tab-arrow { transform: scaleX(-1); }
    .av-tab:hover .av-tab-arrow { color: #6366f1; }

    .av-tab-label {
      writing-mode: vertical-rl;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: #282845;
      text-transform: uppercase;
    }

    /* ── Main panel ── */
    .av-panel {
      width: ${Config.PANEL_WIDTH};
      height: 100vh;
      background: #09090D;
      border-left: 1px solid #1C1C2E;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: -8px 0 40px rgba(0,0,0,0.6);
      flex-shrink: 0;
    }

    /* gradient top bar */
    .av-top-bar {
      height: 3px;
      flex-shrink: 0;
      background: linear-gradient(90deg, #6366f1 0%, #3b82f6 35%, #0ea5e9 65%, #14b8a6 100%);
    }

    /* ── Panel header ── */
    .av-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px 8px;
      flex-shrink: 0;
      border-bottom: 1px solid #0f0f1a;
    }
    .av-header-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #2d2d50;
      transition: background 0.3s;
    }
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

    /* ── Avatar zone ── */
    .av-avatar-zone {
      position: relative;
      flex: 0 0 56%;
      overflow: hidden;
      cursor: pointer;
      background: radial-gradient(ellipse at 50% 30%, #0d0d22 0%, #06060e 100%);
    }

    /* Photo background (photo avatar mode) */
    .av-photo-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center top;
      background-repeat: no-repeat;
      transition: filter 0.4s ease;
    }
    .av-photo-bg.speaking { filter: brightness(1.06); }

    /* Canvas — Three.js face OR photo effects overlay */
    .av-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    /* Bottom gradient so transcript doesn't clash with the avatar image */
    .av-avatar-gradient {
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 56px;
      background: linear-gradient(transparent, #09090D);
      pointer-events: none;
    }

    /* Loading overlay */
    .av-loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: radial-gradient(ellipse at 50% 30%, #0d0d22 0%, #06060e 100%);
      transition: opacity 0.5s ease;
      z-index: 2;
    }
    .av-loading.hidden { opacity: 0; pointer-events: none; }
    .av-orb-fb {
      width: 64px; height: 64px;
      border-radius: 50%;
      background: radial-gradient(circle at 36% 30%, #818cf8 0%, #3b82f6 28%, #0ea5e9 58%, #14b8a6 100%);
      box-shadow: 0 8px 28px rgba(59,130,246,0.4), 0 0 50px rgba(20,184,166,0.14);
      animation: av-breathe 3.2s ease-in-out infinite;
    }
    .av-load-txt {
      font-size: 10px;
      color: #2a2a45;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    /* Speaking rings overlay (photo mode) */
    .av-speaking-rings {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: 0;
    }

    /* ── Status bar ── */
    .av-status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px;
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
      height: 3px; opacity: 0.15;
      transition: opacity 0.3s;
    }
    .av-wave.active .av-wave-bar { opacity: 1; }
    .av-wave.active .av-wave-bar:nth-child(1) { animation: av-bar 0.9s 0.00s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(2) { animation: av-bar 0.9s 0.12s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(3) { animation: av-bar 0.9s 0.06s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(4) { animation: av-bar 0.9s 0.18s ease-in-out infinite; }
    .av-wave.active .av-wave-bar:nth-child(5) { animation: av-bar 0.9s 0.03s ease-in-out infinite; }
    .av-status-label {
      flex: 1;
      font-size: 11px; font-weight: 500;
      color: #404060; letter-spacing: 0.04em;
    }
    .av-status-label.active {
      background: linear-gradient(90deg, #6366f1, #3b82f6, #0ea5e9, #14b8a6);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; background-size: 200% auto;
      animation: av-gradient 2.4s linear infinite;
    }
    .av-hint-text {
      font-size: 10px;
      color: #282845;
      letter-spacing: 0.03em;
    }

    /* ── Transcript ── */
    .av-transcript {
      flex: 1; overflow-y: auto;
      padding: 8px 12px;
      display: flex; flex-direction: column; gap: 6px;
      scroll-behavior: smooth;
    }
    .av-transcript::-webkit-scrollbar { width: 4px; }
    .av-transcript::-webkit-scrollbar-track { background: transparent; }
    .av-transcript::-webkit-scrollbar-thumb { background: #1C1C2E; border-radius: 2px; }
    .av-msg {
      max-width: 88%; padding: 7px 11px; border-radius: 14px;
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
      padding: 8px 10px 12px;
      display: flex; align-items: center; gap: 7px;
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
      border-radius: 24px; padding: 8px 12px; font-size: 12.5px;
      color: #E2E2F0; outline: none; transition: border-color 0.15s;
      min-width: 0;
    }
    .av-input::placeholder { color: #28284A; }
    .av-input:focus { border-color: #3b82f6; }
    .av-call-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      background: linear-gradient(135deg, #4f46e5, #0ea5e9);
      box-shadow: 0 4px 14px rgba(79,70,229,0.4);
      transition: transform 0.15s, box-shadow 0.15s, background 0.3s;
    }
    .av-call-btn:hover  { transform: scale(1.06); }
    .av-call-btn:active { transform: scale(0.93); }
    .av-call-btn.active {
      background: linear-gradient(135deg, #dc2626, #ef4444);
      box-shadow: 0 4px 14px rgba(220,38,38,0.45);
      animation: av-pulse 1s infinite;
    }

    /* ── Mode-toggle button (voice ↔ text) ── */
    .av-mode-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid #1C1C2E; background: #0E0E1A;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s, border-color 0.15s;
    }
    .av-mode-btn:hover { background: #1C1C2E; border-color: #6366f1; }
    .av-mode-btn.text-active { background: #1A1A40; border-color: #6366f1; }
    .av-mode-btn.hidden { display: none; }

    /* ── Send button (text mode) ── */
    .av-send-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      cursor: pointer; display: none; align-items: center; justify-content: center;
      flex-shrink: 0;
      background: linear-gradient(135deg, #4f46e5, #0ea5e9);
      box-shadow: 0 4px 14px rgba(79,70,229,0.4);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .av-send-btn.visible { display: flex; }
    .av-send-btn:hover  { transform: scale(1.06); }
    .av-send-btn:active { transform: scale(0.93); }

    /* ── Avatar selector strip ── */
    .av-selector-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 14px 6px;
      flex-shrink: 0;
      border-bottom: 1px solid #0f0f1a;
    }
    .av-selector-label {
      font-size: 10px;
      font-weight: 600;
      color: #38385A;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .av-selector {
      flex: 1;
      background: #0E0E1A;
      border: 1px solid #1C1C2E;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 12px;
      color: #C4C4DC;
      outline: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%233A3A5C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      padding-right: 26px;
      transition: border-color 0.15s;
    }
    .av-selector:focus  { border-color: #4f46e5; }
    .av-selector:hover  { border-color: #3b82f6; }
    .av-selector option { background: #0E0E1A; color: #C4C4DC; }
    .av-selector-row.hidden { display: none; }

    /* ── Model selector row (text mode) ── */
    .av-model-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 14px 5px;
      flex-shrink: 0;
      border-bottom: 1px solid #0f0f1a;
      background: #07070f;
    }
    .av-model-row.hidden { display: none; }

    /* ── Keyframes ── */
    @keyframes av-breathe  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
    @keyframes av-bar      { 0%,100%{height:3px} 50%{height:12px} }
    @keyframes av-gradient { 0%{background-position:0% center} 100%{background-position:200% center} }
    @keyframes av-pulse    { 0%,100%{opacity:1} 50%{opacity:0.55} }
    @keyframes av-bounce   { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
    @keyframes av-msg-in   { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
    @keyframes av-ring-out { 0%{transform:scale(0.9);opacity:0.7} 100%{transform:scale(1.5);opacity:0} }
  `;

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: DOMBuilder
  // ════════════════════════════════════════════════════════════════════════════
  const DOMBuilder = (() => {
    let _shadow = null;

    const _refs = {};

    function build() {
      const host = document.createElement("div");
      host.id = "ai-avatar-plugin-host";
      document.body.appendChild(host);

      _shadow = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLES;
      _shadow.appendChild(style);

      // ── Outer host wrapper ──
      const wrapper = document.createElement("div");
      wrapper.className = "av-host collapsed";
      _shadow.appendChild(wrapper);
      _refs.wrapper = wrapper;

      // ── Collapse/expand tab ──
      const tab = document.createElement("div");
      tab.className = "av-tab";
      tab.setAttribute("role", "button");
      tab.setAttribute("aria-label", "Toggle avatar panel");
      tab.innerHTML = `
        <div class="av-tab-dot idle" id="av-tab-dot"></div>
        <div class="av-tab-arrow">&#9664;</div>
        <span class="av-tab-label">AI</span>
      `;
      wrapper.appendChild(tab);
      _refs.tab = tab;
      _refs.tabDot = tab.querySelector("#av-tab-dot");

      // ── Main panel ──
      const panel = document.createElement("div");
      panel.className = "av-panel";
      panel.innerHTML = `
        <div class="av-top-bar"></div>

        <div class="av-header">
          <div class="av-header-dot idle" id="av-hd"></div>
          <span class="av-header-name" id="av-agent-name">${_esc(State.get("agentName"))}</span>
        </div>

        <div class="av-selector-row hidden" id="av-selector-row">
          <span class="av-selector-label">Avatar</span>
          <select class="av-selector" id="av-selector"></select>
        </div>

        <div class="av-avatar-zone" id="av-zone">
          <div class="av-photo-bg" id="av-photo-bg" style="display:none"></div>
          <canvas class="av-canvas" id="av-canvas"></canvas>
          <div class="av-avatar-gradient"></div>
          <div class="av-loading" id="av-loading">
            <div class="av-orb-fb"></div>
            <span class="av-load-txt">Initialising…</span>
          </div>
        </div>

        <div class="av-status-bar">
          <div class="av-wave" id="av-wave">
            <div class="av-wave-bar"></div>
            <div class="av-wave-bar"></div>
            <div class="av-wave-bar"></div>
            <div class="av-wave-bar"></div>
            <div class="av-wave-bar"></div>
          </div>
          <span class="av-status-label" id="av-status">${Config.STATUS_LABELS.idle}</span>
          <span class="av-hint-text" id="av-hint">Click avatar to start</span>
        </div>

        <!-- Model picker — shown in text mode when multiple models are available -->
        <div class="av-model-row hidden" id="av-model-row">
          <span class="av-selector-label">Model</span>
          <select class="av-selector" id="av-model-select"></select>
        </div>

        <div class="av-transcript" id="av-transcript"></div>

        <div class="av-controls">
          <!-- Mode toggle: keyboard icon = switch to text, mic icon = switch to voice.
               Hidden entirely when data-chat-mode="false". -->
          <button class="av-mode-btn${Config.CHAT_ENABLED ? "" : " hidden"}" id="av-mode"
            title="Switch input mode">
            <!-- Keyboard icon — shown in voice mode (click → text mode) -->
            <svg id="av-mode-icon-text" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="#6366f1" stroke-width="2">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="6"  y1="9"  x2="6"  y2="9"/>
              <line x1="10" y1="9"  x2="10" y2="9"/>
              <line x1="14" y1="9"  x2="14" y2="9"/>
              <line x1="18" y1="9"  x2="18" y2="9"/>
              <line x1="6"  y1="13" x2="6"  y2="13"/>
              <line x1="18" y1="13" x2="18" y2="13"/>
              <line x1="10" y1="13" x2="14" y2="13"/>
              <line x1="8"  y1="17" x2="16" y2="17"/>
            </svg>
            <!-- Mic icon — shown in text mode (click → voice mode) -->
            <svg id="av-mode-icon-voice" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="#6366f1" stroke-width="2.2" style="display:none">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <button class="av-mute-btn" id="av-mute" title="Toggle mute">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#404060" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            </svg>
          </button>
          <input class="av-input" id="av-input" type="text"
            placeholder="Ask anything…" autocomplete="off"/>
          <button class="av-call-btn" id="av-call" title="Start / end voice call">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8"  y1="23" x2="16" y2="23"/>
            </svg>
          </button>
          <!-- Send button — visible only in text mode -->
          <button class="av-send-btn" id="av-send" title="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      `;
      wrapper.appendChild(panel);

      // Cache refs
      _refs.headerDot   = panel.querySelector("#av-hd");
      _refs.agentName   = panel.querySelector("#av-agent-name");
      _refs.selectorRow = panel.querySelector("#av-selector-row");
      _refs.selector    = panel.querySelector("#av-selector");
      _refs.zone        = panel.querySelector("#av-zone");
      _refs.photoBg     = panel.querySelector("#av-photo-bg");
      _refs.canvas      = panel.querySelector("#av-canvas");
      _refs.loading     = panel.querySelector("#av-loading");
      _refs.wave        = panel.querySelector("#av-wave");
      _refs.status      = panel.querySelector("#av-status");
      _refs.hint        = panel.querySelector("#av-hint");
      _refs.transcript  = panel.querySelector("#av-transcript");
      _refs.modelRow      = panel.querySelector("#av-model-row");
      _refs.modelSelect   = panel.querySelector("#av-model-select");
      _refs.modeBtn       = panel.querySelector("#av-mode");
      _refs.modeIconText  = panel.querySelector("#av-mode-icon-text");
      _refs.modeIconVoice = panel.querySelector("#av-mode-icon-voice");
      _refs.muteBtn       = panel.querySelector("#av-mute");
      _refs.input         = panel.querySelector("#av-input");
      _refs.callBtn       = panel.querySelector("#av-call");
      _refs.sendBtn       = panel.querySelector("#av-send");

      return { shadow: _shadow, refs: _refs };
    }

    return { build };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: PhotoAvatar
  // Portrait rendered as a WebGL texture on a Three.js full-screen quad.
  // A GLSL fragment shader physically warps the lower-lip pixel region downward
  // when lipAmp increases, revealing a dark mouth-cavity beneath.
  // Actual image pixels move — no overlay shapes, no seams.
  //
  // MediaPipe FaceLandmarker runs once on image load to detect exact mouth
  // landmarks (uv fractions). Falls back to DEFAULT_MOUTH if detection fails.
  //
  // The visible canvas keeps a 2D context for overlay effects (blink, glow,
  // waveform). The WebGL shader renders to a secondary offscreen canvas which
  // is blitted to the visible canvas each frame before overlays are drawn.
  // ════════════════════════════════════════════════════════════════════════════
  const PhotoAvatar = (() => {
    // UV y=0 = visual bottom, y=1 = visual top (Three.js flipY=true + WebGL→canvas blit)
    // Mouth at 72% from visual top = 28% from visual bottom → cy = 0.28
    const DEFAULT_MOUTH = Object.freeze({ cx: 0.50, cy: 0.28, hw: 0.120 });
    const MAX_GAP       = 0.034;  // maximum UV-space gap when lipAmp = 1

    // ── GLSL shaders ─────────────────────────────────────────────────────────
    const VERT_SRC = `
      varying vec2 vUv;
      void main() {
        vUv         = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    // Gaussian horizontal mask + inverse-UV displacement + dark cavity with teeth
    const FRAG_SRC = `
      uniform sampler2D uPortrait;
      uniform bool      uReady;
      uniform float     uLipAmp;
      uniform float     uMouthCX;
      uniform float     uMouthCY;
      uniform float     uMouthHW;
      uniform float     uMaxGap;
      varying vec2 vUv;

      void main() {
        if (!uReady) {
          gl_FragColor = vec4(0.035, 0.035, 0.055, 1.0);
          return;
        }

        float gap = uMaxGap * uLipAmp;

        // Gaussian horizontal mask — tapers to 0 beyond mouth corners
        float dx    = (vUv.x - uMouthCX) / max(uMouthHW, 0.001);
        float hMask = exp(-dx * dx * 2.5);

        float halfGap   = gap * 0.5 * hMask;
        float cavityBot = uMouthCY - halfGap;   // lower lip moved down (smaller UV y)
        float cavityTop = uMouthCY + halfGap;   // upper lip moved up   (larger UV y)

        if (hMask > 0.04 && vUv.y > cavityBot && vUv.y < cavityTop) {
          // Inside cavity: bright teeth in upper region, dark below
          float t      = (vUv.y - cavityBot) / max(cavityTop - cavityBot, 0.0001);
          float teethA = smoothstep(0.35, 0.70, t) * hMask * min(1.0, uLipAmp * 3.0);
          vec3 dark    = vec3(0.035, 0.014, 0.010);
          vec3 teeth   = vec3(0.940, 0.920, 0.880);
          gl_FragColor = vec4(mix(dark, teeth, teethA), 1.0);
        } else {
          vec2 sUv = vUv;
          if (vUv.y >= cavityTop) {
            // Upper lip moved up — pull sample back to original position (below)
            float dist    = vUv.y - cavityTop;
            float falloff = exp(-dist / max(halfGap * 3.0, 0.001)) * hMask;
            sUv.y         = vUv.y - halfGap * falloff;
          } else if (vUv.y <= cavityBot) {
            // Lower lip moved down — pull sample back up
            float dist    = cavityBot - vUv.y;
            float falloff = exp(-dist / max(halfGap * 3.0, 0.001)) * hMask;
            sUv.y         = vUv.y + halfGap * falloff;
          }
          gl_FragColor = texture2D(uPortrait, clamp(sUv, 0.001, 0.999));
        }
      }
    `;

    // ── WebGL / Three.js state ────────────────────────────────────────────────
    let _glCanvas  = null;
    let _renderer  = null;
    let _scene     = null;
    let _camera    = null;
    let _material  = null;
    let _texture   = null;
    let _THREE     = null;

    // ── Visible canvas / 2D overlay state ────────────────────────────────────
    let _canvas    = null;
    let _ctx       = null;
    let _rafId     = null;
    let _time      = 0;
    let _mouth     = { ...DEFAULT_MOUTH };
    let _blinkT    = 0;
    let _nextBlink = 3.0 + Math.random() * 2.5;
    let _blinkPhase = 0;
    let _ringsPool = [];
    let _detecting = false;
    let _ready     = false;

    // ── Public: init ─────────────────────────────────────────────────────────
    async function init(canvas, photoBgEl, imageUrl) {
      _canvas = canvas;
      _ctx    = canvas.getContext("2d");
      _mouth  = { ...DEFAULT_MOUTH };
      _ready  = false;

      // Portrait rendered via WebGL — hide the CSS background div
      if (photoBgEl) {
        photoBgEl.style.backgroundImage = "none";
        photoBgEl.style.display         = "none";
      }

      _glCanvas        = document.createElement("canvas");
      _glCanvas.width  = canvas.width;
      _glCanvas.height = canvas.height;

      _THREE = await import(Config.THREE_CDN);
      _setupWebGL(_THREE, canvas.width, canvas.height);
      await _loadTexture(imageUrl);
      _startLoop();
    }

    // ── WebGL setup ───────────────────────────────────────────────────────────
    function _setupWebGL(THREE, W, H) {
      _renderer = new THREE.WebGLRenderer({ canvas: _glCanvas, antialias: false, alpha: false });
      _renderer.setPixelRatio(1);
      _renderer.setSize(W, H);

      _scene  = new THREE.Scene();
      _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const geo = new THREE.PlaneGeometry(2, 2);
      _material = new THREE.ShaderMaterial({
        vertexShader:   VERT_SRC,
        fragmentShader: FRAG_SRC,
        uniforms: {
          uPortrait: { value: null  },
          uReady:    { value: false },
          uLipAmp:   { value: 0.0  },
          uMouthCX:  { value: _mouth.cx },
          uMouthCY:  { value: _mouth.cy },
          uMouthHW:  { value: _mouth.hw },
          uMaxGap:   { value: MAX_GAP   },
        },
      });
      const mesh = new THREE.Mesh(geo, _material);
      mesh.frustumCulled = false;
      _scene.add(mesh);
    }

    // ── Texture loading ───────────────────────────────────────────────────────
    async function _loadTexture(url) {
      return new Promise((resolve) => {
        const loader = new _THREE.TextureLoader();
        loader.load(
          url,
          (tex) => {
            if (_texture) _texture.dispose();
            _texture  = tex;
            _material.uniforms.uPortrait.value = tex;
            _material.uniforms.uReady.value    = true;
            _ready = true;
            resolve();
            _detectMouthFromUrl(url);
          },
          undefined,
          () => { _ready = false; resolve(); }
        );
      });
    }

    // ── Face detection ────────────────────────────────────────────────────────
    function _detectMouthFromUrl(url) {
      if (_detecting) return;
      _detecting = true;
      const img       = new Image();
      img.crossOrigin = "anonymous";
      img.onload      = () => _detectMouth(img).finally(() => { _detecting = false; });
      img.onerror     = () => { _detecting = false; };
      img.src         = url;
    }

    async function _detectMouth(imgEl) {
      try {
        const { FaceLandmarker, FilesetResolver } = await import(Config.MEDIAPIPE_CDN);
        const vision   = await FilesetResolver.forVisionTasks(Config.MEDIAPIPE_WASM);
        const detector = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: Config.MP_MODEL_URL, delegate: "CPU" },
          runningMode: "IMAGE",
          numFaces:    1,
        });
        const result = detector.detect(imgEl);
        detector.close();

        if (!result.faceLandmarks?.length) return;
        const lm = result.faceLandmarks[0];

        // 13 = upper lip centre, 14 = lower lip, 61 = left corner, 291 = right corner
        const ul = lm[13], ll = lm[14], lc = lm[61], rc = lm[291];
        // MediaPipe y is fraction from image top; UV y=0 = visual bottom → flip
        _mouth = {
          cx: (lc.x + rc.x) / 2,
          cy: 1.0 - (ul.y + ll.y) / 2,
          hw: Math.abs(rc.x - lc.x) / 2 * 1.15,
        };
        if (_material) {
          _material.uniforms.uMouthCX.value = _mouth.cx;
          _material.uniforms.uMouthCY.value = _mouth.cy;
          _material.uniforms.uMouthHW.value = _mouth.hw;
        }
      } catch {
        // MediaPipe unavailable — DEFAULT_MOUTH uniforms remain
      }
    }

    // ── RAF loop ──────────────────────────────────────────────────────────────
    function _startLoop() {
      let last = performance.now();
      const tick = (now) => {
        _rafId = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        _time += dt;
        _advanceBlink(dt);
        _drawFrame(dt);
      };
      _rafId = requestAnimationFrame(tick);
    }

    // ── Blink state machine ───────────────────────────────────────────────────
    function _advanceBlink(dt) {
      _blinkT += dt;
      if (_blinkPhase === 0 && _blinkT >= _nextBlink) {
        _blinkT     = 0;
        _nextBlink  = 3.2 + Math.random() * 3.8;
        _blinkPhase = 0.001;
      }
      if (_blinkPhase > 0) {
        _blinkPhase = Math.min(1, _blinkPhase + dt / 0.072);
        if (_blinkPhase >= 1) _blinkPhase = -0.001;
      } else if (_blinkPhase < 0) {
        _blinkPhase = Math.max(-1, _blinkPhase - dt / 0.072);
        if (_blinkPhase <= -1) _blinkPhase = 0;
      }
    }

    function _blinkIntensity() {
      if (_blinkPhase > 0) return _blinkPhase;
      if (_blinkPhase < 0) return 1 + _blinkPhase;
      return 0;
    }

    // ── Draw frame: WebGL → blit → 2D overlays ───────────────────────────────
    function _drawFrame(dt) {
      if (!_canvas || !_ctx) return;
      const W = _canvas.width;
      const H = _canvas.height;

      if (_ready && _renderer && _material) {
        _material.uniforms.uLipAmp.value = State.get("lipAmp");
        _renderer.render(_scene, _camera);
        _ctx.drawImage(_glCanvas, 0, 0);
      } else {
        _ctx.clearRect(0, 0, W, H);
      }

      const mode   = State.get("mode");
      const lipAmp = State.get("lipAmp");
      _drawBlinkOverlay(W, H, _blinkIntensity());
      _drawGlowEffects(W, H, mode, lipAmp, dt);
    }

    function _drawBlinkOverlay(W, H, intensity) {
      if (intensity < 0.02) return;
      const eyeTopY = H * 0.24;
      const eyeH    = H * 0.18;
      const g = _ctx.createLinearGradient(0, eyeTopY, 0, eyeTopY + eyeH);
      g.addColorStop(0,    `rgba(6,6,14,${intensity * 0.15})`);
      g.addColorStop(0.30, `rgba(6,6,14,${intensity * 0.92})`);
      g.addColorStop(0.70, `rgba(6,6,14,${intensity * 0.92})`);
      g.addColorStop(1,    `rgba(6,6,14,${intensity * 0.15})`);
      _ctx.fillStyle = g;
      _ctx.fillRect(0, eyeTopY, W, eyeH);
    }

    function _drawGlowEffects(W, H, mode, lipAmp, dt) {
      const cx    = W / 2;
      // Convert UV y → screen fraction from top: screenFrac = 1 - _mouth.cy
      // Face-glow centre is 28% above the mouth in screen space
      const cy    = H * (1.0 - _mouth.cy - 0.28);
      const faceR = Math.min(W, H) * 0.32;

      if (mode !== "idle") {
        const ga  = mode === "speaking" ? 0.16 + lipAmp * 0.14 : 0.09;
        const grd = _ctx.createRadialGradient(cx, cy, faceR * 0.65, cx, cy, faceR * 1.35);
        grd.addColorStop(0,   `rgba(99,102,241,${ga})`);
        grd.addColorStop(0.5, `rgba(14,165,233,${ga * 0.42})`);
        grd.addColorStop(1,   "rgba(20,184,166,0)");
        _ctx.beginPath();
        _ctx.arc(cx, cy, faceR * 1.35, 0, Math.PI * 2);
        _ctx.fillStyle = grd;
        _ctx.fill();
      }

      if (mode === "listening") {
        const a = 0.27 + Math.sin(_time * 3.0) * 0.10;
        _ctx.beginPath();
        _ctx.arc(cx, cy, faceR + 5, 0, Math.PI * 2);
        _ctx.strokeStyle = `rgba(96,165,250,${a})`;
        _ctx.lineWidth   = 1.5;
        _ctx.stroke();
      }

      if (mode === "speaking") {
        if (lipAmp > 0.32 && Math.random() < 0.07) {
          _ringsPool.push({ r: faceR, life: 1.0 });
        }
        _ringsPool = _ringsPool.filter(ring => {
          ring.r    += dt * 88;
          ring.life -= dt * 1.8;
          if (ring.life <= 0) return false;
          _ctx.beginPath();
          _ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
          _ctx.strokeStyle = `rgba(99,102,241,${ring.life * 0.50})`;
          _ctx.lineWidth   = 1.5;
          _ctx.stroke();
          return true;
        });
        _drawWaveformBars(W, H, lipAmp);
      }
    }

    function _drawWaveformBars(W, H, amplitude) {
      const numBars = 24;
      const barW    = 2.5;
      const barGap  = 2.5;
      const totalW  = numBars * (barW + barGap);
      const startX  = (W - totalW) / 2;
      const baseY   = H - 14;
      const maxH    = 32 * amplitude;

      for (let i = 0; i < numBars; i++) {
        const norm = Math.abs((i / (numBars - 1)) - 0.5) * 2;
        const envH = maxH * (1 - norm * 0.55) * (0.45 + 0.55 * Math.random());
        const x    = startX + i * (barW + barGap);
        const grad = _ctx.createLinearGradient(0, baseY - envH, 0, baseY);
        grad.addColorStop(0, "rgba(14,165,233,0.9)");
        grad.addColorStop(1, "rgba(20,184,166,0.5)");
        _ctx.fillStyle = grad;
        _ctx.beginPath();
        if (_ctx.roundRect) {
          _ctx.roundRect(x, baseY - envH, barW, Math.max(2, envH), 2);
        } else {
          _ctx.rect(x, baseY - envH, barW, Math.max(2, envH));
        }
        _ctx.fill();
      }
    }

    // ── Public: switchImage, resize, destroy ─────────────────────────────────
    async function switchImage(_photoBgEl, imageUrl) {
      _mouth = { ...DEFAULT_MOUTH };
      _ready = false;
      if (_material) {
        _material.uniforms.uMouthCX.value = _mouth.cx;
        _material.uniforms.uMouthCY.value = _mouth.cy;
        _material.uniforms.uMouthHW.value = _mouth.hw;
        _material.uniforms.uReady.value   = false;
      }
      await _loadTexture(imageUrl);
    }

    function resize(w, h) {
      if (_canvas)   { _canvas.width = w; _canvas.height = h; }
      if (_glCanvas) { _glCanvas.width = w; _glCanvas.height = h; }
      if (_renderer) { _renderer.setSize(w, h); }
    }

    function destroy() {
      if (_rafId)    { cancelAnimationFrame(_rafId); _rafId = null; }
      if (_texture)  { _texture.dispose(); _texture = null; }
      if (_renderer) { _renderer.dispose(); _renderer = null; }
    }

    return { init, switchImage, resize, destroy };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: ThreeAvatar — Three.js face: VRM avatar, RPM GLB, or procedural fallback
  // ════════════════════════════════════════════════════════════════════════════
  const ThreeAvatar = (() => {
    let _renderer  = null;
    let _scene     = null;
    let _camera    = null;
    let _clock     = null;
    let _rafId     = null;
    let _ready     = false;

    // Procedural face handles
    let _jawGroup  = null;
    let _headGroup = null;
    let _leftLid   = null;
    let _rightLid  = null;

    // RPM GLB handle
    let _headMesh  = null;

    // VRM handle — set when a .vrm file is loaded
    let _vrm       = null;

    // VRM mouth expression names (three-vrm preset names, work for both VRM 0.x and 1.0)
    const VRM_VOWELS = ["aa", "ih", "ou", "ee", "oh"];

    const RPM_VISEMES = [
      "viseme_sil","viseme_PP","viseme_FF","viseme_TH","viseme_DD",
      "viseme_kk","viseme_CH","viseme_SS","viseme_nn","viseme_RR",
      "viseme_aa","viseme_E","viseme_I","viseme_O","viseme_U",
    ];

    async function init(canvas) {
      if (_ready || !canvas) return;

      try {
        const THREE = await import(Config.THREE_CDN);

        const zone = canvas.parentElement;
        const W    = zone.clientWidth  || 340;
        const H    = zone.clientHeight || 240;

        _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        _renderer.setSize(W, H);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.outputColorSpace = THREE.SRGBColorSpace;
        _renderer.shadowMap.enabled = true;

        _scene  = new THREE.Scene();
        _camera = new THREE.PerspectiveCamera(26, W / H, 0.01, 20);
        _clock  = new THREE.Clock();

        _setupLighting(THREE);
        _addSceneBackground(THREE);

        if (Config.AVATAR_URL) {
          if (Config.AVATAR_URL.toLowerCase().endsWith(".vrm")) {
            await _loadVrmAvatar(THREE, Config.AVATAR_URL);
          } else {
            await _loadRpmAvatar(THREE, canvas);
          }
        } else {
          _buildFace(THREE);
        }

        _ready = true;
        _startRenderLoop(THREE);

      } catch (err) {
        console.warn("[AiAvatar] Three.js init failed:", err);
      }
    }

    function _setupLighting(THREE) {
      _scene.add(new THREE.AmbientLight(0xffffff, 0.7));

      const key = new THREE.DirectionalLight(0xfff4e8, 1.4);
      key.position.set(0.6, 1.5, 2);
      key.castShadow = true;
      _scene.add(key);

      const fill = new THREE.DirectionalLight(0xd0e0ff, 0.55);
      fill.position.set(-1.5, 0.5, 1);
      _scene.add(fill);

      const rim = new THREE.DirectionalLight(0x8899ff, 0.3);
      rim.position.set(0, 0.5, -2);
      _scene.add(rim);
    }

    function _addSceneBackground(THREE) {
      // Subtle dark-purple to midnight-blue gradient sphere (mimics studio background)
      const geo = new THREE.SphereGeometry(6, 32, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x06060e,
        side: THREE.BackSide,
      });
      _scene.add(new THREE.Mesh(geo, mat));
    }

    function _buildFace(THREE) {
      const SKIN   = 0xf0b890;
      const SKIN_D = 0xe0a070;
      const EYE_W  = 0xfafafa;
      const IRIS   = 0x224488;
      const PUPIL  = 0x080808;
      const LIP    = 0xcc6655;
      const BROW   = 0x2a1a0a;
      const HAIR   = 0x1a0f05;
      const TEETH  = 0xf8f4e8;

      function skin(color, rough = 0.82, metal = 0.01) {
        return new THREE.MeshPhysicalMaterial({
          color,
          roughness: rough,
          metalness: metal,
          sheen: 0.08,
          sheenRoughness: 0.85,
        });
      }

      const root = new THREE.Group();

      // Hair cap
      const hairGeo = new THREE.SphereGeometry(0.52, 36, 36, 0, Math.PI * 2, 0, Math.PI * 0.54);
      root.add(Object.assign(new THREE.Mesh(hairGeo, skin(HAIR, 0.9)), { position: { y: 0.02 } }));

      // Side hair
      [-1, 1].forEach(s => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), skin(HAIR, 0.9));
        m.scale.set(0.55, 1.1, 0.6);
        m.position.set(s * 0.44, -0.12, -0.15);
        root.add(m);
      });

      // Head sphere
      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 48), skin(SKIN));
      headMesh.scale.set(1, 1.18, 0.94);
      root.add(headMesh);
      _headGroup = root;

      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.175, 0.22, 24), skin(SKIN));
      neck.position.y = -0.54;
      root.add(neck);

      // Eyes
      function makeEye(xSide) {
        const g = new THREE.Group();
        g.position.set(xSide * 0.165, 0.1, 0.43);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.072, 22, 22), skin(EYE_W, 0.15)));
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.044, 18, 18), skin(IRIS, 0.22, 0.08));
        iris.position.z = 0.038;
        g.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 14), skin(PUPIL, 0.05));
        pupil.position.z = 0.054;
        g.add(pupil);
        const hi = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 8, 8),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, emissive: 0xffffff, emissiveIntensity: 0.5 })
        );
        hi.position.set(0.01, 0.01, 0.065);
        g.add(hi);
        // Eyelid (scale.y 0=open, 1=closed)
        const lidGeo = new THREE.SphereGeometry(0.078, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const lid = new THREE.Mesh(lidGeo, skin(SKIN, 0.85));
        lid.rotation.x = Math.PI;
        lid.position.set(0, 0.003, 0.008);
        lid.scale.y = 0;
        g.add(lid);
        root.add(g);
        return lid;
      }
      _leftLid  = makeEye(-1);
      _rightLid = makeEye(1);

      // Eyebrows
      [-1, 1].forEach(s => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.038), skin(BROW, 0.88));
        b.position.set(s * 0.165, 0.245, 0.435);
        b.rotation.z = s * -0.12;
        root.add(b);
      });

      // Nose
      const noseBridge = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), skin(SKIN_D, 0.85));
      noseBridge.scale.set(0.7, 1.8, 0.9);
      noseBridge.position.set(0, 0.01, 0.48);
      root.add(noseBridge);
      const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.058, 18, 14), skin(SKIN_D, 0.85));
      noseTip.scale.set(1, 0.72, 0.8);
      noseTip.position.set(0, -0.055, 0.485);
      root.add(noseTip);
      [-1, 1].forEach(s => {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skin(0xc07050, 0.9));
        n.scale.set(0.85, 0.7, 0.75);
        n.position.set(s * 0.044, -0.065, 0.475);
        root.add(n);
      });

      // Upper lip (static)
      const upLip = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        skin(LIP, 0.72)
      );
      upLip.scale.set(1.2, 0.65, 0.55);
      upLip.position.set(0, -0.175, 0.455);
      upLip.rotation.x = Math.PI;
      root.add(upLip);

      // Jaw group — rotates on X for lip sync
      _jawGroup = new THREE.Group();
      _jawGroup.position.set(0, -0.195, 0.01);
      const loLip = new THREE.Mesh(
        new THREE.SphereGeometry(0.082, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        skin(LIP, 0.72)
      );
      loLip.scale.set(1.15, 0.62, 0.52);
      loLip.position.set(0, 0.005, 0.45);
      _jawGroup.add(loLip);
      const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 0.04), skin(TEETH, 0.35));
      teeth.position.set(0, 0.028, 0.44);
      _jawGroup.add(teeth);
      const chin = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 28, 14, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
        skin(SKIN, 0.84)
      );
      chin.scale.set(1, 0.55, 0.86);
      chin.position.set(0, 0.01, 0.12);
      _jawGroup.add(chin);
      root.add(_jawGroup);

      // Ears
      [-1, 1].forEach(s => {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), skin(SKIN_D, 0.85));
        ear.scale.set(0.42, 0.75, 0.45);
        ear.position.set(s * 0.495, 0.02, -0.01);
        root.add(ear);
      });

      // Cheek highlights
      [-1, 1].forEach(s => {
        const cheek = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 14, 10),
          new THREE.MeshPhysicalMaterial({ color: 0xffccaa, roughness: 0.95, transparent: true, opacity: 0.16 })
        );
        cheek.scale.set(1.1, 0.65, 0.5);
        cheek.position.set(s * 0.28, 0.02, 0.41);
        root.add(cheek);
      });

      _scene.add(root);
      _camera.position.set(0, 0.04, 1.52);
      _camera.lookAt(0, 0, 0);
    }

    async function _loadRpmAvatar(THREE, canvas) {
      try {
        const { GLTFLoader } = await import(Config.GLTF_CDN);
        const loader = new GLTFLoader();
        return new Promise((resolve) => {
          loader.load(
            Config.AVATAR_URL,
            (gltf) => {
              _scene.add(gltf.scene);
              gltf.scene.traverse((node) => {
                if (node.isMesh && node.morphTargetDictionary) {
                  const keys = Object.keys(node.morphTargetDictionary);
                  if (keys.some(k => k.startsWith("viseme_"))) _headMesh = node;
                }
              });
              _camera.position.set(0, 1.65, 0.7);
              _camera.lookAt(0, 1.52, 0);
              resolve();
            },
            undefined,
            () => { _buildFace(THREE); resolve(); }
          );
        });
      } catch {
        _buildFace(THREE);
      }
    }

    async function _loadVrmAvatar(THREE, url) {
      try {
        const { GLTFLoader }     = await import(Config.GLTF_CDN);
        const { VRMLoaderPlugin } = await import(Config.VRM_CDN);

        const loader = new GLTFLoader();
        loader.register(parser => new VRMLoaderPlugin(parser));

        return new Promise((resolve) => {
          loader.load(
            url,
            (gltf) => {
              _vrm = gltf.userData.vrm;
              if (!_vrm) { _buildFace(THREE); resolve(); return; }

              // VRM models face +Z by default; rotate to face the camera
              _vrm.scene.rotation.y = Math.PI;
              _scene.add(_vrm.scene);

              // Frame for a head-and-shoulders portrait
              _camera.position.set(0, 1.42, 0.72);
              _camera.lookAt(0, 1.30, 0);
              resolve();
            },
            undefined,
            () => { _buildFace(THREE); resolve(); }
          );
        });
      } catch {
        _buildFace(THREE);
      }
    }

    function _startRenderLoop(THREE) {
      const tick = () => {
        _rafId = requestAnimationFrame(tick);
        const dt = Math.min(_clock.getDelta(), 0.05);

        _updateLipSync(dt);
        _updateIdle(dt);

        _renderer.render(_scene, _camera);
      };
      tick();
    }

    function _updateLipSync(dt) {
      // LipSyncEngine owns lipAmp (real ElevenLabs audio or sinusoidal fallback).
      // ThreeAvatar just reads the value and applies it to whatever face is loaded.
      const lipAmp  = State.get("lipAmp");
      let lipPhase  = State.get("lipPhase");
      if (State.get("mode") === "speaking") {
        lipPhase += dt * 28.5;
        State.set("lipPhase", lipPhase);
      }

      // ── Procedural jaw ────────────────────────────────────────────────────
      if (_jawGroup) _jawGroup.rotation.x = lipAmp * 0.28;

      // ── RPM / GLB morph targets ───────────────────────────────────────────
      if (_headMesh) {
        const dict = _headMesh.morphTargetDictionary;
        const infl = _headMesh.morphTargetInfluences;
        RPM_VISEMES.forEach(v => { const i = dict[v]; if (i !== undefined) infl[i] = 0; });
        if (lipAmp > 0.01) {
          const aaI = dict["viseme_aa"];
          if (aaI !== undefined) infl[aaI] = lipAmp * 0.88;
          const vowels = ["viseme_E", "viseme_I", "viseme_O", "viseme_U"];
          const vSel   = vowels[Math.floor((lipPhase * 0.25) % vowels.length)];
          const vI = dict[vSel];
          if (vI !== undefined) infl[vI] = lipAmp * 0.30;
        }
      }

      // ── VRM expressions ───────────────────────────────────────────────────
      if (_vrm && _vrm.expressionManager) {
        const em = _vrm.expressionManager;
        VRM_VOWELS.forEach(e => { try { em.setValue(e, 0); } catch { /* unsupported */ } });
        if (lipAmp > 0.01) {
          try { em.setValue("aa", lipAmp * 0.90); } catch { /* unsupported */ }
          const secondary = VRM_VOWELS[Math.floor((lipPhase * 0.25) % VRM_VOWELS.length)];
          try { em.setValue(secondary, lipAmp * 0.22); } catch { /* unsupported */ }
        }
        em.update();
      }
    }

    function _updateIdle(dt) {
      const t = State.get("idleTime") + dt;
      State.set("idleTime", t);

      // Subtle head sway for procedural and RPM faces
      if (_headGroup) {
        _headGroup.rotation.y = Math.sin(t * 0.22) * 0.04;
        _headGroup.rotation.z = Math.sin(t * 0.17) * 0.022;
        _headGroup.position.y = Math.sin(t * 0.35) * 0.008;
      }
      if (_headMesh && _headMesh.parent) {
        _headMesh.parent.rotation.y = Math.sin(t * 0.22) * 0.04;
        _headMesh.parent.rotation.z = Math.sin(t * 0.17) * 0.018;
      }

      // Subtle head sway for VRM (applied to the VRM scene root)
      if (_vrm) {
        _vrm.scene.rotation.y = Math.PI + Math.sin(t * 0.22) * 0.04;
        _vrm.scene.rotation.z = Math.sin(t * 0.17) * 0.018;
        _vrm.update(dt);  // drives spring bones, look-at, and auto expressions
      }

      // Blink timer
      let blinkTimer = State.get("blinkTimer") + dt;
      const nextBlink = State.get("nextBlink");
      State.set("blinkTimer", blinkTimer);

      if (!State.get("blinking") && blinkTimer > nextBlink) {
        State.set("blinkTimer", 0);
        State.set("nextBlink", 2.8 + Math.random() * 4.0);
        _triggerBlink();
      }
    }

    function _triggerBlink() {
      State.set("blinking", true);
      const start    = performance.now();
      const DURATION = 150;
      const step = () => {
        const p = (performance.now() - start) / DURATION;
        const v = p < 0.45 ? p / 0.45 : p < 1 ? 1 - (p - 0.45) / 0.55 : 0;

        // Procedural eyelids
        if (_leftLid)  _leftLid.scale.y  = v;
        if (_rightLid) _rightLid.scale.y = v;

        // RPM blink morph targets
        if (_headMesh) {
          const dict = _headMesh.morphTargetDictionary;
          const infl = _headMesh.morphTargetInfluences;
          const lI = dict["eyeBlinkLeft"]  ?? dict["blink_left"];
          const rI = dict["eyeBlinkRight"] ?? dict["blink_right"];
          if (lI !== undefined) infl[lI] = v;
          if (rI !== undefined) infl[rI] = v;
        }

        // VRM blink expressions
        if (_vrm && _vrm.expressionManager) {
          try { _vrm.expressionManager.setValue("blinkLeft",  v); } catch { /* unsupported */ }
          try { _vrm.expressionManager.setValue("blinkRight", v); } catch { /* unsupported */ }
          _vrm.expressionManager.update();
        }

        if (p < 1) requestAnimationFrame(step);
        else State.set("blinking", false);
      };
      requestAnimationFrame(step);
    }

    function isReady() { return _ready; }

    function destroy() {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      if (_renderer) { _renderer.dispose(); }
    }

    return { init, isReady, destroy };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: LipSyncEngine — drives PhotoAvatar lip amp when in photo mode
  // (ThreeAvatar drives its own lipAmp internally in the render loop)
  // ════════════════════════════════════════════════════════════════════════════
  const LipSyncEngine = (() => {
    let _rafId       = null;
    let _lastTime    = 0;
    let _getFreqData = null;   // () => Uint8Array|null — real ElevenLabs output

    function setAudioSource(fn) {
      _getFreqData = fn;
    }

    function start() {
      if (_rafId) return;
      _lastTime = performance.now();
      const tick = (now) => {
        _rafId = requestAnimationFrame(tick);
        const dt = Math.min((now - _lastTime) / 1000, 0.05);
        _lastTime = now;
        _update(dt);
      };
      _rafId = requestAnimationFrame(tick);
    }

    function _update(dt) {
      const speaking = State.get("mode") === "speaking";
      let lipAmp    = State.get("lipAmp");

      if (speaking) {
        let amplitude = 0;

        // Try real ElevenLabs output audio frequency data first
        if (_getFreqData) {
          try {
            const freq = _getFreqData();
            if (freq && freq.length > 0) {
              // Sum speech-range bins (~150–3500 Hz with typical 44.1kHz / 1024-bin FFT)
              let sum = 0;
              const lo = 4, hi = Math.min(85, freq.length);
              for (let i = lo; i < hi; i++) sum += freq[i];
              amplitude = Math.min(1, (sum / ((hi - lo) * 255)) * 2.8);
            }
          } catch { /* SDK not ready yet */ }
        }

        // Fall back to sinusoidal syllable simulation when no real data
        if (amplitude < 0.02) {
          let lipPhase = State.get("lipPhase");
          lipPhase += dt * 28.5;
          const syllable = Math.max(0, Math.sin(lipPhase));
          const noise    = (Math.random() - 0.5) * 0.18;
          amplitude = Math.min(1, Math.max(0, 0.22 + syllable * 0.62 + noise));
          State.set("lipPhase", lipPhase);
        }

        lipAmp += (amplitude - lipAmp) * Math.min(1, dt * 22);
      } else {
        lipAmp = Math.max(0, lipAmp - dt * 12);
      }

      State.set("lipAmp", lipAmp);
    }

    function stop() {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    }

    return { setAudioSource, start, stop };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: PageScraper — collects page context for ElevenLabs dynamic variable
  // ════════════════════════════════════════════════════════════════════════════
  const PageScraper = (() => {
    const _sources = {};
    // Live context pushed from the host page via CustomEvent or pushContext().
    // Source-fn results take priority; pushed values fill in when cache is empty.
    const _pushed  = {};

    window.addEventListener("ai-avatar:context-push", (e) => {
      if (e.detail && typeof e.detail === "object") Object.assign(_pushed, e.detail);
    });

    function registerSource(name, getFn) {
      _sources[name] = getFn;
    }

    function scrapePageText() {
      const parts = [];

      // 1. Extract table data as "Header: Cell, Cell | Header: Cell, Cell" rows
      //    so the AI gets structured readings rather than a jumbled text stream.
      document.querySelectorAll("table").forEach((table) => {
        const cs = window.getComputedStyle(table);
        if (cs.display === "none" || cs.visibility === "hidden") return;

        const headers = [...table.querySelectorAll("th")].map(th => th.innerText.trim()).filter(Boolean);
        const rows = [...table.querySelectorAll("tbody tr")];
        if (!rows.length) return;

        parts.push("[Table]");
        if (headers.length) parts.push(headers.join(" | "));
        rows.slice(0, 50).forEach(tr => {
          const cells = [...tr.querySelectorAll("td")].map(td => td.innerText.trim());
          if (cells.some(Boolean)) parts.push(cells.join(" | "));
        });
        parts.push("");
      });

      // 2. Remaining visible text (headings, labels, values outside tables).
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const el  = node.parentElement;
          if (!el) return NodeFilter.FILTER_REJECT;
          const tag = el.tagName.toLowerCase();
          if (["script","style","noscript","meta","head","table","th","td"].includes(tag))
            return NodeFilter.FILTER_REJECT;
          const cs = window.getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden") return NodeFilter.FILTER_SKIP;
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      const texts = [];
      let node;
      while ((node = walker.nextNode())) texts.push(node.textContent.trim());
      if (texts.length) parts.push(texts.join(" ").replace(/\s+/g, " ").trim());

      return parts.join("\n");
    }

    async function collectExtra() {
      // Start from the live pushed snapshot, then overlay with fresh source-fn calls.
      // Source fns always win so stale pushed values don't shadow live data.
      const extra = { ..._pushed };
      for (const [name, getFn] of Object.entries(_sources)) {
        try {
          const val = await Promise.resolve(getFn());
          if (val !== null && val !== undefined) extra[name] = val;
        } catch { /* ignore */ }
      }
      return Object.keys(extra).length ? extra : null;
    }

    // Returns the union of registered source names and pushed keys.
    function listSources() {
      return [...new Set([...Object.keys(_sources), ...Object.keys(_pushed)])];
    }

    // Fetches a single named source: source fn takes priority over pushed cache.
    // Returns null if the name is unknown on both sides.
    async function getSource(name) {
      if (name in _sources) {
        try { return await Promise.resolve(_sources[name]()); } catch { /* fall through */ }
      }
      return Object.prototype.hasOwnProperty.call(_pushed, name) ? _pushed[name] : null;
    }

    return { registerSource, scrapePageText, collectExtra, listSources, getSource };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: TokenService — fetches ElevenLabs token from our FastAPI backend
  // ════════════════════════════════════════════════════════════════════════════
  const TokenService = (() => {
    async function fetchToken() {
      const content = PageScraper.scrapePageText();
      const extra   = await PageScraper.collectExtra();

      const res = await fetch(`${Config.BACKEND}/api/token`, {
        method:  "POST",
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

    async function fetchPublicConfig() {
      const res = await fetch(`${Config.BACKEND}/api/config`);
      if (!res.ok) return null;
      return res.json();
    }

    async function fetchAvatars() {
      try {
        const res = await fetch(`${Config.BACKEND}/api/avatars`);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.avatars || []).map(a => ({
          ...a,
          url: `${Config.BACKEND}${a.url}`,   // make absolute
        }));
      } catch {
        return [];
      }
    }

    return { fetchToken, fetchPublicConfig, fetchAvatars };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: Conversation — manages the ElevenLabs Agent WebRTC session
  // ════════════════════════════════════════════════════════════════════════════
  const Conversation = (() => {
    let _session = null;

    async function start(callbacks) {
      if (_session) return;
      callbacks.onConnecting();

      try {
        const { Conversation: ELConv } = await import(Config.ELEVENLABS_CDN);
        const { token, dynamic_variables } = await TokenService.fetchToken();

        callbacks.onTypingStart();

        _session = await ELConv.startSession({
          conversationToken: token,
          dynamicVariables:  dynamic_variables,

          // Generic client tools — work with any dashboard that uses registerSource().
          // The AI calls these to pull live data on demand during the conversation.
          clientTools: {
            // Lets the AI discover what data the host page has registered.
            list_data_sources: async () => {
              return { sources: PageScraper.listSources() };
            },

            // Lets the AI fetch any named source by name, with a size cap so the
            // context window doesn't get overwhelmed by large datasets.
            get_data_source: async ({ name }) => {
              const data = await PageScraper.getSource(name);
              if (data === null || data === undefined) {
                return { available: false, name };
              }
              const json = JSON.stringify(data, null, 2);
              return {
                available: true,
                name,
                // Truncate large payloads; voice AI doesn't need raw table dumps.
                data: json.length > 5000
                  ? json.slice(0, 5000) + "\n...[truncated — ask for a specific field]"
                  : data,
              };
            },
          },

          onConnect:    () => { callbacks.onTypingStop(); callbacks.onConnect(); },
          onDisconnect: () => { _session = null; callbacks.onDisconnect(); },
          onMessage:    ({ message, source }) => {
            callbacks.onTypingStop();
            callbacks.onMessage(source === "ai" ? "assistant" : "user", message);
          },
          onError: (msg) => {
            callbacks.onTypingStop();
            _session = null;
            callbacks.onError(msg);
          },
          onModeChange: ({ mode }) => {
            if      (mode === "listening")   callbacks.onMode("listening");
            else if (mode === "speaking")    callbacks.onMode("speaking");
            else if (mode === "processing")  callbacks.onMode("thinking");
          },
        });

        if (State.get("isMuted")) _session.setVolume({ volume: 0 });

      } catch (err) {
        callbacks.onTypingStop();
        callbacks.onError(err.message);
      }
    }

    async function end() {
      if (_session) {
        await _session.endSession();
        _session = null;
      }
    }

    function setVolume(vol) {
      if (_session) _session.setVolume({ volume: vol });
    }

    function isActive() { return _session !== null; }

    function getOutputFreqData() {
      if (!_session) return null;
      try { return _session.getOutputByteFrequencyData(); } catch { return null; }
    }

    return { start, end, setVolume, isActive, getOutputFreqData };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: TextChat — stateless text-based chat via backend /api/chat.
  // Generic: works with any dashboard — context comes from PageScraper, not
  // from any dashboard-specific code. History is kept per session for multi-turn.
  // ════════════════════════════════════════════════════════════════════════════
  const TextChat = (() => {
    // Rolling conversation history — [{role, content}].
    // Capped at 20 entries (10 turns) to keep context window sane.
    let _history = [];

    async function send(message, callbacks, model) {
      callbacks.onTypingStart();

      const content = PageScraper.scrapePageText();
      const extra   = await PageScraper.collectExtra();

      try {
        const body = {
          message,
          history: _history.slice(-20),
          url:     window.location.href,
          title:   document.title,
          content: content.slice(0, 4000),
          extra,
        };
        if (model) body.model = model;

        const res = await fetch(`${Config.BACKEND}/api/chat`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Chat failed (${res.status})`);
        }

        const data  = await res.json();
        const reply = data.reply || "";

        // Maintain rolling history for multi-turn context.
        _history.push({ role: "user",      content: message });
        _history.push({ role: "assistant", content: reply   });
        if (_history.length > 20) _history = _history.slice(-20);

        callbacks.onTypingStop();
        callbacks.onMessage("assistant", reply);

      } catch (err) {
        callbacks.onTypingStop();
        callbacks.onError(err.message || String(err));
      }
    }

    // Called when switching away from text mode — clears turn history.
    function reset() { _history = []; }

    return { send, reset };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // MODULE: App — orchestrates all modules, manages DOM refs, exposes public API
  // ════════════════════════════════════════════════════════════════════════════
  const App = (() => {
    let _refs       = {};
    let _avatarMode = "none";   // "photo" | "three" | "none"

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
      const built = DOMBuilder.build();
      _refs = built.refs;

      // Wire real ElevenLabs output audio into the photo-mode lip sync engine
      LipSyncEngine.setAudioSource(Conversation.getOutputFreqData);

      _wireEvents();
      _syncStateToDOM();

      // Fetch config + avatar list in parallel (both non-fatal)
      const [cfg, avatars] = await Promise.all([
        TokenService.fetchPublicConfig().catch(() => null),
        TokenService.fetchAvatars().catch(() => []),
      ]);

      if (cfg && cfg.agent_name && !Config.DISPLAY_NAME) {
        State.set("agentName", cfg.agent_name);
        _refs.agentName.textContent = cfg.agent_name;
      }
      if (cfg && !cfg.ready) {
        _addMessage("system", "Backend not ready — check server setup.");
      }

      // Populate model picker if text chat is enabled and models are returned.
      if (cfg && cfg.chat_enabled && cfg.chat_models && cfg.chat_models.length > 0) {
        _populateModelSelector(cfg.chat_models, cfg.chat_default_model);
      }

      _populateAvatarSelector(avatars);
    }

    // ── Avatar selector ───────────────────────────────────────────────────────
    let _availableAvatars = [];

    function _populateAvatarSelector(avatars) {
      _availableAvatars = avatars;
      if (!avatars.length || !_refs.selector) return;

      // Build <option> elements
      _refs.selector.innerHTML = "";
      avatars.forEach(av => {
        const opt       = document.createElement("option");
        opt.value       = av.url;
        opt.textContent = av.label;
        _refs.selector.appendChild(opt);
      });

      // Pre-select if data-avatar-image matches one of the list
      if (Config.AVATAR_IMAGE) {
        const match = avatars.find(a => a.url === Config.AVATAR_IMAGE);
        if (match) _refs.selector.value = match.url;
      }

      // Show the selector row
      _refs.selectorRow.classList.remove("hidden");

      // On change → switch portrait instantly
      _refs.selector.addEventListener("change", () => {
        const url = _refs.selector.value;
        if (_avatarMode === "photo") {
          PhotoAvatar.switchImage(_refs.photoBg, url);
        } else if (_avatarMode === "none") {
          // Avatar not yet initialised — will pick up the selection on first open
        }
      });
    }

    // ── Model selector (text chat) ────────────────────────────────────────────
    let _chatModels = [];

    function _populateModelSelector(models, defaultModel) {
      _chatModels = models;
      if (!_refs.modelSelect || models.length === 0) return;

      _refs.modelSelect.innerHTML = "";
      models.forEach(id => {
        const opt       = document.createElement("option");
        opt.value       = id;
        opt.textContent = _formatModelLabel(id);
        _refs.modelSelect.appendChild(opt);
      });

      // Honour data-chat-model override → backend default → first in list.
      const preferred = Config.DEFAULT_CHAT_MODEL || defaultModel || models[0];
      if (preferred && models.includes(preferred)) {
        _refs.modelSelect.value = preferred;
      }
    }

    // Turns "nvidia/nemotron-3-ultra-550b-a55b:free" → "Nemotron Ultra 550B"
    function _formatModelLabel(id) {
      const base = id.replace(/:free$/, "").split("/").pop() || id;
      return base
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\b(\d+[bBmM])\b/gi, s => s.toUpperCase());
    }

    // ── Event wiring ──────────────────────────────────────────────────────────
    function _wireEvents() {
      // Tab toggles the panel open/closed
      _refs.tab.addEventListener("click", () => _setOpen(!State.get("isOpen")));

      // Avatar zone click → start voice conversation (only in voice mode)
      _refs.zone.addEventListener("click", () => {
        if (State.get("inputMode") === "voice") _handleMicClick();
      });

      // Mic/call button
      _refs.callBtn.addEventListener("click", (e) => { e.stopPropagation(); _handleMicClick(); });

      // Mode toggle (voice ↔ text) — only rendered when CHAT_ENABLED
      if (_refs.modeBtn) {
        _refs.modeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _setInputMode(State.get("inputMode") === "voice" ? "text" : "voice");
        });
      }

      // Send button (text mode)
      if (_refs.sendBtn) {
        _refs.sendBtn.addEventListener("click", (e) => { e.stopPropagation(); _handleSend(); });
      }

      // Mute
      _refs.muteBtn.addEventListener("click", (e) => { e.stopPropagation(); _toggleMute(); });

      // Text input: Enter sends in text mode, otherwise passthrough
      _refs.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); _handleSend(); }
      });
      _refs.input.addEventListener("click", (e) => e.stopPropagation());

      // State → DOM reactivity
      State.on("mode",      _applyMode);
      State.on("isOpen",    _applyOpen);
      State.on("inputMode", _applyInputMode);
      State.on("agentName", (n) => { if (_refs.agentName) _refs.agentName.textContent = n; });
    }

    // ── Open / close ──────────────────────────────────────────────────────────
    function _setOpen(val) {
      State.set("isOpen", val);
      if (val && _avatarMode === "none") {
        setTimeout(_initAvatar, 80);
      }
    }

    function _applyOpen(isOpen) {
      _refs.wrapper.classList.toggle("collapsed", !isOpen);
    }

    // ── Input mode (voice / text) ─────────────────────────────────────────────
    function _setInputMode(mode) {
      // If switching away from voice while a call is active, end it first.
      if (mode === "text" && Conversation.isActive()) {
        Conversation.end().then(() => {
          State.set("mode", "idle");
          State.set("inputMode", "text");
        });
        return;
      }
      if (mode === "voice") TextChat.reset();
      State.set("inputMode", mode);
    }

    function _applyInputMode(mode) {
      const isText = mode === "text";

      // Toggle which action button is visible
      if (_refs.callBtn)  _refs.callBtn.style.display  = isText ? "none" : "";
      if (_refs.muteBtn)  _refs.muteBtn.style.display  = isText ? "none" : "";
      if (_refs.sendBtn)  _refs.sendBtn.classList.toggle("visible", isText);

      // Show model picker only in text mode when models are available
      if (_refs.modelRow) {
        _refs.modelRow.classList.toggle("hidden", !isText || _chatModels.length < 1);
      }

      // Update mode-toggle button icon and active state
      if (_refs.modeBtn) {
        _refs.modeBtn.classList.toggle("text-active", isText);
      }
      if (_refs.modeIconText)  _refs.modeIconText.style.display  = isText ? "none" : "";
      if (_refs.modeIconVoice) _refs.modeIconVoice.style.display = isText ? ""     : "none";

      // Placeholder reflects current mode
      if (_refs.input) {
        _refs.input.placeholder = isText ? "Type your message…" : "Ask anything…";
      }

      // Status label when idle reflects mode
      if (State.get("mode") === "idle") {
        const label = isText ? Config.STATUS_LABELS["text-idle"] : Config.STATUS_LABELS["idle"];
        if (_refs.status) {
          _refs.status.textContent = label;
          _refs.status.className   = "av-status-label";
        }
        if (_refs.hint) _refs.hint.style.display = isText ? "none" : "";
      }
    }

    // ── Avatar initialisation ─────────────────────────────────────────────────
    async function _initAvatar() {
      const zone   = _refs.zone;
      const canvas = _refs.canvas;
      const W      = zone.clientWidth  || 340;
      const H      = zone.clientHeight || 240;

      // Priority: dropdown selection → data-avatar-image → first from API list → Three.js fallback
      const selectedUrl  = _refs.selector && _refs.selector.value ? _refs.selector.value : null;
      const photoUrl     = selectedUrl || Config.AVATAR_IMAGE || (_availableAvatars[0] && _availableAvatars[0].url) || null;

      if (photoUrl && !Config.AVATAR_URL) {
        // Photo mode — canvas is a transparent overlay for speaking effects
        canvas.width  = W;
        canvas.height = H;
        await PhotoAvatar.init(canvas, _refs.photoBg, photoUrl);

        // Sync selector to the chosen URL if it wasn't already
        if (_refs.selector && _refs.selector.value !== photoUrl) {
          _refs.selector.value = photoUrl;
        }

        LipSyncEngine.start();
        _avatarMode = "photo";
        _refs.loading.classList.add("hidden");

      } else {
        // Three.js mode (VRM, RPM GLB, or procedural face)
        canvas.width  = W;
        canvas.height = H;
        await ThreeAvatar.init(canvas);
        LipSyncEngine.start();   // feeds real ElevenLabs audio into State.lipAmp
        _avatarMode = "three";
        if (ThreeAvatar.isReady()) {
          _refs.loading.classList.add("hidden");
        }
      }
    }

    // ── Mode state machine ─────────────────────────────────────────────────────
    function _applyMode(mode) {
      // Status dot (both header and tab)
      [_refs.headerDot, _refs.tabDot].forEach(dot => {
        if (dot) dot.className = `av-header-dot ${mode}`;
      });
      if (_refs.tabDot) _refs.tabDot.className = `av-tab-dot ${mode}`;

      // Wave bars
      const waveActive = mode === "listening" || mode === "speaking";
      if (_refs.wave) _refs.wave.className = `av-wave${waveActive ? " active" : ""}`;

      // Status label
      if (_refs.status) {
        _refs.status.textContent = Config.STATUS_LABELS[mode] || mode;
        _refs.status.className   = `av-status-label${mode !== "idle" ? " active" : ""}`;
      }

      // Hint text
      if (_refs.hint) _refs.hint.style.display = mode === "idle" ? "" : "none";

      // Call button
      if (_refs.callBtn) _refs.callBtn.classList.toggle("active", Conversation.isActive());

      // Photo background class
      if (_refs.photoBg) _refs.photoBg.classList.toggle("speaking", mode === "speaking");
    }

    function _syncStateToDOM() {
      _applyMode(State.get("mode"));
      _applyOpen(State.get("isOpen"));
      _applyInputMode(State.get("inputMode"));
    }

    // ── Conversation callbacks ────────────────────────────────────────────────
    function _handleMicClick() {
      if (!State.get("isOpen")) _setOpen(true);

      if (Conversation.isActive()) {
        Conversation.end().then(() => State.set("mode", "idle"));
      } else {
        Conversation.start({
          onConnecting: () => State.set("mode", "connecting"),
          onConnect:    () => State.set("mode", "listening"),
          onDisconnect: () => {
            State.set("mode", "idle");
            _addMessage("system", "Conversation ended.");
            if (_refs.callBtn) _refs.callBtn.classList.remove("active");
            if (_refs.hint)    _refs.hint.style.display = "";
          },
          onMode: (m) => State.set("mode", m),
          onMessage: (role, text) => _addMessage(role, text),
          onError: (msg) => {
            State.set("mode", "idle");
            _addMessage("system", `Error: ${msg}`);
          },
          onTypingStart: () => _showTyping(),
          onTypingStop:  () => _hideTyping(),
        });
      }
    }

    async function _handleSend() {
      const text = _refs.input.value.trim();
      if (!text) return;
      _refs.input.value = "";

      if (!State.get("isOpen")) _setOpen(true);

      if (State.get("inputMode") === "text") {
        _addMessage("user", text);
        State.set("mode", "thinking");
        const selectedModel = (_refs.modelSelect && _refs.modelSelect.value) || null;
        await TextChat.send(text, {
          onTypingStart: () => _showTyping(),
          onTypingStop:  () => _hideTyping(),
          onMessage: (_role, reply) => {
            _addMessage("assistant", reply);
            State.set("mode", "idle");
            // Keep status label contextual for text mode
            if (_refs.status) {
              _refs.status.textContent = Config.STATUS_LABELS["text-idle"];
              _refs.status.className   = "av-status-label";
            }
            if (_refs.hint) _refs.hint.style.display = "none";
          },
          onError: (msg) => {
            State.set("mode", "idle");
            _addMessage("system", `Error: ${msg}`);
          },
        }, selectedModel);
      } else {
        // Voice mode — text input starts the voice session if not already active
        _addMessage("user", text);
        if (!Conversation.isActive()) {
          _addMessage("system", "Starting voice session…");
          _handleMicClick();
        }
      }
    }

    function _toggleMute() {
      const muted = !State.get("isMuted");
      State.set("isMuted", muted);
      _refs.muteBtn.classList.toggle("muted", muted);
      Conversation.setVolume(muted ? 0 : 1);
    }

    // ── Transcript helpers ─────────────────────────────────────────────────────
    function _addMessage(role, text) {
      const el = document.createElement("div");
      el.className = `av-msg ${role}`;
      el.textContent = text;
      _refs.transcript.appendChild(el);
      _refs.transcript.scrollTop = _refs.transcript.scrollHeight;
    }

    function _showTyping() {
      if (_refs.transcript.querySelector("#av-typing")) return;
      const el = document.createElement("div");
      el.className = "av-typing";
      el.id        = "av-typing";
      el.innerHTML = "<span></span><span></span><span></span>";
      _refs.transcript.appendChild(el);
      _refs.transcript.scrollTop = _refs.transcript.scrollHeight;
    }

    function _hideTyping() {
      const el = _refs.transcript.querySelector("#av-typing");
      if (el) el.remove();
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    return {
      init,
      open:    () => _setOpen(true),
      close:   () => _setOpen(false),
      toggle:  () => _setOpen(!State.get("isOpen")),
      setMode: (mode) => _setInputMode(mode),  // "voice" | "text"
    };
  })();

  // ════════════════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════════════════
  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Public window API
  // ════════════════════════════════════════════════════════════════════════════
  window.AiAvatar = {
    registerSource: (name, getFn)   => PageScraper.registerSource(name, getFn),
    pushContext:    (key, value)    => window.dispatchEvent(
      new CustomEvent("ai-avatar:context-push", { detail: { [key]: value } })
    ),
    open:    () => App.open(),
    close:   () => App.close(),
    toggle:  () => App.toggle(),
    // Switch input mode programmatically — useful for dashboards that want to
    // control whether users see voice or text by default.
    // "voice" | "text"
    setMode: (mode) => App.setMode(mode),
  };

  // ════════════════════════════════════════════════════════════════════════════
  // Bootstrap
  // ════════════════════════════════════════════════════════════════════════════
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => App.init());
  } else {
    App.init();
  }

})();
