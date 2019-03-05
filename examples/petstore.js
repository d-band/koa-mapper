const Koa = require('koa');
const logger = require('koa-logger');
const Mapper = require('../lib').default;
const { transformType } = require('../lib/utils');

const app = new Koa();

app.use(logger());

const mapper = new Mapper();

mapper.info({
  version: '1.0.0',
  title: 'Swagger Petstore',
  description: 'This is a sample server Petstore server.',
  termsOfService: 'http://petstore.io/terms/',
  contact: {
    email: 'apiteam@petstore.io'
  },
  license: {
    name: 'Apache 2.0',
    url: 'http://www.apache.org/licenses/LICENSE-2.0.html'
  }
});
mapper.addTag({
  name: 'pet',
  description: 'Everything about your Pets',
});
mapper.addTag({
  name: 'store',
  description: 'Access to Petstore orders'
});
mapper.addTag({
  name: 'user',
  description: 'Operations about user',
});
mapper.addServer({
  url: 'https://api.petstore.io/v1',
  description: 'Production'
});
mapper.addServer({
  url: 'https://dev.petstore.io/v1',
  description: 'Development'
});

mapper.get('/', ctx => {
  ctx.body = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Document</title>
    </head>
    <body>
      <form enctype="multipart/form-data" method="post" action="/pet/123/uploadImage">
        <input name="name" type="text" />
        <input name="image" type="file" />
        <input type="submit" value="submit" />
      </form>
    </body>
    </html>
  `;
});

mapper.post('/pet', {
  tags: ['pet'],
  summary: 'Add a new pet to the store',
  operationId: 'addPet',
  responses: {
    '405': { description: 'Invalid input' }
  },
  security: [{
    petstore_auth: ['write:pets', 'read:pets']
  }],
  body: 'Pet'
}, (ctx) => { ctx.body = {}; });

mapper.put('/pet', {
  tags: ['pet'],
  summary: 'Update an existing pet',
  operationId: 'updatePet',
  responses: {
    '400': { description: 'Invalid ID supplied' },
    '404': { description: 'Pet not found' },
    '405': { description: 'Validation exception' }
  },
  security: [{
    petstore_auth: ['write:pets', 'read:pets']
  }],
  body: 'Pet'
}, (ctx) => { ctx.body = {}; });

mapper.get('/pet/findByStatus', {
  throwParamsError: (errors) => {
    console.log(errors[0].params);
  },
  tags: ['pet'],
  summary: 'Finds pets by status',
  operationId: 'findPetsByStatus',
  params: {
    status: {
      in: 'query',
      type: 'array<string>',
      required: true,
      explode: true,
      description: 'Status values that need to be considered for filter',
      items: {
        enum: ['available', 'pending', 'sold'],
        default: 'available'
      }
    }
  },
  responses: {
    '200': {
      content: {
        'application/json': { schema: transformType('array<Pet>') }
      }
    },
    '400': { description: 'Invalid status value' }
  }
}, (ctx) => { ctx.body = ctx.params; });

mapper.get('/pet/findByTags', {
  tags: ['pet'],
  summary: 'Finds pets by tags',
  operationId: 'findPetsByTags',
  deprecated: true,
  params: {
    tags: {
      in: 'query',
      type: 'array<string>',
      required: true,
      explode: true,
      description: 'Tags to filter by'
    }
  },
  responses: {
    '200': {
      content: {
        'application/json': { schema: transformType('array<Pet>') }
      }
    },
    '400': { description: 'Invalid tag value' }
  }
}, (ctx) => { ctx.body = [{}]; });

mapper.get('/pet/:petId', {
  tags: ['pet'],
  summary: 'Finds pet by id',
  operationId: 'getPetById',
  params: {
    petId: {
      type: 'integer',
      format: 'int64',
      description: 'ID of pet to return',
      required: true
    }
  },
  responses: {
    '200': {
      content: {
        'application/json': { schema: transformType('Pet') }
      }
    },
    '400': { description: 'Invalid ID supplied' },
    '404': { description: 'Pet not found' }
  }
}, (ctx) => { ctx.body = {}; });

mapper.post('/pet/:petId', {
  tags: ['pet'],
  summary: 'Updates a pet in the store with form data',
  operationId: 'updatePetWithForm',
  params: {
    petId: {
      type: 'integer',
      format: 'int64',
      description: 'ID of pet to update',
      required: true
    }
  },
  body: {
    name: {
      type: 'string',
      description: 'Updated name of the pet'
    },
    status: {
      type: 'string',
      description: 'Updated status of the pet'
    }
  },
  responses: {
    '405': { description: 'Invalid input' }
  }
}, (ctx) => { ctx.body = {}; });

mapper.del('/pet/:petId', {
  tags: ['pet'],
  summary: 'Deletes a pet',
  operationId: 'deletePet',
  params: {
    api_key: {
      type: 'string',
      in: 'header',
      required: false
    },
    petId: {
      type: 'integer',
      format: 'int64',
      description: 'ID of pet to delete',
      required: true
    }
  },
  responses: {
    '400': { description: 'Invalid ID supplied' },
    '404': { description: 'Pet not found' }
  }
}, (ctx) => { ctx.body = {}; });

mapper.post('/pet/:petId/uploadImage', {
  bodyparser: { multipart: true },
  tags: ['pet'],
  summary: 'uploads an image',
  operationId: 'uploadFile',
  params: {
    petId: {
      type: 'integer',
      // format: 'int64',
      description: 'ID of pet to update',
      required: true
    }
  },
  body: {
    image: {
      type: 'file',
      required: true
    }
  },
  responses: {
    '200': {
      content: {
        'application/json': { schema: transformType('ApiResponse') }
      }
    }
  }
}, (ctx) => {
  ctx.body = {};
});

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
mapper.schema('ApiResponse', {
  code: { type: 'integer', format: 'int64' },
  type: { type: 'string' },
  message: { type: 'string' }
});

app.use(mapper.routes());
app.use(mapper.allowedMethods());

app.listen(3000);
