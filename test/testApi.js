const expect = require('chai').expect;
const setup = require('./lib/setup');
const axios = require('axios');

let objects = null;
let states = null;

process.env.NO_PROXY = '127.0.0.1';

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log('Try check #' + counter);
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
        checkConnectionOfAdapter(res => {
            res && console.log(res);
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('javascript.0.test-string', {
                common: {
                    name: 'test',
                    type: 'string',
                    role: 'value',
                    def: ''
                },
                native: {},
                type: 'state'
            }, (err) => {
                expect(err).to.be.null;
                states.setState('javascript.0.test-string', '', err => {
                    expect(err).to.be.null;
                    done();
                });
            });
        });
    });

    it('Test Swagger API: get - must return state', function (done) {
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
                expect(obj._id).to.equal("system.adapter.swagger.0.alive");
                expect(obj.common).to.be.ok;
                expect(obj.native).to.be.ok;
                expect(obj.common.name).to.equal("swagger.0.alive");
                expect(obj.common.role).to.equal("indicator.state");
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: set - must set state', function (done) {
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
                expect(obj.val).to.equal('50');
                expect(obj.id).to.equal('javascript.0.test-string');
                let _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain');
                const body = _response.data
                console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + body);
                expect(body).equal('"bla"');

                _response = await axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain?extraPlain=true');
                console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + body);
                expect(_response.data).equal('bla');

                _response = await axios.get('http://127.0.0.1:18183/get/javascript.0.test-string')
                console.log('get/javascript.0.test-string => ' + _response.data);
                expect(_response.data.val).equal('bla');
                done();
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it('Test Swagger API: getPlainValue - must return plain value', function (done) {
        axios.get('http://127.0.0.1:18183/v1/state/system.adapter.swagger.0.alive/plain')
            .then(response => {
                const body = response.data
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
        axios.patch('http://127.0.0.1:18183/v1/state/javascript.0.test-string', {val: '60', ack: true})
            .then(response => {
                console.log('[PATCH] /v1/state/javascript.0.test-string => ' + JSON.stringify(response.data));
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.ack).to.be.true;
                expect(obj.id).to.equal('javascript.0.test-string');
                return axios.get('http://127.0.0.1:18183/v1/state/javascript.0.test-string/plain')
                    .then(response => {
                        console.log('[GET] /v1/state/javascript.0.test-string/plain => ' + response.data);
                        expect(response.data).equal('60');
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it.skip('Test Swagger API: set - must set encoded string value', function (done) {
        axios.get('http://127.0.0.1:18183/set/javascript.0.test-string?val=bla%26fasel%2efoo%3Dhummer+hey')
            .then(response => {
                console.log('set/javascript.0.test-string?val=bla%20fasel%2efoo => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).equal('bla&fasel.foo=hummer hey');
                expect(obj.id).to.equal('javascript.0.test-string');
                axios.get('http://127.0.0.1:18183/getPlainValue/javascript.0.test-string')
                    .then(response => {
                        console.log('getPlainValue/javascript.0.test-string => ' + body);
                        expect(error).to.be.not.ok;
                        expect(body).equal('"bla&fasel.foo=hummer hey"');
                        axios.get('http://127.0.0.1:18183/get/javascript.0.test-string')
                            .then(response => {
                                console.log('get/javascript.0.test-string => ' + body);
                                expect(error).to.be.not.ok;
                                expect(JSON.parse(body).val).equal('bla&fasel.foo=hummer hey');
                                done();
                            });
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it.skip('Test Swagger API: set - must set val', function (done) {
        axios.get('http://127.0.0.1:18183/set/system.adapter.swagger.0.alive?val=true')
            .then(response => {
                console.log('set/system.adapter.swagger.0.alive?val=true => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('system.adapter.swagger.0.alive');
                axios.get('http://127.0.0.1:18183/getPlainValue/system.adapter.swagger.0.alive')
                    .then(response => {
                        console.log('getPlainValue/system.adapter.swagger.0.alive => ' + body);
                        expect(error).to.be.not.ok;
                        expect(body).equal('true');
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it.skip('Test Swagger API: toggle - must toggle boolean value to false', function (done) {
        axios.get('http://127.0.0.1:18183/toggle/system.adapter.swagger.0.alive')
            .then(response => {
                console.log('toggle/system.adapter.swagger.0.alive => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.be.false;
                expect(obj.id).to.equal('system.adapter.swagger.0.alive');

                axios.get('http://127.0.0.1:18183/getPlainValue/system.adapter.swagger.0.alive')
                    .then(response => {
                        console.log('getPlainValue/system.adapter.swagger.0.alive => ' + body);
                        expect(error).to.be.not.ok;
                        expect(body).equal('false');
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it.skip('Test Swagger API: toggle - must toggle boolean value to true', function (done) {
        axios.get('http://127.0.0.1:18183/toggle/system.adapter.swagger.0.alive')
            .then(response => {
                console.log('toggle/system.adapter.swagger.0.alive => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.be.true;
                expect(obj.id).to.equal('system.adapter.swagger.0.alive');

                axios.get('http://127.0.0.1:18183/getPlainValue/system.adapter.swagger.0.alive')
                    .then(response => {
                        console.log('getPlainValue/system.adapter.swagger.0.alive => ' + body);
                        expect(error).to.be.not.ok;
                        expect(body).equal('true');
                        done();
                    });
            })
            .catch(error => {
                console.error('Error in response: ' + error);
                expect(error).to.be.not.ok;
            });
    });

    it.skip('Test Swagger API: toggle - must toggle number value to 100', function (done) {
        axios.get('http://127.0.0.1:18183/toggle/system.adapter.swagger.upload')
            .then(response => {
                console.log('toggle/system.adapter.swagger.upload => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj).to.be.ok;
                expect(obj.val).to.be.equal(100);
                expect(obj.id).to.equal('system.adapter.swagger.upload');

                axios.get('http://127.0.0.1:18183/getPlainValue/system.adapter.swagger.upload')
                    .then(response => {
                        console.log('getPlainValue/system.adapter.swagger.upload => ' + body);
                        expect(error).to.be.not.ok;
                        expect(body).equal('100');
                        axios.get('http://127.0.0.1:18183/set/system.adapter.swagger.upload?val=49')
                            .then(response => {
                                console.log('set/system.adapter.swagger.upload?val=49 => ' + body);
                                axios.get('http://127.0.0.1:18183/toggle/system.adapter.swagger.upload')
                                    .then(response => {
                                        console.log('toggle/system.adapter.swagger.upload => ' + body);
                                        expect(error).to.be.not.ok;
                                        const obj = response.data
                                        expect(obj).to.be.ok;
                                        expect(obj.val).to.be.equal(51);
                                        expect(obj.id).to.equal('system.adapter.swagger.upload');

                                        axios.get('http://127.0.0.1:18183/getPlainValue/system.adapter.swagger.upload')
                                            .then(response => {
                                                console.log('getPlainValue/system.adapter.swagger.upload => ' + body);
                                                expect(error).to.be.not.ok;
                                                expect(body).equal('51');
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

    it.skip('Test Swagger API: objects - must return objects', function (done) {
        axios.get('http://127.0.0.1:18183/objects?pattern=system.adapter.*')
            .then(response => {
                console.log('objects?pattern=system.adapter.* => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj['system.adapter.swagger.0.alive']._id).to.be.ok;
                done();
            });
    });

    it.skip('Test Swagger API: objects - must return objects', function (done) {
        axios.get('http://127.0.0.1:18183/objects?pattern=system.adapter.*&type=instance')
            .then(response => {
                console.log('objects?pattern=system.adapter.* => ' + body);
                expect(error).to.be.not.ok;
                const obj = response.data
                expect(obj['system.adapter.swagger.0']._id).to.be.ok;
                done();
            });
    });

    it.skip('Test Swagger API: states - must return states', function (done) {
        axios.get('http://127.0.0.1:18183/states?pattern=system.adapter.*')
            .then(response => {
                console.log('states?pattern=system.adapter.* => ' + body);
                expect(error).to.be.not.ok;
                const states = response.data
                expect(states['system.adapter.swagger.0.uptime'].val).to.be.least(0);
                done();
            });
    });

    it.skip('Test Swagger API: setBulk(POST) - must set values', function (done) {

        axios.get({
            uri: 'http://127.0.0.1:18183/setBulk',
            method: 'POST',
            body: 'system.adapter.swagger.upload=50&system.adapter.swagger.0.alive=false&javascript.0.test-string=bla%26fasel%2efoo%3Dhummer+hey'
        }, function (error, response, body) {
            console.log('setBulk/?system.adapter.swagger.upload=50&system.adapter.swagger.0.alive=false&javascript.0.test-string=bla%26fasel%2efoo%3Dhummer+hey => ' + JSON.stringify(body));
            expect(error).to.be.not.ok;

            const obj = response.data
            expect(obj).to.be.ok;
            expect(obj[0].val).to.be.equal(50);
            expect(obj[0].id).to.equal('system.adapter.swagger.upload');
            expect(obj[1].val).to.be.equal(false);
            expect(obj[1].id).to.equal('system.adapter.swagger.0.alive');
            expect(obj[2].val).to.be.equal('bla&fasel.foo=hummer hey');
            expect(obj[2].id).to.equal('javascript.0.test-string');

            axios.get('http://127.0.0.1:18183/getBulk/system.adapter.swagger.upload,system.adapter.swagger.0.alive,javascript.0.test-string')
                .then(response => {
                    console.log('getBulk/system.adapter.swagger.upload,system.adapter.swagger.0.alive,javascript.0.test-string => ' + body);
                    expect(error).to.be.not.ok;
                    const obj = response.data
                    expect(obj[0].val).equal(50);
                    expect(obj[1].val).equal(false);
                    expect(obj[2].val).equal('bla&fasel.foo=hummer hey');
                    done();
                });
        });
    });

    it.skip('Test Swagger API: setBulk(POST-GET-Mix) - must set values', function (done) {

        axios.get({
            uri: 'http://127.0.0.1:18183/setBulk?system.adapter.swagger.upload=51&system.adapter.swagger.0.alive=false',
            method: 'POST',
            body: ''
        }, function (error, response, body) {
            console.log('setBulk/?system.adapter.swagger.upload=51&system.adapter.swagger.0.alive=false => ' + JSON.stringify(body));
            expect(error).to.be.not.ok;

            const obj = response.data
            expect(obj).to.be.ok;
            expect(obj[0].val).to.be.equal(51);
            expect(obj[0].id).to.equal('system.adapter.swagger.upload');
            expect(obj[1].val).to.be.equal(false);
            expect(obj[1].id).to.equal('system.adapter.swagger.0.alive');

            axios.get('http://127.0.0.1:18183/getBulk/system.adapter.swagger.upload,system.adapter.swagger.0.alive')
                .then(response => {
                    console.log('getBulk/system.adapter.swagger.upload,system.adapter.swagger.0.alive => ' + body);
                    expect(error).to.be.not.ok;
                    const obj = response.data
                    expect(obj[0].val).equal(51);
                    expect(obj[1].val).equal(false);
                    done();
                });
        });
    });

    it.skip('Test Swagger API: setValueFromBody(POST) - must set one value', function (done) {
        axios.get({
            uri: 'http://127.0.0.1:18183/setValueFromBody/system.adapter.swagger.upload',
            method: 'POST',
            body: '55'
        }, function (error, response, body) {
            console.log('setValueFromBody/?system.adapter.swagger.upload => ' + JSON.stringify(body));
            expect(error).to.be.not.ok;

            const obj = response.data
            expect(obj).to.be.ok;
            expect(obj[0].val).to.be.equal(55);
            expect(obj[0].id).to.equal('system.adapter.swagger.upload');

            axios.get('http://127.0.0.1:18183/getBulk/system.adapter.swagger.upload')
                .then(response => {
                    console.log('getBulk/system.adapter.swagger.upload => ' + body);
                    expect(error).to.be.not.ok;
                    const obj = response.data
                    expect(obj[0].val).equal(55);
                    done();
                });
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
