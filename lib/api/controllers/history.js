'use strict';
const commonLib = require('./common.js');

const PARAMETERS = {
    start: 'number',
    end:'number',
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
}

const PARAMETERS_ADD = {
    val: 'string',
    from: 'string',
    ack: 'boolean',
    q: 'number',
    ts: 'number',
}

module.exports = {
    getHistory: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'other', operation: 'sendto'}],  async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (req._adapter.config.dataSource) {
                    // check if instance is alive
                    const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                    if (state.val) {
                        const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                        req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);

                        const options = {};
                        Object.keys(PARAMETERS).forEach(attr => {
                            if (Object.hasOwnProperty.call(req.query, attr)) {
                                if (PARAMETERS[attr] === 'boolean') {
                                    options[attr] = req.query[attr] === 'true';
                                } else if (PARAMETERS[attr] === 'number') {
                                    options[attr] = parseFloat(req.query[attr]);
                                } else if (Array.isArray(PARAMETERS[attr])) {
                                    if (PARAMETERS[attr].includes(req.query[attr])) {
                                        options[attr] = req.query[attr];
                                    } else {
                                        req._adapter.log.warn(`Unknown value ${req.query[attr]} for attribute ${attr}. Allowed: ${PARAMETERS[attr].join(', ')}`);
                                    }
                                } else if (PARAMETERS[attr] === 'string') {
                                    options[attr] = req.query[attr];
                                }
                            }
                        });

                        req._adapter.sendTo(req._adapter.config.dataSource, 'getHistory', {id: params.stateId, options}, (result, step, error) => {
                            if (error) {
                                res.status(500).json({error});
                                return;
                            }
                            // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                            res.json(result.result);
                        });
                    } else {
                        res.status(500).json({error: 'Instance is not alive', instance: req._adapter.config.dataSource});
                    }
                } else {
                    res.status(422).json({error: 'No dataSource defined!'});
                }
            }
        });
    },
    postHistory: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, req.body.options, async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (req._adapter.config.dataSource) {
                    const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                    if (state.val) {
                        req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                        const options = {
                            id: req.body.id,
                            options: {}
                        };

                        if (req.body.options && typeof req.body.options === 'object') {
                            Object.keys(PARAMETERS).forEach(attr => {
                                if (Object.hasOwnProperty.call(req.body.options, attr)) {
                                    if (PARAMETERS[attr] === 'boolean') {
                                        options[attr] = req.body.options[attr] === 'true';
                                    } else if (PARAMETERS[attr] === 'number') {
                                        options[attr] = parseFloat(req.body.options[attr]);
                                    } else if (Array.isArray(PARAMETERS[attr])) {
                                        if (PARAMETERS[attr].includes(req.body.options[attr])) {
                                            options[attr] = req.body.options[attr];
                                        } else {
                                            req._adapter.log.warn(`Unknown value ${req.body.options[attr]} for attribute ${attr}. Allowed: ${PARAMETERS[attr].join(', ')}`);
                                        }
                                    } else if (PARAMETERS[attr] === 'string') {
                                        options[attr] = req.body.options[attr];
                                    }
                                }
                            });
                        }

                        req._adapter.sendTo(req._adapter.config.dataSource, 'getHistory', options, (result, step, error) => {
                            if (error) {
                                res.status(500).json({error});
                                return;
                            }
                            // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                            res.json(result.result);
                        });
                    } else {
                        res.status(500).json({error: 'Instance is not alive', instance: req._adapter.config.dataSource});
                    }
                } else {
                    res.status(422).json({error: 'No dataSource defined!'});
                }
            }
        });
    },
    addHistoryByGet: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'other', operation: 'sendto'}],  async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (req._adapter.config.dataSource) {
                    // check if instance is alive
                    const aliveState = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                    if (aliveState.val) {
                        const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                        req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                        const obj = await req._adapter.getForeignObjectAsync(params.stateId);

                        if (obj && obj.type === 'state' && obj.common && obj.common.type) {
                            const state = {};
                            Object.keys(PARAMETERS_ADD).forEach(attr => {
                                if (Object.hasOwnProperty.call(req.query, attr)) {
                                    if (PARAMETERS_ADD[attr] === 'boolean') {
                                        state[attr] = req.query[attr] === 'true';
                                    } else if (PARAMETERS_ADD[attr] === 'number') {
                                        state[attr] = parseFloat(req.query[attr]);
                                    } else if (PARAMETERS_ADD[attr] === 'string') {
                                        state[attr] = req.query[attr];
                                    }
                                    if (attr === 'val') {
                                        if (obj.common.type === 'boolean') {
                                            state.val = state.val === 'true' || state.val === '1';
                                        } else if (obj.common.type === 'number') {
                                            state.val = parseFloat(state.val);
                                        }
                                    }
                                }
                            });

                            state.ts = state.ts || Date.now();

                            req._adapter.sendTo(req._adapter.config.dataSource, 'storeState', {id: params.stateId, state}, (result, step, error) => {
                                if (error) {
                                    res.status(500).json({error});
                                    return;
                                }
                                // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                                res.json(result);
                            });
                        } else {
                            res.status(404).json({error: 'State not found', stateId: params.stateId});
                        }
                    } else {
                        res.status(500).json({error: 'Instance is not alive', instance: req._adapter.config.dataSource});
                    }
                } else {
                    res.status(422).json({error: 'No dataSource defined!'});
                }
            }
        });
    },
    addHistoryByPost: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, req.body.options, async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (req._adapter.config.dataSource) {
                    const state = await req._adapter.getForeignStateAsync(`system.adapter.${req._adapter.config.dataSource}.alive`);
                    if (state.val) {
                        req._adapter.log.debug(`Read data from: ${req._adapter.config.dataSource}`);
                        const options = {
                            id: req.body.id,
                            state: {}
                        };

                        if (req.body.state && typeof req.body.state === 'object') {
                            Object.keys(PARAMETERS_ADD).forEach(attr => {
                                if (Object.hasOwnProperty.call(req.body.state, attr)) {
                                    if (PARAMETERS_ADD[attr] === 'boolean') {
                                        options[attr] = req.body.state[attr] === 'true';
                                    } else if (PARAMETERS_ADD[attr] === 'number') {
                                        options[attr] = parseFloat(req.body.state[attr]);
                                    } else if (PARAMETERS_ADD[attr] === 'string') {
                                        options[attr] = req.body.state[attr];
                                    }
                                }
                            });
                        }

                        options.state.ts = options.state.ts || Date.now();

                        req._adapter.sendTo(req._adapter.config.dataSource, 'storeState', options, (result, step, error) => {
                            if (error) {
                                res.status(500).json({error});
                                return;
                            }
                            // req._adapter.log.debug(`[QUERY] sendTo result = ${JSON.stringify(result)}`);
                            res.json(result);
                        });
                    } else {
                        res.status(500).json({
                            error: 'Instance is not alive',
                            instance: req._adapter.config.dataSource
                        });
                    }
                } else {
                    res.status(422).json({error: 'No dataSource defined!'});
                }
            }
        });
    },
};