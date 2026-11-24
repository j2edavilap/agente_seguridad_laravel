const PLACEHOLDERS = ['{{username}}', '{{password}}'];

export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['el plan no es un objeto'];

  if (plan.version !== 1) errors.push('version debe ser 1');

  if (plan.login !== undefined) {
    const login = plan.login;
    if (!login || typeof login !== 'object') {
      errors.push('login debe ser un objeto');
    } else {
      if (typeof login.url !== 'string' || !login.url) errors.push('login.url falta');
      if (!login.fields || typeof login.fields !== 'object') {
        errors.push('login.fields falta');
      } else {
        const values = Object.values(login.fields);
        for (const placeholder of PLACEHOLDERS) {
          if (!values.includes(placeholder)) errors.push(`login.fields no incluye ${placeholder}`);
        }
      }
      if (login.contentType && !['form', 'json'].includes(login.contentType)) {
        errors.push('login.contentType debe ser "form" o "json"');
      }
      if (login.successStatus && !Array.isArray(login.successStatus)) {
        errors.push('login.successStatus debe ser un array');
      }
      if (login.csrf && typeof login.csrf.pattern !== 'string') {
        errors.push('login.csrf.pattern falta');
      }
    }
  }

  for (const key of ['crossAccess', 'adminEndpoints']) {
    const list = plan[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`${key} debe ser un array`);
      continue;
    }
    list.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`${key}[${index}] debe ser un objeto`);
        return;
      }
      if (typeof item.url !== 'string' || !item.url) errors.push(`${key}[${index}].url falta`);
      if (typeof item.name !== 'string' || !item.name) errors.push(`${key}[${index}].name falta`);
      if (item.expect !== undefined && !Array.isArray(item.expect)) {
        errors.push(`${key}[${index}].expect debe ser un array`);
      }
      for (const field of ['as', 'owner']) {
        if (item[field] !== undefined && !['user', 'userB', 'admin', 'anonymous'].includes(item[field])) {
          errors.push(`${key}[${index}].${field} debe ser user, userB, admin o anonymous`);
        }
      }
    });
  }

  if (plan.logout !== undefined) {
    if (!plan.logout || typeof plan.logout !== 'object') {
      errors.push('logout debe ser un objeto');
    } else {
      if (typeof plan.logout.url !== 'string' || !plan.logout.url) errors.push('logout.url falta');
      if (typeof plan.logout.protectedUrl !== 'string' || !plan.logout.protectedUrl) {
        errors.push('logout.protectedUrl falta');
      }
    }
  }

  if (plan.enumerate !== undefined) {
    if (!Array.isArray(plan.enumerate)) {
      errors.push('enumerate debe ser un array');
    } else {
      plan.enumerate.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          errors.push(`enumerate[${index}] debe ser un objeto`);
          return;
        }
        if (typeof item.urlTemplate !== 'string' || !item.urlTemplate.includes('{id}')) {
          errors.push(`enumerate[${index}].urlTemplate debe incluir {id}`);
        }
        if (!Number.isInteger(item.from) || !Number.isInteger(item.to)) {
          errors.push(`enumerate[${index}] requiere from y to enteros`);
        } else if (item.to < item.from) {
          errors.push(`enumerate[${index}] tiene to < from`);
        } else if (item.to - item.from + 1 > 100) {
          errors.push(`enumerate[${index}] supera el tope de 100 IDs`);
        }
        if (item.expect !== undefined && !Array.isArray(item.expect)) {
          errors.push(`enumerate[${index}].expect debe ser un array`);
        }
        if (item.as !== undefined && !['user', 'userB', 'admin'].includes(item.as)) {
          errors.push(`enumerate[${index}].as debe ser user, userB o admin`);
        }
      });
    }
  }

  return errors;
}

export function parsePlan(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { plan: null, errors: [`JSON inválido: ${error.message}`] };
  }
  const errors = validatePlan(parsed);
  return { plan: errors.length > 0 ? null : parsed, errors };
}
