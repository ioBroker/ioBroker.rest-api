import { checkPermissions, errorResponse, parseUrl, findState, getState } from './common';
import type { RequestExt } from '../../types';
import type { Response } from 'express';

function getIDs(oids: string): string[] {
    return (oids || '')
        .toString()
        .split(',')
        .map(t => t.trim())
        .filter(t => t);
}

/** Maximal number of states, that can be written with one bulk request */
const MAX_BULK_STATES = 1000;

/** Convert "true"/"false" and numeric strings into boolean/number if the object has such type */
async function _convertValue<T extends ioBroker.StateValue | ioBroker.State>(
    req: RequestExt,
    id: string,
    val: T,
): Promise<T> {
    if (val && typeof val !== 'object') {
        if (val === 'true' || val === 'false') {
            const obj = await req._adapter.getForeignObjectAsync(id, {
                user: req._user,
                limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
            });
            if (obj?.common?.type === 'boolean') {
                return (val === 'true') as T;
            }
        } else if (typeof val === 'string' && isFinite(val as unknown as number)) {
            try {
                const obj = await req._adapter.getForeignObjectAsync(id, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (obj?.common?.type === 'number') {
                    return parseFloat(val) as T;
                }
            } catch (error) {
                req._adapter.log.warn(`Cannot read object ${id}: ${error.toString()}`);
                return parseFloat(val) as T;
            }
        }
    }
    return val;
}

async function _updateState(
    req: RequestExt,
    res: Response,
    id: string,
    timeout: number,
    val: ioBroker.StateValue | ioBroker.State,
    ack?: boolean,
): Promise<void> {
    val = await _convertValue(req, id, val);

    try {
        if (!timeout) {
            if (typeof val !== 'object') {
                await req._adapter.setForeignStateAsync(id, val, !!ack, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
            } else {
                await req._adapter.setForeignStateAsync(id, val, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
            }
            if (typeof val === 'object') {
                res.json({ ...(val as ioBroker.State), id });
            } else {
                res.json({ val, id });
            }
        } else {
            await req._adapter._addTimeout!({ id, val: val as ioBroker.State, res, timeout });

            if (typeof val !== 'object') {
                await req._adapter.setForeignStateAsync(id, val, !!ack, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
            } else {
                await req._adapter.setForeignStateAsync(id, val, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
            }
        }
    } catch (error) {
        errorResponse(req, res, error, { id });
    }
}

export function subscribeState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
        if (error) {
            res.status(403).json({ error: error });
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let url = req.body?.url;
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
                const obj = await req._adapter.getForeignObjectAsync(params.stateId, { user: req._user });
                if (!obj) {
                    res.status(404).json({ error: 'object not found', url: req.body.url });
                } else if (obj.type !== 'state') {
                    res.status(500).json({
                        error: 'Cannot subscribe on non-state',
                        stateId: params.stateId,
                        type: obj.type,
                        url: req.body.url,
                    });
                } else {
                    const error = await req._swaggerObject.registerSubscribe(url, params.stateId, 'state', req._user, {
                        method: req.query?.method || req.body?.method,
                        delta: req.query?.delta || req.body?.delta,
                        onchange: req.query?.onchange || req.body?.onchange,
                    });
                    if (error) {
                        errorResponse(req, res, error, { stateId: params.stateId, url: req.body.url });
                        return;
                    }
                    const state = await req._adapter.getForeignStateAsync(params.stateId, { user: req._user });
                    res.status(200).json(state);
                }
            } catch (error) {
                errorResponse(req, res, error, { stateId: params.stateId });
            }
        }
    });
}

export const subscribeStateGet = subscribeState;

function _toggleState(req: RequestExt, res: Response, oId: string): void {
    let timeout = 0;
    if (req.query.timeout) {
        timeout = parseInt(req.query.timeout as string, 10);

        if (timeout > 60000) {
            timeout = 60000;
        } // maximum 1 minute
    }

    findState(req._adapter, oId, req._user, async (error, id, originId) => {
        if (error?.message?.includes('permissionError')) {
            // assume it is ID
            id = oId;
            error = null;
        }
        if (error) {
            errorResponse(req, res, error?.toString(), { id: oId });
        } else if (!id) {
            res.status(404).json({ error: 'ID not found', id: originId });
        } else {
            try {
                const state = await req._adapter.getForeignStateAsync(id, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (!state || typeof state !== 'object') {
                    res.status(500).json({ error: 'State not initiated', id: originId });
                } else {
                    let obj;
                    try {
                        obj = await req._adapter.getForeignObjectAsync(id, {
                            user: req._user,
                            limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                        });
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

                    if (obj?.common) {
                        if (obj.common.type === 'boolean') {
                            state.val = state.val === 'true' || state.val === true;
                        } else if (obj.common.type === 'number') {
                            if (obj.common.min !== undefined && obj.common.max !== undefined) {
                                val = parseFloat(state.val as string);
                                if (val > obj.common.max) {
                                    val = obj.common.max;
                                } else if (val < obj.common.min) {
                                    val = obj.common.min;
                                }
                                val = obj.common.max + obj.common.min - val;
                            } else {
                                val = parseFloat(val as string);
                            }
                        }
                    }

                    await _updateState(req, res, id, timeout, val);
                }
            } catch (error) {
                errorResponse(req, res, error, { id: oId });
            }
        }
    });
}

export function updateState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'write' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const oId = getIDs(params.stateId);
            let timeout = 0;
            if (req.query.timeout) {
                timeout = parseInt(req.query.timeout as string, 10);

                if (timeout > 60000) {
                    timeout = 60000;
                } // maximum 1 minute
            }

            findState(req._adapter, oId[0], req._user, async (error, id, originId) => {
                if (error?.message?.includes('permissionError')) {
                    // assume it is ID
                    id = oId[0];
                    error = null;
                }

                if (error) {
                    errorResponse(req, res, error?.toString(), { id: oId[0] });
                } else if (!id) {
                    res.status(404).json({ error: 'ID not found', id: originId });
                } else {
                    await _updateState(req, res, id, timeout, req.body);
                }
            });
        }
    });
}

