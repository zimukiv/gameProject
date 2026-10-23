import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../model/level.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const check = ajv.compile(schema);
export function schemaErrors(value: unknown): string[] {
  if (check(value)) return [];
  return (check.errors ?? []).map(error => `${error.instancePath || '/'}: ${error.message ?? 'Schema error'}`);
}
export function assertSchema(value: unknown): void {
  const errors = schemaErrors(value);
  if (errors.length) throw new Error(`JSON Schema 校验失败：${errors.join('; ')}`);
}
