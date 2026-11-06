// Unit tests for the subscriptions of web hooks, polling connections and requests waiting for an acknowledgement,
// with a mocked adapter. No JS-Controller is required. The tests run against the build output, so call
// "npm run build" before.
const { expect } = require('chai');
const express = require('express');
const SwaggerUI = require('../build/lib/rest-api').default;

const ID = 'hm-rpc.0.dev.LEVEL';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createAdapter() {
    const adapter = {
        config: { checkInterval: 0 },
        namespace: 'rest-api.0',
        calls: [],
        warnings: [],
        log: {
            debug: () => {},
            info: () => {},
            silly: () => {},
            warn: text => adapter.warnings.push(text),
            error: text => adapter.warnings.push(text),
        },
        async calculatePermissionsAsync() {
            return {};
        },
        async getForeignObjectAsync() {
            return null;
        },
        async getForeignStateAsync() {
            return null;
        },
        async setForeignStateAsync() {},
        async subscribeForeignStatesAsync(id) {
            adapter.calls.push(`sub state ${id}`);
        },
        async unsubscribeForeignStatesAsync(id) {
            adapter.calls.push(`unsub state ${id}`);
        },
        async subscribeForeignObjectsAsync(id, options) {
            if (options?.user === 'system.user.nobody') {
                throw new Error('permissionError');
            }
            adapter.calls.push(`sub object ${id}`);
        },
        async unsubscribeForeignObjectsAsync(id) {
            adapter.calls.push(`unsub object ${id}`);
        },
        setTimeout: (cb, ms, ...args) => setTimeout(cb, ms, ...args),
        clearTimeout: timer => clearTimeout(timer),
    };
    return adapter;
}

function createResponse() {
    let answered;
    const res = {
        headersSent: false,
        statusCode: 200,
        body: undefined,
        answered: new Promise(resolve => (answered = resolve)),
        status(code) {
            res.statusCode = code;
            return res;
        },
        json(body) {
            if (res.headersSent) {
                throw new Error('ERR_HTTP_HEADERS_SENT');
            }
            res.headersSent = true;
            res.body = body;
            answered(res);
        },
    };
    return res;
}

const count = (adapter, call) => adapter.calls.filter(c => c === call).length;

