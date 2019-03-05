const Koa = require('koa');
const logger = require('koa-logger');
const Mapper = require('../lib').default;

const app = new Koa();

app.use(logger());

const mapper = new Mapper();

mapper.get('/users/:id', {
  params: {
    id: { type: 'number' },
    info: { type: 'User', in: 'query' }
  }
}, (ctx) => {
  ctx.body = ctx.params;
});

mapper.post('/users', {
  body: {
    type: 'User'
  }
}, ctx => {
  ctx.body = ctx.request.body;
});

mapper.define('User', {
  id: { type: 'number', required: true },
  name: { type: 'string', required: true }
});

app.use(mapper.routes());
app.use(mapper.allowedMethods());

app.listen(3000);