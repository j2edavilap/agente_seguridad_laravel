import path from 'node:path';

import { REPORTS_DIR, SECTEST_DIR } from '../paths.js';

function assertInside(projectRoot, base, target, label) {
  const root = path.resolve(projectRoot, base);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);

  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`escritura bloqueada fuera de ${label}/: ${resolved}`);
  }
  return resolved;
}

/** El motor solo escribe dentro de <proyecto>/sectest/reports. */
export function assertInsideSectestReports(projectRoot, target) {
  return assertInside(projectRoot, REPORTS_DIR, target, REPORTS_DIR);
}

/** Para el arnés de pruebas y las herramientas: permite todo sectest/, no solo reports/. */
export function assertInsideSectest(projectRoot, target) {
  return assertInside(projectRoot, SECTEST_DIR, target, SECTEST_DIR);
}
