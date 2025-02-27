const ERROR_PERMISSION = 'permissionError';

function checkPermissions(adapter, user, requiredRights, callback) {
    adapter.calculatePermissions(user, requiredRights, acl => {
        if (user !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendto
            if (requiredRights && requiredRights[0] && acl) {
                // If permission required
                if (requiredRights[0].type) {
                    if (acl[requiredRights[0].type] && acl[requiredRights[0].type][requiredRights[0].operation]) {
                        return callback(null);
                    }
                } else {
                    return callback(null);
                }
            }

            adapter.log.warn(`No permission for "${user}" to call ${JSON.stringify(requiredRights)}`);

            callback(ERROR_PERMISSION);
        } else {
            return callback(null);
        }
    });
}

function findState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    adapter.findForeignObject(
        idOrName,
        type,
        { user, checked: true, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
        callback,
    );
}

function getState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    findState(adapter, idOrName, user, type, (err, id, originId) => {
        if (err && (!err.message || !err.message.includes('permissionError'))) {
            callback && callback(err, undefined, null, originId);
        } else {
            if (err && err.message.includes('permissionError')) {
                // assume it is ID
                id = idOrName;
            }
            if (id) {
                adapter.getForeignState(
                    id,
                    { user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
                    (err, state) => {
                        if (err || !state) {
                            state = undefined;
                        }
                        callback && callback(err, state, id, originId);
                    },
                );
            } else {
                callback && callback(null, undefined, null, originId);
            }
        }
    });
}

function getBinaryState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    findState(adapter, idOrName, user, type, (err, id, originId) => {
        if (err && (!err.message || !err.message.includes('permissionError'))) {
            callback && callback(err, undefined, null, originId);
        } else {
            if (err && err.message.includes('permissionError')) {
                // assume it is ID
                id = idOrName;
            }
            if (id) {
                if (adapter.getForeignBinaryState) {
                    adapter.getForeignBinaryState(
                        id,
                        { user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
                        (err, binary) => {
                            if (err) {
                                binary = undefined;
                            }
                            callback && callback(err, binary, id, originId);
                        },
                    );
                } else {
                    adapter.getBinaryState(
                        id,
                        { user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
                        (err, binary) => {
                            if (err) {
                                binary = undefined;
                            }
                            callback && callback(err, binary, id, originId);
                        },
                    );
                }
            } else {
                callback && callback(null, undefined, null, originId);
            }
        }
    });
}

function parseUrl(url, swagger, webExtensionPrefix) {
    // "/v1/object/adapter.system.admin.0.alive"
    const parts = url.split('?')[0].split('/');
    if (parts[1] === webExtensionPrefix) {
        parts.shift(); // /
        parts.shift(); // remove swagger
        parts.shift(); // remove v1
        parts.shift(); // remove objects or states
    } else {
        parts.shift(); // /
        parts.shift(); // remove v1
        parts.shift(); // remove objects or states
    }
    const result = {};
    if (swagger && swagger.operation && swagger.operation.parameters) {
        let i = 0;
        swagger.operation.parameters.forEach(param => {
            if (param.in === 'path') {
                result[param.name] = parts[i] !== undefined ? decodeURIComponent(parts[i]) : '';
                i++;
            }
        });
    } else {
        parts.forEach((param, i) => (result['arg' + i] = decodeURIComponent(param)));
    }

    return result;
}

function errorResponse(req, res, error, response) {
    error = error.toString();
    if (error === 'Error: permissionError') {
        error = 'permissionError';
    }

    req._adapter.log.warn(`Warning by "${req.url}": ${error}`);

    res.status(error.toString().includes('permissionError') ? 403 : 500).json(
        Object.assign(response || {}, { error: error }),
    );
}

module.exports = {
    checkPermissions,
    findState,
    getState,
    getBinaryState,
    parseUrl,
    errorResponse,
};
