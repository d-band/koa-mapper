import qs from 'qs';
export const debug = require('debug')('koa-mapper');

export function safeDecodeURIComponent(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return text;
  }
}

export function assert(value, message) {
  if (value) return;
  throw new Error(message);
}

export function validateError(errors) {
  const message = errors.map((e) => {
    if (e.dataPath) {
      const key = e.dataPath.replace(/^./, '');
      return `[${key}] ${e.message}`;
    } else {
      return e.message;
    }
  }).join('\n');
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  throw err;
}

export function toURI(base, query) {
  if (!query) return base;
  if (typeof query === 'string') {
    query = qs.parse(query);
  }
  const str = qs.stringify(query);
  if (!str) return base;
  if (base.indexOf('?') >= 0) {
    return `${base}&${str}`;
  } else {
    return `${base}?${str}`;
  }
}

export function takeInOptions(opts, key) {
  const map = {
    'path': ['summary', 'description'],
    'method': ['tags', 'summary', 'description', 'externalDocs', 'responses', 'callbacks', 'deprecated', 'security', 'servers']
  };
  const obj = {};
  map[key].forEach((k) => {
    if (opts[k] !== undefined) {
      obj[k] = opts[k];
    }
  });
  return obj;
}

export const TYPES = ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'];
export const FORMATS = ['date', 'time', 'date-time', 'regex'];

export function ref(name) {
  return `#/components/schemas/${name}`;
}

export function getMixType(type) {
  const types = {
    file: { type: 'object', file: true }
  };
  TYPES.forEach((t) => {
    types[t] = { type: t };
  });
  FORMATS.forEach((t) => {
    types[t] = { type: 'string', format: t, convert: true };
  });
  types['datetime'] = types['date-time'];

  const hasAnd = /&/.test(type);
  const hasOr = /\|/.test(type);
  if (hasAnd && hasOr) {
    throw new Error('& and | can only have one');
  }
  const arr = [];
  type.split(/[&|]/).forEach((t) => {
    t = t.trim();
    if (t) {
      const simple = types[t.toLowerCase()];
      arr.push(simple || { $ref: ref(t) });
    }
  });
  if (arr.length > 1) {
    return hasAnd ? { allOf: arr } : { oneOf: arr };
  } else {
    return arr[0];
  }
}

export function transformExtends(name) {
  const arr = name.split(/:/);
  const clz = { name: arr[0].trim(), parents: [] };
  if (arr[1]) {
    arr[1].split(/,/).forEach((str) => {
      const parent = str.trim();
      if (parent) {
        clz.parents.push({ $ref: ref(parent) });
      }
    });
  }
  return clz;
}

export function transformType(type) {
  type = type.trim();
  if (!type) return {};

  const arrayRE = /array\s?<([^<>]+)>/i;
  const m = arrayRE.exec(type);
  if (m) {
    const str = m[1].trim();
    if (!str) {
      return { type: 'array' };
    }
    return {
      type: 'array',
      items: getMixType(str)
    };
  } else {
    return getMixType(type);
  }
}

export function propsToSchema(props, options = {}) {
  if (props && typeof props === 'string') {
    return { $ref: ref(props) };
  }
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
    return { type: 'object', properties, required };
  }
  return null;
}
