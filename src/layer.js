import qs from 'qs';
import extend from 'extend';
import ptr from 'path-to-regexp';
import bodyParser from 'koa-body';
import {
  debug, assert, safeDecodeURIComponent, takeInOptions,
  transformType, toURI, validateError, propsToSchema
} from './utils';

export default class Layer {
  constructor(path, methods, middlewares, opts) {
    this.opts = opts || {};
    this.name = this.opts.name || null;
    this.methods = [];
    this.pathKeys = [];
    this.parameters = [];
    this.operations = methods;
    this.stack = Array.isArray(middlewares) ? middlewares : [middlewares];

    methods.forEach((method) => {
      const m = method.toUpperCase();
      this.methods.push(m);
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/HEAD
      if (m === 'GET') {
        this.methods.unshift('HEAD');
      }
    });

    // ensure middleware is a function
    this.stack.forEach((fn) => {
      const msg = `${methods} ${this.opts.name || path}: middleware must be a function`;
      assert(typeof fn === 'function', msg);
    });

    this.path = path;
    this.setPrefix(this.opts.prefix || '');
    this.setBodyParser();
  }

  getPathItem() {
    const {
      pathTemplate, parameters, operations, opts
    } = this;
    if (!pathTemplate || opts.ignoreParams) {
      return {};
    }
    const path = pathTemplate();
    let tmp = {};
    if (operations.length) {
      const obj = takeInOptions(opts, 'method');
      if (parameters.length) {
        extend(true, obj, { parameters });
      }
      if (this.bodySchema) {
        const map = {
          json: 'application/json',
          form: 'application/x-www-form-urlencoded',
          multipart: 'multipart/form-data'
        };
        const bodyType = opts.bodyType || ['json', 'form'];
        const requestBody = { content: {} };
        [].concat(bodyType).forEach((t) => {
          const type = map[t] || t;
          requestBody.content[type] = { schema: this.bodySchema };
        });
        extend(true, obj, { requestBody });
      }
      operations.forEach((m) => {
        tmp[m.toLowerCase()] = obj;
      });
    } else {
      tmp = takeInOptions(opts, 'path');
      if (parameters.length) {
        extend(true, tmp, { parameters });
      }
    }
    return { [path]: tmp };
  }

  setParameters() {
    const { pathKeys, opts } = this;
    const { params } = opts;

    const inPath = {};
    const parameters = pathKeys.map((key, index) => {
      const name = String(key.name);
      inPath[name] = { index };
      return {
        name,
        in: 'path',
        required: !key.optional,
        schema: { type: 'string' }
      };
    });
    params && Object.keys(params).forEach((name) => {
      const obj = params[name] || {};
      const param = takeInOptions(obj, 'param');
      const schema = takeInOptions(obj, 'schema');

      param.name = name;

      if (obj.type) {
        extend(true, schema, transformType(obj.type));
      }
      if (Object.keys(schema).length) {
        param.schema = extend(true, param.schema, schema);
      }
      const find = inPath[name];
      if (find) {
        const { index } = find;
        parameters[index] = extend(true, parameters[index], param);
        assert(parameters[index].in === 'path', `${name} must be in path`);
      } else {
        parameters.push(param);
      }
    });
    this.parameters = parameters;
  }

  getParamsValidate() {
    if (this.paramsValidate) {
      return this.paramsValidate;
    }
    if (this.parameters.length === 0 || this.opts.ignoreParams) {
      return null;
    }
    const properties = {};
    const required = [];
    let hasProps = false;
    this.parameters.forEach((p) => {
      if (p.schema) {
        hasProps = true;
        properties[p.name] = p.schema;
        if (p.required) {
          required.push(p.name);
        }
      }
    });
    if (!hasProps) return null;
    const { validator } = this.opts;
    if (!validator) return null;
    this.paramsValidate = validator.compile({
      type: 'object',
      properties,
      required
    });
    return this.paramsValidate;
  }

  setBodyParser() {
    const { body, bodyparser } = this.opts;
    if (bodyparser || body) {
      this.setBodyValidate();
      const options = bodyparser === true ? {} : bodyparser;
      this.stack.unshift(bodyParser(options));
    }
  }

