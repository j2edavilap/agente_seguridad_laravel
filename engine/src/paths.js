/**
 * Todo lo que crea el agente vive bajo una sola carpeta: `sectest/`.
 * Las rutas de artefactos usan '/' porque viajan en JSON e informes.
 */
export const SECTEST_DIR = 'sectest';
export const SCOPE_DIR = `${SECTEST_DIR}/scope`;
export const REPORTS_DIR = `${SECTEST_DIR}/reports`;
export const TESTS_DIR = `${SECTEST_DIR}/tests`;
export const TOOLS_DIR = `${SECTEST_DIR}/tools`;

export const AUTHORIZATION_FILE = `${SCOPE_DIR}/authorization.md`;
export const DRAFT_FILE = `${SCOPE_DIR}/authorization.draft.md`;
export const CREDENTIALS_FILE = `${SCOPE_DIR}/credentials.conf`;
export const PLAN_FILE = `${SCOPE_DIR}/dynamic-plan.json`;
export const CANARY_FILE = `${SCOPE_DIR}/canary.json`;

export const CONTRACTS_DIR = `${REPORTS_DIR}/contratos`;
export const FINDINGS_DIR = `${REPORTS_DIR}/hallazgos`;
export const EVIDENCE_DIR = `${REPORTS_DIR}/evidencia`;

export const REPORT_FILE = (name) => `${REPORTS_DIR}/${name}`;
