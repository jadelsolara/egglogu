// EGGlogU — Role Permissions & Module Groups

export const ROLE_PERMISSIONS = {
  superadmin: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','bienestar','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte','comunidad','superadmin'],
  owner: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','bienestar','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte','comunidad'],
  manager: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','bienestar','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','soporte','comunidad'],
  worker: ['dashboard','produccion','lotes','alimento','ambiente','soporte','comunidad'],
  vet: ['dashboard','lotes','ambiente','sanidad','bioseguridad','bienestar','trazabilidad','carencias','soporte','comunidad']
};

export const MODULE_GROUPS = {
  production: ['produccion','lotes','alimento','ambiente'],
  health: ['sanidad','bioseguridad','bienestar'],
  commercial: ['clientes','inventario','finanzas'],
  management: ['analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion'],
  system: ['admin','config']
};

export const HEAVY_SECTIONS = ['analisis','reportes','operaciones','trazabilidad','planificacion','carencias','bioseguridad','automatizacion'];

export const SUPERUSER_EMAIL = 'jadelsolara@pm.me';

// Restore user from localStorage on page reload
let _currentUser = { name: 'owner', role: 'owner' };
try {
  const saved = JSON.parse(localStorage.getItem('egglogu_current_user') || 'null');
  if (saved && saved.email) {
    if (saved.email.toLowerCase() === SUPERUSER_EMAIL) saved.role = 'superadmin';
    _currentUser = saved;
  }
} catch (e) { /* ignore */ }

export function setCurrentUser(user) {
  if (user && user.email && user.email.toLowerCase() === SUPERUSER_EMAIL) {
    user.role = 'superadmin';
  }
  _currentUser = user;
  // Persist for page reload resilience
  try { localStorage.setItem('egglogu_current_user', JSON.stringify({ name: user.name, role: user.role, id: user.id, email: user.email })); } catch (e) { /* ignore */ }
}
export function getCurrentUser() { return _currentUser; }
export function isSuperuserEmail(email) { return email && email.toLowerCase() === SUPERUSER_EMAIL; }

export function hasPermission(section) {
  if (!_currentUser || !_currentUser.role) return true;
  const perms = ROLE_PERMISSIONS[_currentUser.role];
  return !perms || perms.includes(section);
}
