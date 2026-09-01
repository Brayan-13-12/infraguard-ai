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
├── app/                  routes: / · /login · /register · /dashboard ·
│                         /assets · /assets/new · /assets/[id] · /assets/[id]/edit · /healthz
├── components/
│   ├── ui/               design system (Button, Input, Select, Textarea, Card,
│   │                     Badge, Alert, PageHeader, Pagination, Spinner,
│   │                     EmptyState, Reveal, icons)
│   ├── theme/            ThemeProvider (next-themes) + ThemeToggle
│   ├── shell/            AppShell · Sidebar · SidebarFooter · Topbar ·
│   │                     MobileNav · NavList · LogoutButton
│   ├── auth/             AuthLayout
│   ├── dashboard/        PlatformModules · AccountCard
│   ├── assets/           AssetsBrowser · AssetsTable · AssetFilters · AssetForm ·
│   │                     AssetDetail · AssetBadges · catalog
│   ├── AuthProvider · RequireAuth · AuthForm · AuthNav · Brand ·
│   │                     SystemHealth · LanguageSwitcher
├── i18n/                 LanguageProvider · useTranslation() · translations/{es,en}
├── lib/                  cn · config · validation · assetValidation · navigation
├── services/             auth · health · assets  (fetch wrappers - never throw)
├── types/                auth · health · asset  (+ runtime type guards)
└── test/                 shared test helpers (matchMedia)
```

## Internationalisation (Spanish default, + English)

- **No dependency.** `src/i18n/` is a small custom layer: `config.ts`
  (`LANGUAGES`, `DEFAULT_LANGUAGE = "es"`, storage key), `translations/es.ts`
  (the source of truth for the shape - `en.ts` is typed against it, so a missing
  key is a compile error), and `provider.tsx`.
- **API:** `LanguageProvider` + `useTranslation()` → `{ t, language, setLanguage,
  languages }`. `t("auth.loginTitle")` takes a type-checked dot-path key and
  supports `{var}` interpolation (`t("auth.passwordHint", { min: 12 })`).
  Resolution falls back active-language → Spanish → the key itself.
- **Hydration-safe:** server and first client render use Spanish; a persisted
  choice is applied in an effect after mount (same pattern as the theme toggle),
  so there is no mismatch. `<html lang>` is kept in sync.
- **Persistence:** `localStorage` (`infraguard.language`) - a non-sensitive UI
  preference, never auth data.
- **Switcher:** `<LanguageSwitcher />` - a labelled `ES | EN` button group
  (`aria-pressed`, "Cambiar idioma" / "Change language"). Sits inside the auth
  card, in the sidebar footer, and in the mobile drawer.
- **Fixed English regardless of language** - product/module proper nouns:
  `InfraGuard AI`, the sidebar nav labels (`Dashboard`, `Assets`, `Incidents`,
  `AI Assistant`, `Settings`), the `Dashboard` page heading, the dashboard
  module names, and the `Coming soon` marker. Everything descriptive around them
  (the dashboard welcome line, module descriptions, account labels, …) still
  translates.
- Proper nouns ("PostgreSQL", "Argon2id", "HttpOnly") and user data (emails,
  UUIDs) are never translated.

## Theming (light / dark)

- **Engine:** [`next-themes`](https://github.com/pacocoursey/next-themes) - a
  ~3.5 KB, zero-dependency library that handles SSR hydration (an inline script
  sets the theme before first paint, so **no flash, no mismatch**), persists the
  choice to `localStorage` (`theme` key - a non-sensitive UI preference), and
  honours the OS preference on first visit (`defaultTheme="system"`).
- **Tokens:** semantic CSS variables in `src/app/globals.css` -
  `--background`, `--foreground`, `--surface`, `--surface-elevated`, `--border`,
  `--muted` / `--muted-foreground`, `--primary` / `--primary-hover` /
  `--primary-foreground`, `--success` / `--warning` / `--danger`, `--ring`.
  Values are HSL channel triplets so Tailwind's alpha slot works
  (`bg-primary/10`). `tailwind.config.ts` maps them to utilities.
  **Components never use raw hex.**
- **Dark mode:** `darkMode: "class"` - `next-themes` toggles `class="dark"` on
  `<html>`; `<html suppressHydrationWarning>` in the root layout.
- **Switcher:** `<ThemeToggle />` - a **single contextual button**. It shows the
  icon of the mode you switch *to* (a sun while dark is active, a moon while
  light is active) and its `aria-label` tracks the action. "System" is never
  surfaced in the UI; the first explicit tap persists a concrete `light` /
  `dark` choice.

## Motion system

Reusable, CSS-only (no animation library). `tailwind.config.ts` defines a small
set of entrance keyframes - `fade-in`, `fade-in-up`, `scale-in`,
`slide-in-left`, all 150-260ms. `<Reveal>` (`components/ui/Reveal.tsx`) is the
shared entrance primitive (soft fade + 6px rise, optional stagger `delayMs`);
interactive feedback is hover/focus colour + small transform transitions.
Everything is gated by `motion-safe:` / `motion-reduce:` and the global
`prefers-reduced-motion` rule in `globals.css`.

## Design system

Small internal component set (Tailwind + tokens - no UI framework). `cn()` in
`src/lib/cn.ts` is a dependency-free class joiner. Icons are inline SVG
(`components/ui/icons.tsx`) - no icon-library dependency.

## Authenticated app shell

`<AppShell>` = a fixed sidebar on desktop / a portalled drawer on mobile
(`MobileNav`, opened from the mobile-only `Topbar`), and a scrolling content
column. The **sidebar** carries navigation and a footer with the language
switcher, theme toggle, the signed-in identity, and a confirmation-gated
`<LogoutButton>` (a first tap arms an explicit Confirm / Cancel step; state is
only cleared when `logout()` returns `{ ok: true }`). The mobile drawer repeats
the same controls. Navigation (`src/lib/navigation.ts`) uses fixed English
labels: **Dashboard** and **Assets** are real routes; **Incidents / AI Assistant
/ Settings** render as disabled "Coming soon" items. Routes are guarded
client-side by `<RequireAuth>`.

## Assets (infrastructure inventory)

| Route | Purpose |
| --- | --- |
| `/assets` | list - title, result count, debounced search, catalog + activity filters, "New asset", responsive table (cards below `lg`), pagination, and explicit loading / empty / filtered-empty / error states. Search, filters and page are mirrored into the URL query string; the component that reads `useSearchParams` sits inside a `<Suspense>` boundary |
| `/assets/new` | `<AssetForm mode="create">` |
| `/assets/[id]` | detail - header + criticality/status badges, overview, description, actions (Edit, confirmation-gated Deactivate / Reactivate), and a disabled dependencies/incidents placeholder |
| `/assets/[id]/edit` | `<AssetForm mode="edit" initial={asset}>` |

- **One form** (`AssetForm`) for create and edit. Client validation lives in
  `lib/assetValidation.ts` (returns codes the component translates); server
  field errors from a `422` are merged in.
- **Service layer** (`services/assets.ts`) never throws - every outcome
  (`unreachable` / `unauthorized` / `not_found` / `validation` / `rate_limited` /
  `unexpected`) is a typed result. All calls use `credentials: "include"`.
- **Catalog i18n:** the vocabulary values (`Server`, `Production`, `Critical`,
  `Operational`, …) are English in the data; `components/assets/catalog.ts` maps
  each to a translation key for display. Criticality / status badges always
  carry the translated **text** - colour is only a hint (accessible + grayscale
  safe, both themes). The `Assets` nav label itself stays English.

## Auth screen

`<AuthLayout>` is a **single self-contained centered card** at every width - no
page-level header, nothing floating in the corners. A compact row inside the
card holds the `InfraGuard AI` brand on the left and the language switcher +
theme toggle on the right; the form (`AuthForm`) follows. The card sits centered
on the restrained backdrop (faint primary glow + masked grid).

## Responsive behaviour

Mobile-first. Breakpoint `lg` (1024px) switches the shell from drawer + mobile
topbar to a fixed sidebar. `html, body` carry `overflow-x: hidden` as a guard;
layouts still use `max-w` + padding so nothing actually overflows (verified at
360-1440px).

## Authentication (unchanged from v0.2)

The access token is an **HttpOnly cookie** set by the backend - never in
`localStorage`, never readable by JS. All API calls use `credentials: "include"`.
`AuthProvider` calls `GET /api/v1/auth/me` to establish session state;
`RequireAuth` redirects unauthenticated visitors to `/login`. CSRF / CORS /
logout semantics are backend concerns and were **not** modified by the UI work.

## Tests

Vitest + Testing Library, behaviour-focused. Covers the contextual theme toggle
(switch / persistence / OS fallback, `matchMedia` mocked), the i18n provider and
`ES | EN` switcher (default / interpolation / persistence / fallback), the
single-card auth layout and forms (incl. the show/hide-password control), the
app shell + active nav + sidebar footer, the mobile drawer (open / Escape /
navigate-to-close), the confirmation-gated `LogoutButton`, authentication +
logout, and the **assets module**: the service wrappers (status → typed
result), `assetValidation` (IP + form rules), `AssetForm` (client validation,
normalised submit, server errors, edit prefill, es/en), `AssetsTable` (rows /
badges / inactive / re-translation), `AssetsBrowser` (loading / empty / error +
retry / search / filter / pagination / count), and `AssetDetail` (render +
confirmation-gated deactivate / reactivate).
