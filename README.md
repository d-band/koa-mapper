# koa-mapper

[![NPM version](https://img.shields.io/npm/v/koa-mapper.svg)](https://www.npmjs.com/package/koa-mapper)
[![NPM downloads](https://img.shields.io/npm/dm/koa-mapper.svg)](https://www.npmjs.com/package/koa-mapper)
[![Dependency Status](https://david-dm.org/d-band/koa-mapper.svg)](https://david-dm.org/d-band/koa-mapper)
[![Build Status](https://travis-ci.org/d-band/koa-mapper.svg?branch=master)](https://travis-ci.org/d-band/koa-mapper)
[![Coverage Status](https://coveralls.io/repos/github/d-band/koa-mapper/badge.svg?branch=master)](https://coveralls.io/github/d-band/koa-mapper?branch=master)

> `koa-mapper` is a better and smart router middleware for koa.

## Installation

```bash
npm install koa-mapper
```

## Example

```js
import Koa from 'koa';
import logger from 'koa-logger';
import Mapper from 'koa-mapper';

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

mapper.define('User', {
  id: { type: 'number', required: true },
  name: { type: 'string', required: true }
});

app.use(mapper.routes());
app.use(mapper.allowedMethods());

app.listen(3000);

// open http://localhost:3000/users/123?info[id]=456&info[name]=hello
// open http://localhost:3000/openapi.json
```

## License

MIT
