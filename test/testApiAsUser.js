const path = require('path');
const axios = require('axios');
const { tests } = require('@iobroker/testing');
const { expect } = require('chai');

const PORT = 18185;
const TESTS_TIMEOUT = 10000;
process.env.NO_PROXY = '127.0.0.1';

// Run tests
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    loglevel: 'info',

    defineAdditionalTests({suite}) {
        suite('Test RESTful API as User', getHarness => {
            let harness;
            before(async function () {
                // The adapter start can take a bit
                this.timeout(TESTS_TIMEOUT);
                harness = getHarness();

                await harness.changeAdapterConfig(harness.adapterName, {
                    native: {
                        bind: '127.0.0.1',
                        port: PORT,
                        defaultUser: 'myuser',
                    }
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
                                read: true,
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
                        object: 1638, // 666
                        owner: 'system.user.admin',
                        ownerGroup: 'system.group.administrator'
                    },
                    _id: 'system.group.writer',
                    type: 'group'
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
                        object: 1638, // 666
                        owner: 'system.user.myuser',
                        ownerGroup: 'system.group.administrator',
                        state: 1638
                    }
                });

                await harness.states.setStateAsync('javascript.0.test', 1);

                // Start the adapter and wait until it has started
                await harness.startAdapterAndWait(true);
            });

            it('Test RESTful API as User: get - must return value', async () => {
                let response;
                response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?withInfo=true`);

                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
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
                expect(obj.common.name).to.equal(`${harness.adapterName}.0 alive`);
                expect(obj.common.role).to.equal('indicator.state');
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: must return plain value', async () => {
                const response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                expect(response.data).equal(true);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: Test-Endpoint - must return plain value', async () => {
                const response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test/plain`);
                console.log('v1/state/javascript.0.test => ' + JSON.stringify(response.data));
                expect(response.data).equal(1);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: set 4 Test-Endpoint  - must set value', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test?value=2`);
                console.log('set/javascript.0.test?value=false => ' + JSON.stringify(response.data));

                const obj = response.data;

                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(2);
                expect(obj.id).to.equal('javascript.0.test');

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test/plain`);
                console.log('v1/state/javascript.0.test => ' + JSON.stringify(response.data));

                expect(response.data).equal(2);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: set - must set value', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?value=false`);
                console.log(`set/system.adapter.${harness.adapterName}.0.alive?value=false => ` + JSON.stringify(response.data));
                const obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));
                expect(response.data).equal(false);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: set - must set val', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?value=true`);
                console.log(`set/system.adapter.${harness.adapterName}.0.alive?value=true => ` + JSON.stringify(response.data));

                const obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                expect(response.data).equal(true);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: toggle - must toggle boolean value to false', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?toggle`);
                console.log(`toggle/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                const obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                expect(response.data).equal(false);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: toggle - must toggle boolean value to true', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive?toggle`);
                console.log(`toggle/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                const obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal(`system.adapter.${harness.adapterName}.0.alive`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/system.adapter.${harness.adapterName}.0.alive/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.0.alive => ` + JSON.stringify(response.data));

                expect(response.data).equal(true);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: toggle - must toggle number value to 100', async () => {
                let response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test/toggle`);
                console.log(`toggle/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));

                let obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(-2);
                expect(obj.id).to.equal(`javascript.0.test`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));

                expect(response.data).equal(-2);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test?value=49`);
                console.log(`set/system.adapter.${harness.adapterName}.upload?value=49 => ` + JSON.stringify(response.data));

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test?toggle`);
                console.log(`toggle/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));

                obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(-49);
                expect(obj.id).to.equal(`javascript.0.test`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test/plain`);
                console.log(`v1/state/system.adapter.${harness.adapterName}.upload => ` + JSON.stringify(response.data));

                expect(response.data).equal(-49);
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: objects - must return objects', async () => {
                const response = await axios(`http://127.0.0.1:${PORT}/v1/objects?filter=system.adapter.*`, {validateStatus: () => true});
                console.log(`objects?pattern=system.adapter.* => ${JSON.stringify(response.data)}`);
                expect(response.data.error).to.be.equal('permissionError');
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: objects - must return objects', async () => {
                const response = await axios(`http://127.0.0.1:${PORT}/v1/objects?filter=system.adapter.*&type=instance`, {validateStatus: () => true});
                console.log(`objects?pattern=system.adapter.* => ${JSON.stringify(response.data)}`);
                expect(response.data.error).to.be.equal('permissionError');
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: states - must return states', async () => {
                const response = await axios(`http://127.0.0.1:${PORT}/v1/states?filter=system.adapter.*`, {validateStatus: () => true});
                console.log(`states?pattern=system.adapter.* => ${JSON.stringify(response.data)}`);
                expect(response.data.error).to.be.equal('permissionError');
            })
                .timeout(TESTS_TIMEOUT);

            it('Test RESTful API as User: setValueFromBody(PATCH) - must set one value', async () => {
                let response = await axios.patch(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test`, {
                    val: 55,
                    ack: true
                });
                console.log(`[PATCH] /v1/state/javascript.0.test => ${JSON.stringify(response.data)}`);

                let obj = response.data;
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(55);
                expect(obj.id).to.equal(`javascript.0.test`);

                response = await axios(`http://127.0.0.1:${PORT}/v1/state/javascript.0.test`);
                console.log(`[GET] /v1/state/javascript.0.test => ${JSON.stringify(response.data)}`);

                obj = response.data;
                expect(obj.val).equal(55);
            })
                .timeout(TESTS_TIMEOUT);
        });
    }
});