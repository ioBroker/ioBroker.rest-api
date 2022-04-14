'use strict';
const commonLib = require('./common.js');

function getIDs(oids) {
    return (oids || '').toString().split(',').map(t => t.trim()).filter(t => t);
}

async function updateState(adapter, user, id, timeout, val, res) {
    if (val && typeof val !== 'object') {
        if (val === 'true' || val === 'false') {
            const obj = await adapter.getForeignObjectAsync(id);
            if (obj && obj.common && obj.common.type === 'boolean') {
                val = val === 'true';
            }
        } else if (typeof val === 'string' && !isNaN(val)) {
            const obj = await adapter.getForeignObjectAsync(id);
            if (obj && obj.common && obj.common.type === 'number') {
                val = parseFloat(val);
            }
        }
    }

    try {
        if (!timeout) {
            if (typeof val !== 'object') {
                await adapter.setForeignState(id, val, false, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            } else {
                await adapter.setForeignState(id, val, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            }

            res.json({id, val});
        } else {
            await adapter._addTimeout({id, val, res, timeout});
            if (typeof val !== 'object') {
                await adapter.setForeignState(id, val, false, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            } else {
                await adapter.setForeignState(id, val, {user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner});
            }
        }
    } catch (error) {
        res.status(500).json({error, id});
    }
}

module.exports = {
    updateState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);
                const oId = getIDs(params.stateId);
                let timeout = 0;
                if (req.query.timeout) {
                    timeout = parseInt(req.query.timeout, 10);

                    if (timeout > 60000) {
                        timeout = 60000;
                    } // maximum 1 minute
                }

                commonLib.findState(req._adapter, oId[0], req._user, async (err, id, originId) => {
                    if (err) {
                        res.status(500).json({error: err, id: originId});
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
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);
                const oId = getIDs(params.stateId);
                let timeout = 0;
                if (req.query.timeout) {
                    timeout = parseInt(req.query.timeout, 10);

                    if (timeout > 60000) {
                        timeout = 60000;
                    } // maximum 1 minute
                }

                commonLib.findState(req._adapter, oId[0], req._user, async (err, id, originId) => {
                    if (err) {
                        res.status(500).json({error: err, id: originId});
                    } else if (!id) {
                        res.status(404).json({error: 'ID not found', id: originId});
                    } else {
                        try {
                            const state = await req._adapter.getForeignStateAsync(id, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner});
                            if (!state || typeof state !== 'object') {
                                res.status(500).json({error: 'State not initiated', id: originId});
                            } else {
                                const obj = await req._adapter.getForeignObjectAsync(id, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner});
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
                                            val = val === obj.common.max ? obj.common.min : obj.common.max;
                                        } else {
                                            val = parseFloat(val);
                                        }
                                    }
                                }

                                await updateState(req._adapter, req._user, id, timeout, val, res);
                            }
                        } catch (error) {
                            res.status(500).json({error: err, id: originId});
                        }
                    }
                });
            }
        });
    },

    readState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);
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
                        const {state, id, originId} = await new Promise((resolve, reject) => commonLib.getState(req._adapter, oId[k], req._user, (err, state, id, originId) =>
                            err ? reject(err) : resolve({state, id, originId})));

                        if (!id) {
                            res.status(404).json({error: 'ID not found', id: originId});
                            return;
                        } else {
                            if (req.query.value !== undefined) {
                                await updateState(req._adapter, req._user, id, timeout, req.query.value, res);
                                return;
                            }

                            const vObj = state || {};
                            if (req.query.withInfo === 'true') {
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
                        res.status(500).json({error: err, id: oId});
                        return;
                    }
                }

                res.json(result);
            }
        });
    },

    plainState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);
                const oId = getIDs(params.stateId);
                try {
                    const {state, id, originId} = await new Promise((resolve, reject) => commonLib.getState(req._adapter, oId[0], req._user, (err, state, id, originId) =>
                        err ? reject(err) : resolve({state, id, originId})));

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
                    res.status(500).json({error: err, id: oId});
                }
            }
        });
    },

    listStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'list'}], err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                req._adapter.getForeignStates(req.query.filter || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                }, function (err, list) {
                    if (err) {
                        res.status(500).json({error: err, filter: req.query.filter});
                    } else {
                        res.json(list || []);
                    }
                });
            }
        });
    },

    subscribeState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);

                if (!req.body.url) {
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
                        const error = await req._swaggerObject.registerSubscribe(req.body.url, params.stateId, 'state', req._user);
                        if (error) {
                            res.status(500).json({error, stateId: params.stateId, url: req.body.url});
                            return;
                        }
                        const state = await req._adapter.getForeignStateAsync(params.stateId, {user: req._user});
                        res.status(200).json(state);
                    }
                } catch (error) {
                    res.status(500).json({error, stateId: params.stateId});
                }
            }
        });
    },

    unsubscribeState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger);

                if (!req.body.url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/'}});
                    return;
                }
                try {
                    await req._swaggerObject.unregisterSubscribe(req.body.url, params.stateId, 'state', req._user);
                    res.status(200).json({result: 'OK'});
                } catch (error) {
                    res.status(500).json({error, stateId: params.stateId});
                }
            }
        });
    },

    subscribeStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (!req.body.url) {
                    res.status(422).json({
                        error: 'url not provided',
                        expectedBody: {url: 'http://ipaddress:9000/hook/', pattern: 'system.adapter.admin.0.*'}
                    });
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
                    await req._swaggerObject.registerSubscribe(req.body.url, req.body.pattern, 'state', req._user);
                } catch (error) {
                    res.status(500).json({error, pattern: req.body.pattern, url: req.body.url});
                }
            }
        });
    },

    unsubscribeStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                if (!req.body.url) {
                    res.status(422).json({error: 'url not provided', expectedBody: {url: 'http://ipaddress:9000/hook/', pattern: 'system.adapter.admin.0.*'}});
                    return;
                }

                try {
                    await req._swaggerObject.unregisterSubscribe(req.body.url, req.body.pattern, 'state', req._user);
                    res.status(200).json({result: 'OK'});
                } catch (error) {
                    res.status(500).json({error, pattern: req.body.pattern, url: req.body.url});
                }
            }
        });
    },
};