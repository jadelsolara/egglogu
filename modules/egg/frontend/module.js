// EGGlogU Module Registration
// Defines all sections, their custom element tags, icons, and nav keys
// When FarmLogU loads modules dynamically, it reads this contract

export const EGG_MODULE = {
  id: 'egg',
  name: 'EGGlogU',
  icon: '🥚',
  prefix: '/api/v1/egg',
  version: '3.0.0',

  sections: [
    { id: 'dashboard',      tag: 'egg-dashboard',      icon: '📊', navKey: 'nav_dashboard',      group: 'main' },
    { id: 'lotes',           tag: 'egg-flocks',          icon: '🐔', navKey: 'nav_flocks',         group: 'production' },
    { id: 'produccion',      tag: 'egg-production',      icon: '🥚', navKey: 'nav_production',     group: 'production' },
    { id: 'alimentacion',    tag: 'egg-feed',            icon: '🌾', navKey: 'nav_feed',           group: 'production' },
    { id: 'sanidad',         tag: 'egg-sanidad',         icon: '💉', navKey: 'nav_health',         group: 'health' },
    { id: 'bienestar',       tag: 'egg-welfare',         icon: '🐣', navKey: 'nav_welfare',        group: 'health' },
    { id: 'bioseguridad',    tag: 'egg-biosecurity',     icon: '🛡️', navKey: 'nav_biosecurity',    group: 'health' },
    { id: 'ambiente',        tag: 'egg-environment',     icon: '🌡️', navKey: 'nav_environment',    group: 'health' },
    { id: 'inventario',      tag: 'egg-inventory',       icon: '📦', navKey: 'nav_inventory',      group: 'operations' },
    { id: 'operaciones',     tag: 'egg-operations',      icon: '⚙️', navKey: 'nav_operations',     group: 'operations' },
    { id: 'planificacion',   tag: 'egg-planning',        icon: '📅', navKey: 'nav_planning',       group: 'operations' },
    { id: 'trazabilidad',    tag: 'egg-traceability',    icon: '🔍', navKey: 'nav_traceability',   group: 'operations' },
    { id: 'clientes',        tag: 'egg-clients',         icon: '👥', navKey: 'nav_clients',        group: 'commercial' },
    { id: 'finanzas',        tag: 'egg-finances',        icon: '💰', navKey: 'nav_finances',       group: 'commercial' },
    { id: 'carencias',       tag: 'egg-carencias',       icon: '⚠️', navKey: 'nav_shortages',      group: 'commercial' },
    { id: 'analisis',        tag: 'egg-analysis',        icon: '📈', navKey: 'nav_analytics',      group: 'intelligence' },
    { id: 'reportes',        tag: 'egg-reportes',        icon: '📄', navKey: 'nav_reports',        group: 'intelligence' },
    { id: 'automatizacion',  tag: 'egg-automatizacion',  icon: '🤖', navKey: 'nav_automation',     group: 'intelligence' },
    { id: 'soporte',         tag: 'egg-soporte',         icon: '🎧', navKey: 'nav_support',        group: 'system' },
    { id: 'configuracion',   tag: 'egg-config',          icon: '⚙️', navKey: 'nav_settings',       group: 'system' },
    { id: 'admin',           tag: 'egg-admin',           icon: '👤', navKey: 'nav_admin',          group: 'system' },
    { id: 'superadmin',      tag: 'egg-superadmin',      icon: '🔐', navKey: 'nav_superadmin',     group: 'system' },
  ],

  // Egg-specific core libraries (catalogs, VENG engine, KPIs)
  coreLibs: [
    'catalogs',   // breed curves, vaccine schedules
    'veng',       // active hens engine
    'kpi',        // egg KPI computations
    'farm-report' // egg farm report generator
  ],

  // Dynamic import of all section components
  init() {
    return Promise.all([
      import('./sections/dashboard.js'),
      import('./sections/flocks.js'),
      import('./sections/production.js'),
      import('./sections/feed.js'),
      import('./sections/sanidad.js'),
      import('./sections/welfare.js'),
      import('./sections/biosecurity.js'),
      import('./sections/environment.js'),
      import('./sections/inventory.js'),
      import('./sections/operations.js'),
      import('./sections/planning.js'),
      import('./sections/traceability.js'),
      import('./sections/clients.js'),
      import('./sections/finances.js'),
      import('./sections/carencias.js'),
      import('./sections/analysis.js'),
      import('./sections/reportes.js'),
      import('./sections/automatizacion.js'),
      import('./sections/soporte.js'),
      import('./sections/config.js'),
      import('./sections/admin.js'),
      import('./sections/superadmin.js'),
    ]);
  }
};

export default EGG_MODULE;
