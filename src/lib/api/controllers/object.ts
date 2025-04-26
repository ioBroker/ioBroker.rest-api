import { checkPermissions, errorResponse, parseUrl } from './common';
import type { RequestExt } from '../../types';
import type { Response } from 'express';

export function readObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            void req._adapter.getForeignObject(
                params.objectId,
                { user: req._user, limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner },
                (error, obj) => {
                    if (error) {
                        errorResponse(req, res, error?.toString(), { objectId: req.query.objectId });
                    } else {
                        if (!obj) {
                            res.status(404).json({ error: 'object not found' });
                        } else {
                            res.json(obj);
                        }
                    }
                },
            );
        }
    });
}

export function updateObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
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
                } else {
                    // merge objects together
                    Object.keys(body).forEach(attr => {
                        if (body[attr] === null || body[attr] === undefined) {
                            delete (obj as any)[attr];
                        } else if (typeof body[attr] === 'object') {
                            (obj as any)[attr] ||= {};
                            Object.keys(body[attr]).forEach(attr2 => {
                                if (body[attr][attr2] === null) {
                                    delete (obj as any)[attr][attr2];
                                } else {
                                    (obj as any)[attr][attr2] = body[attr][attr2];
                                }
                            });
                        } else {
                            (obj as any)[attr] = body[attr];
                        }
                    });
                    await req._adapter.setForeignObject(params.objectId, obj, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(obj);
                }
            } catch (error) {
                errorResponse(req, res, error, { objectId: params.objectId });
            }
        }
    });
}

export function createObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
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
                } else {
                    res.status(409).json({ error: 'Object already exists', id: params.objectId });
                }
            } catch (error) {
                errorResponse(req, res, error, { objectId: params.objectId });
            }
        }
    });
}

export function deleteObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'write' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            try {
                const obj = await req._adapter.getForeignObjectAsync(params.objectId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    res.status(404).json({ objectId: params.objectId, error: 'object not found' });
                } else {
                    await req._adapter.delForeignObjectAsync(params.objectId, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json({});
                }
            } catch (error) {
                errorResponse(req, res, error, { objectId: params.objectId });
            }
        }
    });
}

export function listObjects(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            if (req.query.type) {
                req._adapter.getForeignObjects(
                    (req.query.filter as string) || '*',
                    req.query.type as ioBroker.ObjectType,
                    {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    },
                    (error, list) => {
                        if (error) {
                            errorResponse(req, res, error?.toString(), { filter: req.query.filter });
                        } else {
                            res.json(list || []);
                        }
                    },
                );
            } else {
                req._adapter.getForeignObjects(
                    (req.query.filter as string) || '*',
                    {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    },
                    (error, list) => {
                        if (error) {
                            errorResponse(req, res, error?.toString(), { filter: req.query.filter });
                        } else {
                            res.json(list || []);
                        }
                    },
                );
            }
        }
    });
}

export function subscribeObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);

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
                const obj = await req._adapter.getForeignObjectAsync(params.stateId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!obj) {
                    res.status(404).json({ error: 'object not found' });
                } else {
                    await req._swaggerObject.registerSubscribe(
                        url,
                        params.objectId,
                        'object',
                        req._user,
                        (req.query && req.query.method) || (req.body && req.body.method),
                    );
                    const obj = await req._adapter.getForeignStateAsync(params.objectId, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.status(200).json(obj);
                }
            } catch (error) {
                req._adapter.log.warn(`Cannot read ${params.objectId}: ${error}`);
                errorResponse(req, res, error, { objectId: params.objectId });
            }
        }
    });
}

export function unsubscribeObject(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);

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
            } catch (error) {
                errorResponse(req, res, error, { objectId: params.objectId });
            }
        }
    });
}

export function subscribeObjects(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
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
                await req._swaggerObject.registerSubscribe(url, req.body.pattern, 'object', req._user, req.body.method);
            } catch (error) {
                errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}

export function unsubscribeObjects(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
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
            } catch (error) {
                errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}

export function getObjectsSubscribes(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
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
            } catch (error) {
                errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}
