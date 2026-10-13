// Unit tests for the controllers with a mocked adapter. No JS-Controller is required.
// The tests run against the build output, so call "npm run build" before.
const { expect } = require('chai');
const { updateStates, updateState } = require('../build/lib/api/controllers/state');
const { readEnums } = require('../build/lib/api/controllers/enum');

const ADMIN = 'system.user.admin';
const USER = 'system.user.myuser';

/**
 * Creates a mocked adapter with in-memory objects and states.
 *
 * Object flags (only for tests, not ioBroker attributes):
 * - denyRead:   reading of the object throws permissionError (getForeignObject) and it is invisible for find/views
 * - denyWrite:  writing of the state throws permissionError
 * - failWrite:  writing of the state throws an error with this text
 *
 * @param {Record<string, any>} objects
 * @param {{ acl?: Record<string, any>; listDenied?: boolean; failObjectRead?: string }} [options]
 */
function createAdapter(objects, options) {
    options = options || {};
    const adapter = {
        config: { onlyAllowWhenUserIsOwner: false },
        WEB_EXTENSION_PREFIX: 'rest-api',
        writes: [],
        warnings: [],
        log: {
            warn: text => adapter.warnings.push(text),
            debug: () => {},
            error: () => {},
            silly: () => {},
        },
        calculatePermissions(_user, _rights, cb) {
            cb(options.acl || { state: { write: true, read: true }, object: { read: true } });
        },
        async getForeignObjectAsync(id) {
            if (options.failObjectRead) {
                throw new Error(options.failObjectRead);
            }
            const obj = objects[id];
            if (obj?.denyRead) {
                throw new Error('permissionError');
            }
            return obj || null;
        },
        findForeignObject(idOrName, _type, _options, cb) {
            if (options.listDenied) {
                // the user has no "object.list" right
                cb(new Error('permissionError'));
                return;
            }
            if (objects[idOrName] && !objects[idOrName].denyRead) {
                cb(null, idOrName, objects[idOrName].common?.name);
                return;
            }
            const id = Object.keys(objects).find(
                key => !objects[key].denyRead && objects[key].common?.name === idOrName,
            );
            cb(null, id, id ? objects[id].common.name : idOrName);
        },
        async setForeignStateAsync(id, state, ack, opts) {
            if (typeof ack === 'object') {
                opts = ack;
                ack = undefined;
            }
            const obj = objects[id];
            if (obj?.denyWrite) {
                throw new Error('permissionError');
            }
            if (obj?.failWrite) {
                throw new Error(obj.failWrite);
            }
            adapter.writes.push({ id, state, ack, options: opts });
        },
        async getEnumAsync(id) {
            const result = {};
            Object.keys(objects)
                .filter(key => key.startsWith(`${id}.`) && objects[key].type === 'enum' && !objects[key].denyRead)
                .sort()
                .forEach(key => (result[key] = objects[key]));
            return { result, requestEnum: id };
        },
    };
    return adapter;
}

/**
 * Calls the handler like the router in rest-api.ts does and resolves with the answer.
 *
 * @param {(req: any, res: any) => void} handler
 * @param {{ adapter: any; url: string; body?: any; query?: Record<string, string>; user?: string; pathParams?: string[] }} params
 */
function call(handler, params) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No answer from handler')), 2000);
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                clearTimeout(timer);
                resolve({ status: this.statusCode, data });
            },
        };
        handler(
            {
                _adapter: params.adapter,
                _user: params.user || ADMIN,
                url: params.url,
                body: params.body,
                query: params.query || {},
                swagger: {
                    operation: { parameters: (params.pathParams || []).map(name => ({ in: 'path', name })) },
                },
            },
            res,
        );
    });
}

