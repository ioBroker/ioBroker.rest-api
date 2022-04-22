const path = require('path');
const {tests} = require('@iobroker/testing');
const axios = require('axios');
const {expect} = require('chai');
const adapterName = require('../package.json').name.split('.').pop();

const PORT = 18186;

process.env.NO_PROXY = '127.0.0.1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
async function waitForState(harness, id, value) {
    const started = await harness.states.getState(id);
    if (!started.val) {
        await new Promise(resolve => harness.on('stateChange', (id, state) => {
            if (id.endsWith('info.connection') && state.val === value) {
                resolve();
            }
        }));
    }
}

async function setupTests(harness) {
    // Enable the adapter and set its loglevel to debug
    await harness.changeAdapterConfig(adapterName, {
        common: {
            enabled: true,
            loglevel: 'debug',
        },
        native: {
            bind: '127.0.0.1',
            port: PORT,
            auth: true,
            secure: true,
            certPublic: 'defaultPublic',
            certPrivate: 'defaultPrivate',
        }
    });

    // Start the adapter and wait until it has started
    await harness.startAdapterAndWait();

    await waitForState(harness, adapterName + '.0.info.connection', true);
}

// Run tests
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    loglevel: 'info',

    defineAdditionalTests(getHarness) {
        describe('Test REST API SSL', () => {
            it('Test REST API SSL: get - must return value', async () => {
                const harness = getHarness();
                await setupTests(harness);

                const response = await axios.get(`https://127.0.0.1:${PORT}/v1/state/system.adapter.${adapterName}.0.alive?user=admin&pass=iobroker`)
                const obj = response.data;
                console.log(`[GET] /v1/state/system.adapter.${adapterName}.0.alive?user=admin&pass=iobroker => ${JSON.stringify(obj)}`);
                //{
                //    "val" : true,
                //    "ack" : true,
                //    "ts" : 1455009717,
                //    "q" : 0,
                //    "from" : "system.adapter.${adapterName}.0",
                //    "lc" : 1455009717,
                //    "expire" : 30000,
                //    "_id" : "system.adapter.${adapterName}.0.alive",
                //    "type" : "state",
                //    "common" : {
                //      "name" : "${adapterName}.0.alive",
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
                expect(obj.from).to.equal(`system.adapter.${adapterName}.0`);
            })
                .timeout(3000);

            it('Test REST API SSL: get - must return value with auth in header', async () => {
                const harness = getHarness();
                await setupTests(harness);

                const response = await axios.get(`https://127.0.0.1:${PORT}/v1/state/system.adapter.${adapterName}.0.alive`, {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from('admin:iobroker').toString('base64')
                    }
                });
                const obj = response.data;
                console.log(`[GET/Authorization] /v1/state/system.adapter.${adapterName}.0.alive => ${JSON.stringify(obj)}`);
                expect(response.status).to.be.equal(200);
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.true;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal(`system.adapter.${adapterName}.0`);
            })
                .timeout(3000);

            it('Test REST API SSL: get with no credentials', async () => {
                const harness = getHarness();
                await setupTests(harness);

                const response = await axios.get(`https://127.0.0.1:${PORT}/v1/state/system.adapter.${adapterName}.0.alive`, {validateStatus: () => true})
                console.log(`[GET] /v1/state/system.adapter.${adapterName}.0.alive => ${JSON.stringify(response.data)}`);
                expect(response.status).to.be.equal(401);
            })
                .timeout(3000);

            it('Test REST API SSL: get with wrong credentials', async () => {
                const harness = getHarness();
                await setupTests(harness);

                const response = await axios.get(`https://127.0.0.1:${PORT}/v1/state/system.adapter.${adapterName}.0.alive?user=admin&pass=io`, {validateStatus: () => true})
                console.log(`[GET] /v1/state/system.adapter.${adapterName}.0.alive?user=admin&pass=io => ${JSON.stringify(response.data)}`);
                expect(response.status).to.be.equal(401);
            })
                .timeout(3000);

            it('Test REST API SSL: get - get with wrong credentials in header', async () => {
                const harness = getHarness();
                await setupTests(harness);

                const response = await axios.get(`https://127.0.0.1:${PORT}/v1/state/system.adapter.${adapterName}.0.alive`, {
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from('admin:io').toString('base64')
                    },
                    validateStatus: () => true
                })
                console.log(`[GET/Authorization] /v1/state/system.adapter.${adapterName}.0.alive => ${JSON.stringify(response.data)}`);
                expect(response.status).to.be.equal(401);
            })
                .timeout(3000);
        });
    },
});

