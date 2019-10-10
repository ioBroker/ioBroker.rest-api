const ERROR_PERMISSION = 'permissionError';

function checkPermissions(adapter, user, requiredRights, callback) {
    adapter.calculatePermissions(user, requiredRights, acl => {
        if (user !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendto
            if (requiredRights && requiredRights[0] && acl) {
                // If permission required
                if (requiredRights[0].type) {
                    if (acl[requiredRights[0].type] &&
                        acl[requiredRights[0].type][requiredRights[0].operation]) {
                        return callback(null);
                    }
                } else {
                    return callback(null);
                }
            }

            adapter.log.warn('No permission for "' + user + '" to call ' + JSON.stringify(requiredRights));

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
    adapter.findForeignObject(idOrName, type, {user: user, checked: true}, callback);
}

function getState(adapter, idOrName, user, type, callback) {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    findState(adapter, idOrName, user, type, (err, id, originId) => {
        if (err) {
            callback && callback(err, undefined, null, originId);
        } else
        if (id) {
            adapter.getForeignState(id, {user: user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner}, (err, state) => {
                if (err || !state) {
                    state = undefined;
                }
                callback && callback (err, state, id, originId);
            });
        } else {
            callback && callback(null, undefined, null, originId);
        }
    });
}

module.exports = {
    checkPermissions:   checkPermissions,
    findState:          findState,
    getState:           getState
};
