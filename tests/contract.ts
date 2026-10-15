import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { openApiDocument } from '../src/docs/openapi.js';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export function contractFor(name: keyof typeof openApiDocument.components.schemas) {
  let validate = validators.get(name);
  if (!validate) {
    validate = ajv.compile({
      components: openApiDocument.components,
      $ref: `#/components/schemas/${name}`,
    });
    validators.set(name, validate);
  }
  return validate;
}
