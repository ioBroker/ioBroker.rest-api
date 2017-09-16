'use strict';
var commonLib = require(__dirname + '/common.js');

function getIDs(oids) {
    var result = (oids || '').toString().split(',');
    for (var j = result.length - 1; j >= 0; j--) {
        result[j] = result[j].trim();
        if (!result[j]) result.splice(j, 1);
    }

    return result;
}

module.exports = {
    updateState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                var oId  = getIDs(req.swagger.params.stateId.value);
                var timeout = 0;
                if (req.swagger.params.timeout && req.swagger.params.timeout.value) {
                    timeout = parseInt(req.swagger.params.timeout.value, 10);
                    if (timeout > 60000) timeout = 60000; // maximum 1 minute
                }

                var value = req.swagger.params.value.value;

                if (value === 'true') {
                    value = true;
                } else if (value === 'false') {
                    value = false;
                } else if (!isNaN(value)) {
                    value = parseFloat(value);
                }

                commonLib.findState(req._adapter, oId[0], req._user, function (err, id, originId) {
                    if (err) {
                        if (res) {
                            res.status(500).json({error: err, id: originId});
                            res = null;
                        }
                    } else if (!id) {
                        if (res) {
                            res.status(404).json({error: 'ID not found', id: originId});
                            res = null;
                        }
                    } else {
                        req._adapter.setForeignState(id, value, false, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner}, function (err) {
                            if (err) {
                                if (res) {
                                    res.status(500).json({error: err, id: originId});
                                    res = null;
                                }
                            } else if (!timeout) {
                                res.json({id: id, val: value});
                            } else {
                                req._adapter._addTimeout({
                                    id:  id,
                                    val: value,
                                    res: res,
                                    timeout: timeout
                                });
                            }
                        });
                    }
                });
            }
        });
    },

    toggleState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                var oId  = getIDs(req.swagger.params.stateId.value);
                var timeout = 0;
                if (req.swagger.params.timeout && req.swagger.params.timeout.value) {
                    timeout = parseInt(req.swagger.params.timeout.value, 10);
                    if (timeout > 60000) timeout = 60000; // maximum 1 minute
                }

                commonLib.findState(req._adapter, oId[0], req._user, function (err, id, originId) {
                    if (err) {
                        if (res) {
                            res.status(500).json({error: err, id: originId});
                            res = null;
                        }
                    } else if (!id) {
                        if (res) {
                            res.status(404).json({error: 'ID not found', id: originId});
                            res = null;
                        }
                    } else {
                        req._adapter.getForeignState(id, {user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner}, function (err, state) {
                            if (err) {
                                if (res) {
                                    res.status(500).json({error: err, id: originId});
                                    res = null;
                                }
                            } else if (!state || typeof state !== 'object') {
                                if (res) {
                                    res.status(500).json({error: 'State not initiated', id: originId});
                                    res = null;
                                }
                            } else {
                                if (state.val === 'true') {
                                    state.val = 'false';
                                } else if (state.val === 'false') {
                                    state.val = 'true';
                                } else if (state.val === 'on') {
                                    state.val = 'off';
                                } else if (state.val === 'off') {
                                    state.val = 'on';
                                } else if (state.val === 'OFF') {
                                    state.val = 'ON';
                                } else if (state.val === 'ON') {
                                    state.val = 'OFF';
                                } else if (state.val === '0') {
                                    state.val = '1';
                                } else if (state.val === '1') {
                                    state.val = '0';
                                } else if (typeof state.val === 'number') {
                                    state.val = state.val ? 0 : 1;
                                } else {
                                    state.val = !state.val;
                                }

                                req._adapter.setForeignState(id, state.val, false, {
                                    user: req._user,
                                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                                }, function (err) {
                                    if (err) {
                                        if (res) {
                                            res.status(500).json({error: err, id: originId});
                                            res = null;
                                        }
                                    } else if (!timeout) {
                                        res.json({id: id, val: state.val});
                                    } else {
                                        req._adapter._addTimeout({
                                            id:  id,
                                            val: state.val,
                                            res: res,
                                            timeout: timeout
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    },

    readState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                var oId = getIDs(req.swagger.params.stateId.value);
                var counter = oId.length;
                var result;
                for (var k = 0; k < oId.length; k++) {
                    commonLib.getState(req._adapter, req.swagger.params.stateId.value, req._user, function (err, state, id, originId) {
                        if (err) {
                            if (res) {
                                res.status(500).json({error: err, id: originId});
                                res = null;
                            }
                        } else if (!id) {
                            if (res) {
                                res.status(404).json({error: 'ID not found', id: originId});
                                res = null;
                            }
                        } else if (res) {
                            var vObj = state || {};
                            req._adapter.getForeignObject(id, function (err, obj) {
                                // copy all attributes of the object into state
                                if (obj) {
                                    for (var attr in obj) {
                                        if (obj.hasOwnProperty(attr)) {
                                            if (attr === '_id') {
                                                vObj.id = obj._id;
                                            } else {
                                                vObj[attr] = obj[attr];
                                            }
                                        }
                                    }
                                }

                                if (!result) {
                                    result = vObj;
                                } else {
                                    if (typeof result !== 'object' || !result instanceof Array) result = [result];
                                    result.push(vObj);
                                }

                                if (!--counter) res.json(result);
                            });

                        }
                    });
                }
            }
        });
    },

    plainState: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'read'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                var oId = getIDs(req.swagger.params.stateId.value);
                commonLib.getState(req._adapter, oId[0], req._user, function (err, state, id, originId) {
                    if (err) {
                        res.status(500).json({error: err, id: originId});
                    } else if (!id) {
                        res.status(404).json({error: 'ID not found', id: originId});
                    } else if (!state || typeof state !== 'object') {
                        res.status(404).json({error: 'State not found', id: originId});
                    } else {
                        res.json(state.val);
                    }
                });
            }
        });
    },

    listStates: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'list'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                req._adapter.getForeignStates(req.swagger.params.filter.value || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                }, function (err, list) {
                    if (err) {
                        res.status(500).json({error: err, filter: req.swagger.params.filter});
                    } else {
                        res.json(list || []);
                    }
                });
            }
        });
    },

    listObjects: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'object', operation: 'list'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                req._adapter.getForeignObjects(req.swagger.params.filter.value || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                }, function (err, list) {
                    if (err) {
                        res.status(500).json({error: err, filter: req.swagger.params.filter});
                    } else {
                        res.json(list || []);
                    }
                });
            }
        });
    },

    subscribe: function (req, res) {
        // todo
        res.status(403).json({error: 'Not implemented'});
    },

    unsubscribe: function (req, res) {
        // todo
        res.status(403).json({error: 'Not implemented'});
    }
};