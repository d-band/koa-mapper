import moment from 'moment';
import Ajv from 'ajv';
import File from 'formidable/lib/file';
import { assert, transformExtends, transformType, ref } from './utils';

const converts = {
  'date': v => moment.utc(v, 'YYYY-MM-DD').toDate(),
  'time': v => moment.utc(v, 'HH:mm:ssZ.SSS').toDate(),
  'date-time': v => moment.utc(v).toDate()
};

export default class Validator {
  constructor() {
    this.ajv = new Ajv({
      coerceTypes: true,
      useDefaults: true
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
    this.schemas = {};
  }

  getSchemas() {
    return this.schemas;
  }

  addSchema(schemaName, props, options = {}) {
    assert(schemaName, 'schemaName is required');

    const { name, parents } = transformExtends(schemaName);

    let schema = null;

    if (props && Object.keys(props).length) {
      const properties = {};
      const requiredArr = options.required || [];
      Object.keys(props).forEach((k) => {
        const { type, required, ...others } = props[k];
        const typeObj = transformType(type);
        properties[k] = { ...typeObj, ...others };
        if (required) {
          requiredArr.push(k);
        }
      });
      const required = [...new Set(requiredArr)];
      schema = { type: 'object', properties, required };
    }

    if (parents.length) {
      if (schema) {
        parents.push(schema);
      }
      schema = { ...options, allOf: parents };
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
