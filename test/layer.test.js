/**
 * Route tests
 */

import Koa from 'koa';
import http from 'http';
import request from 'supertest';
import chai from 'chai';
import Mapper from '../src/index';
import Layer from '../src/layer';

// eslint-disable-next-line no-unused-vars
const should = chai.should();

describe('Layer', () => {
  it('composes multiple callbacks/middlware', (done) => {
    const app = new Koa();
    const mapper = new Mapper();
    app.use(mapper.routes());
    mapper.get(
      '/:category/:title',
      (ctx, next) => {
        ctx.status = 500;
        return next();
      },
      (ctx, next) => {
        ctx.status = 204;
        return next();
      }
    );
    request(http.createServer(app.callback()))
      .get('/programming/how-to-node')
      .expect(204)
      .end((err) => {
        if (err) return done(err);
        done();
      });
  });

  describe('Layer#match()', () => {
    it('captures URL path parameters', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      mapper.get('/:category/:title', (ctx) => {
        ctx.should.have.property('params');
        ctx.params.should.be.a('object');
        ctx.params.should.have.property('category', 'match');
        ctx.params.should.have.property('title', 'this');
        ctx.status = 204;
      });
      request(http.createServer(app.callback()))
        .get('/match/this')
        .expect(204)
        .end((err, res) => {
          if (err) return done(err);
          done();
        });
    });

    it('return orginal path parameters when decodeURIComponent throw error', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      mapper.get('/:category/:title', (ctx) => {
        ctx.should.have.property('params');
        ctx.params.should.be.a('object');
        ctx.params.should.have.property('category', '100%');
        ctx.params.should.have.property('title', '101%');
        ctx.status = 204;
      });
      request(http.createServer(app.callback()))
        .get('/100%/101%')
        .expect(204)
        .end(done);
    });

    it('should throw friendly error message when handle not exists', () => {
      const app = new Koa();
      const mapper = new Mapper();
      app.use(mapper.routes());
      const notexistHandle = undefined;
      (() => {
        mapper.get('/foo', null, notexistHandle);
      }).should.to.throw('get /foo: middleware must be a function');

      (() => {
        mapper.get('/foo', { name: 'foo mapper' }, notexistHandle);
      }).should.to.throw('get foo mapper: middleware must be a function');

      (() => {
        mapper.post('/foo', () => {}, notexistHandle);
      }).should.to.throw('post /foo: middleware must be a function');
    });
  });

  describe('Layer#param()', () => {
    it('composes middleware for param fn', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      const route = new Layer('/users/:user', ['GET'], [(ctx) => {
        ctx.body = ctx.user;
      }]);
      route.param('user', (id, ctx, next) => {
        ctx.user = { name: 'alex' };
        if (!id) {
          ctx.status = 404;
          return;
        }
        return next();
      });
      mapper.stack.push(route);
      app.use(mapper.middleware());
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

    it('ignores params which are not matched', (done) => {
      const app = new Koa();
      const mapper = new Mapper();
      var route = new Layer('/users/:user', ['GET'], [(ctx) => {
        ctx.body = ctx.user;
      }]);
      route.param('user', (id, ctx, next) => {
        ctx.user = { name: 'alex' };
        if (!id) {
          ctx.status = 404;
          return;
        }
        return next();
      });
      route.param('title', (id, ctx, next) => {
        ctx.user = { name: 'mark' };
        if (!id) {
          ctx.status = 404;
          return;
        }
        return next();
      });
      mapper.stack.push(route);
      app.use(mapper.middleware());
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
  });

  describe('Layer#url()', () => {
    it('generates route URL', () => {
      const route = new Layer('/:category/:title', ['get'], [() => {}], { name: 'books' });
      let url = route.url({ category: 'programming', title: 'how-to-node' });
      url.should.equal('/programming/how-to-node');
      url = route.url(['programming', 'how-to-node']);
      url.should.equal('/programming/how-to-node');
    });

    it('escapes using encodeURIComponent()', () => {
      const route = new Layer('/:category/:title', ['get'], [() => {}], { name: 'books' });
      let url = route.url({ category: 'programming', title: 'how to node' });
      url.should.equal('/programming/how%20to%20node');
    });
  });
});
