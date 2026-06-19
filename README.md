# AI Avatar Plugin

A standalone, embeddable AI voice assistant powered by ElevenLabs.
Drop one `<script>` tag into **any** web app — it reads the page, answers questions by voice.

## Architecture

```
Browser (any app)
  └─ <script src="http://your-server/widget.js"> ──► Floating robot widget
        │  1. reads page text + registered data sources
        │  2. POST /api/token → backend
        │
Python Backend (FastAPI)
  └─ /api/token ──► ElevenLabs API → WebRTC token
        │           (page context injected as dynamic variable)
        │
ElevenLabs Cloud
  └─ STT (Scribe Realtime) → LLM (Gemini 2.5 Flash) → TTS (Flash v2.5)
        ↕ WebRTC audio
Browser (ElevenLabs client SDK)
```

## Setup

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure .env

```bash
cp .env.example .env
# Edit .env and add your ELEVENLABS_API_KEY
```

### 3. Create the ElevenLabs agent (run once)

```bash
cd backend
python setup_agent.py --name "Trading Assistant" --voice rachel
```

This creates the agent on ElevenLabs and saves the `ELEVENLABS_AGENT_ID` to `.env`.

Optional flags:
- `--name "My App Assistant"` — display name
- `--voice rachel|bella|domi|josh|arnold|adam|sam` — voice choice
- `--first-message "Hi! What can I help you with?"` — greeting

### 4. Start the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 5. Embed in any page

```html
<script
  src="http://localhost:8000/widget.js"
  data-backend-url="http://localhost:8000"
  data-position="bottom-right"
  data-name="My Assistant">
</script>
```

That's it. The robot avatar appears — click it to start a voice conversation.

---

## How page context works

When the user opens a conversation, the widget:
1. Scrapes all visible text from the current page
2. Calls any registered data sources (see below)
3. POSTs everything to `/api/token`
4. Backend injects it as `{{page_context}}` dynamic variable in the agent's system prompt
5. ElevenLabs uses it for that session

The agent therefore knows what the user is looking at **without any LLM fine-tuning**.

---

## Registering custom data sources

```javascript
// Add after the widget script tag
window.AiAvatar.registerSource('myData', function() {
  return {
    user: currentUser,
    balance: getBalance(),
    openTrades: getOpenTrades(),
  };
});
```

The function can return a value or a Promise.

---

## API

### `GET /api/config`
Returns `{ agent_name, ready }`.

### `POST /api/token`
Body: `{ url, title, content, extra }`
Returns: `{ token, dynamic_variables }`

### `GET /api/admin/config`
Returns full config including whether API key is set.

### `PUT /api/admin/config`
Update `agent_name`, `agent_id`, `agent_first_message`, `max_context_chars`.

---

## Widget script attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-backend-url` | `http://localhost:8000` | URL of the Python backend |
| `data-position` | `bottom-right` | `bottom-right \| bottom-left \| top-right \| top-left` |
| `data-name` | Agent name from config | Override the display name |

---

## Demo

Open `examples/demo.html` in a browser (with the backend running) to see a demo trading dashboard with the widget embedded.
