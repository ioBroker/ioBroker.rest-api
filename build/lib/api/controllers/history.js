"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = getHistory;
exports.postHistory = postHistory;
exports.addHistoryByGet = addHistoryByGet;
exports.addHistoryByPost = addHistoryByPost;
const common_1 = require("./common");
const PARAMETERS = {
    start: 'number',
    end: 'number',
    count: 'number',
    from: 'boolean',
    ack: 'boolean',
    q: 'boolean',
    addId: 'boolean',
    limit: 'number',
    ignoreNull: 'boolean',
    removeBorderValues: 'boolean',
    returnNewestEntries: 'boolean',
    aggregate: ['minmax', 'max', 'min', 'average', 'total', 'count', 'percentile', 'quantile', 'integral', 'none'],
    percentile: 'number',
    quantile: 'number',
    integralUnit: 'string',
    integralInterpolation: 'string',
    enum: ['linear', 'none'],
};
const PARAMETERS_ADD = {
    val: 'string',
    from: 'string',
    ack: 'boolean',
    q: 'number',
    ts: 'number',
};
function getHistory(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            if (req._adapter.config.dataSource) {
                // check if instance is alive
                const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                if (state?.val) {
                    const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                    req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                    const options = { instance: req._adapter.config.dataSource };
                    Object.keys(PARAMETERS).forEach(attr => {
                        if (Object.hasOwnProperty.call(req.query, attr)) {
                            if (PARAMETERS[attr] === 'boolean') {
                                options[attr] = req.query[attr] === 'true';
                            }
                            else if (PARAMETERS[attr] === 'number') {
                                options[attr] = parseFloat(req.query[attr]);
                            }
                            else if (Array.isArray(PARAMETERS[attr])) {
                                if (PARAMETERS[attr].includes(req.query[attr])) {
                                    options[attr] = req.query[attr];
                                }
                                else {
                                    req._adapter.log.warn(`Unknown value ${req.query[attr]} for attribute ${attr}. Allowed: ${PARAMETERS[attr].join(', ')}`);
                                }
                            }
                            else if (PARAMETERS[attr] === 'string') {
                                options[attr] = req.query[attr];
                            }
                        }
                    });
                    req._adapter.getHistory(params.stateId, options, (error, result) => {
                        if (error) {
                            (0, common_1.errorResponse)(req, res, error?.toString());
                            return;
                        }
                        res.json(result);
                    });
                }
                else {
                    res.status(500).json({
                        error: 'Instance is not alive',
                        instance: req._adapter.config.dataSource,
                    });
                }
            }
            else {
                res.status(422).json({ error: 'No dataSource defined!' });
            }
        }
    });
}
function postHistory(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            if (req._adapter.config.dataSource) {
                const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                if (state?.val) {
                    req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                    const options = {
                        id: req.body.id,
                        options: {
                            instance: req._adapter.config.dataSource,
                        },
                    };
                    if (req.body.options && typeof req.body.options === 'object') {
                        Object.keys(PARAMETERS).forEach(attr => {
                            if (Object.hasOwnProperty.call(req.body.options, attr)) {
                                if (PARAMETERS[attr] === 'boolean') {
                                    options.options[attr] = req.body.options[attr] === 'true';
                                }
                                else if (PARAMETERS[attr] === 'number') {
                                    options.options[attr] = parseFloat(req.body.options[attr]);
                                }
                                else if (Array.isArray(PARAMETERS[attr])) {
                                    if (PARAMETERS[attr].includes(req.body.options[attr])) {
                                        options.options[attr] = req.body.options[attr];
                                    }
                                    else {
                                        req._adapter.log.warn(`Unknown value ${req.body.options[attr]} for attribute ${attr}. Allowed: ${PARAMETERS[attr].join(', ')}`);
                                    }
                                }
                                else if (PARAMETERS[attr] === 'string') {
                                    options.options[attr] = req.body.options[attr];
                                }
                            }
                        });
                    }
                    req._adapter.getHistory(options.id, options.options, (error, result) => {
                        if (error) {
                            (0, common_1.errorResponse)(req, res, error?.toString());
                            return;
                        }
                        res.json(result);
                    });
                }
                else {
                    res.status(500).json({
                        error: 'Instance is not alive',
                        instance: req._adapter.config.dataSource,
                    });
                }
            }
            else {
                res.status(422).json({ error: 'No dataSource defined!' });
            }
        }
    });
}
function addHistoryByGet(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            if (req._adapter.config.dataSource) {
                // check if instance is alive
                const aliveState = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                if (aliveState?.val) {
                    const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                    req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                    const obj = await req._adapter.getForeignObjectAsync(params.stateId);
                    if (obj?.common?.type && obj.type === 'state') {
                        const state = { ts: Date.now() };
                        Object.keys(PARAMETERS_ADD).forEach(attr => {
                            if (Object.hasOwnProperty.call(req.query, attr)) {
                                if (PARAMETERS_ADD[attr] === 'boolean') {
                                    state[attr] = req.query[attr] === 'true';
                                }
                                else if (PARAMETERS_ADD[attr] === 'number') {
                                    state[attr] = parseFloat(req.query[attr]);
                                }
                                else if (PARAMETERS_ADD[attr] === 'string') {
                                    state[attr] = req.query[attr];
                                }
                                if (attr === 'val') {
                                    if (obj.common.type === 'boolean') {
                                        state.val = state.val === 'true' || state.val === '1';
                                    }
                                    else if (obj.common.type === 'number') {
                                        state.val = parseFloat(state.val);
                                    }
                                }
                            }
                        });
                        req._adapter.sendTo(req._adapter.config.dataSource, 'storeState', { id: params.stateId, state }, (result) => {
                            if (typeof result === 'string' || result.error) {
                                (0, common_1.errorResponse)(req, res, result.error || result);
                                return;
                            }
                            // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                            res.json(result);
                        });
                    }
                    else {
                        res.status(404).json({ error: 'State not found', stateId: params.stateId });
                    }
                }
                else {
                    res.status(500).json({
                        error: 'Instance is not alive',
                        instance: req._adapter.config.dataSource,
                    });
                }
            }
            else {
                res.status(422).json({ error: 'No dataSource defined!' });
            }
        }
    });
}
function addHistoryByPost(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            if (req._adapter.config.dataSource) {
                const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                if (state?.val) {
                    req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                    const options = {
                        id: req.body.id,
                        state: { ts: Date.now() },
                    };
                    if (req.body.state && typeof req.body.state === 'object') {
                        Object.keys(PARAMETERS_ADD).forEach(attr => {
                            if (Object.hasOwnProperty.call(req.body.state, attr)) {
                                if (PARAMETERS_ADD[attr] === 'boolean') {
                                    options.state[attr] = req.body.state[attr] === 'true';
                                }
                                else if (PARAMETERS_ADD[attr] === 'number') {
                                    options.state[attr] = parseFloat(req.body.state[attr]);
                                }
                                else if (PARAMETERS_ADD[attr] === 'string') {
                                    options.state[attr] = req.body.state[attr];
                                }
                            }
                        });
                    }
                    req._adapter.sendTo(req._adapter.config.dataSource, 'storeState', options, (result) => {
                        if (typeof result === 'string' || result.error) {
                            (0, common_1.errorResponse)(req, res, result.error || result);
                            return;
                        }
                        // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                        res.json(result);
                    });
                }
                else {
                    res.status(500).json({
                        error: 'Instance is not alive',
                        instance: req._adapter.config.dataSource,
                    });
                }
            }
            else {
                res.status(422).json({ error: 'No dataSource defined!' });
            }
        }
    });
}
//# sourceMappingURL=history.js.map