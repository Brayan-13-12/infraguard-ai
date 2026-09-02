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
    retry: "Reintentar",
  },
  a11y: {
    switchToLight: "Cambiar a modo claro",
    switchToDark: "Cambiar a modo oscuro",
    openNav: "Abrir menú de navegación",
    closeNav: "Cerrar menú de navegación",
    primaryNav: "Navegación principal",
    userMenu: "Menú de cuenta",
    collapseNav: "Contraer la navegación",
    expandNav: "Expandir la navegación",
    comingSoon: "Próximamente",
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
    split: {
      statement: "Inteligencia de infraestructura para equipos tecnológicos modernos.",
      inventoryTitle: "Visibilidad del inventario",
      inventoryBody:
        "Servidores, bases de datos y servicios en un inventario único y consultable.",
      operationsTitle: "Inteligencia operacional",
      operationsBody:
        "Estado, criticidad y cambios de tu infraestructura de un vistazo.",
      aiTitle: "Análisis asistido por IA",
      aiBody: "Causa raíz e impacto con ayuda de IA cuando algo falla.",
    },
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
    logout: "Salir",
    loggingOut: "Saliendo…",
    confirmLogout: "Confirmar",
    logoutConfirmTitle: "¿Deseas salir de InfraGuard AI?",
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
    loadError: "No se pudo cargar el panel.",
    refreshFailed: "No se pudo actualizar el panel.",
    refreshedAt: "Actualizado {time}",
    kpi: {
      total: "Activos totales",
      critical: "Críticos",
      operational: "Operativos",
      degradedOffline: "Degradados / Fuera de servicio",
      maintenance: "Mantenimiento",
      inactive: "Inactivos",
      hints: {
        total: "Ver todos los activos",
        critical: "Ver activos críticos",
        operational: "Ver activos operativos",
        degradedOffline: "Ver degradados y fuera de servicio",
        maintenance: "Ver en mantenimiento",
        inactive: "Ver activos inactivos",
      },
    },
    charts: {
      criticalityTitle: "Activos por criticidad",
      statusTitle: "Estado operativo",
      environmentTitle: "Activos por entorno",
      typeTitle: "Activos por tipo",
      clickToFilter: "Clic para filtrar",
      empty: "Sin datos que mostrar",
      total: "Total",
      centerUnit: "activos",
      tableCaption: "Datos del gráfico: {title}",
      categoryColumn: "Categoría",
      countColumn: "Recuento",
      shareColumn: "Porcentaje",
      shareOfTotal: "{percent} % del total",
    },
    health: {
      operational: "Sistema operativo",
      degraded: "Sistema degradado",
      checking: "Comprobando el sistema…",
      unknown: "Estado del sistema desconocido",
      viewDetails: "Ver el estado del sistema",
      dialogTitle: "Estado del sistema",
    },
    operational: {
      title: "Estado actual",
      viewFiltered: "Ver activos con estado {label}",
    },
    insight: {
      topEnvironment: "Entorno principal",
      topType: "Tipo predominante",
      assets: "{count} activos",
    },
    recent: {
      title: "Actualizados recientemente",
      empty: "Aún no hay actividad de activos.",
      viewAll: "Ver todos los activos",
      updated: "Actualizado {time}",
    },
    modulesTitle: "Módulos de la plataforma",
    modules: {
      authenticationDescription:
        "Inicio de sesión con correo y contraseña, hash Argon2id y cookie de sesión HttpOnly.",
      assetsDescription:
        "Inventario de servidores, bases de datos, servicios y otros recursos de infraestructura.",
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
  nav: {
    comingSoon: "Próximamente",
  },
  overlay: {
    close: "Cerrar",
  },
  toast: {
    regionLabel: "Notificaciones",
    dismiss: "Descartar notificación",
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
    badge: "Consola de operaciones de infraestructura",
    body: "InfraGuard AI reúne el inventario de activos, la respuesta a incidencias y el análisis asistido por IA en una sola consola. La autenticación y el inventario de activos ya están disponibles; el resto de módulos está en desarrollo.",
    createAccount: "Crear cuenta",
    signIn: "Iniciar sesión",
    openDashboard: "Abrir panel",
    loadingAccount: "Cargando la cuenta",
    healthNote:
      "Los datos de estado se obtienen en vivo de la API del backend. El estado de la base de datos refleja una comprobación real de conectividad con PostgreSQL.",
  },
  assetFields: {
    name: "Nombre",
    type: "Tipo",
    environment: "Entorno",
    criticality: "Criticidad",
    status: "Estado",
    hostname: "Nombre de host",
    ipAddress: "Dirección IP",
    owner: "Responsable",
    description: "Descripción",
    created: "Creado",
    updated: "Actualizado",
    id: "ID",
  },
  assetCatalog: {
    type: {
      server: "Servidor",
      virtualMachine: "Máquina virtual",
      database: "Base de datos",
      application: "Aplicación",
      networkDevice: "Dispositivo de red",
      container: "Contenedor",
      kubernetesCluster: "Clúster de Kubernetes",
      cloudResource: "Recurso en la nube",
    },
    environment: {
      production: "Producción",
      staging: "Preproducción",
      development: "Desarrollo",
      test: "Pruebas",
    },
    criticality: {
      critical: "Crítica",
      high: "Alta",
      medium: "Media",
      low: "Baja",
    },
    status: {
      operational: "Operativo",
      degraded: "Degradado",
      maintenance: "Mantenimiento",
      offline: "Fuera de servicio",
    },
  },
  assets: {
    subtitle: "Inventario de la infraestructura que InfraGuard AI supervisa.",
    count: "{count} activos",
    countOne: "1 activo",
    searchPlaceholder: "Buscar por nombre, host, responsable o IP",
    searchLabel: "Buscar activos",
    newAsset: "Nuevo activo",
    inactiveBadge: "Inactivo",
    loading: "Cargando activos…",
    loadErrorTitle: "No se pudieron cargar los activos",
    loadErrorBody: "Comprueba tu conexión e inténtalo de nuevo.",
    retry: "Reintentar",
    emptyTitle: "Aún no hay activos",
    emptyBody:
      "Registra tu primer elemento de infraestructura para empezar a construir el inventario.",
    emptyCta: "Crear activo",
    emptyFilteredTitle: "Ningún activo coincide con los filtros",
    emptyFilteredBody: "Prueba a ajustar la búsqueda o a restablecer los filtros.",
  },
  filters: {
    title: "Filtros",
    all: "Todos",
    reset: "Restablecer filtros",
    state: "Actividad",
    stateAny: "Cualquier estado",
    stateActive: "Solo activos",
    stateInactive: "Solo inactivos",
    chips: {
      label: "Filtros activos",
      clearAll: "Limpiar todo",
      remove: "Quitar filtro: {label}",
      search: "Búsqueda",
    },
  },
  pagination: {
    summary: "{from}–{to} de {total}",
    previous: "Anterior",
    next: "Siguiente",
    pageOf: "Página {page} de {pages}",
  },
  assetForm: {
    createTitle: "Nuevo activo",
    editTitle: "Editar activo",
    createSubtitle: "Añade un elemento de infraestructura al inventario.",
    editSubtitle: "Actualiza los detalles de este activo.",
    optional: "opcional",
    hintHostname: "Nombre de host o FQDN.",
    hintIpAddress: "Dirección IPv4 o IPv6.",
    hintDescription: "Notas breves sobre este activo.",
    submitCreate: "Crear activo",
    submitEdit: "Guardar cambios",
    saving: "Guardando…",
    cancel: "Cancelar",
    errorNameRequired: "El nombre es obligatorio.",
    errorNameTooLong: "El nombre no puede superar los {max} caracteres.",
    errorIpInvalid: "Introduce una dirección IPv4 o IPv6 válida.",
    errorHostnameTooLong: "El nombre de host no puede superar los {max} caracteres.",
    errorOwnerTooLong: "El responsable no puede superar los {max} caracteres.",
    errorDescriptionTooLong: "La descripción no puede superar los {max} caracteres.",
    errorGeneric: "No se pudo guardar el activo. Revisa los campos e inténtalo de nuevo.",
    errorUnreachable: "No se pudo conectar con el servidor. Inténtalo de nuevo.",
    errorNotFound: "Este activo ya no existe.",
    createdToast: "Activo creado correctamente.",
    updatedToast: "Activo actualizado correctamente.",
  },
  assetDetail: {
    overview: "Resumen",
    actions: "Acciones",
    description: "Descripción",
    noDescription: "Sin descripción.",
    notSet: "No definido",
    edit: "Editar",
    deactivate: "Desactivar",
    reactivate: "Reactivar",
    deactivateConfirm:
      "¿Desactivar este activo? Seguirá disponible pero se marcará como inactivo.",
    reactivateConfirm: "¿Reactivar este activo?",
    confirm: "Confirmar",
    inactiveNotice: "Este activo está inactivo.",
    actionError: "No se pudo completar la acción. Inténtalo de nuevo.",
    deactivatedToast: "Activo desactivado.",
    reactivatedToast: "Activo reactivado.",
    backToList: "Volver a Assets",
    loadError: "No se pudo cargar el activo.",
    notFoundTitle: "Activo no encontrado",
    notFoundBody: "Puede que se haya eliminado o que el enlace no sea correcto.",
    futureTitle: "Dependencias e incidencias",
    futureBody:
      "El mapa de dependencias y el historial de incidencias aparecerán aquí en próximas versiones.",
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