function testObjects() {
    return {
        'javascript.0.number': { type: 'state', common: { name: 'Number', type: 'number' } },
        'javascript.0.boolean': { type: 'state', common: { name: 'Boolean', type: 'boolean' } },
        'javascript.0.string': { type: 'state', common: { name: 'String', type: 'string' } },
        'javascript.0.mixed': { type: 'state', common: { name: 'Mixed', type: 'mixed' } },
        'javascript.0.byName': { type: 'state', common: { name: 'UniqueBulkName', type: 'number' } },
        'javascript.0.readOnly': { type: 'state', common: { name: 'ReadOnly', type: 'number' }, denyWrite: true },
        'javascript.0.broken': { type: 'state', common: { name: 'Broken', type: 'number' }, failWrite: 'DB closed' },
        'javascript.0.hidden': { type: 'state', common: { name: 'Hidden', type: 'number' }, denyRead: true },
    };
}

function bulk(adapter, body, query, user) {
    return call(updateStates, { adapter, url: '/v1/states', body, query, user });
}

describe('Controller state: PATCH /v1/states (bulk)', () => {
    describe('array body', () => {
        it('must write all states in the given order and answer in the same order', async () => {
            const adapter = createAdapter(testObjects());
            const { status, data } = await bulk(adapter, [
                { id: 'javascript.0.string', val: 'first' },
                { id: 'javascript.0.number', val: 2 },
                { id: 'javascript.0.boolean', val: true },
            ]);
            expect(status).equal(200);
            expect(data).to.deep.equal([
                { id: 'javascript.0.string', val: 'first', ack: false },
                { id: 'javascript.0.number', val: 2, ack: false },
                { id: 'javascript.0.boolean', val: true, ack: false },
            ]);
            expect(adapter.writes.map(w => w.id)).to.deep.equal([
                'javascript.0.string',
                'javascript.0.number',
                'javascript.0.boolean',
            ]);
        });

        it('must write the same state several times in the given order', async () => {
            const adapter = createAdapter(testObjects());
            await bulk(adapter, [
                { id: 'javascript.0.number', val: 1 },
                { id: 'javascript.0.number', val: 2 },
                { id: 'javascript.0.number', val: 3 },
            ]);
            expect(adapter.writes.map(w => w.state.val)).to.deep.equal([1, 2, 3]);
        });

        it('must wait for every write before starting the next one', async () => {
            const adapter = createAdapter(testObjects());
            const order = [];
            adapter.setForeignStateAsync = async id => {
                order.push(`start ${id}`);
                // the first write is the slowest one
                await new Promise(resolve => setTimeout(resolve, id === 'javascript.0.string' ? 50 : 1));
                order.push(`end ${id}`);
            };
            await bulk(adapter, [
                { id: 'javascript.0.string', val: 'a' },
                { id: 'javascript.0.number', val: 1 },
            ]);
            expect(order).to.deep.equal([
                'start javascript.0.string',
                'end javascript.0.string',
                'start javascript.0.number',
                'end javascript.0.number',
            ]);
        });

        it('must convert string values according to the object type', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [
                { id: 'javascript.0.number', val: '42.5' },
                { id: 'javascript.0.boolean', val: 'true' },
                { id: 'javascript.0.boolean', val: 'false' },
                { id: 'javascript.0.string', val: '42' },
                { id: 'javascript.0.string', val: 'true' },
                { id: 'javascript.0.number', val: 'abc' },
            ]);
            expect(data.map(r => r.val)).to.deep.equal([42.5, true, false, '42', 'true', 'abc']);
            expect(adapter.writes.map(w => w.state.val)).to.deep.equal([42.5, true, false, '42', 'true', 'abc']);
        });

        it('must accept null, 0, false and empty string as value', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [
                { id: 'javascript.0.mixed', val: null },
                { id: 'javascript.0.number', val: 0 },
                { id: 'javascript.0.boolean', val: false },
                { id: 'javascript.0.string', val: '' },
            ]);
            expect(data.map(r => r.val)).to.deep.equal([null, 0, false, '']);
            expect(data.every(r => !r.error)).to.be.true;
        });

        it('must set ack to false by default and convert it to boolean', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [
                { id: 'javascript.0.number', val: 1 },
                { id: 'javascript.0.number', val: 2, ack: true },
                { id: 'javascript.0.number', val: 3, ack: false },
                { id: 'javascript.0.number', val: 4, ack: 1 },
            ]);
            expect(data.map(r => r.ack)).to.deep.equal([false, true, false, true]);
            expect(adapter.writes.map(w => w.state.ack)).to.deep.equal([false, true, false, true]);
        });

        it('must pass other state attributes (q, expire, c) and not the id', async () => {
            const adapter = createAdapter(testObjects());
            await bulk(adapter, [{ id: 'javascript.0.number', val: 5, q: 0x40, expire: 10, c: 'NFC reader' }]);
            expect(adapter.writes[0].state).to.deep.equal({ val: 5, ack: false, q: 0x40, expire: 10, c: 'NFC reader' });
        });

        it('must write with the rights of the user', async () => {
            const adapter = createAdapter(testObjects());
            adapter.config.onlyAllowWhenUserIsOwner = true;
            await bulk(adapter, [{ id: 'javascript.0.number', val: 5 }], {}, USER);
            expect(adapter.writes[0].options).to.deep.equal({ user: USER, limitToOwnerRights: true });
        });

        it('must find the state by name', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [{ id: 'UniqueBulkName', val: '7' }]);
            expect(data).to.deep.equal([{ id: 'javascript.0.byName', val: 7, ack: false }]);
            expect(adapter.writes[0].id).equal('javascript.0.byName');
        });

        it('must use the given ID if the user may not list objects', async () => {
            const adapter = createAdapter(testObjects(), { listDenied: true });
            const { data } = await bulk(adapter, [{ id: 'javascript.0.number', val: '3' }]);
            expect(data).to.deep.equal([{ id: 'javascript.0.number', val: 3, ack: false }]);
        });
    });

    describe('object body', () => {
        it('must accept plain values and keep the order of the keys', async () => {
            const adapter = createAdapter(testObjects());
            const { status, data } = await bulk(adapter, {
                'javascript.0.string': 'text',
                'javascript.0.number': '12',
                'javascript.0.boolean': false,
            });
            expect(status).equal(200);
            expect(data).to.deep.equal([
                { id: 'javascript.0.string', val: 'text', ack: false },
                { id: 'javascript.0.number', val: 12, ack: false },
                { id: 'javascript.0.boolean', val: false, ack: false },
            ]);
        });

        it('must accept state objects as values', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, {
                'javascript.0.number': { val: 1, ack: true, q: 1 },
                'javascript.0.string': 'plain',
            });
            expect(data).to.deep.equal([
                { id: 'javascript.0.number', val: 1, ack: true },
                { id: 'javascript.0.string', val: 'plain', ack: false },
            ]);
            expect(adapter.writes[0].state).to.deep.equal({ val: 1, ack: true, q: 1 });
        });

        it('must accept null as value', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, { 'javascript.0.mixed': null });
            expect(data).to.deep.equal([{ id: 'javascript.0.mixed', val: null, ack: false }]);
        });

        it('must report a state object without val', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, { 'javascript.0.number': { ack: true } });
            expect(data).to.deep.equal([{ id: 'javascript.0.number', index: 0, error: 'val missing' }]);
            expect(adapter.writes).to.be.empty;
        });
    });

    describe('errors per entry', () => {
        it('must report invalid entries with their index and write the others', async () => {
            const adapter = createAdapter(testObjects());
            const { status, data } = await bulk(adapter, [
                { val: 1 },
                null,
                5,
                { id: 7, val: 1 },
                { id: '', val: 1 },
                { id: 'javascript.0.number' },
                { id: 'javascript.0.string', val: 'ok' },
            ]);
            expect(status).equal(200);
            expect(data).to.deep.equal([
                { index: 0, error: 'id missing' },
                { index: 1, error: 'id missing' },
                { index: 2, error: 'id missing' },
                { index: 3, error: 'id missing' },
                { index: 4, error: 'id missing' },
                { id: 'javascript.0.number', index: 5, error: 'val missing' },
                { id: 'javascript.0.string', val: 'ok', ack: false },
            ]);
            expect(adapter.writes.map(w => w.id)).to.deep.equal(['javascript.0.string']);
        });

        it('must report unknown and invisible IDs as "ID not found"', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [
                { id: 'javascript.0.notExisting', val: 1 },
                { id: 'javascript.0.hidden', val: 1 },
            ]);
            expect(data).to.deep.equal([
                { id: 'javascript.0.notExisting', index: 0, error: 'ID not found' },
                { id: 'javascript.0.hidden', index: 1, error: 'ID not found' },
            ]);
            expect(adapter.writes).to.be.empty;
        });

        it('must report missing write permission per state and continue', async () => {
            const adapter = createAdapter(testObjects());
            const { status, data } = await bulk(adapter, [
                { id: 'javascript.0.readOnly', val: 1 },
                { id: 'javascript.0.number', val: 2 },
            ]);
            expect(status).equal(200);
            expect(data).to.deep.equal([
                { id: 'javascript.0.readOnly', index: 0, error: 'permissionError' },
                { id: 'javascript.0.number', val: 2, ack: false },
            ]);
            expect(adapter.warnings.some(w => w.includes('javascript.0.readOnly'))).to.be.true;
        });

        it('must report other write errors with their text', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [{ id: 'javascript.0.broken', val: 1 }]);
            expect(data).to.deep.equal([{ id: 'javascript.0.broken', index: 0, error: 'Error: DB closed' }]);
        });

        it('must report errors of the ID search', async () => {
            const adapter = createAdapter(testObjects());
            adapter.findForeignObject = (_id, _type, _options, cb) => cb(new Error('DB closed'));
            const { data } = await bulk(adapter, [{ id: 'javascript.0.number', val: 1 }]);
            expect(data).to.deep.equal([{ id: 'javascript.0.number', index: 0, error: 'Error: DB closed' }]);
        });
    });

    describe('stopOnError', () => {
        const body = [
            { id: 'javascript.0.string', val: 'first' },
            { id: 'javascript.0.readOnly', val: 1 },
            { id: 'javascript.0.string', val: 'never' },
        ];

        it('must stop at the first error with stopOnError=true', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, body, { stopOnError: 'true' });
            expect(data).to.deep.equal([
                { id: 'javascript.0.string', val: 'first', ack: false },
                { id: 'javascript.0.readOnly', index: 1, error: 'permissionError' },
            ]);
            expect(adapter.writes.map(w => w.state.val)).to.deep.equal(['first']);
        });

        it('must stop at an invalid entry with stopOnError=true', async () => {
            const adapter = createAdapter(testObjects());
            const { data } = await bulk(adapter, [{ val: 1 }, { id: 'javascript.0.string', val: 'never' }], {
                stopOnError: 'true',
            });
            expect(data).to.deep.equal([{ index: 0, error: 'id missing' }]);
            expect(adapter.writes).to.be.empty;
        });

        it('must process all states with stopOnError=false or without it', async () => {
            for (const query of [{ stopOnError: 'false' }, {}]) {
                const adapter = createAdapter(testObjects());
                const { data } = await bulk(adapter, body, query);
                expect(data.length).equal(3);
                expect(adapter.writes.map(w => w.state.val)).to.deep.equal(['first', 'never']);
            }
        });
    });

    describe('invalid requests', () => {
        for (const [name, body] of [
            ['empty array', []],
            ['empty object', {}],
            ['no body', undefined],
            ['null', null],
            ['string', 'text'],
            ['number', 5],
        ]) {
            it(`must answer 422 for ${name}`, async () => {
                const adapter = createAdapter(testObjects());
                const { status, data } = await bulk(adapter, body);
                expect(status).equal(422);
                expect(data.error).to.be.a('string');
                expect(data.expectedBody).to.be.an('array');
                expect(adapter.writes).to.be.empty;
            });
        }

        it('must accept 1000 states', async () => {
            const adapter = createAdapter(testObjects());
            const body = Array.from({ length: 1000 }, (_, i) => ({ id: 'javascript.0.number', val: i }));
            const { status, data } = await bulk(adapter, body);
            expect(status).equal(200);
            expect(data.length).equal(1000);
            expect(adapter.writes.length).equal(1000);
        });

        it('must answer 422 for more than 1000 states and write nothing', async () => {
            const adapter = createAdapter(testObjects());
            const body = Array.from({ length: 1001 }, (_, i) => ({ id: 'javascript.0.number', val: i }));
            const { status, data } = await bulk(adapter, body);
            expect(status).equal(422);
            expect(data.count).equal(1001);
            expect(adapter.writes).to.be.empty;
        });

        it('must answer 403 if the user has no right to write states', async () => {
            const adapter = createAdapter(testObjects(), { acl: { state: { write: false }, object: { read: true } } });
            const { status, data } = await bulk(adapter, [{ id: 'javascript.0.number', val: 1 }], {}, USER);
            expect(status).equal(403);
            expect(data.error).equal('permissionError');
            expect(adapter.writes).to.be.empty;
        });
    });
});

