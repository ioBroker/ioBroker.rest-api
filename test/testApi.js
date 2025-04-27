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
                    },
                });
                // Start the adapter and wait until it has started
                await harness.startAdapterAndWait(true);
                await createVariables(harness, true);
            });

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
        });
    },
});
