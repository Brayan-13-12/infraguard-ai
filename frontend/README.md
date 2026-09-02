# InfraGuard AI - Frontend

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 3 · pnpm.

```bash
pnpm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
pnpm dev          # http://localhost:3000
pnpm lint         # ESLint 9 flat config
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm build
```

## Layout

```
src/
├── app/
│   ├── (app)/            authenticated route group - layout.tsx = RequireAuth + AppShell
│   │   ├── dashboard/
│   │   └── assets/       layout.tsx renders {children}{modal}
│   │       ├── page.tsx  [id]/ [id]/edit/ new/           full-page fallbacks
│   │       └── @modal/   (.)[id]/ (.)[id]/edit/ (.)new/  intercepted drawers + default.tsx
│   ├── login · register · page.tsx (landing) · healthz
├── components/
│   ├── ui/               design system (Button, Input, Select, Textarea, Card,
│   │   │                 Badge, Alert, PageHeader, Pagination, Spinner,
│   │   │                 EmptyState, Reveal, Skeleton, icons)
│   │   ├── overlay/      Overlay · Dialog · Drawer · ConfirmDialog · WorkspaceDialog  (stacked-safe)
│   │   ├── toast/        Toaster · toast() / useToast() (no library)
│   │   └── chart/        DonutChart · HorizontalBarChart · ChartDataTable · …
│   ├── theme/ · auth/ · dashboard/
│   ├── shell/            AppShell · AuthenticatedShell · Sidebar · SidebarFooter ·
│   │                     Topbar · MobileNav · NavList · LogoutButton
│   ├── assets/           AssetsBrowser · AssetsTable · AssetFilters ·
│   │                     ActiveFilterChips · AssetForm · AssetDetail ·
│   │                     AssetDetailContent (tabs + inline editors) ·
│   │                     AssetDetailWorkspace · AssetCreateWorkspace ·
│   │                     AssetDetailLoader · AssetDrawerShell · AssetEditDrawer · AssetBadges · catalog
│   │   ui/               Tabs · DetailRow · FieldEditDialog · WorkspaceDialog  (shared detail primitives)
│   ├── AuthProvider · RequireAuth · AuthForm · AuthNav · Brand · SystemHealth
├── hooks/                useCloseDrawer
├── i18n/ · lib/ (cn · config · … · navigation · motion · assetsRefresh) · services/ · types/
```

## Internationalisation (Spanish-only visible UI)

- **No dependency, no switcher.** `src/i18n/` is a small custom layer kept so
  copy lives in one typed place and a second locale can return later, but the
  visible UI is **Spanish only**: `<html lang="es">`, no `LanguageSwitcher`, no
  persisted language preference.
- `config.ts` (`LANGUAGES`, `DEFAULT_LANGUAGE = "es"`, `LANGUAGE_LOCALES` for
  date/number formatting), `translations/es.ts` (the source of truth for the
  shape - `en.ts` is typed against it, so a missing key is a compile error), and
  a stateless `provider.tsx`.
- **API:** `LanguageProvider` + `useTranslation()` → `{ t, language }`
  (`language` is always `"es"`). `t("auth.loginTitle")` takes a type-checked
  dot-path key and supports `{var}` interpolation. Resolution falls back
  active-language → Spanish → the key itself.
- **Fixed English** - product/module proper nouns: `InfraGuard AI`, the sidebar
  nav labels (`Dashboard`, `Assets`, `Incidents`, `AI Assistant`, `Settings`),
  the `Dashboard` page heading, and the `Coming soon` / `soon` marker. Proper
  nouns ("PostgreSQL", "Argon2id", "HttpOnly") and user data (emails, UUIDs) are
  never translated.

## Theming (light / dark)

