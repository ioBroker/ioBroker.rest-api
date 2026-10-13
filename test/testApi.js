const path = require('node:path');
const axios = require('axios');
const { tests } = require('@iobroker/testing');
const { expect } = require('chai');

const PORT = 18183;
const TESTS_TIMEOUT = 10000;
process.env.NO_PROXY = '127.0.0.1';

async function createVariables(harness, setupBoolean, setupString, setupNumber) {
    if (setupString !== undefined && setupString !== null) {
        await harness.objects.setObjectAsync('javascript.0.test-string1', {
            common: {
                name: 'test',
                type: 'string',
                role: 'value',
                def: '',
            },
            native: {},
            type: 'state',
        });
        await harness.states.setStateAsync('javascript.0.test-string1', setupString);
    }

    if (setupNumber !== undefined && setupNumber !== null) {
        await harness.objects.setObjectAsync('javascript.0.test-number', {
            common: {
                name: 'test',
                type: 'number',
                role: 'value',
                min: 0,
                max: 100,
                def: 0,
            },
            native: {},
            type: 'state',
        });
        await harness.states.setStateAsync('javascript.0.test-number', setupNumber);
    }

    if (setupBoolean !== undefined && setupBoolean !== null) {
        await harness.objects.setObjectAsync('javascript.0.test-boolean', {
            common: {
                name: 'test',
                type: 'boolean',
                role: 'value',
                def: false,
            },
            native: {},
            type: 'state',
        });
        await harness.states.setStateAsync('javascript.0.test-boolean', setupBoolean);
    }
}

