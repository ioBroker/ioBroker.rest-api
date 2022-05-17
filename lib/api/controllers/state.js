'use strict';
const commonLib = require('./common.js');

function getIDs(oids) {
    return (oids || '').toString().split(',').map(t => t.trim()).filter(t => t);
}

async function updateState(adapter, user, id, timeout, val, res) {
    if (val && typeof val !== 'object') {
        if (val === 'true' || val === 'false') {
            const obj = await adapter.getForeignObjectAsync(id, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            if (obj && obj.common && obj.common.type === 'boolean') {
                val = val === 'true';
            }
        } else if (typeof val === 'string' && isFinite(val)) {
            try {
                const obj = await adapter.getForeignObjectAsync(id, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
                if (obj && obj.common && obj.common.type === 'number') {
                    val = parseFloat(val);
                }
            } catch (error) {
                adapter.log.warn(`Cannot read object ${id}: ${error.toString()}`);
                val = parseFloat(val);
            }
        }
    }

    try {
        if (!timeout) {
            if (typeof val !== 'object') {
                await adapter.setForeignStateAsync(id, val, false, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
                res.json({id, val});
            } else {
                await adapter.setForeignStateAsync(id, val, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
                val.id = id;
                res.json(val);
            }
        } else {
            await adapter._addTimeout({id, val, res, timeout});
            if (typeof val !== 'object') {
                await adapter.setForeignStateAsync(id, val, false, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            } else {
                await adapter.setForeignStateAsync(id, val, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            }
        }
    } catch (error) {
        commonLib.errorResponse({_adapter: adapter, url: 'updateState'}, res, error, {id});
    }
}

function subscribeState(req, res) {
    commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
        if (error) {
            res.status(403).json({error: error});
        } else {
            const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let url = req.body.url;
            if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }

            if (!url) {
                res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                return;
            }

            try {
                const obj = await req._adapter.getForeignObjectAsync(params.stateId, {user: req._user});
                if (!obj) {
                    res.status(404).json({error: 'object not found', url: req.body.url});
                } else if (obj.type !== 'state') {
                    res.status(500).json({error: 'Cannot subscribe on non-state', stateId: params.stateId, type: obj.type, url: req.body.url});
                } else {
                    const error = await req._swaggerObject.registerSubscribe(url, params.stateId, 'state', req._user, {
                        method: (req.query && req.query.method) || (req.body && req.body.method),
                        delta: (req.query && req.query.delta) || (req.body && req.body.delta),
                        onchange: (req.query && req.query.onchange) || (req.body && req.body.onchange),
                    });
                    if (error) {
                        commonLib.errorResponse(req, res, error, {stateId: params.stateId, url: req.body.url});
                        return;
                    }
                    const state = await req._adapter.getForeignStateAsync(params.stateId, {user: req._user});
                    res.status(200).json(state);
                }
            } catch (error) {
                commonLib.errorResponse(req, res, error, {stateId: params.stateId});
            }
        }
    });
}

function toggleState(req, res, oId) {
    let timeout = 0;
    if (req.query.timeout) {
        timeout = parseInt(req.query.timeout, 10);

        if (timeout > 60000) {
            timeout = 60000;
        } // maximum 1 minute
    }

    commonLib.findState(req._adapter, oId, req._user, async (error, id, originId) => {
        if (error && error.message && error.message.includes('permissionError')) {
            // assume it is ID
            id = oId;
            error = null;
        }
        if (error) {
            commonLib.errorResponse(req, res, error, {id: oId});
        } else if (!id) {
            res.status(404).json({error: 'ID not found', id: originId});
        } else {
            try {
                const state = await req._adapter.getForeignStateAsync(id, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner});
                if (!state || typeof state !== 'object') {
                    res.status(500).json({error: 'State not initiated', id: originId});
                } else {
                    let obj;
                    try {
                        obj = await req._adapter.getForeignObjectAsync(id, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner});
                    } catch (error) {
                        req._adapter.log.warn(`Cannot read object ${id}: ${error}`);
                    }
                    let val;
                    if (state.val === 'true') {
                        val = 'false';
                    } else if (state.val === 'false') {
                        val = 'true';
                    } else if (state.val === 'on') {
                        val = 'off';
                    } else if (state.val === 'off') {
                        val = 'on';
                    } else if (state.val === 'OFF') {
                        val = 'ON';
                    } else if (state.val === 'ON') {
                        val = 'OFF';
                    } else if (state.val === '0') {
                        val = '1';
                    } else if (state.val === '1') {
                        val = '0';
                    } else if (typeof state.val === 'number') {
                        val = state.val ? 0 : 1;
                    } else {
                        val = !state.val;
                    }

                    if (obj && obj.common) {
                        if (obj.common.type === 'boolean') {
                            state.val = state.val === 'true' || state.val === true;
                        } else if (obj.common.type === 'number') {
                            if (obj.common.min !== undefined && obj.common.max !== undefined) {
                                val = parseFloat(state.val);
                                if (val > obj.common.max) {
                                    val = obj.common.max;
                                } else
                                if (val < obj.common.min) {
                                    val = obj.common.min;
                                }
                                val = obj.common.max + obj.common.min - val;
                            } else {
                                val = parseFloat(val);
                            }
                        }
                    }

                    await updateState(req._adapter, req._user, id, timeout, val, res);
                }
            } catch (error) {
                commonLib.errorResponse(req, res, error, {id: oId});
            }
        }
    });
}

module.exports = {
    updateState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                const oId = getIDs(params.stateId);
                let timeout = 0;
                if (req.query.timeout) {
                    timeout = parseInt(req.query.timeout, 10);

                    if (timeout > 60000) {
                        timeout = 60000;
                    } // maximum 1 minute
                }

                commonLib.findState(req._adapter, oId[0], req._user, async (error, id, originId) => {
                    if (error && error.message && error.message.includes('permissionError')) {
                        // assume it is ID
                        id = oId[0];
                        error = null;
                    }

                    if (error) {
                        commonLib.errorResponse(req, res, error, {id: oId[0]});
                    } else if (!id) {
                        res.status(404).json({error: 'ID not found', id: originId});
                    } else {
                        await updateState(req._adapter, req._user, id, timeout, req.body, res);
                    }
                });
            }
        });
    },

    toggleState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                const oId = getIDs(params.stateId);
                toggleState(req, res, oId[0]);
            }
        });
    },

    readState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                const oId = getIDs(params.stateId);
                let timeout = 0;
                if (req.query.timeout) {
                    timeout = parseInt(req.query.timeout, 10);

                    if (timeout > 60000) {
                        timeout = 60000;
                    } // maximum 1 minute
                }

                let result;
                for (let k = 0; k < oId.length; k++) {
                    try {
                        const {state, id, originId} = await new Promise((resolve, reject) => commonLib.getState(req._adapter, oId[k], req._user, (error, state, id, originId) =>
                            error ? reject(error) : resolve({state, id, originId})));

                        if (!id) {
                            res.status(404).json({error: 'ID not found', id: originId});
                            return;
                        } else {
                            if (req.query.value !== undefined) {
                                await updateState(req._adapter, req._user, id, timeout, req.query.value, res);
                                return;
                            } else if (req.query.toggle !== undefined) {
                                await toggleState(req, res, id);
                                return;
                            }

                            const vObj = state || {};
                            if (req.query.withInfo === 'true') {
                                try {
                                    const obj = await req._adapter.getForeignObjectAsync(id);
                                    // copy all attributes of the object into state
                                    if (obj) {
                                        Object.keys(obj).forEach(attr => {
                                            if (attr === '_id') {
                                                vObj.id = obj._id;
                                            } else {
                                                vObj[attr] = obj[attr];
                                            }
                                        });
                                    }
                                } catch (error) {
                                    req._adapter.log.warn(`Error by reading of object "${id}": ${error}`);
                                }
                            }

                            if (!result) {
                                result = vObj;
                            } else {
                                if (!Array.isArray(result)) {
                                    result = [result];
                                }
                                result.push(vObj);
                            }
                        }
                    } catch (error) {
                        req._adapter.log.warn(`Cannot read ${oId}: ${error}`);
                        commonLib.errorResponse(req, res, error, {id: oId});
                        return;
                    }
                }

                res.json(result);
            }
        });
    },

    plainState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                const oId = getIDs(params.stateId);
                try {
                    const {state, id, originId} = await new Promise((resolve, reject) => commonLib.getState(req._adapter, oId[0], req._user, (error, state, id, originId) =>
                        error ? reject(error) : resolve({state, id, originId})));

                    if (!id) {
                        res.status(404).json({error: 'ID not found', id: originId});
                    } else if (!state || typeof state !== 'object') {
                        res.status(404).json({error: 'State not found', id: originId});
                    } else {
                        if (req.query.extraPlain === 'true') {
                            if (state.val === null) {
                                res.send('null');
                            } else if (state.val === undefined) {
                                res.send('undefined');
                            } else {
                                res.send(state.val.toString());
                            }
                        } else {
                            res.send(JSON.stringify(state.val));
                        }
                    }
                } catch (error) {
                    commonLib.errorResponse(req, res, error, {id: oId});
                }
            }
        });
    },

    listStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'list'}], error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                req._adapter.getForeignStates(req.query.filter || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                }, (error, list) => {
                    if (error) {
                        commonLib.errorResponse(req, res, error, {filter: req.query.filter});
                    } else {
                        res.json(list || []);
                    }
                });
            }
        });
    },

    subscribeStateGet: subscribeState,

    subscribeState: subscribeState,

    unsubscribeState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);

                let url = req.body.url;
                if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                    url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                }

                if (!url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                    return;
                }

                try {
                    await req._swaggerObject.unregisterSubscribe(url, params.stateId, 'state', req._user, (req.query && req.query.method) || (req.body && req.body.method));
                    res.status(200).json({result: 'OK'});
                } catch (error) {
                    commonLib.errorResponse(req, res, error, {stateId: params.stateId});
                }
            }
        });
    },

    subscribeStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                let url = req.body.url;
                if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                    url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                }

                if (!url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                    return;
                }

                if (!req.body.pattern) {
                    res.status(422).json({
                        error: 'pattern not provided',
                        expectedBody: {url: 'http://ipaddress:9000/hook/', pattern: 'system.adapter.admin.0.*'}
                    });
                    return;
                }
                try {
                    await req._swaggerObject.registerSubscribe(url, req.body.pattern, 'state', req._user, {
                        method: req.body.method,
                        onchange: req.body.onchange === 'true',
                        delta: req.body.delta !== undefined ? parseFloat(req.body.delta) : undefined,
                    });
                } catch (error) {
                    commonLib.errorResponse(req, res, error, {pattern: req.body.pattern, url: req.body.url});
                }
            }
        });
    },

    unsubscribeStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                let url = req.body.url;
                if (req.body.method === 'polling') {
                    url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                }

                if (!url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                    return;
                }
                try {
                    await req._swaggerObject.unregisterSubscribe(url, req.body.pattern, 'state', req._user, req.body.method);
                    res.status(200).json({result: 'OK'});
                } catch (error) {
                    commonLib.errorResponse(req, res, error, {pattern: req.body.pattern, url: req.body.url});
                }
            }
        });
    },

    getStatesSubscribes: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                let url = req.body.url;
                if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                    url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                }

                if (!url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                    return;
                }

                try {
                    const result = await req._swaggerObject.getSubscribes(url, req.body.pattern, 'state');
                    if (result === null) {
                        res.status(404).json({error: 'URL or session not found'});
                        return;
                    }
                    res.json({states: result});
                } catch (error) {
                    commonLib.errorResponse(req, res, error, {pattern: req.body.pattern, url: req.body.url});
                }
            }
        });
    },
};
