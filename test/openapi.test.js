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
        id: { type: 'number', schema: { minimum: 100 } },
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