// Run tests
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    loglevel: 'info',
    controllerVersion: process.env.CONTROLLER_VERSION || undefined,

    defineAdditionalTests({ suite }) {
        suite('Test REST API', getHarness => {
            let harness;
            before(async function () {
                // The adapter start can take a bit
                this.timeout(TESTS_TIMEOUT);

                harness = getHarness();

                await harness.changeAdapterConfig(harness.adapterName, {
                    native: {
                        bind: '127.0.0.1',
                        port: PORT,
                        reversePath: '/proxy/',
                    },
                });
                // Start the adapter and wait until it has started
                await harness.startAdapterAndWait(true);
                await createVariables(harness, true);
            });

            it('Test REST API: reverse proxy path - must be used by Swagger UI only', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/api-docs/swagger.json`);
                expect(response.data.basePath).to.equal('/proxy/v1');

                const redirect = await axios.get(`http://127.0.0.1:${PORT}/`, {
                    maxRedirects: 0,
                    validateStatus: status => status === 302,
                });
                expect(redirect.headers.location).to.equal('/proxy/api-doc/');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: get - must return state', async () => {
                // write state, so it has "from" attribute
                await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean?value=true`,
                );

                const response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean`,
                );
                const obj = response.data;
                console.log(`get/system.adapter.${harness.adapterName}.0.alive => ${JSON.stringify(response.data)}`);
                //
                // {
                //   "val": true,
                //   "ack": true,
                //   "ts": 1649867694364,
                //   "q": 0,
                //   "from": "system.adapter.${harness.adapterName}.0",
                //   "lc": 1649867136490
                // }

                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.false;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal(`system.adapter.${harness.adapterName}.0`);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: get - must return state with info', async () => {
                const response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean?withInfo=true`,
                );
                const obj = response.data;
                // console.log(`[GET] /v1/state/system.adapter.${harness.adapterName}.0.alive?withInfo=true => ${JSON.stringify(response.data)}`);
                //
                // {
                //   "val": true,
                //   "ack": true,
                //   "ts": 1649867136399,
                //   "q": 0,
                //   "from": "system.adapter.${harness.adapterName}.0",
                //   "lc": 1649867136490,
                //   "id": "system.adapter.${harness.adapterName}.0.alive",
                //   "type": "state",
                //   "common": {
                //     "name": "${harness.adapterName}.0 alive",
                //     "type": "boolean",
                //     "read": true,
                //     "write": true,
                //     "role": "indicator.state"
                //   },
                //   "native": {},
                //   "acl": {
                //     "object": 1636,
                //     "state": 1636,
                //     "owner": "system.user.admin",
                //     "ownerGroup": "system.group.administrator"
                //   },
                //   "user": "system.user.admin"
                // }

                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.false;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal(`system.adapter.${harness.adapterName}.0`);
                expect(obj.type).to.equal('state');
                expect(obj.id).to.equal(`javascript.0.test-boolean`);
                expect(obj.common).to.be.ok;
                expect(obj.native).to.be.ok;
                expect(obj.common.name).to.equal('test');
                expect(obj.common.role).to.equal('value');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: set - must set state', async () => {
                await createVariables(harness, null, '');

                let response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1?value=bla`);
                const obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-string1?value=bla => ' + JSON.stringify(response.data));
                //
                // {
                //   "id": "javascript.0.test-string1",
                //   "val": 10
                // }

                expect(obj).to.be.ok;
                expect(obj.val).to.equal('bla');
                expect(obj.id).to.equal('javascript.0.test-string1');
                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1/plain`, {
                    responseType: 'arraybuffer',
                    responseEncoding: 'binary',
                });
                let body = response.data.toString('utf8');
                // console.log('[GET] /v1/state/javascript.0.test-string1/plain => ' + body);
                expect(body).equal('"bla"');

                response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1/plain?extraPlain=true`,
                    {
                        responseType: 'arraybuffer',
                        responseEncoding: 'binary',
                    },
                );
                body = response.data.toString('utf8');
                // console.log('[GET] /v1/state/javascript.0.test-string1/plain => ' + body);
                expect(body).equal('bla');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1`);
                // console.log('get/javascript.0.test-string1 => ' + JSON.stringify(response.data));
                expect(response.data.val).equal('bla');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: getPlainValue - must return plain value', async () => {
                const response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean/plain`,
                    {
                        responseType: 'arraybuffer',
                        responseEncoding: 'binary',
                    },
                );
                const body = response.data.toString('utf8');
                // console.log(`[GET] /v1/state/system.adapter.${harness.adapterName}.0.alive/plain => ${body} type is "${typeof body}"`);
                expect(body).equal('true');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: set - must set string value with POST', async () => {
                await createVariables(harness, null, '');

                let response = await axios.patch(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1`, {
                    val: '60',
                    ack: true,
                });
                // console.log('[PATCH] /v1/state/javascript.0.test-string1 => ' + JSON.stringify(response.data));
                const obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.equal('60');
                expect(obj.ack).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-string1');

                await new Promise(resolve => setTimeout(() => resolve(), 2000));

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1`);
                // console.log('[GET] /v1/state/javascript.0.test-string1 => ' + JSON.stringify(response.data));
                expect(response.data.val).equal('60');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: set - must set encoded string value', async () => {
                await createVariables(harness, null, '');

                let response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1?value=bla%26fasel%2efoo%3Dhummer+hey`,
                );
                const obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-string1?value=bla%26fasel%2efoo%3Dhummer+hey => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).equal('bla&fasel.foo=hummer hey');
                expect(obj.id).to.equal('javascript.0.test-string1');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1/plain`);
                // console.log('[GET] /v1/state/javascript.0.test-string1/plain => ' + response.data);
                expect(response.data).equal('bla&fasel.foo=hummer hey');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-string1`);
                // console.log('[GET] /v1/state/javascript.0.test-string1 => ' + JSON.stringify(response.data));
                expect(response.data.val).equal('bla&fasel.foo=hummer hey');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: set - must set boolean value', async () => {
                await createVariables(harness, false);

                let response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean?value=true`,
                );
                const obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-boolean?value=true => ' + JSON.stringify(response.data));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-boolean');
                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean/plain`, {
                    responseType: 'arraybuffer',
                    responseEncoding: 'binary',
                });
                const body = response.data.toString('utf8');
                // console.log(`[GET] http://127.0.0.1:${PORT}/javascript.0.test-boolean => ` + body);
                expect(body).equal('true');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: toggle - must toggle boolean value to false', async () => {
                await createVariables(harness, true);

                let response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean/toggle`);
                const obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-boolean/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.id).to.equal('javascript.0.test-boolean');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean`);
                // console.log('[GET] /v1/state/javascript.0.test-boolean => ' + JSON.stringify(response.data));
                expect(response.data.val).equal(false);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: toggle - must toggle boolean value to true', async () => {
                await createVariables(harness, false);

                let response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean/toggle`);
                const obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-boolean/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-boolean');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-boolean`);
                // console.log('[GET] /v1/state/javascript.0.test-boolean => ' + JSON.stringify(response.data));
                expect(response.data.val).equal(true);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: toggle - must toggle number value to 100', async () => {
                await createVariables(harness, null, null, 0);

                let response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-number/toggle`);
                let obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-number/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(100);
                expect(obj.id).to.equal('javascript.0.test-number');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-number`);
                // console.log('[GET] /v1/state/javascript.0.test-number => ' + JSON.stringify(response.data));
                expect(response.data.val).equal(100);

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-number?value=49`);
                // console.log('[GET] /v1/state/javascript.0.test-number?value=49 => ' + JSON.stringify(response.data));

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-number/toggle`);
                obj = response.data;
                // console.log('[GET] /v1/state/javascript.0.test-number/toggle => ' + JSON.stringify(response.data));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(51);
                expect(obj.id).to.equal('javascript.0.test-number');

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test-number`);
                // console.log('[GET] /v1/state/javascript.0.test-number => ' + JSON.stringify(response.data));
                expect(response.data.val).equal(51);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: objects - must return objects', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/objects?filter=system.adapter.*`);
                const obj = response.data;
                // console.log('[GET] /v1/objects?filter=system.adapter.* => ' + JSON.stringify(obj));
                expect(obj[`system.adapter.${harness.adapterName}.0.alive`]._id).to.be.ok;
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: objects - must return objects', async () => {
                const response = await axios.get(
                    `http://127.0.0.1:${PORT}/v1/objects?filter=system.adapter.*&type=instance`,
                );
                const obj = response.data;
                // console.log('[GET] /v1/objects?filter=system.adapter.*&type=instance => ' + JSON.stringify(obj));
                expect(obj[`system.adapter.${harness.adapterName}.0`]._id).to.be.ok;
                expect(obj[`system.adapter.${harness.adapterName}.0.alive`]).to.be.not.ok;
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: states - must return states', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/states?filter=system.adapter.*`);
                const states = response.data;
                // console.log('[GET] /v1/states?filter=system.adapter.* => ' + JSON.stringify(states));
                expect(states[`system.adapter.${harness.adapterName}.0`]).to.be.not.ok;
                expect(states[`system.adapter.${harness.adapterName}.0.uptime`].val).to.be.least(0);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: enum - must return enum itself and sub-enums', async () => {
                await harness.objects.setObjectAsync('enum.functions.testShutters', {
                    common: { name: 'Shutters', members: ['javascript.0.test-number'] },
                    native: {},
                    type: 'enum',
                });
                await harness.objects.setObjectAsync('enum.functions.testShutters.boolean', {
                    common: { name: 'Boolean', members: ['javascript.0.test-boolean'] },
                    native: {},
                    type: 'enum',
                });

                let response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/functions.testShutters.boolean`);
                expect(response.data).to.deep.equal([
                    {
                        _id: 'enum.functions.testShutters.boolean',
                        common: { name: 'Boolean', members: ['javascript.0.test-boolean'] },
                    },
                ]);

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/functions.testShutters`);
                expect(response.data.map(e => e._id)).to.deep.equal([
                    'enum.functions.testShutters',
                    'enum.functions.testShutters.boolean',
                ]);

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/functions`);
                expect(response.data.find(e => e._id === 'enum.functions')).to.be.not.ok;
                expect(response.data.find(e => e._id === 'enum.functions.testShutters.boolean')).to.be.ok;

                response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/functions.notExisting`, {
                    validateStatus: () => true,
                });
                expect(response.status).equal(404);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: enum - must not mix up enums with the same beginning', async () => {
                await harness.objects.setObjectAsync('enum.functions.testLight', {
                    common: { name: 'Light', members: [] },
                    native: {},
                    type: 'enum',
                });
                await harness.objects.setObjectAsync('enum.functions.testLighting', {
                    common: { name: 'Lighting', members: [] },
                    native: {},
                    type: 'enum',
                });

                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/functions.testLight`);
                expect(response.data.map(e => e._id)).to.deep.equal(['enum.functions.testLight']);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: enum - must accept ID with "enum." prefix', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/enum.functions.testShutters.boolean`);
                expect(response.data.map(e => e._id)).to.deep.equal(['enum.functions.testShutters.boolean']);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: enum - must answer 404 for unknown category', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum/notExistingCategory`, {
                    validateStatus: () => true,
                });
                expect(response.status).equal(404);
                expect(response.data).to.deep.equal({ error: 'Enum not found', enumId: 'enum.notExistingCategory' });
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: enum - main enums must still be returned', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/v1/enum`);
                expect(response.status).equal(200);
                expect(response.data['enum.functions']).to.be.ok;
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must set many states as array', async () => {
                await createVariables(harness, false, 'a', 1);

                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { id: 'javascript.0.test-string1', val: 'bulk' },
                    { id: 'javascript.0.test-number', val: '42', ack: true },
                    { id: 'javascript.0.test-boolean', val: 'true' },
                ]);
                expect(response.data).to.deep.equal([
                    { id: 'javascript.0.test-string1', val: 'bulk', ack: false },
                    { id: 'javascript.0.test-number', val: 42, ack: true },
                    { id: 'javascript.0.test-boolean', val: true, ack: false },
                ]);

                let state = await harness.states.getStateAsync('javascript.0.test-string1');
                expect(state.val).equal('bulk');
                state = await harness.states.getStateAsync('javascript.0.test-number');
                expect(state.val).equal(42);
                expect(state.ack).to.be.true;
                state = await harness.states.getStateAsync('javascript.0.test-boolean');
                expect(state.val).to.be.true;
                expect(state.ack).to.be.false;
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must set many states as object', async () => {
                await createVariables(harness, true, 'a', 1);

                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, {
                    'javascript.0.test-string1': 'obj',
                    'javascript.0.test-number': { val: 7, ack: true },
                });
                expect(response.data).to.deep.equal([
                    { id: 'javascript.0.test-string1', val: 'obj', ack: false },
                    { id: 'javascript.0.test-number', val: 7, ack: true },
                ]);
                const state = await harness.states.getStateAsync('javascript.0.test-number');
                expect(state.val).equal(7);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must report errors per entry', async () => {
                await createVariables(harness, true, 'a', 1);

                let response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { val: 1 },
                    { id: 'javascript.0.test-number' },
                    { id: 'javascript.0.test-string1', val: 'after-error' },
                ]);
                expect(response.data.length).equal(3);
                expect(response.data[0]).to.deep.equal({ index: 0, error: 'id missing' });
                expect(response.data[1]).to.deep.equal({ id: 'javascript.0.test-number', index: 1, error: 'val missing' });
                expect(response.data[2]).to.deep.equal({ id: 'javascript.0.test-string1', val: 'after-error', ack: false });

                response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states?stopOnError=true`, [
                    { id: 'javascript.0.test-string1', val: 'first' },
                    { id: 'javascript.0.test-number' },
                    { id: 'javascript.0.test-string1', val: 'never' },
                ]);
                expect(response.data.length).equal(2);
                expect(response.data[1].error).equal('val missing');
                const state = await harness.states.getStateAsync('javascript.0.test-string1');
                expect(state.val).equal('first');

                response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [], {
                    validateStatus: () => true,
                });
                expect(response.status).equal(422);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must write the same state in the given order', async () => {
                await createVariables(harness, null, null, 1);

                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { id: 'javascript.0.test-number', val: 10 },
                    { id: 'javascript.0.test-number', val: 20 },
                    { id: 'javascript.0.test-number', val: 30 },
                ]);
                expect(response.data.map(r => r.val)).to.deep.equal([10, 20, 30]);
                const state = await harness.states.getStateAsync('javascript.0.test-number');
                expect(state.val).equal(30);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must fire change events in the given order', async () => {
                await createVariables(harness, false, 'a', 1);
                const ids = ['javascript.0.test-string1', 'javascript.0.test-number', 'javascript.0.test-boolean'];

                const events = [];
                const onStateChange = (id, state) => ids.includes(id) && events.push(`${id}=${state?.val}`);
                // the harness is subscribed to all states
                harness.on('stateChange', onStateChange);

                try {
                    await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                        { id: ids[0], val: 'event' },
                        { id: ids[1], val: 99 },
                        { id: ids[2], val: true },
                    ]);
                    // wait till all events are delivered
                    for (let i = 0; i < 50 && events.length < 3; i++) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                } finally {
                    harness.removeListener('stateChange', onStateChange);
                }

                expect(events).to.deep.equal([`${ids[0]}=event`, `${ids[1]}=99`, `${ids[2]}=true`]);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must store additional state attributes', async () => {
                await createVariables(harness, null, null, 1);

                await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { id: 'javascript.0.test-number', val: 5, ack: true, q: 0x40, c: 'NFC reader' },
                ]);
                const state = await harness.states.getStateAsync('javascript.0.test-number');
                expect(state.val).equal(5);
                expect(state.ack).to.be.true;
                expect(state.q).equal(0x40);
                expect(state.c).equal('NFC reader');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must find state by name', async () => {
                await harness.objects.setObjectAsync('javascript.0.test-bulk-name', {
                    common: { name: 'UniqueBulkTestName', type: 'number', role: 'value', def: 0 },
                    native: {},
                    type: 'state',
                });

                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { id: 'UniqueBulkTestName', val: '8' },
                ]);
                expect(response.data).to.deep.equal([{ id: 'javascript.0.test-bulk-name', val: 8, ack: false }]);
                const state = await harness.states.getStateAsync('javascript.0.test-bulk-name');
                expect(state.val).equal(8);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must report unknown IDs and write the other states', async () => {
                await createVariables(harness, null, 'a');

                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, [
                    { id: 'javascript.0.not-existing-bulk', val: 1 },
                    { id: 'javascript.0.test-string1', val: 'written' },
                ]);
                expect(response.status).equal(200);
                expect(response.data).to.deep.equal([
                    { id: 'javascript.0.not-existing-bulk', index: 0, error: 'ID not found' },
                    { id: 'javascript.0.test-string1', val: 'written', ack: false },
                ]);
                expect(await harness.states.getStateAsync('javascript.0.not-existing-bulk')).to.be.not.ok;
                const state = await harness.states.getStateAsync('javascript.0.test-string1');
                expect(state.val).equal('written');
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API: bulk - must reject more than 1000 states', async () => {
                await createVariables(harness, null, null, 1);

                const body = Array.from({ length: 1001 }, (_, i) => ({ id: 'javascript.0.test-number', val: i + 2 }));
                const response = await axios.patch(`http://127.0.0.1:${PORT}/v1/states`, body, {
                    validateStatus: () => true,
                });
                expect(response.status).equal(422);
                expect(response.data.count).equal(1001);
                const state = await harness.states.getStateAsync('javascript.0.test-number');
                expect(state.val).equal(1);
            }).timeout(TESTS_TIMEOUT);
        });
    },
});
