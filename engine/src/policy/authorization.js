const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function splitSections(markdown) {
  const parts = markdown.replace(/\r\n/g, '\n').split(/^##\s+/m).slice(1);
  const sections = new Map();
  for (const part of parts) {
    const heading = part.match(/^(\d+)\./);
    if (heading) sections.set(Number(heading[1]), part);
  }
  return sections;
}

function field(section, label) {
  if (!section) return null;
  const match = section.match(new RegExp(`\\*\\*${label}[^*]*:\\*\\*[ \\t]*([^\\n]*)`, 'i'));
  if (!match) return null;
  const value = match[1].trim();
  return isPlaceholder(value) ? null : value;
}

function isPlaceholder(value) {
  if (!value) return true;
  return /^(PENDIENTE|—|-+|n\/a|no|sí\/no|si\/no)$/i.test(value.trim());
}

function collectWhitelist(section) {
  if (!section) return [];
  const entries = [];
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    const urlMatch = line.match(/https?:\/\/[^\s`)\]]+/i);
    if (urlMatch) {
      entries.push(urlMatch[0]);
      continue;
    }
    const cidrMatch = line.match(/\b\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?\b/);
    if (cidrMatch) entries.push(cidrMatch[0]);
  }
  return entries;
}

function collectAuthorizedTests(section) {
  if (!section) return [];
  const tests = [];
  for (const rawLine of section.split('\n')) {
    const match = rawLine.match(/^\s*-\s*\[x\]\s*(.+)$/i);
    if (match) tests.push(match[1].trim());
  }
  return tests;
}

export function parseAuthorization(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const sections = splitSections(text);

  return {
    draft: /Estado:\s*BORRADOR/i.test(text),
    project: field(sections.get(1), 'Nombre del proyecto'),
    version: field(sections.get(1), 'Versión / commit auditado'),
    owner: field(sections.get(1), 'Responsable técnico del proyecto'),
    whitelist: collectWhitelist(sections.get(3)),
    authorizedTests: collectAuthorizedTests(sections.get(6)),
    window: {
      start: field(sections.get(4), 'Inicio'),
      end: field(sections.get(4), 'Fin'),
      timezone: field(sections.get(4), 'Zona horaria'),
    },
    signature: {
      name: field(sections.get(9), 'Nombre'),
      role: field(sections.get(9), 'Cargo'),
      date: field(sections.get(9), 'Fecha'),
      approval: field(sections.get(9), 'Firma / aprobación'),
    },
    thresholds: {
      seg: parseThreshold(thresholdField(sections.get(8), 'Seguridad \\(SEG\\)')),
      ci: parseThreshold(thresholdField(sections.get(8), 'Control de información \\(CI\\)')),
      cs: parseThreshold(thresholdField(sections.get(8), 'Calidad de software \\(CS\\)')),
    },
    signed: false,
  };
}

function thresholdField(section, label) {
  if (!section) return null;
  const match = section.match(new RegExp(`^\\s*-\\s*${label}\\s*≥\\s*([^\\n]*)`, 'mi'));
  if (!match) return null;
  const value = match[1].trim();
  return isPlaceholder(value) ? null : value;
}

function parseThreshold(value) {
  if (!value) return null;
  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function ipv4InCidr(ip, cidr) {
  const [range, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (value) =>
    value.split('.').reduce((acc, octet) => (acc << 8) + (Number(octet) & 0xff), 0) >>> 0;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

export function isHostAllowed(target, whitelist = []) {
  if (whitelist.length === 0) return false;

  let host;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    host = String(target).toLowerCase().split('/')[0].split(':')[0];
  }

  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

  for (const entry of whitelist) {
    const raw = String(entry).trim();
    if (raw.includes('/') || /^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) {
      const ip = raw.split('/')[0];
      if (isIp && (raw.includes('/') ? ipv4InCidr(host, raw) : host === ip)) return true;
      continue;
    }
    let candidate = raw;
    try {
      candidate = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
    } catch {
      candidate = raw.toLowerCase();
    }
    if (candidate.startsWith('*.')) {
      const suffix = candidate.slice(2);
      if (host === suffix || host.endsWith(`.${suffix}`)) return true;
      continue;
    }
    if (host === candidate) return true;
  }

  return false;
}

export function validateAuthorization(doc, { now = new Date() } = {}) {
  const errors = [];
  const warnings = [];

  if (doc.draft) errors.push('la autorización conserva "Estado: BORRADOR"');
  if (!doc.signature.name) errors.push('falta el nombre del responsable en la firma');
  if (!doc.signature.approval) errors.push('falta la firma o aprobación del responsable');

  const { start, end } = doc.window;
  if (!start) errors.push('falta Inicio (ISO 8601) en la ventana de tiempo');
  if (!end) errors.push('falta Fin (ISO 8601) en la ventana de tiempo');

  if (start && !ISO_WITH_OFFSET.test(start)) {
    errors.push(`Inicio '${start}' no es ISO 8601 con offset`);
  }
  if (end && !ISO_WITH_OFFSET.test(end)) {
    errors.push(`Fin '${end}' no es ISO 8601 con offset`);
  }

  if (start && end && ISO_WITH_OFFSET.test(start) && ISO_WITH_OFFSET.test(end)) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!(startMs < endMs)) {
      errors.push('la ventana de tiempo está invertida o vacía');
    } else if (now.getTime() < startMs) {
      errors.push(`fuera de la ventana: aún no empieza (inicio ${start})`);
    } else if (now.getTime() > endMs) {
      errors.push(`fuera de la ventana: ya venció (fin ${end})`);
    }
  }

  if (doc.whitelist.length === 0) errors.push('la lista blanca de hosts está vacía');
  if (!doc.window.timezone) warnings.push('la ventana no declara zona horaria');
  if (!doc.project) warnings.push('falta el nombre del proyecto');

  doc.signed = errors.length === 0;
  return { ok: errors.length === 0, errors, warnings };
}
