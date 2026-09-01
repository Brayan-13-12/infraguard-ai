import type { Translations } from "./es";

/**
 * English translations. Typed against `Translations` (from `es.ts`) so the
 * structure is kept in lockstep with the source of truth.
 */
const en: Translations = {
  common: {
    appTagline: "Infrastructure intelligence for modern technology teams.",
    active: "Active",
    inactive: "Inactive",
    pleaseWait: "Please wait…",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    cancel: "Cancel",
  },
  a11y: {
    changeLanguage: "Change language",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    themePlaceholder: "Loading theme control",
    openNav: "Open navigation menu",
    closeNav: "Close navigation menu",
    primaryNav: "Primary",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  auth: {
    loginTitle: "Sign in",
    loginSubtitle: "Welcome back to InfraGuard AI.",
    loginSubmit: "Sign in",
    loginAlt: "Need an account?",
    loginAltLabel: "Create one",
    registerTitle: "Create your account",
    registerSubtitle: "Start with InfraGuard AI in a few seconds.",
    registerSubmit: "Create account",
    registerAlt: "Already registered?",
    registerAltLabel: "Sign in",
    email: "Email",
    password: "Password",
    passwordHint: "At least {min} characters. Passphrases welcome.",
    redirecting: "Redirecting…",
    registeredTitle: "Account created",
    registeredBody: "Your account for {email} is ready.",
    registeredContinue: "Continue to sign in",
    fieldErrors: {
      emailRequired: "Email is required.",
      emailInvalid: "Enter a valid email address.",
      passwordRequired: "Password is required.",
      passwordTooShort: "Password must be at least {min} characters.",
      passwordTooLong: "Password must be at most {max} characters.",
    },
    formErrors: {
      invalidCredentials: "Invalid email or password.",
      conflict: "That email is already registered.",
      rateLimited: "Too many attempts. Try again shortly.",
      unreachable: "Could not reach the server. Check your connection and try again.",
      validation: "Please fix the highlighted fields.",
      unexpected: "Something went wrong. Please try again.",
    },
  },
  shell: {
    signedInAs: "Signed in as",
    logout: "Sign out",
    loggingOut: "Signing out…",
    confirmLogout: "Confirm",
    logoutErrorUnreachable: "Could not reach the server. You are still signed in.",
    logoutErrorGeneric: "Sign out failed. You are still signed in - please try again.",
  },
  guard: {
    checkingSession: "Checking your session…",
    redirecting: "Redirecting to sign in…",
  },
  dashboard: {
    welcome: "Welcome back, {name}. Here's the state of your InfraGuard AI environment.",
    welcomeNoName: "The state of your InfraGuard AI environment.",
    modulesTitle: "Platform modules",
    modules: {
      authenticationDescription:
        "Email + password sign-in, Argon2id hashing, HttpOnly session cookie.",
      assetsDescription: "Inventory of services, systems and their dependencies.",
      incidentsDescription:
        "Incident timelines, impact analysis and health monitoring.",
      aiDescription: "AI-assisted root-cause analysis and infrastructure insight.",
    },
    account: {
      title: "Your account",
      email: "Email",
      userId: "User ID",
      status: "Status",
      memberSince: "Member since",
    },
  },
  systemHealth: {
    title: "System health",
    subtitle: "Live checks against the backend API.",
    frontend: "Frontend",
    backend: "Backend API",
    database: "PostgreSQL Database",
    lastChecked: "Last checked {time}",
    contacting: "Contacting backend…",
    status: {
      checking: "Checking…",
      operational: "Operational",
      unavailable: "Unavailable",
      unknown: "Unknown",
    },
    details: {
      dbCheckFailed: "PostgreSQL connectivity check failed",
      backendUnreachable: "Could not reach the backend API",
      backendUnreachableShort: "Backend unreachable",
      backendUnreadable: "Backend response could not be read",
    },
  },
  landing: {
    badge: "v0.3 · UI Foundation",
    body: "InfraGuard AI brings asset context, incident response and AI-assisted analysis into one place. Authentication is live today; the domain modules are in progress.",
    createAccount: "Create account",
    signIn: "Sign in",
    openDashboard: "Open dashboard",
    loadingAccount: "Loading account",
    healthNote:
      "Health data is retrieved live from the backend API. Database status reflects a real PostgreSQL connectivity check.",
  },
};

export default en;
