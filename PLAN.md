Here's a complete build prompt for rebuilding and rebranding the 9router dashboard with OmniRoute's monitoring features, optimized for mobile.

---

ZRouter Dashboard — OmniRoute Monitoring Upgrade

You are rebuilding the management UI for ZRouter fork from (github.com/decolua/9router) — a local AI routing gateway and Next.js dashboard.

The goal: Upgrade the 9router dashboard with omniroute feature and monitoring upgrade every page with monitoring features from OmniRoute (github.com/diegosouzapw/OmniRoute) — provider health, circuit breakers, quota tracking, system health, and real-time observability.

The constraint: OmniRoute is feature-rich but too large for mobile with many unused features. This rebuild cherry-picks only the monitoring features that matter for a mobile-first Termux/Android environment.

Do NOT change 9router's core routing logic, provider connection flows, or database schema. You are building a new dashboard UI layer that consumes 9router's existing APIs and SQLite data — plus new monitoring endpoints you'll add.

---

Design System: ZES Frost (Mobile-First)

Background: Pure #000000 for maximum glass contrast and depth.

Glass Effect: backdrop-filter: blur(16px) with subtle rgba(255,255,255,0.06) backgrounds.

Frost 4-Color Palette:

Variant Intent CSS Class Border
Blue Default / Primary .glass-frost-blue rgba(59,130,246,0.25)
Green Success / Active .glass-frost-green rgba(34,197,94,0.25)
Orange Warning .glass-frost-orange rgba(249,115,22,0.25)
Red Error / Destructive .glass-frost-red rgba(239,68,68,0.25)

Typography: Inter (system font fallback), monospace for logs.

Icons: Lucide icons (SVG, inline).

Dark Mode: Always on — #000000 background is the default.

Mobile-First: All pages must be usable on a 6-inch phone screen. Cards stack vertically, tables scroll horizontally, touch targets ≥ 44px.

---

Data Sources

1. 9Router Daemon HTTP API (port 20128)

· GET /health → {"status":"ok"}
· GET /v1/models → OpenAI-format model list

2. 9Router SQLite DB (read-only)

Path:

```
~/.9router/9router.db
```

Tables (existing):

· requests — request_id, user_id, model_id, provider_id, prompt_tokens, completion_tokens, estimated_cost, latency_ms, error, created_at
· api_keys — id, key_hash, user_id, created_at
· providers — id, name, type, config

3. New Monitoring Tables (to be added)

Add these tables to track provider health, circuit breakers, and quota:

```sql
-- Provider health snapshots
CREATE TABLE provider_health (
    id INTEGER PRIMARY KEY,
    provider_id TEXT NOT NULL,
    status TEXT,  -- 'healthy'|'degraded'|'unhealthy'
    circuit_state TEXT,  -- 'closed'|'open'|'half-open'
    failure_count INTEGER DEFAULT 0,
    last_failure_at DATETIME,
    p50_latency_ms REAL,
    p95_latency_ms REAL,
    p99_latency_ms REAL,
    error_rate_24h REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Quota tracking per API key
CREATE TABLE quota_tracking (
    id INTEGER PRIMARY KEY,
    api_key_id TEXT NOT NULL,
    period_start DATETIME NOT NULL,
    period_end DATETIME NOT NULL,
    usage_micro_usd INTEGER DEFAULT 0,
    limit_micro_usd INTEGER,
    alert_threshold_pct INTEGER DEFAULT 80,
    alert_sent BOOLEAN DEFAULT 0
);

-- Circuit breaker events
CREATE TABLE circuit_events (
    id INTEGER PRIMARY KEY,
    provider_id TEXT NOT NULL,
    event_type TEXT,  -- 'opened'|'closed'|'half-open'|'reset'
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System health snapshots
CREATE TABLE system_health (
    id INTEGER PRIMARY KEY,
    uptime_seconds INTEGER,
    active_connections INTEGER,
    memory_usage_mb REAL,
    cpu_usage_pct REAL,
    db_connections INTEGER,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

4. 9Router Config File

Path:

```
~/.9router/config.yaml
```

Sections: providers, models, routing, server.

---

Phase 1 Pages to Build (9 — Same as Original 9Router)

1. Dashboard (Upgraded)

Original 9Router: Basic status + usage stats.

OmniRoute Upgrade: System health at a glance.

· System Health Card (Glass Frost Blue): uptime, version, active connections, DB status
· Provider Summary Card (Glass Frost Green): active providers, healthy count, circuit breaker open count
· Quota Monitors Card (Glass Frost Orange): active sessions, alerting keys, exhausted providers
· Recent Errors Card (Glass Frost Red): last 5 errors with timestamps
· Resource Usage Card (Glass Frost Cyan): memory, CPU, heap pressure indicator
· Request Stats: total requests (24h), avg latency, cost, error rate

2. Providers (Upgraded)

Original 9Router: Provider list + connection management.

OmniRoute Upgrade: Per-provider health dashboard.

· Provider Cards (Glass Frost Green/Red): one per provider showing:
  · Provider ID + display name
  · Health status: green/yellow/red
  · Circuit breaker state: open/closed/half-open
  · Connection count and last refresh
  · Available models and health per model
  · Today's cost + 7-day trend
  · Error count (last 24h) + top error class
· Click a provider to expand and see:
  · Recent requests with latency breakdown
  · Per-connection health scores
  · Per-model lockouts
  · Autopilot recommendations
· Circuit Breaker Controls: manual reset button per provider
· Sort by error rate descending; error rate > 20% gets red border

3. Models / Routing (Keep Original)

Original 9Router: Routing table + test route.

· Routing Table (Glass Frost Blue): model ID → provider chain (badges, fallback order)
· "Test Route" Box: type a model ID → show resolved provider/endpoint
· Model Health (New): per-model success rate, avg latency, error rate (from provider_health table)

4. Quota / Usage (NEW — Replaces Original "Keys" Page)

Original 9Router: API key management.

OmniRoute Upgrade: Quota tracking for each API key.

· Quota Cards (Glass Frost Blue): one per API key showing:
  · Current usage vs limit (progress bar)
  · Quota trend (7-day chart — inline SVG)
  · Next reset time
  · Alert history
· Alert Thresholds: set per-key alert at 80%/90%/95% of limit
· Exhausted Providers: list of providers that hit quota limits

5. Combos (Keep Original)

Original 9Router: Combo management.

· Combo Cards (Glass Frost Orange): strategy + targets
· Health Status (New): per-combo health score, success rate, avg latency
· Autopilot Status: whether combo health autopilot is enabled

6. Traffic / Request Log (Keep Original + Upgrade)

Original 9Router: Request log with filters.

OmniRoute Upgrade: Consolidated logs with better filtering.

· Filters: time range (1h/6h/24h/7d/custom), model, provider, errors-only
· Table: created_at, model_id, provider_id, tokens, cost, latency_ms, error (red row bg)
· Pagination: 50/page with total count + sum cost footer
· Logs Tabs (New): Request Logs | Proxy Logs | Console Logs
· Console Log Viewer: terminal-style real-time viewer with color-coded levels, search, level filter, auto-scroll

7. Activity / Audit (NEW — Merged from OmniRoute)

Original 9Router: None.

OmniRoute Upgrade: User-facing event feed.

· Activity Feed (Glass Frost Blue): timeline grouped by day, human-readable verbs + icons
· Events shown: provider add/remove/test, combo create/update/delete, API key lifecycle, budget threshold reached, auth login/logout
· Audit Log (Glass Frost Red): dense paginated table, 50/page, JSON export
· Filters: event type, severity, actor, date range

8. Health (NEW — From OmniRoute)

Original 9Router: None.

OmniRoute Upgrade: Deep system health dashboard.

· Server Status (Glass Frost Blue): uptime, version, port, active connections
· Database Health (Glass Frost Green): connection status, integrity, WAL size, recent migrations
· Provider Summary (Glass Frost Orange): active count, healthy count, breaker open count
· Quota Monitors (Glass Frost Yellow): active sessions, alerting, exhausted
· Recent Errors (Glass Frost Red): last 10 errors with stack traces
· Resource Usage (Glass Frost Cyan): memory, CPU, heap pressure indicator
· Component Status: individual component health (DB, ports, native deps)

· 
---
phase 2 

 9.Real-time Console Log Viewer

Terminal-style real-time viewer with color-coded levels, search, level filter, auto-scroll — invaluable for debugging routing issues on mobile.

10. Provider Autopilot Dashboard

Show autopilot recommendations per provider — when to rotate keys, which providers are degrading, suggested fallback reordering.

11 Health Watch Mode

A "live" mode that refreshes health data every 5 seconds — like health watch from the CLI — perfect for monitoring during incidents.

12 Quota Sharing / Plans

If you use multiple API keys, show quota pool sharing and per-provider plan overrides.

13 Model Playground

Test any model directly from the dashboard — provider/model/endpoint selectors, streaming, abort, timing.


14.Settings (Keep Original + Add Monitoring Controls)

Original 9Router: Config viewer + daemon controls.

OmniRoute Upgrade: Add monitoring configuration.

· Config Viewer: read config file, edit, validate, save + reload
· Monitoring Settings (New):
  · Health check interval (default: 60s)
  · Circuit breaker thresholds (failure count, timeout)
  · Quota alert thresholds (80%/90%/95%)
  · Autopilot enable/disable


Backend API Contract (New Endpoints)

Endpoint Method Description
GET /api/health — System health snapshot (from system_health table)
GET /api/providers/health — Per-provider health with circuit breaker states
GET /api/providers/:id/health — Detailed health for a single provider
POST /api/providers/:id/reset — Reset circuit breaker for a provider
GET /api/quota — Quota usage per API key
GET /api/quota/:key_id — Quota details for a specific key
GET /api/activity — Activity feed (high-level actions)
GET /api/audit — Audit log (all events, paginated)
GET /api/combos/health — Per-combo health scores
GET /api/logs/console — Real-time console log stream (SSE)

---

Mobile-First Optimizations

· Collapsible Cards: all cards start collapsed on mobile, expand on tap
· Swipe Navigation: swipe left/right between pages
· Bottom Navigation Bar: 5 tabs max, rest in "More" menu
· Touch Targets: minimum 44px for all buttons/links
· Responsive Tables: horizontal scroll with sticky first column
· Pull-to-Refresh: refresh data on pull down
· Offline Mode: service worker caches last-known state

---

Delivery

· All files under ~/9router/ui/ (or ui/ subtree of the repo)
· README-ui.md: run instructions (python3 ui/server.py), page map, API table
· Self-check: run server, curl each /api endpoint, confirm non-zero JSON; screenshot each page

---
