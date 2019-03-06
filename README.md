# koa-mapper

[![NPM version](https://img.shields.io/npm/v/koa-mapper.svg)](https://www.npmjs.com/package/koa-mapper)
[![NPM downloads](https://img.shields.io/npm/dm/koa-mapper.svg)](https://www.npmjs.com/package/koa-mapper)
[![Dependency Status](https://david-dm.org/d-band/koa-mapper.svg)](https://david-dm.org/d-band/koa-mapper)
[![Build Status](https://travis-ci.org/d-band/koa-mapper.svg?branch=master)](https://travis-ci.org/d-band/koa-mapper)
[![Coverage Status](https://coveralls.io/repos/github/d-band/koa-mapper/badge.svg?branch=master)](https://coveralls.io/github/d-band/koa-mapper?branch=master) [![Greenkeeper badge](https://badges.greenkeeper.io/d-band/koa-mapper.svg)](https://greenkeeper.io/)

> `koa-mapper` is a better and smart router middleware for koa. (Inspired by `koa-router`)

* Support almost all features of `koa-router`
* Support for parameters validation
* Support parameters in `path`, `header`, `query`, `cookie`
* Support body parser
* Support request body validation
* Support coerce data types of parameters and body
* Support OpenAPI generation

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

mapper.post('/users', {
  body: {
    users: { type: 'array<User>', in: 'query' }
  }
}, (ctx) => {
  ctx.body = ctx.request.body;
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

## API Reference

### `new Mapper([options])`

**Options**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| prefix | `string` | `''` | the path prefix for a Mapper |
| openURL | `string` or `false` | `/openapi.json` | OpenAPI route, `false` to disable OpenAPI |
| bodyparser | `object` or `boolean` | `false` | `koa-body` options, `true|{}` to enable body parser |
| throwParamsError | `function` or `boolean` | `utils.validateError` | Throw error for params invalid |
| throwBodyError | `function` or `boolean` | `utils.validateError` | Throw error for body invalid |
| validator | `object` | `{}` | [`ajv options`](https://github.com/epoberezkin/ajv#options) |
| sensitive | `boolean` | `false` | `sensitive` option for [path-to-regexp](https://github.com/pillarjs/path-to-regexp) |
| strict | `boolean` | `false` | `strict` option for [path-to-regexp](https://github.com/pillarjs/path-to-regexp) |

### `mapper.get|put|post|delete|del|patch(path, [options], ...middlewares) => Mapper`

```js
type options = {
  name: string, // route name, default null
  prefix: string, // route prefix, default ''
  bodyparser: function, // like Mapper options.bodyparser
  throwParamsError: function, // like Mapper options.throwParamsError
  throwBodyError: function, // like Mapper options.throwBodyError
  params: Params, // OpenAPI parameters definition
  body: Body, // OpenAPI requestBody schema definition
  ...others, // OpenAPI [Operation Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#operation-object)
}
```

```
type Params = {
  in: string, // parameter in: `path`, `query`, `header`, `cookie`
  type: string, // parameter type
  ...others, // OpenAPI [Parameter Object](https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#parameterObject)
}
```

> `type` support `array`, `boolean`, `integer`, `null`, `number`, `object`, `string`, `date`, `time`, `datetime`, `regex`, `array<type>`. like: `array<string>`, `Pet`, `array<Pet>`

```
type Body = string | {
  [property]: Schema
}
```

> examples: `body: 'Pet'` => `body: { $ref: 'Pet' }`, `body: { id: { type: 'number' } }` => `body: { type: 'object', properties: { id: { type: 'number' } }}`


### `mapper.define(schemaName, properties, options) => Mapper` alias `mapper.schema()`

```
mapper.schema('Tag', {
  id: { type: 'integer', format: 'int64' },
  name: { type: 'string' }
});
mapper.schema('Category', {
  id: { type: 'integer', format: 'int64' },
  name: { type: 'string' }
});
mapper.schema('Pet', {
  id: { type: 'integer', format: 'int64' },
  category: { type: 'Category' },
  name: { type: 'string' },
  photoUrls: { type: 'array<string>' },
  tags: { type: 'array<Tag>' },
  status: { type: 'string', enum: ['available', 'pending', 'sold'] }
}, {
  required: ['name', 'photoUrls']
});
```
## License

MIT
