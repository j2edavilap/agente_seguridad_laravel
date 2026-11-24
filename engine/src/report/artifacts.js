import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { assertInsideSectestReports } from '../io/paths.js';
import { EVIDENCE_DIR, FINDINGS_DIR, REPORTS_DIR } from '../paths.js';

export function writeReport(projectRoot, fileName, content) {
  const directory = path.join(projectRoot, REPORTS_DIR);
  mkdirSync(directory, { recursive: true });
  const target = assertInsideSectestReports(projectRoot, path.join(directory, fileName));
  writeFileSync(target, content, 'utf8');
  return target;
}

export function writeFindingsArtifact(projectRoot, payload) {
  const directory = path.join(projectRoot, FINDINGS_DIR);
  mkdirSync(directory, { recursive: true });
  const target = assertInsideSectestReports(projectRoot, path.join(directory, `${payload.subagente}.json`));
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

export function writeEvidence(projectRoot, checkName, payload) {
  const directory = path.join(projectRoot, EVIDENCE_DIR);
  mkdirSync(directory, { recursive: true });
  const safeName = String(checkName).replace(/[^a-z0-9-]/gi, '-');
  const target = assertInsideSectestReports(projectRoot, path.join(directory, `A-03-${safeName}.json`));
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return target;
}

export function readArtifacts(projectRoot) {
  const directory = path.join(projectRoot, FINDINGS_DIR);
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .flatMap((name) => {
      try {
        const payload = JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
        if (!payload || typeof payload !== 'object' || !payload.subagente) return [];
        return [payload];
      } catch {
        return [];
      }
    });
}

export function existingReportFiles(projectRoot) {
  const reports = path.join(projectRoot, REPORTS_DIR);
  if (!existsSync(reports)) return [];
  return readdirSync(reports)
    .filter((name) => name.endsWith('.md'))
    .sort();
}
