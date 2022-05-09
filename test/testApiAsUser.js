const path = require('path');
const { tests } = require('@iobroker/testing');
const axios = require('axios');
const { expect } = require('chai');

const PORT = 18185;
const TESTS_TIMEOUT = 10000;
process.env.NO_PROXY = '127.0.0.1';

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
    await harness.objects.setObjectAsync('system.group.writer', {
        common: {
            name: 'Writer',
            desc: '',
            members: [
                'system.user.myuser'
            ],
            acl: {
                object: {
                    list: false,
                    read: false,
                    write: false,
                    delete: false
                },
                state: {
                    list: false,
                    read: true,
                    write: true,
                    create: false,
                    delete: false
                },
                users: {
                    write: false,
                    create: false,
                    delete: false
                },
                other: {
                    execute: false,
                    http: false,
                    sendto: false
                },
                file: {
                    list: false,
                    read: false,
                    write: false,
                    create: false,
                    delete: false
                }
            }
        },
        native: {},
        acl: {
            object: 1638,
            owner: 'system.user.admin',
            ownerGroup: 'system.group.administrator'
        },
        _id: 'system.group.writer',
        type: 'group'
    });

    await harness.objects.setObjectAsync('system.user.myuser', {
        type: 'user',
        common: {
            name: 'myuser',
            enabled: true,
            groups: [],
            password: 'pbkdf2$10000$ab4104d8bb68390ee7e6c9397588e768de6c025f0c732c18806f3d1270c83f83fa86a7bf62583770e5f8d0b405fbb3ad32214ef3584f5f9332478f2506414443a910bf15863b36ebfcaa7cbb19253ae32cd3ca390dab87b29cd31e11be7fa4ea3a01dad625d9de44e412680e1a694227698788d71f1e089e5831dc1bbacfa794b45e1c995214bf71ee4160d98b4305fa4c3e36ee5f8da19b3708f68e7d2e8197375c0f763d90e31143eb04760cc2148c8f54937b9385c95db1742595634ed004fa567655dfe1d9b9fa698074a9fb70c05a252b2d9cf7ca1c9b009f2cd70d6972ccf0ee281d777d66a0346c6c6525436dd7fe3578b28dca2c7adbfde0ecd45148$31c3248ba4dc9600a024b4e0e7c3e585'
        },
        _id: 'system.user.myuser',
        native: {},
        acl: {
            object: 1638
        }
    });

    await harness.changeAdapterConfig(harness.adapterName, {
        native: {
            bind: '127.0.0.1',
            port: PORT,
            defaultUser: 'myuser',
        }
    });

    await harness.objects.setObjectAsync('javascript.0.test', {
        common: {
            name: 'test',
            type: 'number',
            role: 'level',
            min: -100,
            max: 100,
            def: 1
        },
        native: {},
        type: 'state',
        acl: {
            object: 1638,
            owner: 'system.user.myuser',
            ownerGroup: 'system.group.administrator',
            state: 1638
        }
    });
    await harness.states.setStateAsync('javascript.0.test');

    // Start the adapter and wait until it has started
    await harness.startAdapterAndWait(true);
}