describe('Controller state: PATCH /v1/state/{stateId} (value conversion)', () => {
    function update(adapter, stateId, body) {
        return call(updateState, { adapter, url: `/v1/state/${stateId}`, body, pathParams: ['stateId'] });
    }

    it('must still convert "true" for boolean states', async () => {
        const adapter = createAdapter(testObjects());
        const { data } = await update(adapter, 'javascript.0.boolean', 'true');
        expect(data).to.deep.equal({ id: 'javascript.0.boolean', val: true });
    });

    it('must still convert numeric strings for number states', async () => {
        const adapter = createAdapter(testObjects());
        const { data } = await update(adapter, 'javascript.0.number', '17');
        expect(data).to.deep.equal({ id: 'javascript.0.number', val: 17 });
    });

    it('must not convert numeric strings for string states', async () => {
        const adapter = createAdapter(testObjects());
        const { data } = await update(adapter, 'javascript.0.string', '17');
        expect(data).to.deep.equal({ id: 'javascript.0.string', val: '17' });
    });

    it('must write state objects unchanged', async () => {
        const adapter = createAdapter(testObjects());
        const { data } = await update(adapter, 'javascript.0.number', { val: '17', ack: true });
        expect(data).to.deep.equal({ id: 'javascript.0.number', val: '17', ack: true });
    });
});

