const path = require('node:path');
const axios = require('axios');
const { tests } = require('@iobroker/testing');
const { expect } = require('chai');

const PORT = 18186;
const TESTS_TIMEOUT = 10000;

process.env.NO_PROXY = '127.0.0.1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Run tests
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    loglevel: 'info',
    controllerVersion: process.env.CONTROLLER_VERSION || undefined,

    defineAdditionalTests({ suite }) {
        suite('Test REST API SSL', getHarness => {
            let harness;
            before(async function () {
                // The adapter start can take a bit
                this.timeout(TESTS_TIMEOUT);

                harness = getHarness();

                await harness.changeAdapterConfig(harness.adapterName, {
                    native: {
                        bind: '127.0.0.1',
                        port: PORT,
                        auth: true,
                        secure: true,
                        certPublic: 'defaultPublic',
                        certPrivate: 'defaultPrivate',
                    },
                });

                await harness.objects.setObjectAsync('javascript.0.test-big', {
                    type: 'state',
                    common: {
                        name: 'test-big',
                        type: 'string',
                        role: 'json',
                        read: true,
                        write: true,
                    },
                    native: {},
                });

                // Start the adapter and wait until it has started
                await harness.startAdapterAndWait(true);
            });

            it('Test REST API SSL: get - must return value', async () => {
                const response = await axios.get(
                    `https://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?user=admin&pass=iobroker`,
                );
                const obj = response.data;
                console.log(
                    `[GET] /v1/state/system.adapter.${harness.adapterName}.0.alive?user=admin&pass=iobroker => ${JSON.stringify(obj)}`,
                );
                //{
                //    "val" : true,
                //    "ack" : true,
                //    "ts" : 1455009717,
                //    "q" : 0,
                //    "from" : "system.adapter.${harness.adapterName}.0",
                //    "lc" : 1455009717,
                //    "expire" : 30000,
                //    "_id" : "system.adapter.${harness.adapterName}.0.alive",
                //    "type" : "state",
                //    "common" : {
                //      "name" : "${harness.adapterName}.0.alive",
                //        "type" : "boolean",
                //        "role" : "indicator.state"
                //       },
                //    "native" : {}
                //
                //}

                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.true;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal(`system.adapter.${harness.adapterName}.0`);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API SSL: get - must return value with auth in header', async () => {
                const response = await axios.get(
                    `https://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive`,
                    {
                        headers: {
                            Authorization: 'Basic ' + Buffer.from('admin:iobroker').toString('base64'),
                        },
                    },
                );
                const obj = response.data;
                console.log(
                    `[GET/Authorization] /v1/state/system.adapter.${harness.adapterName}.0.alive => ${JSON.stringify(obj)}`,
                );
                expect(response.status).to.be.equal(200);
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.true;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal(`system.adapter.${harness.adapterName}.0`);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API SSL: get with no credentials', async () => {
                const response = await axios.get(
                    `https://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive`,
                    { validateStatus: () => true },
                );
                console.log(
                    `[GET] /v1/state/system.adapter.${harness.adapterName}.0.alive => ${JSON.stringify(response.data)}`,
                );
                expect(response.status).to.be.equal(401);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API SSL: get with wrong credentials', async () => {
                const response = await axios.get(
                    `https://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?user=admin&pass=io`,
                    { validateStatus: () => true },
                );
                console.log(
                    `[GET] /v1/state/system.adapter.${harness.adapterName}.0.alive?user=admin&pass=io => ${JSON.stringify(response.data)}`,
                );
                expect(response.status).to.be.equal(401);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API SSL: get - get with wrong credentials in header', async () => {
                const response = await axios.get(
                    `https://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive`,
                    {
                        headers: {
                            Authorization: `Basic ${Buffer.from('admin:io').toString('base64')}`,
                        },
                        validateStatus: () => true,
                    },
                );
                console.log(
                    `[GET/Authorization] /v1/state/system.adapter.${harness.adapterName}.0.alive => ${JSON.stringify(response.data)}`,
                );
                expect(response.status).to.be.equal(401);
            }).timeout(TESTS_TIMEOUT);

            it('Test REST API SSL: command setState - must accept body larger than 100kB', async () => {
                // 1 MB payload: bigger than the default body-parser limit of 100kB (#227)
                const val = 'x'.repeat(1024 * 1024);
                const response = await axios.post(
                    `https://127.0.0.1:${PORT}/v1/command/setState`,
                    { id: 'javascript.0.test-big', state: { val, ack: false } },
                    {
                        headers: {
                            Authorization: `Basic ${Buffer.from('admin:iobroker').toString('base64')}`,
                        },
                        validateStatus: () => true,
                    },
                );
                console.log(`[POST] /v1/command/setState (1 MB) => ${response.status}`);
                expect(response.status).to.be.equal(200);

                const state = await harness.states.getStateAsync('javascript.0.test-big');
                expect(state.val).to.be.equal(val);
            }).timeout(TESTS_TIMEOUT);
        });
    },
});
