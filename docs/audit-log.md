# Network code audit log

A public, append-only log of every code change that touches network-reaching APIs. The point is that anyone reading this file should be able to see, at a glance, every place where the extension or backend can talk to the outside world, and when each call was added or modified.

## What requires an entry

Any PR that introduces, modifies, or removes a call to one of the following must add an entry below:

- `fetch` (browser, Node, or Cloudflare Worker)
- `XMLHttpRequest`
- `chrome.runtime.sendMessage`, `chrome.runtime.connect`, and the `onMessage` / `onConnect` counterparts
- `chrome.webRequest.*` and `chrome.declarativeNetRequest.*`
- `navigator.sendBeacon`
- `WebSocket`, `EventSource`
- `import()` of any module that wraps the above (e.g. the OpenAI/OpenRouter SDK, an HTTP client library)
- Any new entry in `host_permissions` or `optional_host_permissions` in `manifest.json`
- Any new outbound call from the worker to a third party

A "modification" includes: changing a destination URL, adding/removing a header, changing what request body is sent, changing which user input flows into a request.

## Entry format

Each entry is one line under the year heading:

```
- YYYY-MM-DD — short description — <PR number/link> — <commit SHA>
```

Keep descriptions specific. "Added fetch" is not enough. "Added fetch to OpenRouter `/api/v1/chat/completions` with user's API key from `chrome.storage.local`" is.

## Process

1. Author of the PR adds the entry to this file as part of the PR.
2. Reviewer must confirm the entry is present and accurate before approving. PRs that touch the listed APIs without a log entry should be requested-changes.
3. The log is append-only. Corrections are added as a new dated entry, not by editing earlier ones.

## Log

### 2026

- 2026-05-03 — Repository scaffold; no network code shipped yet. This file established as part of the reproducible-build security docs (see `SECURITY.md`). Future entries land here as PRs touch network APIs.
