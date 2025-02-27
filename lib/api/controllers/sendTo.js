'use strict';
const commonLib = require('./common.js');

function sendTo(req, res) {
    commonLib.checkPermissions(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async error => {
        if (error) {
            commonLib.errorResponse(req, res, error);
        } else {
            const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let message = req.query.message;
            let noResponse = req.query.noResponse;
            let timeout = req.query.timeout;
            let data = req.query.data;
            if (req.body && req.body.message) {
                message = req.query.message;
            }
            if (req.body && req.body.timeout) {
                timeout = req.query.timeout;
            }
            timeout = parseInt(timeout, 10) || 10000;
            if (req.body && req.body.noResponse !== undefined) {
                noResponse = req.query.noResponse;
            }
            noResponse = noResponse === 'true';

            if (req.body && req.body.data !== undefined) {
                data = req.query.data;
            } else {
                if (data !== undefined && data !== null) {
                    if (data === 'null') {
                        data = null;
                    } else if (data === 'undefined') {
                        data = undefined;
                    } else if (data === 'true') {
                        data = true;
                    } else if (data === 'false') {
                        data = false;
                    } else if (isFinite(data)) {
                        data = parseFloat(data);
                    } else if (data.startsWith('{') && data.endsWith('}')) {
                        try {
                            data = JSON.parse(data);
                        } catch (error) {
                            // ignore
                        }
                    } else if (data.startsWith('[') && data.endsWith(']')) {
                        try {
                            data = JSON.parse(data);
                        } catch (error) {
                            // ignore
                        }
                    }
                }
            }
            const instance = params.instance;

            if (!instance) {
                res.status(422).json({ error: 'No instance provided' });
                return;
            }
            if (!message) {
                res.status(422).json({ error: 'No message provided' });
                return;
            }

            // check if instance is alive
            let state;
            try {
                state = await req._adapter.getForeignStateAsync(`system.adapter.${instance}.alive`);
                if (!state || !state.val) {
                    res.status(500).json({ error: 'instance is not online', instance });
                    return;
                }
            } catch (error) {
                res.status(500).json({ error: 'invalid instance', instance });
                return;
            }
            if (noResponse) {
                req._adapter.sendTo(instance, message, data);
                res.json({ result: 'sent' });
            } else {
                let timer;
                let answerDone = false;
                if (timeout) {
                    timer = setTimeout(() => {
                        timer = null;
                        if (!answerDone) {
                            answerDone = true;
                            res.status(408).json({ error: 'timeout' });
                        }
                    }, timeout);
                }

                req._adapter.sendTo(instance, message, data, (result, result1) => {
                    timer && clearTimeout(timer);
                    if (!answerDone) {
                        answerDone = true;
                        if (!result && result1) {
                            res.json(result1);
                        } else if (result && !result1) {
                            res.json(result);
                        } else {
                            res.json({ error: result, result: result1 });
                        }
                    }
                });
            }
        }
    });
}

module.exports = {
    sendToPost: sendTo,
    sendTo: sendTo,
};