type BulkStateItem = Partial<ioBroker.SettableState> & { id: string };
type BulkStateResult =
    | { id: string; val: ioBroker.StateValue; ack: boolean }
    | { id?: string; index: number; error: string };

/** Accepts `[{ id, val, ack, ... }]` or `{ "<id>": value | { val, ack, ... } }` and returns a list in the given order */
function _normalizeBulkBody(body: any): BulkStateItem[] | null {
    if (Array.isArray(body)) {
        return body;
    }
    if (body && typeof body === 'object') {
        return Object.keys(body).map(id => {
            const value = body[id];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return { ...value, id };
            }
            return { id, val: value };
        });
    }
    return null;
}

function _findStateAsync(req: RequestExt, idOrName: string): Promise<string | undefined> {
    return new Promise((resolve, reject) =>
        findState(req._adapter, idOrName, req._user, (error, id) => {
            if (error?.message?.includes('permissionError')) {
                // assume it is ID. setForeignState will check the permissions
                resolve(idOrName);
            } else if (error) {
                reject(error);
            } else {
                resolve(id);
            }
        }),
    );
}

/**
 * Write many states with one request. States are written sequentially in the given order.
 * It is not a transaction: every state fires its own change event, and states written before an error remain written.
 */
export function updateStates(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'write' }], async error => {
        if (error) {
            errorResponse(req, res, error);
            return;
        }
        const items = _normalizeBulkBody(req.body);
        if (!items?.length) {
            res.status(422).json({
                error: 'Body must be a non-empty array of states or an object with IDs as keys',
                expectedBody: [{ id: '0_userdata.0.example', val: 1, ack: false }],
            });
            return;
        }
        if (items.length > MAX_BULK_STATES) {
            res.status(422).json({ error: `Too many states. Maximum is ${MAX_BULK_STATES}`, count: items.length });
            return;
        }
        const stopOnError = req.query.stopOnError === 'true';

        const results: BulkStateResult[] = [];
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (!item || typeof item !== 'object' || !item.id || typeof item.id !== 'string') {
                results.push({ index, error: 'id missing' });
            } else if (!('val' in item)) {
                results.push({ id: item.id, index, error: 'val missing' });
            } else {
                try {
                    const id = await _findStateAsync(req, item.id);
                    if (!id) {
                        results.push({ id: item.id, index, error: 'ID not found' });
                    } else {
                        const { id: _id, ...state } = item;
                        state.val = await _convertValue(req, id, state.val!);
                        state.ack = !!state.ack;
                        await req._adapter.setForeignStateAsync(id, state as ioBroker.SettableState, {
                            user: req._user,
                            limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                        });
                        results.push({ id, val: state.val, ack: state.ack });
                    }
                } catch (error) {
                    let text = error.toString();
                    if (text === 'Error: permissionError') {
                        text = 'permissionError';
                    }
                    req._adapter.log.warn(`Warning by "${req.url}": cannot write "${item.id}": ${text}`);
                    results.push({ id: item.id, index, error: text });
                }
            }

            if (stopOnError && 'error' in results[results.length - 1]) {
                break;
            }
        }

        res.json(results);
    });
}

export function toggleState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'write' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const oId = getIDs(params.stateId);
            _toggleState(req, res, oId[0]);
        }
    });
}

