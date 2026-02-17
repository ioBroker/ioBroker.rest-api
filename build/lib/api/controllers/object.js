"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readObject = readObject;
exports.updateObject = updateObject;
exports.createObject = createObject;
exports.deleteObject = deleteObject;
exports.listObjects = listObjects;
exports.subscribeObject = subscribeObject;
exports.unsubscribeObject = unsubscribeObject;
exports.subscribeObjects = subscribeObjects;
exports.unsubscribeObjects = unsubscribeObjects;
exports.getObjectsSubscribes = getObjectsSubscribes;
const common_1 = require("./common");
function readObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], error => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            void req._adapter.getForeignObject(params.objectId, { user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner }, (error, obj) => {
                if (error) {
                    (0, common_1.errorResponse)(req, res, error?.toString(), { objectId: req.query.objectId });
                }
                else {
                    if (!obj) {
                        res.status(404).json({ error: 'object not found' });
                    }
                    else {
                        res.json(obj);
                    }
                }
            });
        }
    });
}
function updateObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const body = req.body;
            try {
                const obj = await req._adapter.getForeignObjectAsync(params.objectId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    await req._adapter.setForeignObject(params.objectId, body, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(body);
                }
                else {
                    // merge objects together
                    Object.keys(body).forEach(attr => {
                        if (body[attr] === null || body[attr] === undefined) {
                            delete obj[attr];
                        }
                        else if (typeof body[attr] === 'object') {
                            obj[attr] ||= {};
                            Object.keys(body[attr]).forEach(attr2 => {
                                if (body[attr][attr2] === null) {
                                    delete obj[attr][attr2];
                                }
                                else {
                                    obj[attr][attr2] = body[attr][attr2];
                                }
                            });
                        }
                        else {
                            obj[attr] = body[attr];
                        }
                    });
                    await req._adapter.setForeignObject(params.objectId, obj, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(obj);
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { objectId: params.objectId });
            }
        }
    });
}
function createObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const body = req.body;
            try {
                const obj = await req._adapter.getForeignObjectAsync(params.objectId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    await req._adapter.setForeignObject(params.objectId, body, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(body);
                }
                else {
                    res.status(409).json({ error: 'Object already exists', id: params.objectId });
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { objectId: params.objectId });
            }
        }
    });
}
function deleteObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            try {
                const obj = await req._adapter.getForeignObjectAsync(params.objectId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    res.status(404).json({ objectId: params.objectId, error: 'object not found' });
                }
                else {
                    await req._adapter.delForeignObjectAsync(params.objectId, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json({});
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { objectId: params.objectId });
            }
        }
    });
}
function listObjects(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], error => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            if (req.query.type) {
                req._adapter.getForeignObjects(req.query.filter || '*', req.query.type, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                }, (error, list) => {
                    if (error) {
                        (0, common_1.errorResponse)(req, res, error?.toString(), { filter: req.query.filter });
                    }
                    else {
                        res.json(list || []);
                    }
                });
            }
            else {
                req._adapter.getForeignObjects(req.query.filter || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                }, (error, list) => {
                    if (error) {
                        (0, common_1.errorResponse)(req, res, error?.toString(), { filter: req.query.filter });
                    }
                    else {
                        res.json(list || []);
                    }
                });
            }
        }
    });
}
function subscribeObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let url = req.body.url;
            if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }
            try {
                const obj = await req._adapter.getForeignObjectAsync(params.objectId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    res.status(404).json({ error: 'object not found' });
                }
                else {
                    await req._swaggerObject.registerSubscribe(url, params.objectId, 'object', req._user, (req.query && req.query.method) || (req.body && req.body.method));
                    const currentObj = await req._adapter.getForeignObjectAsync(params.objectId, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(currentObj);
                }
            }
            catch (error) {
                req._adapter.log.warn(`Cannot read ${params.objectId}: ${error}`);
                (0, common_1.errorResponse)(req, res, error, { objectId: params.objectId });
            }
        }
    });
}
function unsubscribeObject(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let url = req.body.url;
            if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }
            try {
                await req._swaggerObject.unregisterSubscribe(url, params.objectId, 'object', req._user);
                res.status(200).json({ result: 'OK' });
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { objectId: params.objectId });
            }
        }
    });
}
function subscribeObjects(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            let url = req.body.url;
            if (req.body.method === 'polling') {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }
            if (!req.body.pattern) {
                res.status(422).json({
                    error: 'pattern not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/', pattern: 'system.adapter.admin.0.*' },
                });
                return;
            }
            try {
                const error = await req._swaggerObject.registerSubscribe(url, req.body.pattern, 'object', req._user, req.body.method);
                if (error) {
                    (0, common_1.errorResponse)(req, res, error, { pattern: req.body.pattern, url: req.body.url });
                }
                else {
                    res.status(200).json({ result: 'OK' });
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}
function unsubscribeObjects(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            let url = req.body.url;
            if (req.body.method === 'polling') {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }
            try {
                await req._swaggerObject.unregisterSubscribe(url, req.body.pattern, 'object', req._user);
                res.status(200).json({ result: 'OK' });
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}
function getObjectsSubscribes(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'state', operation: 'read' }], error => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            let url = req.body.url;
            if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }
            try {
                const result = req._swaggerObject.getSubscribes(url, req.body.pattern, 'object');
                if (result === null) {
                    res.status(404).json({ error: 'URL or session not found' });
                    return;
                }
                res.json({ states: result });
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}
//# sourceMappingURL=object.js.map