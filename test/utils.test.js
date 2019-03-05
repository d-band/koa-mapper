import { expect } from 'chai';
import * as utils from '../src/utils';

describe('utils', () => {
  it('utils#toURI()', () => {
    expect(utils.toURI('/hello')).to.equal('/hello');
    expect(utils.toURI('/hello', null)).to.equal('/hello');
    expect(utils.toURI('/hello', {})).to.equal('/hello');
    expect(utils.toURI('/hello', 'a=b')).to.equal('/hello?a=b');
    expect(utils.toURI('/hello', { a: 'b' })).to.equal('/hello?a=b');
    expect(utils.toURI('/hello?test', 'a=b')).to.equal('/hello?test&a=b');
    expect(utils.toURI('/hello?test', { a: 'b' })).to.equal('/hello?test&a=b');
  });
  it('utils#getMixType()', () => {
    expect(utils.getMixType('file')).to.deep.equal({ type: 'object', file: true });
    expect(utils.getMixType('date')).to.deep.equal({ type: 'string', format: 'date', convert: true });
    expect(utils.getMixType('datetime')).to.deep.equal({ type: 'string', format: 'date-time', convert: true });
    expect(utils.getMixType('number')).to.deep.equal({ type: 'number' });
    expect(utils.getMixType('User')).to.deep.equal({ $ref: '#/components/schemas/User' });
    expect(utils.getMixType('number|string')).to.deep.equal({
      oneOf: [{ type: 'number' }, { type: 'string' }]
    });
    expect(utils.getMixType('number|User')).to.deep.equal({
      oneOf: [{ type: 'number' }, { $ref: '#/components/schemas/User' }]
    });
    expect(utils.getMixType('Model|User')).to.deep.equal({
      oneOf: [{ $ref: '#/components/schemas/Model' }, { $ref: '#/components/schemas/User' }]
    });
    expect(utils.getMixType('number&integer')).to.deep.equal({
      allOf: [{ type: 'number' }, { type: 'integer' }]
    });
    expect(utils.getMixType('number&User')).to.deep.equal({
      allOf: [{ type: 'number' }, { $ref: '#/components/schemas/User' }]
    });
    expect(utils.getMixType('Model&User')).to.deep.equal({
      allOf: [{ $ref: '#/components/schemas/Model' }, { $ref: '#/components/schemas/User' }]
    });
    expect(() => utils.getMixType('number|string&date')).to.throw('& and | can only have one');
    // eslint-disable-next-line no-unused-expressions
    expect(utils.getMixType('   |   |   ')).to.be.undefined;
  });
  it('utils#transformExtends()', () => {
    expect(utils.transformExtends('User')).to.deep.equal({
      name: 'User',
      parents: []
    });
    expect(utils.transformExtends('User:   ,   ,   ')).to.deep.equal({
      name: 'User',
      parents: []
    });
    expect(utils.transformExtends('User:Model')).to.deep.equal({
      name: 'User',
      parents: [{ $ref: '#/components/schemas/Model' }]
    });
    expect(utils.transformExtends('User: Model, Test')).to.deep.equal({
      name: 'User',
      parents: [
        { $ref: '#/components/schemas/Model' },
        { $ref: '#/components/schemas/Test' }
      ]
    });
  });
  it('utils#transformType()', () => {
    expect(utils.transformType('')).to.deep.equal({});
    expect(utils.transformType('number')).to.deep.equal({
      type: 'number'
    });
    expect(utils.transformType('array')).to.deep.equal({
      type: 'array'
    });
    expect(utils.transformType('array< >')).to.deep.equal({
      type: 'array'
    });
    expect(utils.transformType('array<number>')).to.deep.equal({
      type: 'array',
      items: { type: 'number' }
    });
    expect(utils.transformType('array<number|string>')).to.deep.equal({
      type: 'array',
      items: {
        oneOf: [{ type: 'number' }, { type: 'string' }]
      }
    });
    expect(utils.transformType('array<User>')).to.deep.equal({
      type: 'array',
      items: {
        $ref: '#/components/schemas/User'
      }
    });
  });
  it('utils#takeInOptions()', () => {
    expect(utils.takeInOptions({
      summary: 'test',
      tags: 'test'
    }, 'path')).to.deep.equal({ summary: 'test' });
    expect(utils.takeInOptions({
      summary: 'test',
      tags: 'test'
    }, 'method')).to.deep.equal({ summary: 'test', tags: 'test' });
    expect(utils.takeInOptions({
      summary: 'test',
      tags: 'test',
      test: 'hello'
    }, 'method')).to.deep.equal({ summary: 'test', tags: 'test' });
  });
  it('utils#propsToSchema()', () => {
    expect(utils.propsToSchema('User')).to.deep.equal({
      $ref: '#/components/schemas/User'
    });
    // eslint-disable-next-line no-unused-expressions
    expect(utils.propsToSchema()).to.be.null;
    expect(utils.propsToSchema({
      id: { type: 'number' },
      list: { type: 'array<number>' }
    })).to.deep.equal({
      type: 'object',
      properties: {
        id: { type: 'number' },
        list: { type: 'array', items: { type: 'number' } }
      }
    });
    expect(utils.propsToSchema({
      id: { type: 'number', required: true },
      list: { type: 'array<number>' }
    }, {
      required: ['id', 'list']
    })).to.deep.equal({
      type: 'object',
      properties: {
        id: { type: 'number' },
        list: { type: 'array', items: { type: 'number' } }
      },
      required: ['id', 'list']
    });
  });
});