  setBodyValidate() {
    const { body, validator } = this.opts;
    if (!body || !validator) return;
    this.bodySchema = propsToSchema(body);
    if (this.bodySchema) {
      this.stack.unshift((ctx, next) => {
        if (!this.bodyValidate) {
          this.bodyValidate = validator.compile(this.bodySchema);
        }
        const { throwBodyError } = this.opts;
        const valid = this.bodyValidate(ctx.request.body);
        ctx.bodyErrors = this.bodyValidate.errors;
        if (!valid && throwBodyError !== false) {
          if (typeof throwBodyError === 'function') {
            throwBodyError(ctx.bodyErrors);
          } else {
            validateError(ctx.bodyErrors);
          }
        }
        return next();
      });
    }
  }

  setPrefix(prefix) {
    if (this.path) {
      this.path = prefix + this.path;
      if (/.+\/$/.test(this.path)) {
        this.path = this.path.replace(/\/$/, '');
      }
      debug('defined route %s %s', this.methods, this.path);

      const tokens = ptr.parse(this.path, this.opts);
      this.pathKeys = [];
      this.regexp = ptr.tokensToRegExp(tokens, this.pathKeys, this.opts);
      this.url = (params, options = {}) => {
        let replace = {};
        if (Array.isArray(params)) {
          this.pathKeys.forEach((key, i) => {
            replace[key.name] = params[i];
          });
        } else {
          replace = params;
        }
        const toPath = ptr.tokensToFunction(tokens);
        const base = toPath(replace, options);
        return toURI(base, options.query);
      };
      this.pathTemplate = () => {
        const obj = this.pathKeys.reduce((memo, k) => {
          memo[k.name] = k.name;
          return memo;
        }, {});
        return this.url(obj, {
          encode: v => `{${v}}`,
          skipMatch: true
        });
      };
      this.setParameters();
    }
    return this;
  }

  match(path) {
    return this.regexp.test(path);
  }

  params(path, ctx) {
    // "query", "header", "path" or "cookie"
    const params = ctx.params || {};
    if (this.opts.ignoreParams) {
      return params;
    }

    const { parameters, opts } = this;
    const paramsIn = s => parameters.filter(p => p.in === s);
    // handle params in header
    paramsIn('header').forEach((p) => {
      params[p.name] = ctx.get(p.name);
    });
    // handle params in cookie
    paramsIn('cookie').forEach((p) => {
      params[p.name] = ctx.cookies.get(p.name, opts.cookieOptions);
    });
    // handle params in query
    const queryParams = paramsIn('query');
    if (queryParams.length) {
      const query = (() => {
        const str = ctx.querystring;
        const c = ctx._querycache = ctx._querycache || {};
        return c[str] || (c[str] = qs.parse(str, opts.queryOptions));
      })();
      queryParams.forEach((p) => {
        params[p.name] = query[p.name];
      });
    }
    // handle params in path
    if (!ctx._pathParsed) {
      const { regexp, pathKeys } = this;
      const captures = path.match(regexp).slice(1);
      for (let len = captures.length, i = 0; i < len; i++) {
        if (pathKeys[i]) {
          const c = captures[i];
          params[pathKeys[i].name] = c ? safeDecodeURIComponent(c) : c;
        }
      }
      ctx._pathParsed = true;
    }
    const validate = this.getParamsValidate();
    if (validate) {
      const valid = validate(params);
      ctx.paramsErrors = validate.errors;
      if (!valid && opts.throwParamsError !== false) {
        if (typeof opts.throwParamsError === 'function') {
          opts.throwParamsError(ctx.paramsErrors);
        } else {
          validateError(ctx.paramsErrors);
        }
      }
    }
    return params;
  }

  param(param, fn) {
    const { stack, parameters } = this;
    const paramFn = (ctx, next) => fn(ctx.params[param], ctx, next);

    paramFn.param = param;

    const names = parameters.map(p => p.name);
    const x = names.indexOf(param);
    if (x > -1) {
      stack.some((mw, i) => {
        if (!mw.param || names.indexOf(mw.param) > x) {
          stack.splice(i, 0, paramFn);
          return true; // break the loop
        }
      });
    }

    return this;
  }
}
