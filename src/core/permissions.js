// EGGlogU — Role Permissions & Module Groups

export const ROLE_PERMISSIONS = {
  superadmin: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte','superadmin'],
  owner: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','admin','config','soporte'],
  manager: ['dashboard','produccion','lotes','alimento','ambiente','sanidad','bioseguridad','clientes','inventario','finanzas','analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion','soporte'],
  worker: ['dashboard','produccion','lotes','alimento','ambiente','soporte'],
  vet: ['dashboard','lotes','ambiente','sanidad','bioseguridad','trazabilidad','carencias','soporte']
};

export const MODULE_GROUPS = {
  production: ['produccion','lotes','alimento','ambiente'],
  health: ['sanidad','bioseguridad'],
  commercial: ['clientes','inventario','finanzas'],
  management: ['analisis','operaciones','trazabilidad','planificacion','carencias','reportes','automatizacion'],
  system: ['admin','config']
};

export const HEAVY_SECTIONS = ['analisis','reportes','operaciones','trazabilidad','planificacion','carencias','bioseguridad','automatizacion'];

let _currentUser = { name: 'owner', role: 'owner' };

export function setCurrentUser(user) { _currentUser = user; }
export function getCurrentUser() { return _currentUser; }

export function hasPermission(section) {
  if (!_currentUser || !_currentUser.role) return true;
  const perms = ROLE_PERMISSIONS[_currentUser.role];
  return !perms || perms.includes(section);
}
