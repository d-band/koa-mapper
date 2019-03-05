import allMethods from 'methods';
import compose from 'koa-compose';
import HttpError from 'http-errors';
import extend from 'extend';
import Layer from './layer';
import Validator from './validator';
import { debug, assert } from './utils';

export default class Mapper {
  constructor(opts) {
    this.opts = opts || {};
    this.methods = this.opts.methods || [
      'HEAD',
      'OPTIONS',
      'GET',
      'PUT',
      'PATCH',
      'POST',
      'DELETE'
    ];
    this.params = {};
    this.stack = [];
    this.routes = this.middleware;
    this.schema = this.define;
    this.validator = new Validator();
    this.rootDoc = {
      openapi: '3.0.2',
      info: {},
      tags: [],
      servers: [],
      ...this.opts.document
    };
    this._applyMethods();
    if (this.opts.openURL !== false) {
      const openURL = this.opts.openURL || '/openapi.json';
      this.get(openURL, this.apiMiddleware());
    }
  }

  info(data) {
    this.rootDoc.info = data;
  }

  addTag(obj) {
    this.rootDoc.tags.push(obj);
  }

  addServer(obj) {
    this.rootDoc.servers.push(obj);
  }

  apiMiddleware() {
    return (ctx) => {
      const { rootDoc, validator, stack } = this;
      const { schemas } = validator;
      const paths = {};
      stack.forEach((layer) => {
        extend(true, paths, layer.getPathItem());
      });
      ctx.body = { ...rootDoc, paths, components: { schemas } };
    };
  }

  _applyMethods() {
    const methodFn = methods => (path, opts, ...middlewares) => {
      assert(typeof path === 'string' || Array.isArray(path), 'path must be a string or array.');
      if (typeof opts === 'function') {
        middlewares.unshift(opts);
        opts = {};
      }
      this.register(path, methods, middlewares, opts);
      return this;
    };
    allMethods.forEach((method) => {
      this[method] = methodFn([method]);
    });
    this.del = this.delete;
    this.all = methodFn(allMethods);
  }

  define(name, props, options) {
    this.validator.addSchema(name, props, options);
  }

  use(path, ...middlewares) {
    if (Array.isArray(path)) {
      path.forEach((p) => {
        this.use(p, ...middlewares);
      });
      return this;
    }
    if (typeof path !== 'string') {
      middlewares.unshift(path);
      path = null;
    }
    middlewares.forEach((mw) => {
      if (mw.mapper) {
        mw.mapper.stack.forEach((nestedLayer) => {
          if (path) nestedLayer.setPrefix(path);
          if (this.opts.prefix) nestedLayer.setPrefix(this.opts.prefix);
          this.stack.push(nestedLayer);
        });
        Object.keys(this.params).forEach((key) => {
          mw.mapper.param(key, this.params[key]);
        });
      } else {
        this.register(path || '(.*)', [], mw, {
          end: false,
          ignoreParams: path === null
        });
      }
    });
    return this;
  }

  prefix(path) {
    const p = path.replace(/\/$/, '');
    this.opts.prefix = p;
    this.stack.forEach(route => route.setPrefix(p));
    return this;
  }

  middleware() {
    const dispatch = (ctx, next) => {
      debug('%s %s', ctx.method, ctx.path);

      const path = this.opts.mapperPath || ctx.mapperPath || ctx.path;
      const matched = this.match(path, ctx.method);

      ctx.matched = (ctx.matched || []).concat(matched.path);
      ctx.mapper = this;

      if (!matched.route) return next();

      const matchedLayers = matched.pathAndMethod;
      const lastLayer = matchedLayers[matchedLayers.length - 1];
      ctx._matchedRoute = lastLayer.path;
      if (lastLayer.name) {
        ctx._matchedRouteName = lastLayer.name;
      }

      const layerChain = matchedLayers.reduce((memo, layer) => {
        memo.push((ctx, next) => {
          ctx.params = layer.params(path, ctx);
          ctx.routeName = layer.name;
          return next();
        });
        return memo.concat(layer.stack);
      }, []);

      return compose(layerChain)(ctx, next);
    };
    dispatch.mapper = this;
    return dispatch;
  }

  allowedMethods(options = {}) {
    const implemented = this.methods;
    return (ctx, next) => {
      return next().then(() => {
        if (!ctx.status || ctx.status === 404) {
          const allowed = {};
          ctx.matched.forEach((route) => {
            route.methods.forEach((method) => {
              allowed[method] = method;
            });
          });

          const allowedArr = Object.keys(allowed);
          const handle = (code, fn) => {
            if (options.throw) {
              if (typeof fn === 'function') {
                throw fn(); // set whatever the user returns from their function
              } else {
                throw new HttpError[code]();
              }
            } else {
              ctx.status = code;
              ctx.set('Allow', allowedArr.join(', '));
            }
          };

          if (!implemented.includes(ctx.method)) {
            handle(501, options.notImplemented);
          } else if (allowedArr.length) {
            if (ctx.method === 'OPTIONS') {
              ctx.status = 200;
              ctx.body = '';
              ctx.set('Allow', allowedArr.join(', '));
            } else if (!allowed[ctx.method]) {
              handle(405, options.methodNotAllowed);
            }
          }
        }
      });
    };
  }

  register(path, methods, middlewares, opts) {
    opts = opts || {};
    // support array of paths
    if (Array.isArray(path)) {
      path.forEach((p) => {
        this.register(p, methods, middlewares, opts);
      });
      return this;
    }
    assert(typeof path === 'string', 'path must be a string');
    // create route
    const route = new Layer(path, methods, middlewares, {
      ...opts,
      prefix: this.opts.prefix || '',
      validator: this.validator,
      end: opts.end === false ? opts.end : true,
      sensitive: opts.sensitive || this.opts.sensitive || false,
      strict: opts.strict || this.opts.strict || false,
      bodyparser: opts.bodyparser || this.opts.bodyparser,
      throwParamsError: opts.throwParamsError || this.opts.throwParamsError
    });

    // add parameter middlewares
    Object.keys(this.params).forEach((param) => {
      route.param(param, this.params[param]);
    });

    this.stack.push(route);
    return this;
  }

  route(name) {
    return this.stack.find(r => (r.name && r.name === name));
  }

  url(name, ...args) {
    const route = this.route(name);
    assert(route, `No route found for name: ${name}`);
    return route.url(...args);
  }

  redirect(source, destination, code) {
    // lookup source route by name
    if (source[0] !== '/') {
      source = this.url(source);
    }
    // lookup destination route by name
    if (destination[0] !== '/') {
      destination = this.url(destination);
    }
    return this.all(source, (ctx) => {
      ctx.redirect(destination);
      ctx.status = code || 301;
    });
  }

  match(path, method) {
    const matched = {
      path: [],
      pathAndMethod: [],
      route: false
    };
    this.stack.forEach((layer) => {
      debug('test %s %s', layer.path, layer.regexp);
      if (layer.match(path)) {
        matched.path.push(layer);
        const { methods } = layer;
        if (!methods.length || methods.includes(method)) {
          matched.pathAndMethod.push(layer);
          if (methods.length) {
            matched.route = true;
          }
        }
      }
    });
    return matched;
  }

  param(param, middleware) {
    this.params[param] = middleware;
    this.stack.forEach((route) => {
      route.param(param, middleware);
    });
    return this;
  }
}
