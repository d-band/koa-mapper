/**
 * Mapper tests
 */

import http from 'http';
import Koa from 'koa';
import qs from 'qs';
import request from 'supertest';
import { expect } from 'chai';
import Mapper from '../src/index';

describe('OpenAPI', () => {
  it('mapper with custom openURL', (done) => {
    const app = new Koa();
    const mapper = new Mapper({ openURL: '/swagger' });
    mapper.get('/users/:user', (ctx) => {
      ctx.body = ctx.params;
    });
    app.use(mapper.routes());
    request(http.createServer(app.callback()))
      .get('/swagger')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('paths');
        expect(res.body.paths).to.have.property('/swagger');
        expect(res.body.paths).to.have.property('/users/{user}');
        done();
      });
  });

  it('mapper with openURL = false', (done) => {
    const app = new Koa();
    const mapper = new Mapper({ openURL: false });
    app.use(mapper.routes());
    request(http.createServer(app.callback()))
      .get('/openapi.json')
      .expect(404)
      .end(done);
  });

  describe('mapper route with no method or no params validate', () => {
    const app = new Koa();
    const mapper = new Mapper();
    let counter = 0;
    mapper.use((ctx, next) => {
      counter++;
      ctx.params = { id: 123 };
      return next();
    });
    mapper.get('/users/:user', (ctx, next) => {
      counter++;
      ctx.params.id = 345;
      return next();
    });
    mapper.register('/users/:user', [], (ctx, next) => {
      counter++;
      ctx.body = ctx.params;
      return next();
    }, {
      summary: 'user api',
      params: {
        user: { type: 'number' },
        type: { type: 'number', in: 'query' }
      }
    });
    mapper.get('/', {
      params: {
        name: { in: 'query' }
      }
    }, (ctx) => {
      ctx.body = ctx.params;
    });
    app.use(mapper.routes());
    const client = request(http.createServer(app.callback()));
    it('get openapi.json', (done) => {
      client.get('/openapi.json')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('paths');
          expect(res.body.paths).to.have.property('/users/{user}');
          expect(res.body.paths['/users/{user}']).to.have.property('get');
          expect(res.body.paths['/users/{user}']).to.have.property('parameters');
          expect(res.body.paths['/users/{user}']).to.have.property('summary', 'user api');
          done();
        });
    });

    it('get users api', (done) => {
      client.get('/users/333?type=1')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(counter).to.equal(3);
          expect(res.body).to.deep.equal({
            id: 345,
            user: 333,
            type: 1
          });
          done();
        });
    });

    it('get with no validate', (done) => {
      client.get('?id=123&name=456')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(counter).to.equal(4);
          expect(res.body).to.deep.equal({
            id: 123,
            name: '456'
          });
          done();
        });
    });
  });

  describe('mapper route with no body validate', () => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.post('/users', {
      bodyparser: true,
      body: {}
    }, (ctx, next) => {
      ctx.body = ctx.request.body;
    });
    mapper.post('/nobody', {
      bodyparser: true
    }, (ctx, next) => {
      ctx.body = ctx.request.body;
    });
    app.use(mapper.routes());
    const client = request(http.createServer(app.callback()));

    it('no body validate with body {}', (done) => {
      client.post('/users')
        .send('id=123&name=456')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.deep.equal({
            id: '123',
            name: '456'
          });
          done();
        });
    });

    it('no body validate with body undefined', (done) => {
      client.post('/users')
        .send('id=123&name=456')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.deep.equal({
            id: '123',
            name: '456'
          });
          done();
        });
    });
  });

  it('mapper route with body schema', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.define('User', {
      id: { type: 'number' },
      name: { type: 'string' }
    }, {
      required: ['id', 'name']
    });

    mapper.post('/users', {
      body: 'User',
      bodyType: 'json',
      summary: 'users post api'
    }, (ctx, next) => {
      ctx.body = ctx.request.body;
    });

    mapper.post('/users2', {
      body: 'User',
      bodyType: 'multipart/mixed'
    }, (ctx, next) => {
      ctx.body = ctx.request.body;
    });

    mapper.put('/users/:id', {
      body: {
        name: { type: 'string', required: true }
      }
    }, (ctx, next) => {
      ctx.body = ctx.request.body;
    });
    mapper.register('/users', [], (ctx) => {
      ctx.body = ctx.request.body;
    }, {
      summary: 'users api'
    });
    app.use(mapper.routes());
    request(http.createServer(app.callback()))
      .get('/openapi.json')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('paths');
        expect(res.body.paths).to.have.property('/users');
        expect(res.body.paths).to.have.property('/users2');
        expect(res.body.paths).to.have.property('/users/{id}');
        expect(res.body.paths['/users']).to.deep.equal({
          summary: 'users api',
          post: {
            summary: 'users post api',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            }
          }
        });
        expect(res.body.paths['/users2']).to.deep.equal({
          post: {
            requestBody: {
              content: {
                'multipart/mixed': {
                  schema: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            }
          }
        });
        expect(res.body.paths['/users/{id}']).to.deep.equal({
          put: {
            parameters: [{
              in: 'path',
              name: 'id',
              required: true,
              schema: {
                type: 'string'
              }
            }],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' }
                    },
                    required: ['name']
                  }
                },
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' }
                    },
                    required: ['name']
                  }
                }
              }
            }
          }
        });
        done();
      });
  });

  describe('simple params', () => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.get('/users/:id', {
      name: 'user',
      params: {
        id: { type: 'number', schema: { minimum: 100 } },
        type: { type: 'number', in: 'query' },
        token: { type: 'string', in: 'header' },
        sid: { type: 'string', in: 'cookie' }
      }
    }, (ctx) => {
      ctx.body = ctx.params;
    });
    app.use(mapper.routes());
    const client = request(http.createServer(app.callback()));

    it('simple params: get params', (done) => {
      client.get('/users/123?type=2')
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('id', 123);
          expect(res.body).to.have.property('type', 2);
          done();
        });
    });

    it('simple params: get params from header and cookie', (done) => {
      client.get('/users/123?type=2')
        .set('token', 'hello')
        .set('Cookie', ['sid=world'])
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.body).to.have.property('token', 'hello');
          expect(res.body).to.have.property('sid', 'world');
          done();
        });
    });

    it('simple params: get params required error', (done) => {
      client.get('/users/hello')
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).to.equal('[id] should be number');
          done();
        });
    });

    it('simple params: get params minimum error', (done) => {
      client.get('/users/10')
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).to.equal('[id] should be >= 100');
          done();
        });
    });

    it('simple params: get params custom error', (done) => {
      mapper.route('user').opts.throwParamsError = (errors) => {
        expect(errors[0].message).to.equal('should be >= 100');
        const err = new Error('custom error');
        err.status = 400;
        err.expose = true;
        throw err;
      };
      client.get('/users/10')
        .expect(400)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.text).to.equal('custom error');
          done();
        });
    });
  });

  it('complex params', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    mapper.get('/users/:id', {
      name: 'user',
      params: {
        id: { type: 'number' },
        info: { type: 'User', in: 'query' }
      }
    }, (ctx) => {
      ctx.body = ctx.params;
    });
    mapper.define('Model', {
      id: { type: 'number' }
    });
    mapper.define('User: Model', {
      name: { type: 'string' },
      roles: { type: 'array<string>' }
    });
    app.use(mapper.routes());
    const info = {
      id: 123,
      name: 'test',
      roles: ['hello', 'world']
    };
    request(http.createServer(app.callback()))
      .get(`/users/123?${qs.stringify({ info })}`)
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('id', 123);
        expect(res.body).to.have.deep.property('info', info);
        done();
      });
  });

  it('openapi json', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    const info = {
      title: 'users api',
      version: '1.0.0'
    };
    const tags = [{
      name: 'user',
      description: 'user api'
    }, {
      name: 'simple',
      description: 'simple api'
    }];
    const servers = [{
      url: 'https://development.gigantic-server.com/v1',
      description: 'Development server'
    }, {
      url: 'https://staging.gigantic-server.com/v1',
      description: 'Staging server'
    }, {
      url: 'https://api.gigantic-server.com/v1',
      description: 'Production server'
    }];

    mapper.info(info);
    tags.forEach(tag => mapper.addTag(tag));
    servers.forEach(server => mapper.addServer(server));

    mapper.get('/users/:id', {
      name: 'user',
      tags: ['user'],
      summary: 'get user infomation',
      params: {
        id: { type: 'number', minimum: 100 },
        type: { type: 'number', in: 'query' },
        token: { type: 'string', in: 'header' },
        sid: { type: 'string', in: 'cookie' }
      }
    }, (ctx) => {
      ctx.body = ctx.params;
    });
    app.use(mapper.routes());
    request(http.createServer(app.callback()))
      .get('/openapi.json')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        expect(res.body).to.have.property('paths');
        expect(res.body.paths).to.have.property('/openapi.json');
        expect(res.body.paths).to.have.property('/users/{id}');
        expect(res.body.info).to.deep.equal(info);
        expect(res.body.tags).to.deep.equal(tags);
        expect(res.body.servers).to.deep.equal(servers);
        expect(res.body.paths['/users/{id}'].get).to.deep.equal({
          parameters: [{
            in: 'path',
            name: 'id',
            required: true,
            schema: { minimum: 100, type: 'number' }
          }, {
            in: 'query',
            name: 'type',
            schema: { type: 'number' }
          }, {
            in: 'header',
            name: 'token',
            schema: { type: 'string' }
          }, {
            in: 'cookie',
            name: 'sid',
            schema: { type: 'string' }
          }],
          summary: 'get user infomation',
          tags: ['user']
        });
        done();
      });
  });
});