describe('Controller enum: GET /v1/enum/{enumId}', () => {
    function enumObjects() {
        return {
            'enum.functions': { type: 'enum', common: { name: 'Functions', members: [] } },
            'enum.functions.shutters': { type: 'enum', common: { name: 'Shutters', members: ['a.0.s'] } },
            'enum.functions.shutters.boolean': {
                type: 'enum',
                common: { name: 'Boolean', members: ['a.0.b'] },
                native: { secret: 1 },
            },
            'enum.functions.shutters.boolean.deep': { type: 'enum', common: { name: 'Deep', members: [] } },
            'enum.functions.light': { type: 'enum', common: { name: 'Light', members: ['a.0.l'] } },
            'enum.functions.lighting': { type: 'enum', common: { name: 'Lighting', members: [] } },
            'enum.rooms': { type: 'enum', common: { name: 'Rooms', members: [] } },
            'enum.private': { type: 'enum', common: { name: 'Private', members: [] } },
            'enum.private.hidden': { type: 'enum', common: { name: 'Hidden', members: [] }, denyRead: true },
            'enum.private.hidden.visible': { type: 'enum', common: { name: 'Visible', members: [] } },
            'enum.private.secret': { type: 'enum', common: { name: 'Secret', members: [] }, denyRead: true },
            'javascript.0.notEnum': { type: 'state', common: { name: 'Not enum' } },
        };
    }

    function read(adapter, enumId, user) {
        return call(readEnums, {
            adapter,
            url: `/v1/enum/${encodeURIComponent(enumId)}`,
            pathParams: ['enumId'],
            user,
        });
    }

    const ids = data => data.map(e => e._id);

    it('must return all enums of a category, but not the category itself', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'functions');
        expect(status).equal(200);
        expect(ids(data)).to.deep.equal([
            'enum.functions.light',
            'enum.functions.lighting',
            'enum.functions.shutters',
            'enum.functions.shutters.boolean',
            'enum.functions.shutters.boolean.deep',
        ]);
    });

    it('must return the enum itself as first entry and then all sub-enums', async () => {
        const { data } = await read(createAdapter(enumObjects()), 'functions.shutters');
        expect(ids(data)).to.deep.equal([
            'enum.functions.shutters',
            'enum.functions.shutters.boolean',
            'enum.functions.shutters.boolean.deep',
        ]);
    });

    it('must return an enum without sub-enums (issue #200)', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'functions.light');
        expect(status).equal(200);
        // "enum.functions.lighting" starts with the same text, but is not a sub-enum
        expect(data).to.deep.equal([{ _id: 'enum.functions.light', common: { name: 'Light', members: ['a.0.l'] } }]);
    });

    it('must return only _id and common', async () => {
        const { data } = await read(createAdapter(enumObjects()), 'functions.shutters.boolean');
        expect(data[0]).to.deep.equal({
            _id: 'enum.functions.shutters.boolean',
            common: { name: 'Boolean', members: ['a.0.b'] },
        });
    });

    it('must accept the ID with "enum." prefix', async () => {
        const { data } = await read(createAdapter(enumObjects()), 'enum.functions.light');
        expect(ids(data)).to.deep.equal(['enum.functions.light']);
    });

    it('must return an empty list for a category without enums', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'rooms');
        expect(status).equal(200);
        expect(data).to.deep.equal([]);
    });

    it('must answer 404 for a not existing enum', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'functions.notExisting');
        expect(status).equal(404);
        expect(data).to.deep.equal({ error: 'Enum not found', enumId: 'enum.functions.notExisting' });
    });

    it('must answer 404 for a not existing category', async () => {
        const { status } = await read(createAdapter(enumObjects()), 'notExisting');
        expect(status).equal(404);
    });

    it('must not return an object that is not an enum', async () => {
        const objects = enumObjects();
        objects['enum.functions.wrong'] = { type: 'state', common: { name: 'Wrong' } };
        const { status, data } = await read(createAdapter(objects), 'functions.wrong');
        expect(status).equal(404);
        expect(data).to.deep.equal({ error: 'Enum not found', enumId: 'enum.functions.wrong' });
    });

    it('must return the readable sub-enums if the enum itself is not readable', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'private.hidden', USER);
        expect(status).equal(200);
        expect(ids(data)).to.deep.equal(['enum.private.hidden.visible']);
    });

    it('must answer 403 if the enum is not readable and has no readable sub-enums', async () => {
        const { status, data } = await read(createAdapter(enumObjects()), 'private.secret', USER);
        expect(status).equal(403);
        expect(data).to.deep.equal({ error: 'permissionError', enumId: 'enum.private.secret' });
    });

    it('must not return the sub-enums that are not readable', async () => {
        const { data } = await read(createAdapter(enumObjects()), 'private', USER);
        expect(ids(data)).to.deep.equal(['enum.private.hidden.visible']);
    });

    it('must answer 500 by other errors', async () => {
        const adapter = createAdapter(enumObjects(), { failObjectRead: 'DB closed' });
        const { status, data } = await read(adapter, 'functions.light');
        expect(status).equal(500);
        expect(data).to.deep.equal({ error: 'Error: DB closed', enumId: 'enum.functions.light' });
    });

    it('must answer 403 if the user has no right to read objects', async () => {
        const adapter = createAdapter(enumObjects(), { acl: { object: { read: false } } });
        const { status, data } = await read(adapter, 'functions.light', USER);
        expect(status).equal(403);
        expect(data.error).equal('permissionError');
    });
});
