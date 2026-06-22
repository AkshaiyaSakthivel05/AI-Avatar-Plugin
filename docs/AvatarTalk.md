LiveKit docs › Models › Virtual avatar › LiveAvatar

---

# LiveAvatar virtual avatar integration guide

> How to use the LiveAvatar virtual avatar plugin for LiveKit Agents.

Available in:
- [ ] Node.js
- [x] Python

## Overview

[LiveAvatar](https://www.liveavatar.com/) by [HeyGen](https://www.heygen.com/) provides dynamic real-time avatars that naturally interact with users. You can use the open source LiveAvatar integration for LiveKit Agents to add virtual avatars to your voice AI app.

### Installation

Install the plugin from PyPI:

```shell
uv add "livekit-agents[liveavatar]~=1.5"

```

### Authentication

The LiveAvatar plugin requires a [LiveAvatar API key](https://docs.liveavatar.com/docs/api-key-configuration).

Set `LIVEAVATAR_API_KEY` in your `.env` file.

### Avatar setup

The LiveAvatar plugin requires an avatar ID, which can either be set as the `LIVEAVATAR_AVATAR_ID` environment variable or passed in the avatar session. You can choose either a public avatar or create your own on the LiveAvatar [dashboard](https://app.liveavatar.com/home).

Select an avatar ID for the following steps.

### Usage

Use the plugin in an `AgentSession`. For example, you can use this avatar in the [Voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai.md).

```python
from livekit import agents
from livekit.agents import AgentServer, AgentSession
from livekit.plugins import liveavatar

server = AgentServer()

@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: agents.JobContext):
   session = AgentSession(
      # ... stt, llm, tts, etc.
   )

   avatar = liveavatar.AvatarSession(
      avatar_id="...",  # ID of the LiveAvatar avatar to use
   )

   # Start the avatar and wait for it to join
   await avatar.start(session, room=ctx.room)

   # Start your agent session with the user
   await session.start(
      # ... room, agent, room_options, etc....
   )

```

Preview the avatar in the [Agent Console](https://docs.livekit.io/agents/start/console.md) or a frontend [starter app](https://docs.livekit.io/agents/start/frontend.md#starter-apps) that you build.

### Parameters

This section describes some of the available parameters. See the [plugin reference](https://docs.livekit.io/reference/python/livekit/plugins/liveavatar/index.html.md#livekit.plugins.liveavatar.AvatarSession) for a complete list of all available parameters.

- **`avatar_id`** _(string)_: ID of the LiveAvatar avatar to use. See [Avatar setup](#avatar) for details.

- **`video_quality`** _(string | Literal['very_high', 'high', 'medium', 'low'])_ (optional): Quality of the avatar video stream. Lower values reduce bandwidth.

## Additional resources

The following resources provide more information about using LiveAvatar with LiveKit Agents.

- **[Python package](https://pypi.org/project/livekit-plugins-liveavatar/)**: The `livekit-plugins-liveavatar` package on PyPI.

- **[Plugin reference](https://docs.livekit.io/reference/python/livekit/plugins/liveavatar/index.html.md)**: Reference for the LiveAvatar avatar plugin.

- **[GitHub repo](https://github.com/livekit/agents/tree/main/livekit-plugins/livekit-plugins-liveavatar)**: View the source or contribute to the LiveKit LiveAvatar avatar plugin.

- **[LiveAvatar docs](https://docs.liveavatar.com/)**: LiveAvatar's full docs site.

- **[Agent Console](https://docs.livekit.io/agents/start/console.md)**: A virtual workbench to test your avatar agent.

- **[Frontend starter apps](https://docs.livekit.io/agents/start/frontend.md#starter-apps)**: Ready-to-use frontend apps with avatar support.

---

This document was rendered at 2026-06-17T11:37:06.344Z.
For the latest version of this document, see [https://docs.livekit.io/agents/models/avatar/plugins/liveavatar.md](https://docs.livekit.io/agents/models/avatar/plugins/liveavatar.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).






LiveKit docs › Models › Virtual avatar › AvatarTalk

---

# AvatarTalk Realtime Avatar integration guide

> How to use the AvatarTalk virtual avatar plugin for LiveKit Agents.

Available in:
- [ ] Node.js
- [x] Python

## Overview

[AvatarTalk's](https://avatartalk.ai/) Realtime Avatars let you create your own avatar that can participate in live, interactive conversations. You can use the open-source AvatarTalk integration for LiveKit Agents in your voice AI app.

## Quick reference

This section includes a basic usage example and some reference material. For links to more detailed documentation, see [Additional resources](#additional-resources).

### Installation

Install the plugin from PyPI:

```shell
uv add "livekit-plugins-avatartalk~=1.5"

```

### Authentication

The AvatarTalk plugin requires a [AvatarTalk API key](https://avatartalk.ai/users/register).

Set `AVATARTALK_API_KEY` in your `.env` file.

### Avatar setup

The AvatarTalk plugin accepts an avatar ID, which can either be set as the `AVATARTALK_AVATAR` environment variable or as the `avatar` argument in the avatar session. You can choose an avatar on the AvatarTalk [dashboard](https://avatartalk.ai/dashboard/).

You may also set the avatar's emotion, which can be set either as the `AVATARTALK_EMOTION` environment variable or as the `emotion` argument passed to the `AvatarSession`.

### Usage

Use the plugin in an `AgentSession`. For example, you can use this avatar in the [Voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai.md).

```python
from livekit import agents
from livekit.agents import AgentServer, AgentSession
from livekit.plugins import avatartalk

server = AgentServer()

@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: agents.JobContext):
   session = AgentSession(
      # ... stt, llm, tts, etc.
   )

   avatar = avatartalkAvatarSession(
      avatar="...",  # ID of the AvatarTalk avatar to use. See "Avatar setup" for details.
   )

   # Start the avatar and wait for it to join
   await avatar.start(session, room=ctx.room)

   # Start your agent session with the user
   await session.start(
      # ... room, agent, room_options, etc....
   )

```

Preview the avatar in the [Agent Console](https://docs.livekit.io/agents/start/console.md) or a frontend [starter app](https://docs.livekit.io/agents/start/frontend.md#starter-apps) that you build.

### Parameters

This section describes some of the available parameters. See the [plugin reference](https://docs.livekit.io/reference/python/livekit/plugins/avatartalk/index.html.md#livekit.plugins.avatartalk.AvatarSession) for a complete list of all available parameters.

- **`avatar`** _(string)_ (optional) - Default: `japanese_man`: ID of the AvatarTalk avatar to use. See [Avatar setup](#avatar) for details.

- **`emotion`** _(string)_ (optional) - Default: `expressive`: The avatar's emotion for the session. See [Avatar setup](#avatar) for details.

- **`avatar_participant_name`** _(string)_ (optional) - Default: `avatartalk-agent`: The name of the participant to use for the avatar.

## Additional resources

The following resources provide more information about using AvatarTalk with LiveKit Agents.

- **[Python package](https://pypi.org/project/livekit-plugins-avatartalk/)**: The `livekit-plugins-avatartalk` package on PyPI.

- **[Plugin reference](https://docs.livekit.io/reference/python/livekit/plugins/avatartalk/index.html.md)**: Reference for the AvatarTalk avatar plugin.

- **[GitHub repo](https://github.com/livekit/agents/tree/main/livekit-plugins/livekit-plugins-avatartalk)**: View the source or contribute to the LiveKit AvatarTalk avatar plugin.

- **[AvatarTalk API docs](https://github.com/avatartalk-ai/avatartalk-examples/blob/main/API.md)**: AvatarTalk's API docs.

- **[Agent Console](https://docs.livekit.io/agents/start/console.md)**: A virtual workbench to test your avatar agent.

- **[Frontend starter apps](https://docs.livekit.io/agents/start/frontend.md#starter-apps)**: Ready-to-use frontend apps with avatar support.

---

This document was rendered at 2026-06-17T11:37:50.994Z.
For the latest version of this document, see [https://docs.livekit.io/agents/models/avatar/plugins/avatartalk.md](https://docs.livekit.io/agents/models/avatar/plugins/avatartalk.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).



# AvatarTalk API Documentation

## Base URL

`https://api.avatartalk.ai`

## Table of Contents

- [Base URL](#base-url)
- [Authentication](#authentication)
- [POST /inference](#post-inference)
- [WebSocket /ws/infer](#websocket-wsinfer)
- [WebSocket /ws/continuous](#websocket-wscontinuous)
- [LiveKit Session Management](#livekit-session-management)
  - [Create LiveKit Session](#create-livekit-session)
  - [Delete LiveKit Session](#delete-livekit-session)
- [Lightning Network Payment Endpoints](#lightning-network-payment-endpoints)
  - [Payment Flow Overview](#payment-flow-overview)
  - [POST /lightning/request-video/text](#post-lightningrequest-video-text)
  - [POST /lightning/request-video/audio](#post-lightningrequest-video-audio)
  - [POST /lightning/generate-video](#post-lightninggenerate-video)
  - [GET /lightning/payment/{invoice}](#get-lightningpaymentinvoice)
  - [GET /lightning/payments](#get-lightningpayments)
  - [Lightning Payment Example Workflow](#lightning-payment-example-workflow)
- [Error Responses](#error-responses)
- [Costs](#costs)
  - [Standard API Endpoints](#standard-api-endpoints)
  - [Lightning Network Payments](#lightning-network-payments)

## Authentication

Include your API key in the Authorization header:

```
Authorization: Bearer {your_api_key}
```

## POST /inference

Generate avatar videos with text-to-speech synthesis.

### Endpoints

- **Regular Request**: `POST https://api.avatartalk.ai/inference`
  - Returns JSON with video URLs
- **Streaming Request**: `POST https://api.avatartalk.ai/inference?stream=true`
  - Returns MP4 video data in real-time
- **Video Viewer**: `GET https://api.avatartalk.ai/inference/:id/video.html`
  - Displays video in browser

### Request Parameters

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| `text` | string | Yes | Text to be spoken by the avatar | Any text string |
| `avatar` | string | Yes | Avatar character to use | See [Avatar Options](#avatar-options) |
| `emotion` | string | Yes | Emotional expression for the avatar | `"happy"`, `"neutral"`, `"serious"` |
| `language` | string | No | Language for speech synthesis (defaults to `"en"`) | See [Language Options](#language-options) |
| `stream` | string | No | Enable streaming mode (query parameter) | `"true"` for streaming, omit for regular response |
| `delayed` | string/boolean | No | Enable delayed execution mode | `"true"` or `true` for delayed, omit for immediate execution |

#### Avatar Options

- `"japanese_man"` - Japanese Man
- `"old_european_woman"` - Elderly Woman
- `"european_woman"` - European Woman
- `"european_man"` - European Man
- `"african_man"` - African Man
- `"african_woman"` - African Woman
- `"japanese_woman"` - Japanese Woman
- `"iranian_man"` - Iranian Man
- `"mexican_man"` - Mexican Man
- `"mexican_woman"` - Mexican Woman
- `"colombian_woman"` - Colombian Woman
- `"old_japanese_man"` - Elderly Japanese Man
- `"arab_man"` - Arab Man
- `"arab_woman"` - Arab Woman

#### Language Options

- `"en"` - English
- `"es"` - Spanish
- `"fr"` - French
- `"de"` - German
- `"it"` - Italian
- `"pt"` - Portuguese
- `"pl"` - Polish
- `"tr"` - Turkish
- `"ru"` - Russian
- `"nl"` - Dutch
- `"cs"` - Czech
- `"ar"` - Arabic
- `"zh"` - Chinese
- `"ja"` - Japanese
- `"hu"` - Hungarian
- `"ko"` - Korean
- `"hi"` - Hindi

### Response Formats

#### Regular Request (JSON Response)

Returns JSON with inference details and video URLs:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "success",
  "stream": false,
  "text": "Hello, this is a test message",
  "created_at": "2025-09-29T11:50:26.890669Z",
  "language": "en",
  "credits_consumed": 5,
  "avatar": "black_man",
  "emotion": "neutral",
  "file_size_bytes": 2048576,
  "inference_duration_ms": 3500,
  "video_duration_seconds": 4.2,
  "html_url": "https://api.avatartalk.ai/inference/123e4567-e89b-12d3-a456-426614174000/video.html",
  "mp4_url": "https://api.avatartalk.ai/inference/123e4567-e89b-12d3-a456-426614174000/video.mp4"
}
```

#### Delayed Request (JSON Response)

Returns JSON with pending status and trigger URLs:

```json
{
  "id": "456e7890-f12c-34d5-b678-901234567890",
  "status": "delayed",
  "stream": false,
  "text": "Hello! This video will be generated when accessed.",
  "created_at": "2025-09-29T11:50:26.890829Z",
  "language": "en",
  "credits_consumed": 0,
  "avatar": "black_man",
  "emotion": "neutral",
  "file_size_bytes": null,
  "inference_duration_ms": null,
  "video_duration_seconds": null,
  "html_url": "https://api.avatartalk.ai/inference/456e7890-f12c-34d5-b678-901234567890/video.html",
  "mp4_url": "https://api.avatartalk.ai/inference/456e7890-f12c-34d5-b678-901234567890/video.mp4"
}
```

**Note**: Both `mp4_url` and `html_url` are trigger URLs - accessing either will generate the video and consume credits.

#### Streaming Request (Binary Response)

Returns chunked MP4 video data as it's generated:

**Headers**:
```
Content-Type: video/mp4
Transfer-Encoding: chunked
Content-Disposition: attachment; filename="video.mp4"
Cache-Control: no-cache
```

**Body**: Raw MP4 video data streamed in real-time

## WebSocket /ws/infer

Real-time bidirectional streaming for avatar inference with support for audio and video input/output.

### Endpoint

```
wss://api.avatartalk.ai/ws/infer
```

### Query Parameters

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| `output_type` | string | Yes | Output format type | `"livekit"`, `"file"`, `"rtmp"` |
| `input_type` | string | Yes | Input format type | `"audio"`, `"text"` |
| `avatar` | string | Yes | Avatar character to use | See [Avatar Options](#avatar-options) |
| `stream_id` | string | No | Unique stream identifier (auto-generated if not provided) | UUID string |
| `emotion` | string | No | Emotional expression (defaults to `"neutral"`) | `"happy"`, `"neutral"`, `"serious"`, `"expressive"` |
| `language` | string | No | Language for speech synthesis | See [Language Options](#language-options) |
| `meeting_token` | string | No | Token for LiveKit meeting authentication | Valid LiveKit token |
| `as_agent` | boolean | No | Run as agent mode (defaults to `false`) | `true`, `false` |
| `increase_resolution` | boolean | No | Enable higher resolution output (defaults to `false`) | `true`, `false` |
| `rtmp_url` | string | No | RTMP streaming URL for output | Valid RTMP URL |

### Authentication

Use one of the following methods:

**Bearer Token (Standard)**:
```
Authorization: Bearer {your_api_key}
```

### Connection Flow

1. **Connect**: Establish WebSocket connection with required query parameters
2. **Authenticate**: Connection validates API key and authorization
3. **Stream Data**: Send and receive data based on `input_type` and `output_type`
4. **Close**: Connection terminates when streaming completes or on error

### Input/Output Types

#### Input Types

- **`text`**: Send text messages for the avatar to speak
- **`audio`**: Stream audio data for processing

#### Output Types

- **`audio`**: Receive audio output only
- **`video`**: Receive video with synchronized audio
- **`livekit`**: Stream output to LiveKit room

### WebSocket Messages

#### Sending Data (Client → Server)

Send binary audio data or JSON text messages based on `input_type`:

**Text Input**:
```json
{
  "text": "Hello, this is what the avatar should say"
}
```

**Audio Input**: Send raw binary audio data in chunks

#### Receiving Data (Server → Client)

Receive binary video/audio data or JSON status messages based on `output_type`.

### Error Handling

WebSocket will close with specific error codes:

| Code | Reason | Description |
|------|--------|-------------|
| 1008 | Invalid API key | The provided API key is invalid or missing |
| 1008 | Insufficient credits | Account does not have enough video time |
| 1008 | Authorization failed | Authorization validation failed |
| 1011 | Processing error | Internal server error during inference |

### Example Usage

```javascript
const ws = new WebSocket(
  'wss://api.avatartalk.ai/ws/infer?' +
  'output_type=file&' +
  'input_type=text&' +
  'avatar=european_woman&' +
  'emotion=happy&' +
  'language=en'
);

ws.addEventListener('open', () => {
  // Send text for the avatar to speak
  ws.send(JSON.stringify({
    text: "Hello! Welcome to AvatarTalk."
  }));
});

ws.addEventListener('message', (event) => {
  // Receive video/audio data
  const videoData = event.data;
  // Process received data
});

ws.addEventListener('close', (event) => {
  console.log('Connection closed:', event.code, event.reason);
});
```

## WebSocket /ws/continuous

Persistent, low-latency video streaming with smooth transitions between silence and speech. Ideal for real-time conversational applications with automatic turn-taking.

### Endpoint

```
wss://api.avatartalk.ai/ws/continuous
```

### Query Parameters

| Parameter | Type | Required | Description | Valid Values |
|-----------|------|----------|-------------|--------------|
| `avatar` | string | Yes | Avatar character to use | Currently only available for `"mexican_woman"`. Other avatars can be requested. See [Avatar Options](#avatar-options) |
| `expression` | string | No | Initial expression (defaults to `"neutral"`) | `"happy"`, `"neutral"`, `"serious"` |
| `language` | string | No | Language code (defaults to `"en"`) | Currently only `"en"` supported |

**Note**: .

### Authentication

Authentication methods:

**Bearer Token**:
```
Authorization: Bearer {your_api_key}
```

### Protocol

The continuous streaming endpoint uses a unified WebSocket for both control messages and video data:

- **Client → Server (Text frames)**: JSON control messages
- **Server → Client (Text frames)**: JSON responses
- **Server → Client (Binary frames)**: MP4 video chunks

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `session_start` | Client → Server | Initialize streaming session |
| `text_input` | Client → Server | Send text to synthesize |
| `text_append` | Client → Server | Append text to ongoing generation |
| `turn_start` | Client → Server | Trigger end-of-turn pregen segment |
| `session_ready` | Server → Client | Session successfully started |
| `state_change` | Server → Client | State machine transition |
| `ready_to_listen` | Server → Client | Client can enable microphone |

---

### Message Format

All messages use JSON envelope:
```json
{"type": "<message_type>", "data": {...}}
```

---

### Client → Server Messages

#### session_start

Initialize streaming session. **Must be sent first.**

```json
{
  "type": "session_start",
  "data": {
    "avatar_name": "mexican_woman",
    "expression": "neutral",
    "language": "en",
    "expressive_mode": false,
    "target_buffer_ms": 2000,
    "min_buffer_ms": 500,
    "max_buffer_ms": 5000
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `avatar_name` | string | **required** | Avatar identifier |
| `expression` | string | **required** | `happy`, `neutral`, `serious` |
| `language` | string | `"en"` | Language code |
| `expressive_mode` | bool | `false` | Dynamically change expressions|
| `target_buffer_ms` | int | `2000` | Target buffer level |
| `min_buffer_ms` | int | `500` | Minimum buffer |
| `max_buffer_ms` | int | `5000` | Maximum buffer |

---

#### text_input

Send text for speech generation.

```json
{
  "type": "text_input",
  "data": {
    "text": "Hello, how are you?",
    "expression": "happy",
    "mode": "dynamic_only"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `text` | string | **required** | Text to synthesize |
| `expression` | string | current | Change expression |
| `mode` | string | `"full"` | `"full"` or `"dynamic_only"` |

---

#### text_append

Append to ongoing generation (streaming LLM).

```json
{
  "type": "text_append",
  "data": {"text": "Additional sentence."}
}
```

---

#### text_stream_done

Signal text stream complete.

```json
{"type": "text_stream_done", "data": {}}
```

---

#### turn_start

Trigger End-of-Turn pregenerated segment.

```json
{
  "type": "turn_start",
  "data": {"expression": "neutral"}
}
```

---

#### buffer_status

Report client buffer level.

```json
{
  "type": "buffer_status",
  "data": {"buffered_ms": 1500, "playback_position": 10.5}
}
```

---

#### session_end

End session gracefully.

```json
{"type": "session_end", "data": {}}
```

---

### Server → Client Messages

#### session_ready

Session initialized.

```json
{
  "type": "session_ready",
  "data": {"session_id": "abc123", "initial_buffer_ms": 2000}
}
```

---

#### state_change

State transition.

```json
{
  "type": "state_change",
  "data": {"from": "silence", "to": "dynamic_speech", "timestamp": 1699123456.789}
}
```

**States:** `initial`, `silence`, `silence_to_pregen`, `pregen_video`, `pregen_to_dynamic`, `dynamic_speech`, `dynamic_to_silence`, `terminated`

---

#### ready_to_listen

Client can enable microphone.

```json
{"type": "ready_to_listen", "data": {"timestamp": 1699123456.789}}
```

---

#### text_queued / text_appended / text_stream_completed

Acknowledgments.

```json
{"type": "text_queued", "data": {"session_id": "abc123", "text_length": 45}}
{"type": "text_appended", "data": {"session_id": "abc123", "text_length": 25}}
{"type": "text_stream_completed", "data": {"session_id": "abc123"}}
```

---

#### buffer_warning

Buffer critical.

```json
{"type": "buffer_warning", "data": {"level": "critical", "buffer_ms": 200}}
```

---

#### billing_error

User out of credits.

```json
{
  "type": "billing_error",
  "data": {"session_id": "abc123", "message": "Insufficient credits", "error_code": "insufficient_credits"}
}
```

| Error Code | Description |
|------------|-------------|
| `insufficient_credits` | No credits remaining |
| `session_not_found` | Billing session not found |
| `billing_error` | Other billing error |

---

#### error

General error.

```json
{"type": "error", "data": {"message": "Session not found", "session_id": "abc123"}}
```

---

### Binary Frames

Binary WebSocket frames contain **fMP4 (fragmented MP4)** video chunks.

| Property | Value |
|----------|-------|
| Codec | H.264 |
| Container | fMP4 |
| Frame rate | 25 FPS |
| Resolution | 512×512 |
| Audio | AAC @ 48kHz |

---

## LiveKit Session Management

Manage real-time avatar sessions using LiveKit for video conferencing and interactive applications.

### Create LiveKit Session

Create a new LiveKit session with an avatar agent.

#### Endpoint

```
POST https://api.avatartalk.ai/livekit/create-session
```

#### Request Body

```json
{
  "room_name": "my-meeting-room",
  "room_token": "participant_token",
  "listener_token": "listener_token",
  "livekit_url": "wss://livekit.example.com",
  "avatar": "european_woman",
  "emotion": "neutral"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `room_name` | string | Yes | LiveKit room identifier |
| `room_token` | string | Yes | LiveKit participant token for the avatar |
| `listener_token` | string | Yes | LiveKit listener token for monitoring |
| `livekit_url` | string | Yes | WebSocket URL of LiveKit server |
| `avatar` | string | Yes | Avatar character to use (see [Avatar Options](#avatar-options)) |
| `emotion` | string | Yes | Avatar emotional expression (`"happy"`, `"neutral"`, `"serious"`, `"expressive"`) |

**Note**: If `emotion` is set to `"expressive"`, it will be automatically converted to `"neutral"` for the avatar.

#### Response

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `task_id` | string | Unique identifier for the session task (use this to delete the session) |

#### Example Request

```bash
curl -X POST https://api.avatartalk.ai/livekit/create-session \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "room_name": "demo-room",
    "room_token": "eyJhbGc...",
    "listener_token": "eyJhbGc...",
    "livekit_url": "wss://my-livekit.com",
    "avatar": "japanese_woman",
    "emotion": "happy"
  }'
```

### Delete LiveKit Session

Terminate an active LiveKit session.

#### Endpoint

```
DELETE https://api.avatartalk.ai/livekit/delete-session/{task_id}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | Yes | The task ID returned from session creation |

#### Response

**Success (200)**:
```json
{
  "status": "Task 550e8400-e29b-41d4-a716-446655440000 deleted successfully"
}
```

**Error (404)**:
```json
{
  "detail": "Task 550e8400-e29b-41d4-a716-446655440000 not found"
}
```

#### Example Request

```bash
curl -X DELETE https://api.avatartalk.ai/livekit/delete-session/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer your_api_key"
```

## Error Responses

All endpoints return standardized JSON error responses:

### 400 Bad Request - Invalid Parameters

```json
{
  "status": "error",
  "error_code": "INVALID_PARAMETERS",
  "message": "Request parameters are invalid",
  "details": {}
}
```

### 401 Unauthorized - Invalid API Key

```json
{
  "status": "error",
  "error_code": "INVALID_API_KEY",
  "message": "Invalid or missing API key"
}
```

### 403 Forbidden - Insufficient Credits

```json
{
  "status": "error",
  "error_code": "INSUFFICIENT_CREDITS",
  "message": "Insufficient video time to process request"
}
```

### 404 Not Found

```json
{
  "detail": "Resource not found"
}
```

### 500 Internal Server Error - Processing Failed

```json
{
  "status": "error",
  "error_code": "INFERENCE_FAILED",
  "message": "Inference processing failed"
}
```

## Lightning Network Payment Endpoints

Pay for avatar video generation using Bitcoin Lightning Network payments. This payment flow uses BOLT11 invoices.

### Payment Flow Overview

1. **Request Video**: Submit text or audio to `/lightning/request-video/text` or `/lightning/request-video/audio`
2. **Receive Invoice**: Get a BOLT11 invoice with the cost and duration estimate
3. **Pay Invoice**: Pay the BOLT11 invoice using your Lightning wallet
4. **Generate Video**: Call `/lightning/generate-video` with the invoice to retrieve your video

### POST /lightning/request-video/text

Create a video request from text and receive a Lightning invoice for payment.

#### Endpoint

```
POST https://api.avatartalk.ai/lightning/request-video/text
```

#### Request Body

```json
{
  "text": "Hello! This is the text that will be spoken by the avatar."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text content to be converted to speech |

#### Response

```json
{
  "duration": 4.5,
  "bolt11_invoice": "lnbc450n1p3...",
  "amount": 450
}
```

| Field | Type | Description |
|-------|------|-------------|
| `duration` | number | Estimated video duration in seconds |
| `bolt11_invoice` | string | Lightning Network BOLT11 invoice string |
| `amount` | integer | Payment amount in satoshis |

#### Example Request

```bash
curl -X POST https://api.avatartalk.ai/lightning/request-video/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to AvatarTalk! This is a demonstration of our text-to-speech technology."
  }'
```

### POST /lightning/request-video/audio

Create a video request from an audio file and receive a Lightning invoice for payment.

#### Endpoint

```
POST https://api.avatartalk.ai/lightning/request-video/audio
```

#### Request Parameters

Multipart form data with an audio file:

| Field | Type | Required | Description | Format |
|-------|------|----------|-------------|--------|
| `audio` | file | Yes | Audio file to be processed | WAV format, 16kHz, mono, 16-bit |

#### Audio File Requirements

- **Format**: WAV (`.wav`)
- **Sample Rate**: 16kHz
- **Channels**: Mono
- **Bit Depth**: 16-bit
- **Minimum Size**: 44 bytes (valid WAV header)

#### Response

```json
{
  "duration": 8.2,
  "bolt11_invoice": "lnbc820n1p3...",
  "amount": 820
}
```

| Field | Type | Description |
|-------|------|-------------|
| `duration` | number | Actual audio duration in seconds |
| `bolt11_invoice` | string | Lightning Network BOLT11 invoice string |
| `amount` | integer | Payment amount in satoshis |

#### Error Responses

**400 Bad Request - Missing File**:
```json
{
  "detail": "Audio file is required"
}
```

**400 Bad Request - Invalid Format**:
```json
{
  "detail": "Only WAV files are supported. Please upload a .wav file."
}
```

**400 Bad Request - Invalid WAV**:
```json
{
  "detail": "Invalid WAV file: too small"
}
```

#### Example Request

```bash
curl -X POST https://api.avatartalk.ai/lightning/request-video/audio \
  -F "audio=@speech.wav"
```

### POST /lightning/generate-video

Generate and retrieve the video after paying the Lightning invoice.

#### Endpoint

```
POST https://api.avatartalk.ai/lightning/generate-video
```

#### Request Body

```json
{
  "bolt11_invoice": "lnbc450n1p3...",
  "avatar": "european_woman",
  "emotion": "happy",
  "language": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bolt11_invoice` | string | Yes | The BOLT11 invoice from the request step (must be paid) |
| `avatar` | string | Yes | Avatar character to use (see [Avatar Options](#avatar-options)) |
| `emotion` | string | Yes | Avatar emotional expression: `"happy"`, `"neutral"`, `"serious"`, `"expressive"` |
| `language` | string | No | Language code for speech synthesis (see [Language Options](#language-options)) |

**Note**: If `emotion` is set to `"expressive"`, it will be automatically converted to `"neutral"` for processing.

#### Response

Returns a streaming MP4 video file:

**Headers**:
```
Content-Type: video/mp4
Cache-Control: no-cache
```

**Body**: Binary MP4 video data (streamed)

#### Error Responses

**400 Bad Request - Invoice Not Paid**:
```json
{
  "detail": "Invoice not paid in time."
}
```

**404 Not Found - Invoice Not Found**:
```json
{
  "detail": "Invoice lnbc450n1p... not found."
}
```

#### Example Request

```bash
curl -X POST https://api.avatartalk.ai/lightning/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "bolt11_invoice": "lnbc450n1p3...",
    "avatar": "japanese_woman",
    "emotion": "happy",
    "language": "en"
  }' \
  --output video.mp4
```

### GET /lightning/payment/{invoice}

Check the payment status of a specific Lightning invoice.

#### Endpoint

```
GET https://api.avatartalk.ai/lightning/payment/{invoice}
```

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `invoice` | string | Yes | The BOLT11 invoice string |

#### Response

Returns payment details:

```json
{
  "invoice": "lnbc450n1p3...",
  "amount_sat": 450,
  "amount_usd": 0.15,
  "status": "paid",
  "created_at": "2025-09-29T12:00:00Z",
  "paid_at": "2025-09-29T12:01:30Z"
}
```

#### Error Responses

**404 Not Found**:
```json
{
  "detail": "Payment not found"
}
```

#### Example Request

```bash
curl -X GET https://api.avatartalk.ai/lightning/payment/lnbc450n1p3... \
  -H "Authorization: Bearer your_api_key"
```

### GET /lightning/payments

List all Lightning payments (requires authentication).

#### Endpoint

```
GET https://api.avatartalk.ai/lightning/payments
```

#### Authentication

Requires API key:
```
Authorization: Bearer {your_api_key}
```

#### Response

Returns an array of all payment records:

```json
[
  {
    "id": 1,
    "invoice": "lnbc450n1p3...",
    "amount_sat": 450,
    "amount_usd": 0.15,
    "status": "paid",
    "created_at": "2025-09-29T12:00:00Z",
    "paid_at": "2025-09-29T12:01:30Z"
  },
  {
    "id": 2,
    "invoice": "lnbc820n1p3...",
    "amount_sat": 820,
    "amount_usd": 0.28,
    "status": "pending",
    "created_at": "2025-09-29T12:05:00Z",
    "paid_at": null
  }
]
```

#### Example Request

```bash
curl -X GET https://api.avatartalk.ai/lightning/payments \
  -H "Authorization: Bearer your_api_key"
```

### Lightning Payment Example Workflow

Here's a complete example of the Lightning payment workflow:

```bash
# Step 1: Request a video from text
RESPONSE=$(curl -X POST https://api.avatartalk.ai/lightning/request-video/text \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from AvatarTalk!"}')

# Extract invoice and amount
INVOICE=$(echo $RESPONSE | jq -r '.bolt11_invoice')
AMOUNT=$(echo $RESPONSE | jq -r '.amount')
echo "Invoice: $INVOICE"
echo "Amount: $AMOUNT sats"

# Step 2: Pay the invoice using your Lightning wallet
# (Use your preferred Lightning wallet or CLI tool)
# lightning-cli pay $INVOICE

# Step 3: Check payment status (optional)
curl -X GET https://api.avatartalk.ai/lightning/payment/$INVOICE

# Step 4: Generate and download the video
curl -X POST https://api.avatartalk.ai/lightning/generate-video \
  -H "Content-Type: application/json" \
  -d "{
    \"bolt11_invoice\": \"$INVOICE\",
    \"avatar\": \"european_woman\",
    \"emotion\": \"happy\",
    \"language\": \"en\"
  }" \
  --output my_video.mp4
```

## Costs

### Standard API Endpoints

Each successful inference consumes video time from your account:

- **1 second of generated video = 1 second of video time**

Video time is consumed when:
- Regular `/api/inference` request completes successfully
- Delayed request URLs (`mp4_url` or `html_url`) are accessed
- WebSocket streaming generates video output
- LiveKit sessions are active

Check your account balance through the AvatarTalk dashboard to monitor remaining video time.

### Lightning Network Payments

When using Lightning Network endpoints (`/lightning/*`), payment is calculated based on the estimated or actual duration of the generated video:

- **Cost per second**: Determined by the current market rate (returned in the invoice)
- **Payment method**: Bitcoin Lightning Network (BOLT11 invoices)
- **Instant settlement**: Videos are generated immediately after invoice payment is confirmed

The exact cost in satoshis and USD is provided in the response when you request a video. Payment must be completed before the video can be generated.


Skip to main content
PyPI
Search PyPI
Type '/' to search projects
Search
Help Docs Sponsors Log in Register
livekit-plugins-avatartalk 1.6.0
pip install livekit-plugins-avatartalkCopy PIP instructions

Latest release
Released: Jun 12, 2026

Agent Framework plugin for AvatarTalk

Navigation
 Project description
 Release history
 Download files
Verified details 
These details have been verified by PyPI
Project links
Source
Owner
 LiveKit
GitHub Statistics
 Repository
 Stars: 11014
 Forks: 3236
 Open issues: 230
 Open PRs: 393
Unverified details
These details have not been verified by PyPI
Project links
Documentation
Website
Meta
License Expression: Apache-2.0
SPDX License Expression
Author: LiveKit
 Tagsaudio , livekit , realtime , video , webrtc
Requires: Python >=3.10.0
Classifiers
Intended Audience
Developers
License
OSI Approved :: Apache Software License
Programming Language
Python :: 3
Python :: 3 :: Only
Python :: 3.10
Python :: 3.11
Python :: 3.12
Topic
Multimedia :: Sound/Audio
Multimedia :: Video
Scientific/Engineering :: Artificial Intelligence
Report project as malware
Project description
AvatarTalk plugin for LiveKit Agents
Support for the AvatarTalk virtual avatar.

Installation
pip install livekit-plugins-avatartalk
Pre-requisites
You'll need an API key from AvatarTalk. It can be set as an environment variable: AVATARTALK_API_KEY


Help
Installing packages
Uploading packages
User guide
Project name retention
FAQs
About PyPI
PyPI Blog
Infrastructure dashboard
Statistics
Logos & trademarks
Our sponsors
Contributing to PyPI
Bugs and feedback
Contribute on GitHub
Translate PyPI
Sponsor PyPI
Development credits
Using PyPI
Terms of Service
Report security issue
Code of conduct
Privacy Notice
Acceptable Use Policy
Status: All Systems Operational

Developed and maintained by the Python community, for the Python community.
Donate today!

"PyPI", "Python Package Index", and the blocks logos are registered trademarks of the Python Software Foundation.

© 2026 Python Software Foundation
Site map

Deployed from 862968e

English español français 日本語 português (Brasil) українська Ελληνικά Deutsch 中文 (简体) 中文 (繁體) русский עברית Esperanto 한국어

AWS
Cloud computing and Security Sponsor

Datadog
Monitoring

Depot
Continuous Integration

Fastly
CDN

Google
Download Analytics

Pingdom
Monitoring

Sentry
Error logging

StatusPage
Status page

https://pypi.org/project/livekit-plugins-avatartalk/



LiveKit docs › Get Started › Introduction

---

# Agent Frontends

> Build a custom web or mobile frontend for your LiveKit Agent.

## Overview

LiveKit provides open-source SDKs and UI components for all major web and mobile platforms. Use these tools to build a custom frontend for your voice or video agent.

Your frontend connects to your agent using [WebRTC](https://docs.livekit.io/transport.md), which is the gold standard for reliable realtime media and data even in challenging network environments. The LiveKit SDKs make it easy to use cameras, microphones, and more to build any kind of realtime frontend you need.

## Get started

LiveKit has high-quality starter apps for all major web and mobile platforms, which are the easiest way to get started with a custom voice agent frontend. If you prefer, you can also follow the quickstart guide for React.

- **[Starter apps](https://docs.livekit.io/frontends/start/starter-apps.md)**: Open-source starter apps for React, SwiftUI, Android, Flutter, React Native, and web embed.

- **[React voice AI quickstart](https://docs.livekit.io/frontends/start/react-quickstart.md)**: Build a voice AI frontend with React in less than 10 minutes.

## Building frontends

Learn the core concepts for building a production-ready agent frontend.

- **[Session management](https://docs.livekit.io/frontends/build/sessions.md)**: Use Session APIs to manage room connections and agent lifecycle automatically.

- **[Authentication](https://docs.livekit.io/frontends/build/authentication.md)**: Generate and manage JWT tokens for connecting your frontend to LiveKit.

- **[Agent state](https://docs.livekit.io/frontends/build/agent-state.md)**: Track and respond to agent state changes in your frontend.

- **[Realtime media and data](https://docs.livekit.io/frontends/build/media-data.md)**: Work with audio, video, text streams, and data in your agent frontend.

- **[Virtual avatars](https://docs.livekit.io/frontends/build/virtual-avatars.md)**: Give your agent a visual presence with a virtual avatar.

## UI components

Pre-built component libraries for popular frontend frameworks that handle session management, media controls, audio visualization, and chat.

- **[UI components](https://docs.livekit.io/frontends/agents-ui.md)**: Learn about the available component libraries for React, Swift, Android, and Flutter.

## Reference

Complete SDK documentation, API references, and advanced topics.

- **[LiveKit SDKs](https://docs.livekit.io/reference.md#livekit-sdks)**: Complete documentation for all LiveKit client SDKs.

- **[UI component SDKs](https://docs.livekit.io/reference.md#ui-components)**: API references and examples for React, Swift, Android, and Flutter components.

- **[Tokens & grants](https://docs.livekit.io/frontends/reference/tokens-grants.md)**: Reference documentation for access tokens, grants, and permissions.

---

This document was rendered at 2026-06-17T11:39:28.173Z.
For the latest version of this document, see [https://docs.livekit.io/frontends.md](https://docs.livekit.io/frontends.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).

LiveKit docs › Get Started › React voice agent quickstart

---

# React voice AI quickstart

> Build a voice AI frontend with React in less than 10 minutes.

## Overview

This guide walks you through building a voice AI frontend using React and the LiveKit React components library. In less than 10 minutes, you'll have a working frontend that connects to your agent and allows users to have voice conversations through their browser.

## Starter projects

The simplest way to get your first agent running is with the following starter projects. Click "Use this template" in the top right to create a new repo on GitHub, then follow the instructions in the project's README.

- **[Next.js Voice Agent](https://docs.livekit.io/frontends/start/starter-apps/react.md)**: Ready-to-go React starter project. Clone a repo with all the code you need to get started.

- **[Web Embed Voice Agent](https://docs.livekit.io/frontends/start/starter-apps/web-embed.md)**: Ready-to-go web embed starter project. Clone a repo with all the code you need to get started.

## Requirements

The following sections describe the minimum requirements to build a React frontend for your voice AI agent.

### LiveKit Cloud account

This guide assumes you have signed up for a free [LiveKit Cloud](https://cloud.livekit.io/) account. Create a free project to get started with your voice AI application.

### Agent backend

You need a LiveKit agent running on the backend that is configured for your LiveKit Cloud project. Follow the [Voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai.md) to create and deploy your agent.

### Token server

This guide uses the LiveKit Cloud token server for ease of use. Enable it from your project's [Settings](https://cloud.livekit.io/projects/p_/settings/project) page by toggling **Token server** on, then copy the sandbox ID.

For production usage, you should set up a dedicated token server implementation. See the [authentication](https://docs.livekit.io/frontends/build/authentication.md) guide for more details.

## Setup

Use the instructions in the following sections to set up your new React frontend project.

### Create React project

Create a new React project using your preferred method:

**pnpm**:

```shell
pnpm create vite@latest my-agent-app --template react-ts
cd my-agent-app

```

---

**npm**:

```shell
npm create vite@latest my-agent-app -- --template react-ts
cd my-agent-app

```

### Install packages

Install the LiveKit SDK and React components:

**pnpm**:

```shell
pnpm add @livekit/components-react @livekit/components-styles livekit-client

```

---

**npm**:

```shell
npm install @livekit/components-react @livekit/components-styles livekit-client --save

```

### Add agent frontend code

Replace the contents of your `src/App.tsx` file with the following code:

> ℹ️ **Note**
> 
> Update the `sandboxId` with your own token server ID from your project's [Settings](https://cloud.livekit.io/projects/p_/settings/project) page, and set the `agentName` to match your deployed agent's name.

** Filename: `src/App.tsx`**

```tsx
'use client';
import { useEffect, useRef } from 'react';
import {
  ControlBar,
  RoomAudioRenderer,
  useSession,
  SessionProvider,
  useAgent,
  BarVisualizer,
} from '@livekit/components-react';
import { TokenSource, TokenSourceConfigurable, TokenSourceFetchOptions } from 'livekit-client';
import '@livekit/components-styles';

const tokenSource = TokenSource.sandboxTokenServer('%{firstSandboxTokenServerName}%');

export default function App() {
  const session = useSession(tokenSource, { agentName: 'my-agent-name' });

  // Connect to session
  useEffect(() => {
    session.start();
    return () => {
      session.end();
    };
  }, []);

  return (
    <SessionProvider session={session}>
      <div data-lk-theme="default" style={{ height: '100vh' }}>
        {/* Your custom component with basic video agent functionality. */}
        <MyAgentView />
        {/* Controls for the user to start/stop audio and disconnect from the session */}
        <ControlBar controls={{ microphone: true, camera: false, screenShare: false }} />
        {/* The RoomAudioRenderer takes care of room-wide audio for you. */}
        <RoomAudioRenderer />
      </div>
    </SessionProvider>
  );
}

function MyAgentView() {
  const agent = useAgent();
  return (
    <div style={{ height: '350px' }}>
      <p>Agent state: {agent.state}</p>
      {/* Renders a visualizer for the agent's audio track */}
      {agent.canListen && (
        <BarVisualizer track={agent.microphoneTrack} state={agent.state} barCount={5} />
      )}
    </div>
  );
}

```

## Run your application

Start the development server:

**pnpm**:

```shell
pnpm dev

```

---

**npm**:

```shell
npm run dev

```

Open your browser to the URL shown in the terminal (typically `http://localhost:5173`). You should see your agent frontend with controls to enable your microphone and speak with your agent.

## Next steps

The following resources help you build on your React agent frontend.

- **[Authentication](https://docs.livekit.io/frontends/build/authentication.md)**: Set up production token generation for your frontend.

- **[UI components](https://docs.livekit.io/frontends/agents-ui.md)**: Add pre-built components for media controls, visualizers, and chat.

- **[Session management](https://docs.livekit.io/frontends/build/sessions.md)**: Learn how Session APIs manage room connections and agent lifecycle.

---

This document was rendered at 2026-06-17T11:39:39.308Z.
For the latest version of this document, see [https://docs.livekit.io/frontends/start/react-quickstart.md](https://docs.livekit.io/frontends/start/react-quickstart.md).

To explore all LiveKit documentation, see [llms.txt](https://docs.livekit.io/llms.txt).