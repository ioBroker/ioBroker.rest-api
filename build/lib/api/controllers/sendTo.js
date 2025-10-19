"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToPost = void 0;
exports.sendTo = sendTo;
const common_1 = require("./common");
function sendTo(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let message = req.query.message;
            let noResponseStr = req.query.noResponse;
            let timeout = req.query.timeout;
            let data = req.query.data;
            if (req.body?.message) {
                message = req.body.message;
            }
            if (req.body?.timeout) {
                timeout = req.body.timeout;
            }
            timeout = parseInt(timeout, 10) || 10000;
            if (req.body?.noResponse !== undefined) {
                noResponseStr = req.body.noResponse;
            }
            const noResponse = noResponseStr === 'true';
            if (req.body?.data !== undefined) {
                data = req.body.data;
            }
            else {
                if (data !== undefined && data !== null) {
                    if (data === 'null') {
                        data = null;
                    }
                    else if (data === 'undefined') {
                        data = undefined;
                    }
                    else if (data === 'true') {
                        data = true;
                    }
                    else if (data === 'false') {
                        data = false;
                    }
                    else if (isFinite(data)) {
                        data = parseFloat(data);
                    }
                    else if (data.startsWith('{') && data.endsWith('}')) {
                        try {
                            data = JSON.parse(data);
                        }
                        catch {
                            // ignore
                        }
                    }
                    else if (data.startsWith('[') && data.endsWith(']')) {
                        try {
                            data = JSON.parse(data);
                        }
                        catch {
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
                if (!state?.val) {
                    res.status(500).json({ error: 'instance is not online', instance });
                    return;
                }
            }
            catch {
                res.status(500).json({ error: 'invalid instance', instance });
                return;
            }
            if (noResponse) {
                req._adapter.sendTo(instance, message, data);
                res.json({ result: 'sent' });
            }
            else {
                let timer = null;
                let answerDone = false;
                if (timeout) {
                    timer = req._adapter.setTimeout(() => {
                        timer = null;
                        if (!answerDone) {
                            answerDone = true;
                            res.status(408).json({ error: 'timeout' });
                        }
                    }, timeout);
                }
                req._adapter.sendTo(instance, message, data, (result) => {
                    if (timer) {
                        req._adapter.clearTimeout(timer);
                    }
                    if (!answerDone) {
                        answerDone = true;
                        res.json(result);
                    }
                });
            }
        }
    });
}
exports.sendToPost = sendTo;
//# sourceMappingURL=sendTo.js.map