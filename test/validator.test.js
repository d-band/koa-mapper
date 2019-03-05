import { expect } from 'chai';
import File from 'formidable/lib/file';
import Validator from '../src/validator';

describe('Validator', () => {
  it('validator compile', () => {
    const validator = new Validator();
    const validate = validator.compile({
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' }
      },
      required: ['id', 'name']
    });
    expect(validate).to.be.a('function');
    // eslint-disable-next-line no-unused-expressions
    expect(validate({
      id: 123,
      name: 'hello'
    })).to.be.true;
    // eslint-disable-next-line no-unused-expressions
    expect(validate({
      id: '123',
      name: 'hello'
    })).to.be.true;
    // eslint-disable-next-line no-unused-expressions
    expect(validate({
      id: 123
    })).to.be.false;
    // eslint-disable-next-line no-unused-expressions
    expect(validate({
      id: 'abc',
      name: 'hello'
    })).to.be.false;
    const obj = { id: '123', name: 345 };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.id).to.be.a('number');
    expect(obj.name).to.be.a('string');
  });

  it('validator convert', () => {
    const validator = new Validator();
    // date
    let validate = validator.compile({
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date', convert: true }
      }
    });
    expect(validate).to.be.a('function');
    let obj = { date: '2019-03-04' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.date).to.instanceof(Date);
    expect(obj.date.toISOString()).to.equal('2019-03-04T00:00:00.000Z');
    // convert function
    validate = validator.compile({
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date', convert: () => 123 }
      }
    });
    obj = { date: '2019-03-04' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.date).to.equal(123);
    // time
    validate = validator.compile({
      type: 'object',
      properties: {
        time: { type: 'string', format: 'time', convert: true }
      }
    });
    expect(validate).to.be.a('function');
    obj = { time: '12:45:19.456' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.time).to.instanceof(Date);
    expect(obj.time.toISOString()).to.have.string('12:45:19.456Z');
    obj = { time: '12:45:19+08:00' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.time).to.instanceof(Date);
    expect(obj.time.toISOString()).to.have.string('04:45:19.000Z');
    // date-time
    validate = validator.compile({
      type: 'object',
      properties: {
        datetime: { type: 'string', format: 'date-time', convert: true }
      }
    });
    expect(validate).to.be.a('function');
    obj = { datetime: '2019-03-04 12:45:19.000Z' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.datetime).to.instanceof(Date);
    expect(obj.datetime.toISOString()).to.equal('2019-03-04T12:45:19.000Z');
    // convert false
    validate = validator.compile({
      type: 'object',
      properties: {
        datetime: { type: 'string', format: 'date-time', convert: false }
      }
    });
    expect(validate).to.be.a('function');
    obj = { datetime: '2019-03-04 12:45:19.000Z' };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.datetime).to.equal('2019-03-04 12:45:19.000Z');
  });

  it('validator file', () => {
    const validator = new Validator();
    let validate = validator.compile({
      type: 'object',
      properties: {
        file: { type: 'object', file: true }
      }
    });
    let obj = { file: new File() };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.file).to.instanceof(File);

    expect(validate({ file: {} })).to.be.false; // eslint-disable-line no-unused-expressions

    validate = validator.compile({
      type: 'object',
      properties: {
        file: { type: 'object', file: false }
      }
    });
    obj = { file: new File() };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.file).to.instanceof(File);

    expect(validate({ file: {} })).to.be.true; // eslint-disable-line no-unused-expressions
  });

  it('validator schema', () => {
    const validator = new Validator();
    validator.addSchema('User: Model', {
      name: { type: 'string', required: true },
      birthday: { type: 'date' }
    });
    validator.addSchema('Model', {
      id: { type: 'number', required: true }
    });
    validator.addSchema('Info: User');
    const validate = validator.compile({
      type: 'object',
      properties: {
        id: { type: 'number' },
        user: { $ref: '#/components/schemas/User' }
      }
    });
    expect(validator.getSchemas()).to.deep.equal({
      Info: {
        $ref: '#/components/schemas/User'
      },
      Model: {
        type: 'object',
        properties: {
          id: { 'type': 'number' }
        },
        required: ['id']
      },
      User: {
        allOf: [{
          $ref: '#/components/schemas/Model'
        }, {
          type: 'object',
          properties: {
            name: { type: 'string' },
            birthday: {
              type: 'string',
              format: 'date',
              convert: true
            }
          },
          required: ['name']
        }]
      }
    });
    const obj = {
      id: '123',
      user: {
        id: '456',
        name: 567,
        birthday: '2019-03-04'
      }
    };
    expect(validate(obj)).to.be.true; // eslint-disable-line no-unused-expressions
    expect(obj.id).to.equal(123);
    expect(obj.user.id).to.equal(456);
    expect(obj.user.name).to.equal('567');
    expect(obj.user.birthday).to.instanceof(Date);
    expect(obj.user.birthday.toISOString()).to.equal('2019-03-04T00:00:00.000Z');
    // eslint-disable-next-line no-unused-expressions
    expect(validate({
      id: '123',
      user: {
        id: '456'
      }
    })).to.be.false;
  });
});
