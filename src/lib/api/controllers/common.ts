import type { RequestExt, RestApiAdapter, Swagger, UserName } from '../../types';
import type { CommandsPermissionsEntry } from '@iobroker/types/build/types';
import type { Response } from 'express';

const ERROR_PERMISSION = 'permissionError';

export function checkPermissions(
    adapter: RestApiAdapter,
    user: UserName,
    requiredRights: CommandsPermissionsEntry[],
    callback: (error: string | null) => void,
): void {
    void adapter.calculatePermissions(user, requiredRights, (acl: ioBroker.PermissionSet): void => {
        if (user !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendto
            if (requiredRights?.[0] && acl) {
                // If permission required
                if (requiredRights[0].type) {
                    const aclType = acl[requiredRights[0].type];
                    if (aclType && (aclType as any)[requiredRights[0].operation]) {
                        callback(null);
                        return;
                    }
                } else {
                    callback(null);
                    return;
                }
            }

            adapter.log.warn(`No permission for "${user}" to call ${JSON.stringify(requiredRights)}`);

            callback(ERROR_PERMISSION);
        } else {
            callback(null);
        }
    });
}

export function findState(
    adapter: RestApiAdapter,
    idOrName: string,
    user: UserName,
    type: ioBroker.CommonType | ((err?: Error | null, id?: string, name?: ioBroker.StringOrTranslated) => void) | null,
    callback?: (err?: Error | null, id?: string, name?: ioBroker.StringOrTranslated) => void,
): void {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    adapter.findForeignObject(
        idOrName,
        type,
        // @ts-expect-error fixed in js-controller
        { user, checked: true, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
        callback,
    );
}

export function getState(
    adapter: RestApiAdapter,
    idOrName: string,
    user: UserName,
    type:
        | ioBroker.CommonType
        | ((
              err: Error | null | undefined,
              state: ioBroker.State | undefined,
              id: string | null | undefined,
              originId: ioBroker.StringOrTranslated | undefined,
          ) => void)
        | null,
    callback?: (
        err: Error | null | undefined,
        state: ioBroker.State | undefined,
        id: string | null | undefined,
        originId: ioBroker.StringOrTranslated | undefined,
    ) => void,
): void {
    if (typeof type === 'function') {
        callback = type;
        type = null;
    }
    findState(adapter, idOrName, user, type, (err, id, originId) => {
        if (err && (!err.message || !err.message.includes('permissionError'))) {
            callback?.(err, undefined, null, originId);
        } else {
            if (err?.message.includes('permissionError')) {
                // assume it is ID
                id = idOrName;
            }
            if (id) {
                void adapter.getForeignState(
                    id,
                    { user, limitToOwnerRights: adapter.config.onlyAllowWhenUserIsOwner },
                    (err, state) => {
                        if (err || !state) {
                            state = undefined;
                        }
                        callback?.(err, state, id, originId);
                    },
                );
            } else {
                callback?.(null, undefined, null, originId);
            }
        }
    });
}

export function parseUrl<T extends Record<string, string> = Record<string, string>>(
    url: string,
    swagger: Swagger,
    webExtensionPrefix: string,
): T {
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
    const result: T = {} as T;
    if (swagger?.operation?.parameters) {
        let i = 0;
        swagger.operation.parameters.forEach((param: { in: string; name: string }): void => {
            if (param.in === 'path') {
                try {
                    (result as any)[param.name] = parts[i] !== undefined ? decodeURIComponent(parts[i]) : '';
                } catch {
                    console.error(`Cannot decode ${parts[i]}"`);
                    (result as any)[param.name] = parts[i];
                }

                i++;
            }
        });
    } else {
        parts.forEach((param, i) => {
            try {
                (result as any)[`arg${i}`] = decodeURIComponent(param);
            } catch {
                console.error(`Cannot decode ${param}"`);
                (result as any)[`arg${i}`] = param;
            }
        });
    }

    return result;
}

export function errorResponse(
    req: RequestExt,
    res: Response,
    error: string,
    response?: Record<string, any> | 401 | 403 | 500 | 422 | 429,
    responseCode?: 401 | 403 | 500 | 422 | 429,
): void {
    error = error.toString();
    if (error === 'Error: permissionError') {
        error = 'permissionError';
    }

    req._adapter.log.warn(`Warning by "${req.url}": ${error}`);

    if (typeof response === 'number') {
        res.status(response).json({ error });
    } else {
        res.status(responseCode || (error.toString().includes('permissionError') ? 403 : 500)).json(
            Object.assign(response || {}, { error }),
        );
    }
}
