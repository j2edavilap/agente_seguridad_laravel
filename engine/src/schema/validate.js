/**
 * Validador de un subconjunto de JSON Schema, sin dependencias.
 * Soporta: type, required, properties, additionalProperties, enum,
 * minimum, maximum, items, minItems, pattern.
 * Es el mismo subconjunto que implementa tools/validate-reports.ps1.
 */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));
  switch (type) {
    case 'null':
      return value === null;
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateSchema(value, schema, path = '$') {
  const errors = [];
  if (!schema) return errors;

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    const expected = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
    errors.push(`${path}: se esperaba '${expected}' y llego '${typeOf(value)}'`);
    return errors;
  }

  if (value === null) return errors;

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path}: '${value}' fuera del enum`);
  }

  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} < minimo ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} > maximo ${schema.maximum}`);
    }
  }

  if (typeof value === 'string' && schema.pattern !== undefined) {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: '${value}' no cumple el patron ${schema.pattern}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: ${value.length} elementos < minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    for (const required of schema.required ?? []) {
      if (!keys.includes(required)) errors.push(`${path}.${required}: falta clave obligatoria`);
    }
    for (const key of keys) {
      const propertySchema = schema.properties?.[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) errors.push(`${path}.${key}: clave no permitida`);
        continue;
      }
      errors.push(...validateSchema(value[key], propertySchema, `${path}.${key}`));
    }
  }

  return errors;
}
