/**
 * Mapper tests
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import Koa from 'koa';
import methods from 'methods';
import request from 'supertest';
import chai from 'chai';
import Mapper from '../src/index';
import Layer from '../src/layer';

const { expect } = chai;
const should = chai.should();

describe('Mapper', () => {
  it('creates new mapper with koa app', (done) => {
    const mapper = new Mapper();
    mapper.should.be.instanceof(Mapper);
    done();
  });

  it('shares context between mappers (gh-205)', (done) => {
    const app = new Koa();
    const mapper1 = new Mapper();
    const mapper2 = new Mapper();
    mapper1.get('/', (ctx, next) => {
      ctx.foo = 'bar';
      return next();
    });
    mapper2.get('/', (ctx, next) => {
      ctx.baz = 'qux';
      ctx.body = { foo: ctx.foo };
      return next();
    });
    app.use(mapper1.routes()).use(mapper2.routes());
    request(http.createServer(app.callback()))
      .get('/')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('foo', 'bar');
        done();
      });
  });

  it('does not register middleware more than once (gh-184)', (done) => {
    const app = new Koa();
    var parentMapper = new Mapper();
    var nestedMapper = new Mapper();

    nestedMapper
      .get('/first-nested-route', (ctx, next) => {
        ctx.body = { n: ctx.n };
      })
      .get('/second-nested-route', (ctx, next) => {
        return next();
      })
      .get('/third-nested-route', (ctx, next) => {
        return next();
      });

    parentMapper.use('/parent-route', (ctx, next) => {
      ctx.n = ctx.n ? (ctx.n + 1) : 1;
      return next();
    }, nestedMapper.routes());

    app.use(parentMapper.routes());

    request(http.createServer(app.callback()))
      .get('/parent-route/first-nested-route')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('n', 1);
        done();
      });
  });

  it('mapper can be accecced with ctx', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.get('/', { name: 'home' }, (ctx) => {
      ctx.body = {
        url: ctx.mapper.url('home')
      };
    });
    app.use(mapper.routes());
    request(http.createServer(app.callback()))
      .get('/')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body.url).to.eql('/');
        done();
      });
  });

  it('registers multiple middleware for one route', (done) => {
    const app = new Koa();
    const mapper = new Mapper();

    mapper.get('/double', (ctx, next) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          ctx.body = { message: 'Hello' };
          resolve(next());
        }, 1);
      });
    }, (ctx, next) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          ctx.body.message += ' World';
          resolve(next());
        }, 1);
      });
    }, (ctx, next) => {
      ctx.body.message += '!';
    });

    app.use(mapper.routes());

    request(http.createServer(app.callback()))
      .get('/double')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body.message).to.eql('Hello World!');
        done();
      });
  });

  it('exposes middleware factory', (done) => {
    const mapper = new Mapper();
    mapper.should.have.property('routes');
    mapper.routes.should.be.a('function');
    const middleware = mapper.routes();
    should.exist(middleware);
    middleware.should.be.a('function');
    done();
  });

  it('supports promises for async/await', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.get('/async', (ctx, next) => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          ctx.body = { msg: 'promises!' };
          resolve();
        }, 1);
      });
    });

    app.use(mapper.routes()).use(mapper.allowedMethods());
    request(http.createServer(app.callback()))
      .get('/async')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('msg', 'promises!');
        done();
      });
  });

  it('matches middleware only if route was matched (gh-182)', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    var otherMapper = new Mapper();

    mapper.use((ctx, next) => {
      ctx.body = { bar: 'baz' };
      return next();
    });

    otherMapper.get('/bar', (ctx) => {
      ctx.body = ctx.body || { foo: 'bar' };
    });

    app.use(mapper.routes()).use(otherMapper.routes());

    request(http.createServer(app.callback()))
      .get('/bar')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('foo', 'bar');
        expect(res.body).to.not.have.property('bar');
        done();
      });
  });

  it('matches first to last', (done) => {
    const app = new Koa();
    const mapper = new Mapper();

    mapper
      .get('/user/(.*).jsx', (ctx) => {
        ctx.body = { order: 1 };
      })
      .all('/app/(.*).jsx', (ctx) => {
        ctx.body = { order: 2 };
      })
      .all('(.*).jsx', (ctx) => {
        ctx.body = { order: 3 };
      });

    request(http.createServer(app.use(mapper.routes()).callback()))
      .get('/user/account.jsx')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('order', 1);
        done();
      });
  });

  it('does not run subsequent middleware without calling next', (done) => {
    const app = new Koa();
    const mapper = new Mapper();

    mapper
      .get('/user/(.*).jsx', (ctx) => {
        // no next()
      }, (ctx) => {
        ctx.body = { order: 1 };
      });

    request(http.createServer(app.use(mapper.routes()).callback()))
      .get('/user/account.jsx')
      .expect(404)
      .end(done);
  });

  it('nests mappers with prefixes at root', (done) => {
    const app = new Koa();
    const forums = new Mapper({
      prefix: '/forums'
    });
    const posts = new Mapper({
      prefix: '/:fid/posts'
    });

    posts
      .get('/', (ctx, next) => {
        ctx.status = 204;
        return next();
      })
      .get('/:pid', (ctx, next) => {
        ctx.body = ctx.params;
        return next();
      });

    forums.use(posts.routes());

    const server = http.createServer(app.use(forums.routes()).callback());

    request(server)
      .get('/forums/1/posts')
      .expect(204)
      .end((err) => {
        if (err) return done(err);

        request(server)
          .get('/forums/1')
          .expect(404)
          .end((err) => {
            if (err) return done(err);

            request(server)
              .get('/forums/1/posts/2')
              .expect(200)
              .end((err, res) => {
                if (err) return done(err);

                expect(res.body).to.have.property('fid', '1');
                expect(res.body).to.have.property('pid', '2');
                done();
              });
          });
      });
  });

  it('nests mappers with prefixes at path', (done) => {
    const app = new Koa();
    const forums = new Mapper({
      prefix: '/api'
    });
    const posts = new Mapper({
      prefix: '/posts'
    });

    posts
      .get('/', (ctx, next) => {
        ctx.status = 204;
        return next();
      })
      .get('/:pid', (ctx, next) => {
        ctx.body = ctx.params;
        return next();
      });

    forums.use('/forums/:fid', posts.routes());

    const server = http.createServer(app.use(forums.routes()).callback());

    request(server)
      .get('/api/forums/1/posts')
      .expect(204)
      .end((err) => {
        if (err) return done(err);

        request(server)
          .get('/api/forums/1')
          .expect(404)
          .end((err) => {
            if (err) return done(err);

            request(server)
              .get('/api/forums/1/posts/2')
              .expect(200)
              .end((err, res) => {
                if (err) return done(err);

                expect(res.body).to.have.property('fid', '1');
                expect(res.body).to.have.property('pid', '2');
                done();
              });
          });
      });
  });

  it('runs submapper middleware after parent', (done) => {
    const app = new Koa();
    const submapper = new Mapper()
      .use((ctx, next) => {
        ctx.msg = 'submapper';
        return next();
      })
      .get('/', (ctx) => {
        ctx.body = { msg: ctx.msg };
      });
    const mapper = new Mapper()
      .use((ctx, next) => {
        ctx.msg = 'mapper';
        return next();
      })
      .use(submapper.routes());
    request(http.createServer(app.use(mapper.routes()).callback()))
      .get('/')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('msg', 'submapper');
        done();
      });
  });

  it('runs parent middleware for submapper routes', (done) => {
    const app = new Koa();
    const submapper = new Mapper()
      .get('/sub', (ctx) => {
        ctx.body = { msg: ctx.msg };
      });
    const mapper = new Mapper()
      .use((ctx, next) => {
        ctx.msg = 'mapper';
        return next();
      })
      .use('/parent', submapper.routes());
    request(http.createServer(app.use(mapper.routes()).callback()))
      .get('/parent/sub')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('msg', 'mapper');
        done();
      });
  });

  it('matches corresponding requests', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    app.use(mapper.routes());
    mapper.get('/:category/:title', (ctx) => {
      ctx.should.have.property('params');
      ctx.params.should.have.property('category', 'programming');
      ctx.params.should.have.property('title', 'how-to-node');
      ctx.status = 204;
    });
    mapper.post('/:category', (ctx) => {
      ctx.should.have.property('params');
      ctx.params.should.have.property('category', 'programming');
      ctx.status = 204;
    });
    mapper.put('/:category/not-a-title', (ctx) => {
      ctx.should.have.property('params');
      ctx.params.should.have.property('category', 'programming');
      ctx.params.should.not.have.property('title');
      ctx.status = 204;
    });
    var server = http.createServer(app.callback());
    request(server)
      .get('/programming/how-to-node')
      .expect(204)
      .end((err, res) => {
        if (err) return done(err);
        request(server)
          .post('/programming')
          .expect(204)
          .end((err, res) => {
            if (err) return done(err);
            request(server)
              .put('/programming/not-a-title')
              .expect(204)
              .end((err, res) => {
                done(err);
              });
          });
      });
  });

  it('executes route middleware using `app.context`', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    app.use(mapper.routes());
    mapper.use((ctx, next) => {
      ctx.bar = 'baz';
      return next();
    });
    mapper.get('/:category/:title', (ctx, next) => {
      ctx.foo = 'bar';
      return next();
    }, (ctx) => {
      ctx.should.have.property('bar', 'baz');
      ctx.should.have.property('foo', 'bar');
      ctx.should.have.property('app');
      ctx.should.have.property('req');
      ctx.should.have.property('res');
      ctx.status = 204;
      done();
    });
    request(http.createServer(app.callback()))
      .get('/match/this')
      .expect(204)
      .end((err) => {
        if (err) return done(err);
      });
  });

  it('does not match after ctx.throw()', (done) => {
    const app = new Koa();
    let counter = 0;
    const mapper = new Mapper();
    app.use(mapper.routes());
    mapper.get('/', (ctx) => {
      counter++;
      ctx.throw(403);
    });
    mapper.get('/', () => {
      counter++;
    });
    const server = http.createServer(app.callback());
    request(server)
      .get('/')
      .expect(403)
      .end((err, res) => {
        if (err) return done(err);
        counter.should.equal(1);
        done();
      });
  });

  it('supports promises for route middleware', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    app.use(mapper.routes());
    const readVersion = () => {
      return new Promise((resolve, reject) => {
        const packagePath = path.join(__dirname, '..', 'package.json');
        fs.readFile(packagePath, 'utf8', (err, data) => {
          if (err) return reject(err);
          resolve(JSON.parse(data).version);
        });
      });
    };
    mapper
      .get('/', (ctx, next) => {
        return next();
      }, (ctx) => {
        return readVersion().then(() => {
          ctx.status = 204;
        });
      });
    request(http.createServer(app.callback()))
      .get('/')
      .expect(204)
      .end(done);
  });

  describe('Mapper#allowedMethods()', () => {
    it('responds to OPTIONS requests', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use(mapper.allowedMethods());
      mapper.get('/users', (ctx, next) => {});
      mapper.put('/users', (ctx, next) => {});
      request(http.createServer(app.callback()))
        .options('/users')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.header.should.have.property('content-length', '0');
          res.header.should.have.property('allow', 'HEAD, GET, PUT');
          done();
        });
    });

    it('responds with 405 Method Not Allowed', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      mapper.post('/events', () => {});
      app.use(mapper.routes());
      app.use(mapper.allowedMethods());
      request(http.createServer(app.callback()))
        .post('/users')
        .expect(405)
        .end((err, res) => {
          if (err) return done(err);
          res.header.should.have.property('allow', 'HEAD, GET, PUT');
          done();
        });
    });

    it('responds with 405 Method Not Allowed using the "throw" option', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use((ctx, next) => {
        return next().catch((err) => {
          // assert that the correct HTTPError was thrown
          err.name.should.equal('MethodNotAllowedError');
          err.statusCode.should.equal(405);

          // translate the HTTPError to a normal response
          ctx.body = err.name;
          ctx.status = err.statusCode;
        });
      });
      app.use(mapper.allowedMethods({ throw: true }));
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      mapper.post('/events', () => {});
      request(http.createServer(app.callback()))
        .post('/users')
        .expect(405)
        .end((err, res) => {
          if (err) return done(err);
          // the 'Allow' header is not set when throwing
          res.header.should.not.have.property('allow');
          done();
        });
    });

    it('responds with user-provided throwable using the "throw" and "methodNotAllowed" options', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use((ctx, next) => {
        return next().catch((err) => {
          // assert that the correct HTTPError was thrown
          err.message.should.equal('Custom Not Allowed Error');
          err.statusCode.should.equal(405);

          // translate the HTTPError to a normal response
          ctx.body = err.body;
          ctx.status = err.statusCode;
        });
      });
      app.use(mapper.allowedMethods({
        throw: true,
        methodNotAllowed: () => {
          const notAllowedErr = new Error('Custom Not Allowed Error');
          notAllowedErr.type = 'custom';
          notAllowedErr.statusCode = 405;
          notAllowedErr.body = {
            error: 'Custom Not Allowed Error',
            statusCode: 405,
            otherStuff: true
          };
          return notAllowedErr;
        }
      }));
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      mapper.post('/events', () => {});
      request(http.createServer(app.callback()))
        .post('/users')
        .expect(405)
        .end((err, res) => {
          if (err) return done(err);
          // the 'Allow' header is not set when throwing
          res.header.should.not.have.property('allow');
          res.body.should.eql({
            error: 'Custom Not Allowed Error',
            statusCode: 405,
            otherStuff: true
          });
          done();
        });
    });

    it('responds with 501 Not Implemented', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use(mapper.allowedMethods());
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      request(http.createServer(app.callback()))
        .search('/users')
        .expect(501)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });

    it('responds with 501 Not Implemented using the "throw" option', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use((ctx, next) => {
        return next().catch((err) => {
          // assert that the correct HTTPError was thrown
          err.name.should.equal('NotImplementedError');
          err.statusCode.should.equal(501);

          // translate the HTTPError to a normal response
          ctx.body = err.name;
          ctx.status = err.statusCode;
        });
      });
      app.use(mapper.allowedMethods({ throw: true }));
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      request(http.createServer(app.callback()))
        .search('/users')
        .expect(501)
        .end((err, res) => {
          if (err) return done(err);
          // the 'Allow' header is not set when throwing
          res.header.should.not.have.property('allow');
          done();
        });
    });

    it('responds with user-provided throwable using the "throw" and "notImplemented" options', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use((ctx, next) => {
        return next().catch((err) => {
          // assert that our custom error was thrown
          err.message.should.equal('Custom Not Implemented Error');
          err.type.should.equal('custom');
          err.statusCode.should.equal(501);

          // translate the HTTPError to a normal response
          ctx.body = err.body;
          ctx.status = err.statusCode;
        });
      });
      app.use(mapper.allowedMethods({
        throw: true,
        notImplemented: () => {
          const notImplementedErr = new Error('Custom Not Implemented Error');
          notImplementedErr.type = 'custom';
          notImplementedErr.statusCode = 501;
          notImplementedErr.body = {
            error: 'Custom Not Implemented Error',
            statusCode: 501,
            otherStuff: true
          };
          return notImplementedErr;
        }
      }));
      mapper.get('/users', () => {});
      mapper.put('/users', () => {});
      request(http.createServer(app.callback()))
        .search('/users')
        .expect(501)
        .end((err, res) => {
          if (err) return done(err);
          // the 'Allow' header is not set when throwing
          res.header.should.not.have.property('allow');
          res.body.should.eql({
            error: 'Custom Not Implemented Error',
            statusCode: 501,
            otherStuff: true
          });
          done();
        });
    });

    it('does not send 405 if route matched but status is 404', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use(mapper.allowedMethods());
      mapper.get('/users', (ctx, next) => {
        ctx.status = 404;
      });
      request(http.createServer(app.callback()))
        .get('/users')
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });

    it('sets the allowed methods to a single Allow header #273', (done) => {
      // https://tools.ietf.org/html/rfc7231#section-7.4.1
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      app.use(mapper.allowedMethods());

      mapper.get('/', (ctx, next) => {});

      request(http.createServer(app.callback()))
        .options('/')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.header.should.have.property('allow', 'HEAD, GET');
          const allowHeaders = res.res.rawHeaders.filter(item => item === 'Allow');
          expect(allowHeaders.length).to.eql(1);
          done();
        });
    });
  });

  it('supports custom routing detect path: ctx.mapperPath', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    app.use((ctx, next) => {
      // bind helloworld.example.com/users => example.com/helloworld/users
      const appname = ctx.request.hostname.split('.', 1)[0];
      ctx.mapperPath = '/' + appname + ctx.path;
      return next();
    });
    app.use(mapper.routes());
    mapper.get('/helloworld/users', (ctx) => {
      ctx.body = ctx.method + ' ' + ctx.url;
    });

    request(http.createServer(app.callback()))
      .get('/users')
      .set('Host', 'helloworld.example.com')
      .expect(200)
      .expect('GET /users', done);
  });

  describe('Mapper#[verb]()', () => {
    it('registers route specific to HTTP verb', () => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      methods.forEach((method) => {
        mapper.should.have.property(method);
        mapper[method].should.be.a('function');
        mapper[method]('/', () => {});
      });
      mapper.stack.should.have.length(methods.length + 1);
    });

    it('registers route with a given name', () => {
      const mapper = new Mapper();
      methods.forEach((method) => {
        mapper[method]('/', { name: method }, () => {}).should.equal(mapper);
      });
    });

    it('enables route chaining', () => {
      const mapper = new Mapper();
      methods.forEach((method) => {
        mapper[method]('/', () => {}).should.equal(mapper);
      });
    });

    it('registers array of paths (gh-203)', () => {
      const mapper = new Mapper();
      mapper.get(['/one', '/two'], (ctx, next) => {
        return next();
      });
      expect(mapper.stack).to.have.property('length', 3);
      expect(mapper.stack[1]).to.have.property('path', '/one');
      expect(mapper.stack[2]).to.have.property('path', '/two');
    });

    it('resolves non-parameterized routes without attached parameters', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.get('/notparameter', (ctx, next) => {
        ctx.body = {
          param: ctx.params.parameter
        };
      });

      mapper.get('/:parameter', (ctx, next) => {
        ctx.body = {
          param: ctx.params.parameter
        };
      });

      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/notparameter')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body.param).to.equal(undefined);
          done();
        });
    });
  });

  describe('Mapper#use()', (done) => {
    it('uses mapper middleware without path', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.use((ctx, next) => {
        ctx.foo = 'baz';
        return next();
      });

      mapper.use((ctx, next) => {
        ctx.foo = 'foo';
        return next();
      });

      mapper.get('/foo/bar', (ctx) => {
        ctx.body = {
          foobar: ctx.foo + 'bar'
        };
      });

      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/foo/bar')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property('foobar', 'foobar');
          done();
        });
    });

    it('uses mapper middleware at given path', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.use('/foo/bar', (ctx, next) => {
        ctx.foo = 'foo';
        return next();
      });

      mapper.get('/foo/bar', (ctx) => {
        ctx.body = {
          foobar: ctx.foo + 'bar'
        };
      });

      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/foo/bar')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property('foobar', 'foobar');
          done();
        });
    });

    it('runs mapper middleware before submapper middleware', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var submapper = new Mapper();

      mapper.use((ctx, next) => {
        ctx.foo = 'boo';
        return next();
      });

      submapper
        .use((ctx, next) => {
          ctx.foo = 'foo';
          return next();
        })
        .get('/bar', (ctx) => {
          ctx.body = {
            foobar: ctx.foo + 'bar'
          };
        });

      mapper.use('/foo', submapper.routes());
      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/foo/bar')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property('foobar', 'foobar');
          done();
        });
    });

    it('assigns middleware to array of paths', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.use(['/foo', '/bar'], (ctx, next) => {
        ctx.foo = 'foo';
        ctx.bar = 'bar';
        return next();
      });

      mapper.get('/foo', (ctx, next) => {
        ctx.body = {
          foobar: ctx.foo + 'bar'
        };
      });

      mapper.get('/bar', (ctx) => {
        ctx.body = {
          foobar: 'foo' + ctx.bar
        };
      });

      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/foo')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('foobar', 'foobar');
          request(http.createServer(app.callback()))
            .get('/bar')
            .expect(200)
            .end((err, res) => {
              if (err) return done(err);
              expect(res.body).to.have.property('foobar', 'foobar');
              done();
            });
        });
    });

    it('without path, does not set params.0 to the matched path - gh-247', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.use((ctx, next) => {
        return next();
      });

      mapper.get('/foo/:id', (ctx) => {
        ctx.body = ctx.params;
      });

      app.use(mapper.routes());
      request(http.createServer(app.callback()))
        .get('/foo/815')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body).to.have.property('id', '815');
          expect(res.body).to.not.have.property('0');
          done();
        });
    });

    it('does not add an erroneous (.*) to unprefiexed nested mappers - gh-369 gh-410', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var nested = new Mapper();
      var called = 0;

      nested
        .get('/', (ctx, next) => {
          ctx.body = 'root';
          called += 1;
          return next();
        })
        .get('/test', (ctx, next) => {
          ctx.body = 'test';
          called += 1;
          return next();
        });

      mapper.use(nested.routes());
      app.use(mapper.routes());

      request(app.callback())
        .get('/test')
        .expect(200)
        .expect('test')
        .end((err, res) => {
          if (err) return done(err);
          expect(called).to.eql(1, 'too many routes matched');
          done();
        });
    });
  });

  describe('Mapper#register()', () => {
    it('registers new routes', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper.should.have.property('register');
      mapper.register.should.be.a('function');
      mapper.register('/', ['GET', 'POST'], () => {});
      app.use(mapper.routes());
      mapper.stack.should.be.an.instanceof(Array);
      mapper.stack.should.have.property('length', 2);
      mapper.stack[1].should.have.property('path', '/');
      done();
    });
  });

  describe('Mapper#redirect()', () => {
    it('registers redirect routes', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper.should.have.property('redirect');
      mapper.redirect.should.be.a('function');
      mapper.redirect('/source', '/destination', 302);
      app.use(mapper.routes());
      mapper.stack.should.have.property('length', 2);
      mapper.stack[1].should.be.instanceof(Layer);
      mapper.stack[1].should.have.property('path', '/source');
      done();
    });

    it('redirects using route names', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      mapper.get('/', { name: 'home' }, () => {});
      mapper.get('/sign-up-form', { name: 'sign-up-form' }, () => {});
      mapper.redirect('home', 'sign-up-form');
      request(http.createServer(app.callback()))
        .post('/')
        .expect(301)
        .end((err, res) => {
          if (err) return done(err);
          res.header.should.have.property('location', '/sign-up-form');
          done();
        });
    });
  });

  describe('Mapper#route()', () => {
    it('inherits routes from nested mapper', () => {
      const submapper = new Mapper().get('/hello', { name: 'child' }, (ctx) => {
        ctx.body = { hello: 'world' };
      });
      const mapper = new Mapper().use(submapper.routes());
      expect(mapper.route('child')).to.have.property('name', 'child');
    });
  });

  describe('Mapper#url()', () => {
    it('generates URL for given route name', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      mapper.get('/:category/:title', { name: 'books' }, (ctx) => {
        ctx.status = 204;
      });
      let url = mapper.url('books', { category: 'programming', title: 'how to node' });
      url.should.equal('/programming/how to node');
      url = mapper.url('books', ['programming', 'how to node']);
      url.should.equal('/programming/how to node');
      done();
    });

    it('generates URL for given route name within embedded mappers', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        prefix: '/books'
      });

      const embeddedMapper = new Mapper({
        prefix: '/chapters'
      });
      embeddedMapper.get('/:chapterName/:pageNumber', { name: 'chapters' }, (ctx) => {
        ctx.status = 204;
      });
      mapper.use(embeddedMapper.routes());
      app.use(mapper.routes());
      let url = mapper.url('chapters', { chapterName: 'Learning ECMA6', pageNumber: 123 });
      url.should.equal('/books/chapters/Learning ECMA6/123');
      url = mapper.url('chapters', ['Learning ECMA6', 123]);
      url.should.equal('/books/chapters/Learning ECMA6/123');
      done();
    });

    it('generates URL for given route name within two embedded mappers', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        prefix: '/books'
      });
      const embeddedMapper = new Mapper({
        prefix: '/chapters'
      });
      const embeddedMapper2 = new Mapper({
        prefix: '/:chapterName/pages'
      });
      embeddedMapper2.get('/:pageNumber', { name: 'chapters' }, (ctx) => {
        ctx.status = 204;
      });
      embeddedMapper.use(embeddedMapper2.routes());
      mapper.use(embeddedMapper.routes());
      app.use(mapper.routes());
      const url = mapper.url('chapters', { chapterName: 'Learning ECMA6', pageNumber: 123 });
      url.should.equal('/books/chapters/Learning ECMA6/pages/123');
      done();
    });

    it('generates URL for given route name with params and query params', (done) => {
      const mapper = new Mapper();
      mapper.get('/books/:category/:id', { name: 'books' }, (ctx) => {
        ctx.status = 204;
      });
      let url = mapper.url('books', ['programming', 4], {
        query: { page: 3, limit: 10 }
      });
      url.should.equal('/books/programming/4?page=3&limit=10');
      url = mapper.url('books',
        { category: 'programming', id: 4 },
        { query: { page: 3, limit: 10 } }
      );
      url.should.equal('/books/programming/4?page=3&limit=10');
      url = mapper.url('books',
        { category: 'programming', id: 4 },
        { query: 'page=3&limit=10' }
      );
      url.should.equal('/books/programming/4?page=3&limit=10');
      done();
    });

    it('generates URL for given route name without params and query params', (done) => {
      const mapper = new Mapper();
      mapper.get('/category', { name: 'category' }, (ctx) => {
        ctx.status = 204;
      });
      var url = mapper.url('category', null, {
        query: { page: 3, limit: 10 }
      });
      url.should.equal('/category?page=3&limit=10');
      done();
    });
  });

  describe('Mapper#param()', () => {
    it('runs parameter middleware', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      mapper
        .param('user', (id, ctx, next) => {
          ctx.user = { name: 'alex' };
          if (!id) {
            ctx.status = 404;
            return;
          }
          return next();
        })
        .get('/users/:user', (ctx, next) => {
          ctx.body = ctx.user;
        });
      request(http.createServer(app.callback()))
        .get('/users/3')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.should.have.property('body');
          res.body.should.have.property('name', 'alex');
          done();
        });
    });

    it('runs parameter middleware in order of URL appearance', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper
        .param('user', (id, ctx, next) => {
          ctx.user = { name: 'alex' };
          if (ctx.ranFirst) {
            ctx.user.ordered = 'parameters';
          }
          if (!id) {
            ctx.status = 404;
            return;
          }
          return next();
        })
        .param('first', (id, ctx, next) => {
          ctx.ranFirst = true;
          if (ctx.user) {
            ctx.ranFirst = false;
          }
          if (!id) {
            ctx.status = 404;
            return;
          }
          return next();
        })
        .get('/:first/users/:user', (ctx) => {
          ctx.body = ctx.user;
        });

      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/first/users/3')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.should.have.property('body');
          res.body.should.have.property('name', 'alex');
          res.body.should.have.property('ordered', 'parameters');
          done();
        });
    });

    it('runs parameter middleware in order of URL appearance even when added in random order', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper
        // intentional random order
        .param('a', (id, ctx, next) => {
          ctx.state.loaded = [id];
          return next();
        })
        .param('d', (id, ctx, next) => {
          ctx.state.loaded.push(id);
          return next();
        })
        .param('c', (id, ctx, next) => {
          ctx.state.loaded.push(id);
          return next();
        })
        .param('b', (id, ctx, next) => {
          ctx.state.loaded.push(id);
          return next();
        })
        .get('/:a/:b/:c/:d', (ctx, next) => {
          ctx.body = ctx.state.loaded;
        });

      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/1/2/3/4')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.should.have.property('body');
          res.body.should.eql(['1', '2', '3', '4']);
          done();
        });
    });

    it('runs parent parameter middleware for submapper', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var submapper = new Mapper();
      submapper.get('/:cid', (ctx) => {
        ctx.body = {
          id: ctx.params.id,
          cid: ctx.params.cid
        };
      });
      mapper
        .param('id', (id, ctx, next) => {
          ctx.params.id = 'ran';
          if (!id) {
            ctx.status = 404;
            return;
          }
          return next();
        })
        .use('/:id/children', submapper.routes());

      request(http.createServer(app.use(mapper.routes()).callback()))
        .get('/did-not-run/children/2')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.should.have.property('body');
          res.body.should.have.property('id', 'ran');
          res.body.should.have.property('cid', '2');
          done();
        });
    });
  });

  describe('Mapper#opts', () => {
    it('responds with 200', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        strict: true
      });
      mapper.get('/info', (ctx) => {
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/info')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.text.should.equal('hello');
          done();
        });
    });

    it('should allow setting a prefix', (done) => {
      const app = new Koa();
      var routes = new Mapper({ prefix: '/things/:thing_id' });

      routes.get('/list', (ctx) => {
        ctx.body = ctx.params;
      });

      app.use(routes.routes());

      request(http.createServer(app.callback()))
        .get('/things/1/list')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.body.thing_id.should.equal('1');
          done();
        });
    });

    it('responds with 404 when has a trailing slash', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        strict: true
      });
      mapper.get('/info', (ctx) => {
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/info/')
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('use middleware with opts', () => {
    it('responds with 200', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        strict: true
      });
      mapper.get('/info', (ctx) => {
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/info')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          res.text.should.equal('hello');
          done();
        });
    });

    it('responds with 404 when has a trailing slash', (done) => {
      const app = new Koa();
      const mapper = new Mapper({
        strict: true
      });
      mapper.get('/info', (ctx) => {
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .get('/info/')
        .expect(404)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('mapper.routes()', () => {
    it('should return composed middleware', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var middlewareCount = 0;
      var middlewareA = (ctx, next) => {
        middlewareCount++;
        return next();
      };
      var middlewareB = (ctx, next) => {
        middlewareCount++;
        return next();
      };

      mapper.use(middlewareA, middlewareB);
      mapper.get('/users/:id', (ctx) => {
        should.exist(ctx.params.id);
        ctx.body = { hello: 'world' };
      });

      const mapperMiddleware = mapper.routes();

      expect(mapperMiddleware).to.be.a('function');

      request(http.createServer(
        app
          .use(mapperMiddleware)
          .callback()))
        .get('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.be.an('object');
          expect(res.body).to.have.property('hello', 'world');
          expect(middlewareCount).to.equal(2);
          done();
        });
    });

    it('places a `_matchedRoute` value on context', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var middleware = (ctx, next) => {
        expect(ctx._matchedRoute).to.equal('/users/:id');
        return next();
      };

      mapper.use(middleware);
      mapper.get('/users/:id', (ctx, next) => {
        expect(ctx._matchedRoute).to.equal('/users/:id');
        should.exist(ctx.params.id);
        ctx.body = { hello: 'world' };
      });

      const mapperMiddleware = mapper.routes();

      request(http.createServer(
        app
          .use(mapperMiddleware)
          .callback()))
        .get('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });

    it('places a `_matchedRouteName` value on the context for a named route', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.get('/users/:id', { name: 'users#show' }, (ctx, next) => {
        expect(ctx._matchedRouteName).to.equal('users#show');
        ctx.status = 200;
      });

      request(http.createServer(app.use(mapper.routes()).callback()))
        .get('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });

    it('does not place a `_matchedRouteName` value on the context for unnamed routes', (done) => {
      const app = new Koa();
      const mapper = new Mapper();

      mapper.get('/users/:id', (ctx, next) => {
        expect(ctx._matchedRouteName).to.equal(undefined);
        ctx.status = 200;
      });

      request(http.createServer(app.use(mapper.routes()).callback()))
        .get('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });
  });

  describe('If no HEAD method, default to GET', () => {
    it('should default to GET', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper.get('/users/:id', (ctx) => {
        should.exist(ctx.params.id);
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .head('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          // eslint-disable-next-line no-unused-expressions
          expect(res.body).to.be.empty;
          done();
        });
    });

    it('should work with middleware', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      mapper.get('/users/:id', (ctx) => {
        should.exist(ctx.params.id);
        ctx.body = 'hello';
      });
      request(http.createServer(
        app
          .use(mapper.routes())
          .callback()))
        .head('/users/1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          // eslint-disable-next-line no-unused-expressions
          expect(res.body).to.be.empty;
          done();
        });
    });
  });

  describe('Mapper#prefix', () => {
    it('should set opts.prefix', () => {
      const mapper = new Mapper();
      expect(mapper.opts).to.not.have.key('prefix');
      mapper.prefix('/things/:thing_id');
      expect(mapper.opts.prefix).to.equal('/things/:thing_id');
    });

    it('should prefix existing routes', () => {
      const mapper = new Mapper();
      mapper.get('/users/:id', (ctx) => {
        ctx.body = 'test';
      });
      mapper.prefix('/things/:thing_id');
      var route = mapper.stack[1];
      expect(route.path).to.equal('/things/:thing_id/users/:id');
      expect(route.pathKeys).to.have.length(2);
      expect(route.pathKeys[0]).to.have.property('name', 'thing_id');
      expect(route.pathKeys[1]).to.have.property('name', 'id');
    });

    describe('when used with .use(fn) - gh-247', () => {
      it('does not set params.0 to the matched path', (done) => {
        const app = new Koa();
        const mapper = new Mapper();

        mapper.use((ctx, next) => {
          return next();
        });

        mapper.get('/foo/:id', (ctx) => {
          ctx.body = ctx.params;
        });

        mapper.prefix('/things');

        app.use(mapper.routes());
        request(http.createServer(app.callback()))
          .get('/things/foo/108')
          .expect(200)
          .end((err, res) => {
            if (err) return done(err);

            expect(res.body).to.have.property('id', '108');
            expect(res.body).to.not.have.property('0');
            done();
          });
      });
    });

    describe('with trailing slash', testPrefix('/admin/'));
    describe('without trailing slash', testPrefix('/admin'));

    function testPrefix(prefix) {
      return () => {
        var server;
        var middlewareCount = 0;

        before(() => {
          const app = new Koa();
          const mapper = new Mapper();
          mapper.use((ctx, next) => {
            middlewareCount++;
            ctx.thing = 'worked';
            return next();
          });
          mapper.get('/', (ctx) => {
            middlewareCount++;
            ctx.body = { name: ctx.thing };
          });
          mapper.prefix(prefix);
          server = http.createServer(app.use(mapper.routes()).callback());
        });

        after(() => {
          server.close();
        });

        beforeEach(() => {
          middlewareCount = 0;
        });

        it('should support root level mapper middleware', (done) => {
          request(server)
            .get(prefix)
            .expect(200)
            .end((err, res) => {
              if (err) return done(err);
              expect(middlewareCount).to.equal(2);
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('name', 'worked');
              done();
            });
        });

        it('should support requests with a trailing path slash', (done) => {
          request(server)
            .get('/admin/')
            .expect(200)
            .end((err, res) => {
              if (err) return done(err);
              expect(middlewareCount).to.equal(2);
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('name', 'worked');
              done();
            });
        });

        it('should support requests without a trailing path slash', (done) => {
          request(server)
            .get('/admin')
            .expect(200)
            .end((err, res) => {
              if (err) return done(err);
              expect(middlewareCount).to.equal(2);
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('name', 'worked');
              done();
            });
        });
      };
    }
  });
});