- **Engine:** [`next-themes`](https://github.com/pacocoursey/next-themes) - an
  inline script sets the theme before first paint (**no flash, no mismatch**) and
  persists the choice to `localStorage` (`theme` key - a non-sensitive UI
  preference). **Dark is the default** (`defaultTheme="dark"`) - it is
  InfraGuard's primary visual identity - and an explicit light/dark choice always
  wins on the next visit.
- **Tokens only, no `dark:` variants.** Semantic CSS variables in
  `src/app/globals.css`, defined once on `:root` and swapped under `.dark`:
  `--background`, `--foreground`, `--surface(-elevated)`, `--border`,
  `--muted(-foreground)`, `--primary(-hover/-foreground)`, `--success` /
  `--warning` / `--caution` / `--danger` / `--info`, `--ring`, `--sidebar(-border)`,
  `--overlay`, `--chart-1..6`, and `--auth-panel*` (the split-login canvas -
  theme-independent, defined only on `:root`). Values are HSL channel triplets so Tailwind's
  alpha slot works (`bg-primary/10`). `tailwind.config.ts` maps them to
  utilities. **Components never use raw hex and never use `dark:`.**
- **Dark mode:** `darkMode: "class"` - `next-themes` toggles `class="dark"` on
  `<html>`; `<html suppressHydrationWarning>` in the root layout.
- **Switcher:** `<ThemeToggle />` - a **single contextual button** showing the
  icon of the mode you switch *to*; its `aria-label` tracks the action. Lives in
  the sidebar footer, the mobile drawer and the auth card.

## Overlay, toast & skeleton foundations

- **`components/ui/overlay/`** - `Overlay` is the headless surface (portal to
  `<body>`, `--overlay` scrim with optional blur, Escape + backdrop dismissal,
  focus moves in and is **restored to the trigger**, focus **trap**, scroll
  lock, `role="dialog"` / `aria-modal` / `aria-labelledby`, reduced-motion).
  `Dialog` (centered, titled/described), `Drawer` (`side="right|left|bottom"`)
  and `ConfirmDialog` (explicit two-button flow, async `loading`, inline
  `error`) build on it. The mobile nav drawer uses `Drawer`.
- **`components/ui/toast/`** - `<Toaster>` (mounted once in the root layout) plus
  a module-level `toast()` / `useToast()`. No dependency. Desktop top-right /
  mobile bottom-center stack, `role="status"` (or `"alert"` for important
  errors), auto-dismiss with pause-on-hover/focus, manual dismiss,
  reduced-motion.
- **`components/ui/Skeleton.tsx`** - token-based loading placeholder
  (`Skeleton` / `SkeletonText`); pulse disabled under reduced motion. Used for
  the Dashboard loading state.

## Dashboard

`DashboardOverview` fetches **one** request - `GET /api/v1/assets/summary` - and
renders, deliberately calm (one chart, semantic colour only):

- a **KPI row** (Total / Critical / Operational / Degraded+Offline / Maintenance
  / Inactive) - counts straight from the summary; each card is a restrained link
  (semantic dot, large tabular number, a quiet drill hint that turns primary +
  nudges its arrow on hover/focus, subtle lift);
- one primary chart on a **level-1 surface** (`elevated`, left accent rail, faint
  primary halo) - **`CriticalityChart`** ("Activos por criticidad"): a donut with
  a large central metric (`18` / `activos`), hovering a segment or a legend row
  cross-highlights the other;
- **`OperationalSummary`** ("Estado actual") - *not* a second chart: interactive
  status rows (hover highlight + arrow + stronger bar, each links into Assets)
  and a visually distinct insight strip (top environment / top type);
- **`RecentAssets`** - the five most recently updated assets (row hover +
  trailing chevron, mono asset names), refetched by "Actualizar";
- system health as a compact `● Sistema operativo` cue that opens a small dialog;
- **"Actualizar"** really refetches the summary, the recent list and the health
  check (visible loading state, "Actualizado HH:MM" timestamp, failure surfaced
  as a toast without blowing away the board).

The status donut, environment donut and assets-by-type bar were **removed** from
the Dashboard to cut visual noise; `DonutChart` / `HorizontalBarChart` /
`ChartDataTable` stay as reusable primitives for future analytics screens. Every
KPI, chart slice and status row is a real link into the matching Assets filter -
the query parameter names (`criticality`, `status`, `state`) match
`AssetsBrowser` exactly.

**Charts** (`components/ui/chart/`) wrap **Recharts** - the only new chart
dependency, lazy-loaded via `next/dynamic({ ssr: false })` so it stays out of the
shared bundle. Each chart renders a decorative SVG **plus** a `ChartDataTable`:
a real `<table>` with category / count / percentage and keyboard-navigable
drill-down links. Charts are never colour-only; animation respects reduced
motion.

## Motion system

Reusable, CSS-only (no animation library). `tailwind.config.ts` defines a small
set of entrance keyframes - `fade-in`, `fade-in-up`, `scale-in`,
`slide-in-left` / `-right` / `-up`, `node-ping` (a very slow topology halo) - all
in the 150-260ms band (the halo is a deliberate slow exception). `<Reveal>`
(`components/ui/Reveal.tsx`) is the shared entrance primitive (soft fade + 6px
rise, optional stagger `delayMs`).

The coherent **microinteraction** language: nav active-state colour transition;
KPI hover lift + arrow reveal; card border/shadow transition; table-row and
status-row background transitions; button press `active:scale-[0.98]`; donut
segment ↔ legend cross-highlight; filter-chip `active:scale-90` + `scale-in`
entrance; refresh spinner; sidebar collapse width transition; auth topology
pulse. Everything is gated by `motion-safe:` / `motion-reduce:` and the global
`prefers-reduced-motion` rule in `globals.css`. Ambient identity (used sparingly,
never behind text): a faint dot grid in empty states, a thin node topology on the
auth panel, a faint primary halo behind the primary Dashboard insight.

## Design system

Small internal component set (Tailwind + tokens - no UI framework). `cn()` in
`src/lib/cn.ts` is a dependency-free class joiner. Icons are inline SVG
(`components/ui/icons.tsx`) - no icon-library dependency.

## Authenticated app shell

**Scroll architecture.** `<AppShell>` is `h-[100dvh] overflow-hidden` - the
document/body never scrolls. The navigation rail is a full-height flex child
(visually continuous top-to-bottom on any page length) and the **main pane** is
the scroll container (`overflow-y-auto`, `data-scroll-lock` so overlays lock it
too). Mobile keeps the portalled `Drawer` (`MobileNav` from `Topbar`).

The **rail** (`Sidebar`, `--sidebar` tokens) is a flex column: brand + footer
`shrink-0`, only the nav scrolls. It is **collapsible** on desktop (~256px ↔
~68px, 200ms width transition, choice persisted in `localStorage` -
non-sensitive); collapsed shows icons only with hover/focus tooltips and the
label as the accessible name. Navigation (`src/lib/navigation.ts` → `NAV_ITEMS`)
is a **single flat list** - Dashboard, Assets, Incidents, AI Assistant, Settings,
**no section headings**. The active item gets a primary-tinted fill, primary
text/icon and a left accent bar (`aria-current="page"`); future items are
`aria-disabled`, not links, with a quiet lock marker and a "Próximamente"
tooltip. The footer: a compact identity row (avatar + email + theme toggle) over
a confirmation-gated **"Salir"** (`<LogoutButton>` - a first tap arms an explicit
Confirm / Cancel step, or a `ConfirmDialog` on the collapsed rail; state is only
cleared when `logout()` returns `{ ok: true }` - **unchanged**). The mobile
drawer mirrors the flat nav + footer.

Authenticated pages live under the **`(app)` route group**, whose `layout.tsx`
is the one place that composes `<RequireAuth><AppShell>` (via
`AuthenticatedShell`). The group is invisible in the URL - `/dashboard`,
`/assets`, … are unchanged.

## Assets (infrastructure inventory)

### Route-aware detail workspace

Navigating **from the inventory** opens Asset **detail** in a large centered
**workspace dialog** over the still-mounted list, and **create / edit** in a
right-side drawer, using Next.js **Parallel + Intercepting Routes**:

```
(app)/assets/
  layout.tsx        → {children}{modal}
  page.tsx          → AssetsBrowser
  @modal/
    default.tsx           → null (list, or any hard load)
    (.)[id]/page.tsx      → id==="new" ? <AssetCreateWorkspace/> : <AssetDetailWorkspace/>
    (.)[id]/edit/page.tsx → <AssetEditDrawer/>        (legacy full-form deep-link edit)
    (.)new/page.tsx       → <AssetCreateWorkspace/>   (retained; the dispatch above is the live path)
  [id]/page.tsx · [id]/edit/page.tsx · new/page.tsx   → full-page fallbacks
```

- The detail surface is a **`WorkspaceDialog`** (`variant="workspace"`,
  `min(1100px,100vw-4rem)` x `min(820px,100dvh-4rem)` desktop). **Creation** uses
  the same component with `variant="modal"` (`min(900px,100vw-4rem)`,
  content-height) - `AssetForm` / `IncidentForm` verbatim. Both are **full-screen
  sheets on mobile**, sticky header + close, internally-scrolling body.
- **`/assets/new` routing:** Next.js 15.x routes the client-side `/assets/new`
  navigation through the sibling dynamic `(.)[id]` interceptor, so
  `@modal/(.)[id]/page.tsx` dispatches (`id === "new"` → create modal, else →
  detail). `AssetDetailLoader` never sees `"new"`; **`GET /api/v1/assets/new` is
  never issued**. Same fix as Incidents; regression tests in
  `app/(app)/assets/modal-routing.test.tsx`.
- **Direct visit / refresh** of `/assets/[id]`, `/assets/new`, `/assets/[id]/edit`
  still renders a usable **full page** (same `AssetDetailContent` / `AssetForm`).
- Close / backdrop / Escape → `router.back()` (via `useCloseDrawer`), so the
  exact `/assets?filters&page` state is restored - **filters and page are never
  reset**.
- `Overlay` keeps an overlay **stack**: a field editor / deactivate
  `ConfirmDialog` opened over the workspace takes Escape + focus-trap and does
  **not** close the workspace; closing it returns focus to the trigger row.
- Loading shows a **skeleton**, not a blank panel; failure → Retry / Close;
  missing asset → not-found.

### Inline editing (no separate edit screen)

Every persisted field is shown across four tabs (*Resumen / Información técnica /
Incidentes / Actividad*) - `created_at` / `updated_at` / `id` are read-only,
everything else is inline-editable. A quiet pencil on an editable row opens a
small **`FieldEditDialog`** (one reusable primitive for `text` / `textarea` /
`select` / `date` / `datetime`): it `PATCH`es only that field, refreshes the
detail in place, refetches the list (`notifyAssetsChanged()`, filter/page kept),
toasts, and closes - staying open with an inline error on failure. The generic
"Editar" action is gone; `/assets/[id]/edit` remains a legacy full-form
deep-link.

### Shared implementation (one detail, one form)

`AssetDetailLoader` is the single fetch/state machine; `AssetDetailContent`
(tabs + inline editors) and `AssetLifecycleButton` are shared by the workspace
and the full page. `AssetForm` is used verbatim by create + the legacy edit
drawer. `AssetsTable` rows are a **stretched-link** with a hover/focus **Edit**
quick-action and a fresh-create highlight (`highlightId`).

| Route | Purpose |
| --- | --- |
| `/assets` | inventory - filter toolbar (search + catalog + activity, mobile-collapsible), URL-driven active-filter chips (`criticality` / `status` repeatable), responsive table/cards, real server-side pagination (**20 rows/page**, `ASSETS_PAGE_SIZE`), explicit loading / empty / error states; `Suspense` around `useSearchParams` |
| `/assets/new` · `/assets/[id]` · `/assets/[id]/edit` | full-page fallbacks reusing the shared pieces (detail: header + badges, `AssetOverview`, `AssetDescription`, Edit + confirmation-gated Deactivate/Reactivate) |

- **Toasts** (`components/ui/toast`): "Activo creado correctamente." /
  "Activo actualizado correctamente." / "Activo desactivado." / "Activo
  reactivado." on success; a danger toast when a refresh-style action fails but
  the current content can be kept. Validation errors stay field/inline.
- **List refresh**: a drawer action calls `notifyAssetsChanged()`
  (`lib/assetsRefresh.ts`, a tiny event bus); `AssetsBrowser` subscribes and
  refetches without losing its filter/page state. `router.refresh()` is not
  relied on (the list is client-fetched).
- **One form** (`AssetForm`) for create and edit. Client validation lives in
  `lib/assetValidation.ts` (returns codes the component translates); server
  field errors from a `422` are merged in.
- **Service layer** (`services/assets.ts`) never throws - every outcome
  (`unreachable` / `unauthorized` / `not_found` / `validation` / `rate_limited` /
  `unexpected`) is a typed result. All calls use `credentials: "include"`.
  `getAssetSummary()` backs the Dashboard; `criticality` / `status` list params
  accept `string | string[]`.
- **Catalog i18n:** the vocabulary values (`Server`, `Production`, `Critical`,
  `Operational`, …) are English in the data; `components/assets/catalog.ts` maps
  each to a translation key for display. Criticality / status badges always
  carry the translated **text** - colour is only a hint (accessible + grayscale
  safe, both themes). The `Assets` nav label itself stays English.
- **Asset detail** carries a real **"Incidentes relacionados"** section
  (`RelatedIncidents`, `GET /incidents?asset_id=…`); the "Dependencias y
  topología" note stays an explicit **future** placeholder.

## Incidents (incident management)

Mirrors the Assets experience - the **same** Parallel + Intercepting Routes
architecture, `useCloseDrawer("/incidents")`, `lib/incidentsRefresh.ts` event
bus, `IncidentDetailLoader` state machine, shared `IncidentDetailContent`
(tabbed + inline-editable) / `IncidentAffectedAssets` / `IncidentLifecycleActions`,
one `IncidentForm` for create + the legacy edit drawer. Detail opens in a
`WorkspaceDialog` (tabs: *Resumen / Activos afectados / Cronología / Actividad*);
**creation opens in the same component with `variant="modal"`** - a centered
~900px content-height modal (`IncidentCreateWorkspace`). Only `/incidents/[id]/edit`
still uses a drawer (`IncidentDrawerShell`).

```
(app)/incidents/
  layout.tsx  → {children}{modal}
  page.tsx    → IncidentsBrowser
  @modal/  default.tsx · (.)[id]/page.tsx · (.)[id]/edit/page.tsx · (.)new/page.tsx
  [id]/page.tsx · [id]/edit/page.tsx · new/page.tsx   → full-page fallbacks
```

| Route | Purpose |
| --- | --- |
| `/incidents` | compact interactive KPI row (open / critical / investigating / monitoring / resolved-recently → click applies the matching filter); URL-driven filters (severity / status / priority repeatable, `asset_id`, date range) + search + sort; dense desktop table (Incident / Severity / Status / Priority / Affected assets / Owner / Started / Updated - title is the stretched link, no UUID column) and mobile cards; real server-side pagination (**15 rows/page**, `INCIDENTS_PAGE_SIZE`); loading / empty / filtered-empty / error states |
| `/incidents/new` · `/incidents/[id]` · `/incidents/[id]/edit` | full-page fallbacks reusing the shared pieces |

- **Severity** badge: `Critical`→danger, `High`→warning, `Medium`→caution,
  `Low`→neutral. **Status** badges stay quiet (only `Resolved` is coloured).
  **Priority** is a plain neutral badge so it never competes with severity. Every
  badge carries the translated text (`components/incidents/catalog.ts`).
- **Affected-asset picker** (`IncidentAssetPicker`): opens with a batch of 20 and
  loads more with **"Mostrar más"** (server-side search, bounded by the 100
  page-size cap) - never loads the whole inventory; selected assets are removable
  chips that stay visible when the search changes. Editable inline from detail
  via `AffectedAssetsEditDialog`; saving reconciles the relationship, which
  generates the `ASSET_ADDED` / `ASSET_REMOVED` timeline events.
- **Inline field editing**: every field except `created_at` / `updated_at` /
  `created_by` / `id` / `resolved_at` is inline-editable via `FieldEditDialog`.
  Status crossing the terminal boundary routes through `/resolve` / `/reopen`;
  other transitions `PATCH` (the backend still logs the timeline event).
- **Timeline** (`IncidentTimeline`): restrained vertical timeline, muted icons
  (not a bright colour per type), read-only, message + actor + timestamp;
  Spanish prose from the backend.
- **Lifecycle**: Resolve / Reopen behind a `ConfirmDialog`; toasts
  "Incidente creado/actualizado correctamente.", "Incidente resuelto.",
  "Incidente reabierto.", "Activos afectados actualizados.";
  `notifyIncidentsChanged()` refetches the list without
  losing filter/page state.
- **Service layer** (`services/incidents.ts`) never throws - typed
  `IncidentResult<T>` for every outcome; all calls use `credentials: "include"`.
- **Dashboard**: `RecentIncidents` - a compact "Incidentes recientes" block
  (five most recent + open/critical line); rows use the full `/incidents/{id}`
  route since the dashboard is outside `/incidents`.
- Topology / dependencies, impact analysis and AI root-cause are **future**
  milestones and are not implied anywhere in the UI.

## Auth screen

`<AuthLayout>` is an **enterprise split** at `lg+` (~55/45): a deep, branded
slate panel on the left (brand, product statement over a faint primary glow,
three restrained capability highlights, a node-topology backdrop with one or two
softly pulsing nodes) and a focused auth card on the right. The contextual theme
toggle lives **inside the card header** (top-right), not floating at page level.
The left panel is a deliberately theme-independent canvas (`--auth-panel*`
tokens - dark in both light and dark mode). Below `lg` the marketing panel
collapses away entirely: brand + short tagline + card, single column. The
authentication flow itself
(`AuthForm`, validation, cookie handling) is unchanged.

## Responsive behaviour

Mobile-first. Breakpoint `lg` (1024px) switches the shell from drawer + mobile
topbar to the desktop navigation rail (collapsible; the collapsed icon rail is
desktop-only). The shell is `h-[100dvh] overflow-hidden` and the **main pane**
scrolls, so the full-height rail (and its footer) never appears cut off however
tall the page is. `html, body` carry `overflow-x: hidden` as a guard; layouts
use `max-w` + padding so nothing overflows (verified 390-1920px, sidebar
expanded and collapsed).

## Authentication (unchanged from v0.2)

The access token is an **HttpOnly cookie** set by the backend - never in
`localStorage`, never readable by JS. All API calls use `credentials: "include"`.
`AuthProvider` calls `GET /api/v1/auth/me` to establish session state;
`RequireAuth` redirects unauthenticated visitors to `/login`. CSRF / CORS /
logout semantics are backend concerns and were **not** modified by the UI work.

## Tests

Vitest + Testing Library, behaviour-focused. Covers the contextual theme toggle
(dark default / switch / persistence, `matchMedia` mocked), the i18n provider
(Spanish / interpolation / fallback), the single-card auth layout (no language
switcher) and forms, the grouped sidebar (sections / active / `· soon` / footer),
the mobile drawer (open / Escape / navigate-to-close), the **overlay** primitives
(open/close/Escape/focus-restore/a11y + `ConfirmDialog`), **toast**
(status vs alert / auto- & manual-dismiss), the confirmation-gated `LogoutButton`,
the **Dashboard** (skeleton → KPI values + hrefs, chart card titles, error+retry,
recent assets, compact health), the **charts** (companion table counts /
percentages / drill-down URLs / Spanish labels), and the **assets module**: the
service wrappers (incl. `getAssetSummary` + repeated multi-value params),
`assetValidation`, `AssetForm`, `AssetsTable`, `AssetsBrowser` (loading / empty /
error+retry / search / filter / pagination / count / **active-filter chips**),
and `AssetDetail`.
