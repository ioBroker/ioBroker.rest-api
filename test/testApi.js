const expect = require('chai').expect;
const setup = require('./lib/setup');
const axios = require('axios');

let objects = null;
let states = null;

process.env.NO_PROXY = '127.0.0.1';

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log(`Try check #${counter}`);
    if (counter > 30) {
        cb && cb('Cannot check connection');
        return;
    }

    states.getState('system.adapter.swagger.0.alive', (err, state) => {
        err && console.error(err);
        if (state && state.val) {
            cb && cb();
        } else {
            setTimeout(() =>
                checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

describe('Test Swagger API', function () {
    before('Test Swagger API: Start js-controller', function (_done) {
        this.timeout(600000); // because of first install from npm
        setup.adapterStarted = false;

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled = true;
            config.common.loglevel = 'debug';
            config.native.port = 18183;
            await setup.setAdapterConfig(config.common, config.native);

            setup.startController((_objects, _states) => {
                objects = _objects;
                states = _states;
                // give some time to start server
                setTimeout(() => _done(), 2000);
            });
        });
    });

    it('Test adapter: Check if adapter started and create test datapoint', function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(async res => {
            res && console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            await objects.setObjectAsync('javascript.0.test-string', {
                common: {
                    name: 'test',
                    type: 'string',
                    role: 'value',
                    def: ''
                },
                native: {},
                type: 'state'
            });
            await states.setStateAsync('javascript.0.test-string', '');
            await objects.setObjectAsync('javascript.0.test-number', {
                common: {
                    name: 'test',
                    type: 'number',
                    role: 'value',
                    min: 0,
                    max: 100,
                    def: 0
                },
                native: {},
                type: 'state'
            });
            await states.setStateAsync('javascript.0.test-number', 0);
            await objects.setObjectAsync('javascript.0.test-boolean', {
                common: {
                    name: 'test',
                    type: 'boolean',
                    role: 'value',
                    def: false
                },
                native: {},
                type: 'state'
            });
            await states.setStateAsync('javascript.0.test-boolean', false);
            done();
        });
    });

    it('Test Swagger API: get - must return state', function (done) {
        this.timeout(2000);

        axios.get('http://127.0.0.1:18183/v1/state/system.adapter.swagger.0.alive')
            .then(response => {
                const obj = response.data;
                console.log('get/system.adapter.swagger.0.alive => ' + JSON.stringify(response.data));
                //
                // {
                //   "val": true,
                //   "ack": true,
                //   "ts": 1649867694364,
                //   "q": 0,
                //   "from": "system.adapter.swagger.0",
                //   "lc": 1649867136490
                // }

                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.ack).to.be.true;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal('system.adapter.swagger.0');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: get - must return state with info', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/system.adapter.swagger.0.alive?withInfo=true')
            .then(response => {
                const obj = response.data;
                console.log('[GET] /v1/state/system.adapter.swagger.0.alive?withInfo=true => ' + JSON.stringify(response.data));
                //
                // {
                //   "val": true,
                //   "ack": true,
                //   "ts": 1649867136399,
                //   "q": 0,
                //   "from": "system.adapter.swagger.0",
                //   "lc": 1649867136490,
                //   "id": "system.adapter.swagger.0.alive",
                //   "type": "state",
                //   "common": {
                //     "name": "swagger.0 alive",
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
                expect(obj.ack).to.be.true;
                expect(obj.ts).to.be.ok;
                expect(obj.from).to.equal('system.adapter.swagger.0');
                expect(obj.type).to.equal('state');
                expect(obj.id).to.equal("system.adapter.swagger.0.alive");
                expect(obj.common).to.be.ok;
                expect(obj.native).to.be.ok;
                expect(obj.common.name).to.equal("swagger.0 alive");
                expect(obj.common.role).to.equal("indicator.state");
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: set - must set state', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string?value=bla')
            .then(async response => {
                const obj = response.data;
                console.log('[GET] /v1/state/javascript.0.test-string?value=bla => ' + JSON.stringify(response.data));
                //
                // {
                //   "id": "javascript.0.test-string",
                //   "val": 10
                // }

                expect(obj).to.be.ok;
                expect(obj.val).to.equal('bla');
                expect(obj.id).to.equal('javascript.0.test-string');
                let _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain', {
                    responseType: 'arraybuffer',
                    responseEncoding: 'binary'
                });
                let body =_response.data.toString('utf8');
                console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + body);
                expect(body).equal('"bla"');

                _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain?extraPlain=true', {
                    responseType: 'arraybuffer',
                    responseEncoding: 'binary'
                });
                body =_response.data.toString('utf8');
                console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + body);
                expect(body).equal('bla');

                _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string');
                console.log('get/javascript.0.test-string => ' + JSON.stringify(_response.data));
                expect(_response.data.val).equal('bla');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: getPlainValue - must return plain value', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/system.adapter.swagger.0.alive/plain', {
                responseType: 'arraybuffer',
                responseEncoding: 'binary'
            })
            .then(response => {
                const body = response.data.toString('utf8');
                console.log(`[GET] /v1/state/system.adapter.swagger.0.alive/plain => ${body} type is "${typeof body}"`);
                expect(body).equal('true');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: set - must set value', function (done) {
        this.timeout(2000);
        axios.patch('http://127.0.0.1:18183/v1/state/javascript.0.test-string', {val: '60', ack: true})
            .then(response => {
                console.log('[PATCH] /v1/state/javascript.0.test-string => ' + JSON.stringify(response.data));
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.equal('60');
                expect(obj.ack).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-string');
                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string')
                    .then(response => {
                        console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + response.data);
                        expect(response.data.val).equal('60');
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: set - must set encoded string value', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string?value=bla%26fasel%2efoo%3Dhummer+hey')
            .then(async response => {
                const obj = response.data
                console.log('[GET] /v1/state/javascript.0.test-string?value=bla%26fasel%2efoo%3Dhummer+hey => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).equal('bla&fasel.foo=hummer hey');
                expect(obj.id).to.equal('javascript.0.test-string');
                let _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain');
                console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + _response.data);
                expect(_response.data).equal('bla&fasel.foo=hummer hey');
                _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string');
                console.log('[GET] /v1/state/javascript.0.test-string => ' + JSON.stringify(_response.data));
                expect(_response.data.val).equal('bla&fasel.foo=hummer hey');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: set - must set value', function (done) {
        this.timeout(2000);

        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean?value=true')
            .then(async response => {
                const obj = response.data;
                console.log('[GET] /v1/state/javascript.0.test-boolean?value=true => ' + JSON.stringify(response.data));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-boolean');
                const _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean/plain', {
                    responseType: 'arraybuffer',
                    responseEncoding: 'binary'
                });
                const body = _response.data.toString('utf8');
                console.log('[GET] http://127.0.0.1:18183/javascript.0.test-boolean => ' + body);
                expect(body).equal('true');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: toggle - must toggle boolean value to false', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean/toggle')
            .then(response => {
                const obj = response.data;
                console.log('[GET] /v1/state/javascript.0.test-boolean/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.id).to.equal('javascript.0.test-boolean');

                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean')
                    .then(response => {
                        console.log('[GET] /v1/state/javascript.0.test-boolean => ' + JSON.stringify(response.data));
                        expect(response.data.val).equal(false);
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: toggle - must toggle boolean value to true', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean/toggle')
            .then(response => {
                const obj = response.data;
                console.log('[GET] /v1/state/javascript.0.test-boolean/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-boolean');

                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-boolean')
                    .then(response => {
                        console.log('[GET] /v1/state/javascript.0.test-boolean => ' + JSON.stringify(response.data));
                        expect(response.data.val).equal(true);
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: toggle - must toggle number value to 100', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-number/toggle')
            .then(response => {
                const obj = response.data;
                console.log('[GET] /v1/state/javascript.0.test-number/toggle] => ' + JSON.stringify(obj));
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(100);
                expect(obj.id).to.equal('javascript.0.test-number');

                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-number')
                    .then(response => {
                        console.log('[GET] /v1/state/javascript.0.test-number => ' + JSON.stringify(response.data));
                        expect(response.data.val).equal(100);
                        return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-number?value=49')
                            .then(response => {
                                console.log('[GET] /v1/state/javascript.0.test-number?value=49 => ' + JSON.stringify(response.data));
                                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-number/toggle')
                                    .then(response => {
                                        const obj = response.data;
                                        console.log('[GET] /v1/state/javascript.0.test-number/toggle => ' + JSON.stringify(response.data));
                                        expect(obj).to.be.ok;
                                        expect(obj.val).to.be.equal(51);
                                        expect(obj.id).to.equal('javascript.0.test-number');

                                        axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-number')
                                            .then(response => {
                                                console.log('[GET] /v1/state/javascript.0.test-number => ' + JSON.stringify(response.data));
                                                expect(response.data.val).equal(51);
                                                done();
                                            });
                                    });
                            });
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: objects - must return objects', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/objects?filter=system.adapter.*')
            .then(response => {
                const obj = response.data
                console.log('[GET] /v1/objects?filter=system.adapter.* => ' + JSON.stringify(obj));
                expect(obj['system.adapter.swagger.0.alive']._id).to.be.ok;
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: objects - must return objects', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/objects?filter=system.adapter.*&type=instance')
            .then(response => {
                const obj = response.data
                console.log('[GET] /v1/objects?filter=system.adapter.*&type=instance => ' + JSON.stringify(obj));
                expect(obj['system.adapter.swagger.0']._id).to.be.ok;
                expect(obj['system.adapter.swagger.0.alive']).to.be.not.ok;
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: states - must return states', function (done) {
        this.timeout(2000);
        axios.get('http://127.0.0.1:18183/v1/states?filter=system.adapter.*')
            .then(response => {
                const states = response.data
                console.log('[GET] /v1/states?filter=system.adapter.* => ' + JSON.stringify(states));
                expect(states['system.adapter.swagger.0']).to.be.not.ok;
                expect(states['system.adapter.swagger.0.uptime'].val).to.be.least(0);
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    after('Test Swagger API: Stop js-controller', function (done) {
        this.timeout(6000);
        setup.stopController(function (normalTerminated) {
            console.log('Adapter normal terminated: ' + normalTerminated);
            done();
        });
    });
});
