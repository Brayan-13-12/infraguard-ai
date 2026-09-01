/**
 * Spanish translations - the source of truth for the translation shape.
 *
 * `en.ts` is typed against `Translations` so a missing or misspelled key there
 * is a compile error. Namespaces mirror the product areas so future modules
 * (assets, incidents, AI, settings, notifications, reports) slot in cleanly.
 *
 * Interpolation: `{name}` style placeholders, filled by the `t()` helper.
 * Proper nouns ("InfraGuard AI", "PostgreSQL", "Argon2id", "HttpOnly") are kept
 * verbatim on purpose.
 */
const es = {
  common: {
    appTagline: "Inteligencia de infraestructura para equipos tecnológicos modernos.",
    active: "Activo",
    inactive: "Inactivo",
    pleaseWait: "Un momento…",
    refresh: "Actualizar",
    refreshing: "Actualizando…",
    cancel: "Cancelar",
  },
  a11y: {
    changeLanguage: "Cambiar idioma",
    switchToLight: "Cambiar a modo claro",
    switchToDark: "Cambiar a modo oscuro",
    themePlaceholder: "Cargando el control de tema",
    openNav: "Abrir menú de navegación",
    closeNav: "Cerrar menú de navegación",
    primaryNav: "Navegación principal",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
  },
  auth: {
    loginTitle: "Iniciar sesión",
    loginSubtitle: "Bienvenido de nuevo a InfraGuard AI.",
    loginSubmit: "Iniciar sesión",
    loginAlt: "¿No tienes cuenta?",
    loginAltLabel: "Crear una cuenta",
    registerTitle: "Crea tu cuenta",
    registerSubtitle: "Empieza a usar InfraGuard AI en unos segundos.",
    registerSubmit: "Crear cuenta",
    registerAlt: "¿Ya tienes cuenta?",
    registerAltLabel: "Iniciar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    passwordHint: "Al menos {min} caracteres. Se aceptan frases de contraseña.",
    redirecting: "Redirigiendo…",
    registeredTitle: "Cuenta creada",
    registeredBody: "Tu cuenta para {email} está lista.",
    registeredContinue: "Continuar para iniciar sesión",
    fieldErrors: {
      emailRequired: "El correo electrónico es obligatorio.",
      emailInvalid: "Introduce un correo electrónico válido.",
      passwordRequired: "La contraseña es obligatoria.",
      passwordTooShort: "La contraseña debe tener al menos {min} caracteres.",
      passwordTooLong: "La contraseña no puede superar los {max} caracteres.",
    },
    formErrors: {
      invalidCredentials: "Correo electrónico o contraseña incorrectos.",
      conflict: "Ese correo electrónico ya está registrado.",
      rateLimited: "Demasiados intentos. Inténtalo de nuevo en un momento.",
      unreachable:
        "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
      validation: "Corrige los campos resaltados.",
      unexpected: "Algo salió mal. Inténtalo de nuevo.",
    },
  },
  shell: {
    signedInAs: "Sesión iniciada como",
    logout: "Cerrar sesión",
    loggingOut: "Cerrando sesión…",
    confirmLogout: "Confirmar",
    logoutErrorUnreachable:
      "No se pudo conectar con el servidor. Tu sesión sigue activa.",
    logoutErrorGeneric:
      "No se pudo cerrar la sesión. Tu sesión sigue activa; inténtalo de nuevo.",
  },
  guard: {
    checkingSession: "Comprobando tu sesión…",
    redirecting: "Redirigiendo al inicio de sesión…",
  },
  dashboard: {
    welcome: "Hola de nuevo, {name}. Este es el estado de tu entorno de InfraGuard AI.",
    welcomeNoName: "El estado de tu entorno de InfraGuard AI.",
    modulesTitle: "Módulos de la plataforma",
    modules: {
      authenticationDescription:
        "Inicio de sesión con correo y contraseña, hash Argon2id y cookie de sesión HttpOnly.",
      assetsDescription: "Inventario de servicios, sistemas y sus dependencias.",
      incidentsDescription:
        "Cronología de incidencias, análisis de impacto y monitorización del estado.",
      aiDescription:
        "Análisis de causa raíz asistido por IA e información sobre la infraestructura.",
    },
    account: {
      title: "Tu cuenta",
      email: "Correo electrónico",
      userId: "ID de usuario",
      status: "Estado",
      memberSince: "Miembro desde",
    },
  },
  systemHealth: {
    title: "Estado del sistema",
    subtitle: "Comprobaciones en vivo contra la API del backend.",
    frontend: "Frontend",
    backend: "API del backend",
    database: "Base de datos PostgreSQL",
    lastChecked: "Última comprobación: {time}",
    contacting: "Contactando con el backend…",
    status: {
      checking: "Comprobando…",
      operational: "Operativo",
      unavailable: "No disponible",
      unknown: "Desconocido",
    },
    details: {
      dbCheckFailed: "La comprobación de conectividad con PostgreSQL falló",
      backendUnreachable: "No se pudo contactar con la API del backend",
      backendUnreachableShort: "Backend no disponible",
      backendUnreadable: "No se pudo leer la respuesta del backend",
    },
  },
  landing: {
    badge: "v0.3 · Base de la interfaz",
    body: "InfraGuard AI reúne el contexto de los activos, la respuesta a incidencias y el análisis asistido por IA en un único lugar. La autenticación ya está disponible; los módulos de dominio están en desarrollo.",
    createAccount: "Crear cuenta",
    signIn: "Iniciar sesión",
    openDashboard: "Abrir panel",
    loadingAccount: "Cargando la cuenta",
    healthNote:
      "Los datos de estado se obtienen en vivo de la API del backend. El estado de la base de datos refleja una comprobación real de conectividad con PostgreSQL.",
  },
};

export default es;

export type Translations = typeof es;

type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

/** Dot-path of every string leaf, e.g. `"auth.fieldErrors.emailInvalid"`. */
export type TranslationKey = Leaves<Translations>;