describe('Subscriptions of hooks and waiting requests', () => {
    let adapter;
    let api;

    beforeEach(async () => {
        adapter = createAdapter();
        api = new SwaggerUI(null, { secure: false, port: 0 }, adapter, null, express());
        await api.ready();
    });

    afterEach(async () => {
        await api.unload();
    });

    it('can be reloaded by web in place', () => {
        expect(api.supportsHotReload).to.equal(true);
    });

    it('keeps a state subscribed while another hook still holds it', async () => {
        await api.registerSubscribe('client1', ID, 'state', 'system.user.admin', 'polling');
        await api.registerSubscribe('client2', ID, 'state', 'system.user.admin', 'polling');
        expect(count(adapter, `sub state ${ID}`)).to.equal(1);

        await api.unregisterSubscribe('client1', ID, 'state');
        expect(count(adapter, `unsub state ${ID}`)).to.equal(0);

        await api.unregisterSubscribe('client2', ID, 'state');
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
    });

    it('subscribes an object for every hook, so that the rights of each user are checked', async () => {
        await api.registerSubscribe('client1', 'system.adapter.*', 'object', 'system.user.admin', 'polling');
        await api.registerSubscribe('client2', 'system.adapter.*', 'object', 'system.user.admin', 'polling');
        expect(count(adapter, 'sub object system.adapter.*')).to.equal(2);

        let error;
        try {
            await api.registerSubscribe('client3', 'system.adapter.*', 'object', 'system.user.nobody', 'polling');
        } catch (e) {
            error = e;
        }
        expect(error?.message).to.equal('permissionError');
        expect(api.getSubscribes('client3', 'system.adapter.*', 'object')).to.equal(null);

        await api.unregisterSubscribe('client1', null, 'object');
        await api.unregisterSubscribe('client2', null, 'object');
        expect(count(adapter, 'unsub object system.adapter.*')).to.equal(1);
    });

    it('answers a waiting request with the acknowledged state and keeps the subscription of a hook', async () => {
        await api.registerSubscribe('client1', ID, 'state', 'system.user.admin', 'polling');
        const res = createResponse();
        await api.addTimeout({ id: ID, val: 5, res, timeout: 2000 });

        await api.stateChange(ID, { val: 5, ack: false });
        expect(res.headersSent).to.equal(false);
        await api.stateChange(ID, { val: 5, ack: true });
        await res.answered;
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.deep.include({ id: ID, val: 5, ack: true });
        expect(count(adapter, `unsub state ${ID}`)).to.equal(0);

        await api.unregisterSubscribe('client1', ID, 'state');
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
    });

    it('keeps the subscription for a request that still waits, when another one times out', async () => {
        const short = createResponse();
        const long = createResponse();
        await api.addTimeout({ id: ID, val: 1, res: short, timeout: 50 });
        await api.addTimeout({ id: ID, val: 2, res: long, timeout: 2000 });
        expect(count(adapter, `sub state ${ID}`)).to.equal(1);

        await short.answered;
        expect(short.statusCode).to.equal(501);
        expect(short.body.error).to.equal('timeout');
        expect(count(adapter, `unsub state ${ID}`)).to.equal(0);

        await api.stateChange(ID, { val: 2, ack: true });
        await long.answered;
        expect(long.body.val).to.equal(2);
        await wait(10);
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
    });

    it('keeps the subscription for a waiting request, when a hook gives up the same state', async () => {
        await api.registerSubscribe('client1', ID, 'state', 'system.user.admin', 'polling');
        const res = createResponse();
        await api.addTimeout({ id: ID, val: 3, res, timeout: 2000 });

        await api.unregisterSubscribe('client1', ID, 'state');
        expect(count(adapter, `unsub state ${ID}`)).to.equal(0);

        await api.stateChange(ID, { val: 3, ack: true });
        await res.answered;
        await wait(10);
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
    });

    it('ends the wait without an answer, when the write failed', async () => {
        const res = createResponse();
        const endWait = await api.addTimeout({ id: ID, val: 4, res, timeout: 50 });
        endWait();
        await wait(100);
        // the timer did not answer: the error response of the controller is the only answer
        expect(res.headersSent).to.equal(false);
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
    });

    it('gives up only the subscriptions of an inactive polling connection', async () => {
        await api.registerSubscribe('client1', ID, 'state', 'system.user.admin', 'polling');
        await api.registerSubscribe('client2', ID, 'state', 'system.user.admin', 'polling');
        await api.registerSubscribe('client2', 'other.0.state', 'state', 'system.user.admin', 'polling');

        // client2 did not poll for a long time
        for (const store of Object.values(api.subscribes)) {
            if (store.urlHook === 'client2') {
                store.ts = Date.now() - 3600000;
            }
        }
        await api._executeGC();

        expect(api.getSubscribes('client2', ID, 'state')).to.equal(null);
        expect(count(adapter, `unsub state ${ID}`)).to.equal(0);
        expect(count(adapter, 'unsub state other.0.state')).to.equal(1);
        expect(api.getSubscribes('client1', ID, 'state')).to.deep.equal([ID]);
    });

    it('answers the waiting requests and gives up every subscription once on unload', async () => {
        await api.registerSubscribe('client1', ID, 'state', 'system.user.admin', 'polling');
        await api.registerSubscribe('client2', ID, 'state', 'system.user.admin', 'polling');
        await api.registerSubscribe('client1', 'system.adapter.*', 'object', 'system.user.admin', 'polling');
        const res = createResponse();
        await api.addTimeout({ id: 'other.0.state', val: 7, res, timeout: 100 });

        await api.unload();
        expect(res.statusCode).to.equal(503);
        expect(count(adapter, `unsub state ${ID}`)).to.equal(1);
        expect(count(adapter, 'unsub state other.0.state')).to.equal(1);
        expect(count(adapter, 'unsub object system.adapter.*')).to.equal(1);

        // the timer of the request is gone: a second answer would throw in the timer
        await wait(150);
        expect(res.statusCode).to.equal(503);
        expect(res.body.error).to.equal('REST-API was stopped');
    });
});
