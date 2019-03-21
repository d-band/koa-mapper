import moment from 'moment';
import Ajv from 'ajv';
import File from 'formidable/lib/file';
import {
  assert, transformExtends, ref, propsToSchema
} from './utils';

const converts = {
  'date': v => moment.utc(v, 'YYYY-MM-DD').toDate(),
  'time': v => moment.utc(v, 'HH:mm:ssZ.SSS').toDate(),
  'date-time': v => moment.utc(v).toDate()
};

const INT32_MIN = -1 * Math.pow(2, 31);
const INT32_MAX = Math.pow(2, 31) - 1;

export default class Validator {
  constructor(opts = {}) {
    this.ajv = new Ajv({
      coerceTypes: 'array',
      useDefaults: true,
      unknownFormats: 'ignore',
      ...opts
    });
    this.ajv.addKeyword('convert', {
      compile(convert, schema) {
        const fn = convert === true
          ? converts[schema.format]
          : convert;
        if (fn && typeof fn === 'function') {
          return (value, fullKey, data, key) => {
            data[key] = fn(value);
            return true;
          };
        }
        return () => true;
      }
    });
    this.ajv.addKeyword('file', {
      compile(checkFile, schema) {
        if (checkFile) {
          return (value) => {
            if (value && value instanceof File) {
              return true;
            }
            return false;
          };
        }
        return () => true;
      }
    });
    this.ajv.addFormat('int32', {
      type: 'number',
      validate(n) {
        return Number.isSafeInteger(n) && n >= INT32_MIN && n <= INT32_MAX;
      }
    });
    this.ajv.addFormat('int64', {
      type: 'number',
      validate(n) {
        return Number.isSafeInteger(n);
      }
    });
    this.schemas = {};
  }

  getSchemas() {
    return this.schemas;
  }

  addSchema(schemaName, props, options = {}) {
    assert(schemaName, 'schemaName is required');

    const { name, parents } = transformExtends(schemaName);
    let schema = propsToSchema(props, options);

    if (parents.length) {
      if (schema) {
        parents.push(schema);
      }
      if (parents.length === 1) {
        schema = { ...options, ...parents[0] };
      } else {
        schema = { ...options, allOf: parents };
      }
    } else {
      schema = { ...options, ...schema };
    }

    this.schemas[name] = schema;
    this.ajv.addSchema(schema, ref(name));
  }

  compile(schema) {
    return this.ajv.compile(schema);
  }
}