// Run tests
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    loglevel: 'info',

    defineAdditionalTests({ suite }) {
        suite('Test RESTful API as User', (harness) => {
            before(async function () {
                // The adapter start can take a bit
                this.timeout(TESTS_TIMEOUT);
                await setupTests(harness);
            });

            it.skip('Test RESTful API as User: get - must return value', async () => {
                const response = await axios.get(`http://127.0.0.1:${PORT}/state/system.adapter.${harness.adapterName}.0.alive/plain?withInfo=true`);
                console.log(`get/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                const obj = response.data;
                //{
                //    "val" : true,
                //    "ack" : true,
                //    "ts" : 1455009717,
                //    "q" : 0,
                //    "from" : `system.adapter.${harness.adapterName}.0`,
                //    "lc" : 1455009717,
                //    "expire" : 30000,
                //    "_id" : `system.adapter.${harness.adapterName}.0.alive`,
                //    "type" : "state",
                //    "common" : {
                //      "name" : `${harness.adapterName}.0.alive`,
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
                expect(obj.type).to.equal('state');
                expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);
                expect(obj.common).to.be.ok;
                expect(obj.native).to.be.ok;
                expect(obj.common.name).to.equal(`${harness.adapterName}.0.alive`);
                expect(obj.common.role).to.equal('indicator.state');
            })
                .timeout(TESTS_TIMEOUT);
            /*
                        it('Test RESTful API as User: getPlainValue - must return plain value', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            const response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('true');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: getPlainValue 4 Test-Endpoint - must return plain value', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            const response = await axios.get('http://127.0.0.1:${PORT}/getPlainValue/javascript.0.test');
                            console.log('getPlainValue/javascript.0.test => ' + JSON.stringify(response.data));
                            expect(response.data).equal('1');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: set 4 Test-Endpoint  - must set value', async () => {
                             const harness = getHarness();
                            await setupTests(harness);
            
                           let response = await axios.get('http://127.0.0.1:${PORT}/set/javascript.0.test?val=2');
                            console.log('set/javascript.0.test?val=false => ' + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            const obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.equal(2);
                            expect(obj.id).to.equal('javascript.0.test');
                            response = await axios.get('http://127.0.0.1:${PORT}/getPlainValue/javascript.0.test');
                            console.log('getPlainValue/javascript.0.test => ' + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('2');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: set - must set value', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get(`http://127.0.0.1:${PORT}/set/system.adapter.${harness.adapterName}.0.alive?val=false`);
                            console.log(`set/system.adapter.${harness.adapterName}.0.alive?val=false => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            const obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.false;
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('false');
                            done();
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: set - must set val', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get(`http://127.0.0.1:${PORT}/set/system.adapter.${harness.adapterName}.0.alive?val=true`);
                            console.log(`set/system.adapter.${harness.adapterName}.0.alive?val=true => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            const obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.true;
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('true');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: toggle - must toggle boolean value to false', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get(`http://127.0.0.1:${PORT}/toggle/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`toggle/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            const obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.false;
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('false');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: toggle - must toggle boolean value to true', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get(`http://127.0.0.1:${PORT}/toggle/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`toggle/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            const obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.true;
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.0.alive`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('true');
                            done();
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: toggle - must toggle number value to 100', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get(`http://127.0.0.1:${PORT}/toggle/system.adapter.${harness.adapterName}.upload`);
                            console.log(`toggle/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            let obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.equal(100);
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.upload`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.upload`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('100');
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/set/system.adapter.${harness.adapterName}.upload?val=49`);
                            console.log(`set/system.adapter.${harness.adapterName}.upload?val=49 => ` + JSON.stringify(response.data));
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/toggle/system.adapter.${harness.adapterName}.upload`);
                            console.log(`toggle/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj.val).to.be.equal(51);
                            expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.upload`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getPlainValue/system.adapter.${harness.adapterName}.upload`);
                            console.log(`getPlainValue/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));
                            expect(error).to.be.not.ok;
                            expect(body).equal('51');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: objects - must return objects', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            const response = await axios.get('http://127.0.0.1:${PORT}/objects?pattern=system.adapter.*');
                            console.log('objects?pattern=system.adapter.* => ' + JSON.stringify(response.data));
                            expect(body).to.be.equal('error: permissionError');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: objects - must return objects', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            const response = await axios.get('http://127.0.0.1:${PORT}/objects?pattern=system.adapter.*&type=instance');
                            console.log('objects?pattern=system.adapter.* => ' + JSON.stringify(response.data));
                            expect(body).to.be.equal('error: permissionError');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: states - must return states', async () => {
                            const response = await axios.get('http://127.0.0.1:${PORT}/states?pattern=system.adapter.*');
                            console.log('states?pattern=system.adapter.* => ' + JSON.stringify(response.data));
                            expect(body).to.be.equal('error: permissionError');
                        })
                            .timeout(TESTS_TIMEOUT);
            
                        it('Test RESTful API as User: setValueFromBody(POST) - must set one value', async () => {
                            const harness = getHarness();
                            await setupTests(harness);
            
                            let response = await axios.get({
                                uri: `http://127.0.0.1:${PORT}/setValueFromBody/system.adapter.${harness.adapterName}.upload`,
                                method: 'POST',
                                body: '55'
                            });
                            console.log(`setValueFromBody/?system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(body));
                            expect(error).to.be.not.ok;
            
                            let obj = response.data;
                            expect(obj).to.be.ok;
                            expect(obj[0].val).to.be.equal(55);
                            expect(obj[0].id).to.equal(`system.adapter.${harness.adapterName}.upload`);
            
                            response = await axios.get(`http://127.0.0.1:${PORT}/getBulk/system.adapter.${harness.adapterName}.upload`);
                            console.log(`getBulk/system.adapter.${harness.adapterName}.upload => ${JSON.stringify(response.data)}`);
                            expect(error).to.be.not.ok;
                            obj = response.data;
                            expect(obj[0].val).equal(55);
                        })
                            .timeout(TESTS_TIMEOUT);*/
        });
    }
});
