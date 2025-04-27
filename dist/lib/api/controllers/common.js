"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPermissions = checkPermissions;
exports.findState = findState;
exports.getState = getState;
exports.parseUrl = parseUrl;
exports.errorResponse = errorResponse;
const ERROR_PERMISSION = 'permissionError';
function checkPermissions(adapter, user, requiredRights, callback) {
    void adapter.calculatePermissions(user, requiredRights, (acl) => {
        if (user !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendto
            if (requiredRights?.[0] && acl) {
                // If permission required
                if (requiredRights[0].type) {
                    const aclType = acl[requiredRights[0].type];
                    if (aclType && aclType[requiredRights[0].operation]) {
                        callback(null);
                        return;
                    }
                }
                else {
                    callback(null);
                    return;
                }
            }
            adapter.log.warn(`No permission for "${user}" to call ${JSON.stringify(requiredRights)}`);
            callback(ERROR_PERMISSION);
        }
        else {
            callback(null);
        }
    });
}
function findState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    adapter.findForeignObject(idOrName, type, 
    // @ts-expect-error fixed in js-controller
    { user, checked: true, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner }, callback);
}
function getState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    findState(adapter, idOrName, user, type, (err, id, originId) => {
        if (err && (!err.message || !err.message.includes('permissionError'))) {
            callback?.(err, undefined, null, originId);
        }
        else {
            if (err?.message.includes('permissionError')) {
                // assume it is ID
                id = idOrName;
            }
            if (id) {
                void adapter.getForeignState(id, { user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner }, (err, state) => {
                    if (err || !state) {
                        state = undefined;
                    }
                    callback?.(err, state, id, originId);
                });
            }
            else {
                callback?.(null, undefined, null, originId);
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
    }
    else {
        parts.shift(); // /
        parts.shift(); // remove v1
        parts.shift(); // remove objects or states
    }
    const result = {};
    if (swagger?.operation?.parameters) {
        let i = 0;
        swagger.operation.parameters.forEach((param) => {
            if (param.in === 'path') {
                result[param.name] = parts[i] !== undefined ? decodeURIComponent(parts[i]) : '';
                i++;
            }
        });
    }
    else {
        parts.forEach((param, i) => (result[`arg${i}`] = decodeURIComponent(param)));
    }
    return result;
}
function errorResponse(req, res, error, response, responseCode) {
    error = error.toString();
    if (error === 'Error: permissionError') {
        error = 'permissionError';
    }
    req._adapter.log.warn(`Warning by "${req.url}": ${error}`);
    if (typeof response === 'number') {
        res.status(response).json({ error });
    }
    else {
        res.status(responseCode || (error.toString().includes('permissionError') ? 403 : 500)).json(Object.assign(response || {}, { error }));
    }
}
//# sourceMappingURL=common.js.map