export function readState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const oId = getIDs(params.stateId);
            let timeout = 0;
            if (req.query.timeout) {
                timeout = parseInt(req.query.timeout as string, 10);

                if (timeout > 60000) {
                    timeout = 60000;
                } // maximum 1 minute
            }

            let result;
            for (let k = 0; k < oId.length; k++) {
                try {
                    const { state, id, originId } = await new Promise<{
                        state: ioBroker.State | null | undefined;
                        id: string | null | undefined;
                        originId: ioBroker.StringOrTranslated | null | undefined;
                    }>((resolve, reject) =>
                        getState(req._adapter, oId[k], req._user, (error, state, id, originId) =>
                            error ? reject(error) : resolve({ state, id, originId }),
                        ),
                    );

                    if (!id) {
                        res.status(404).json({ error: 'ID not found', id: originId });
                        return;
                    }
                    if (req.query.value !== undefined) {
                        await _updateState(
                            req,
                            res,
                            id,
                            timeout,
                            req.query.value as string,
                            req.query.ack !== undefined ? req.query.ack === 'true' : undefined,
                        );
                        return;
                    }
                    if (req.query.toggle !== undefined) {
                        _toggleState(req, res, id);
                        return;
                    }

                    const vObj: Omit<ioBroker.Object & ioBroker.State & { id: string }, '_id'> = (state || {}) as Omit<
                        ioBroker.Object & ioBroker.State & { id: string },
                        '_id'
                    >;
                    if (req.query.withInfo === 'true') {
                        try {
                            const obj = await req._adapter.getForeignObjectAsync(id);
                            // copy all attributes of the object into state
                            if (obj) {
                                Object.keys(obj).forEach(attr => {
                                    if (attr === '_id') {
                                        vObj.id = obj._id;
                                    } else {
                                        (vObj as any)[attr] = (obj as any)[attr];
                                    }
                                });
                            }
                        } catch (error) {
                            req._adapter.log.warn(`Error by reading of object "${id}": ${error}`);
                        }
                    } else {
                        vObj.id = id;
                    }

                    if (!result) {
                        result = vObj;
                    } else {
                        if (!Array.isArray(result)) {
                            result = [result];
                        }
                        result.push(vObj);
                    }
                } catch (error) {
                    req._adapter.log.warn(`Cannot read ${oId.join(', ')}: ${error}`);
                    errorResponse(req, res, error, { id: oId });
                    return;
                }
            }

            res.json(result);
        }
    });
}

export function plainState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const oId = getIDs(params.stateId);
            try {
                const { state, id, originId } = await new Promise<{
                    state: ioBroker.State | undefined;
                    id: string | null | undefined;
                    originId: ioBroker.StringOrTranslated | undefined;
                }>((resolve, reject) =>
                    getState(req._adapter, oId[0], req._user, (error, state, id, originId) =>
                        error ? reject(error) : resolve({ state, id, originId }),
                    ),
                );

                if (!id) {
                    res.status(404).json({ error: 'ID not found', id: originId });
                } else if (!state || typeof state !== 'object') {
                    res.status(404).json({ error: 'State not found', id: originId });
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
                errorResponse(req, res, error, { id: oId });
            }
        }
    });
}

export function listStates(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'list' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            req._adapter.getForeignStates(
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
    });
}

export function unsubscribeState(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ stateId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);

            let url = req.body.url;
            if (req.query?.method === 'polling' || req.body?.method === 'polling') {
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
                await req._swaggerObject.unregisterSubscribe(url, params.stateId, 'state', req._user);
                res.status(200).json({ result: 'OK' });
            } catch (error) {
                errorResponse(req, res, error, { stateId: params.stateId });
            }
        }
    });
}

export function subscribeStates(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
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

            if (!req.body.pattern) {
                res.status(422).json({
                    error: 'pattern not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/', pattern: 'system.adapter.admin.0.*' },
                });
                return;
            }
            try {
                const error = await req._swaggerObject.registerSubscribe(url, req.body.pattern, 'state', req._user, {
                    method: req.body.method,
                    onchange: req.body.onchange === 'true',
                    delta: req.body.delta !== undefined ? parseFloat(req.body.delta) : undefined,
                });
                if (error) {
                    errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
                } else {
                    res.status(200).json({ result: 'OK' });
                }
            } catch (error) {
                errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}

export function unsubscribeStates(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], async error => {
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
                await req._swaggerObject.unregisterSubscribe(url, req.body.pattern, 'state', req._user);
                res.status(200).json({ result: 'OK' });
            } catch (error) {
                errorResponse(req, res, error, { pattern: req.body.pattern, url: req.body.url });
            }
        }
    });
}

export function getStatesSubscribes(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'state', operation: 'read' }], error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            let url = req.body?.url;
            if ((req.query && req.query.method === 'polling') || (req.body && req.body.method === 'polling')) {
                url = req.query.sid || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            }
            const pattern: string = (req.query?.pattern as string | undefined) ?? '*';

            if (!url) {
                res.status(422).json({
                    error: 'url not provided',
                    expectedBody: { url: 'http://ipaddress:9000/hook/' },
                });
                return;
            }

            try {
                const result = req._swaggerObject.getSubscribes(url, pattern, 'state');
                if (result === null) {
                    res.status(404).json({ error: 'URL or session not found' });
                    return;
                }
                res.json({ states: result });
            } catch (error) {
                errorResponse(req, res, error, { pattern, url: req.body?.url });
            }
        }
    });
}
