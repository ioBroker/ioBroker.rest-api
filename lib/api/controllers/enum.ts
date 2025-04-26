import { checkPermissions, errorResponse, parseUrl } from './common';
import type { RequestExt } from '../../types';
import type { Response } from 'express';

export function readMainEnums(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            // check if instance is alive
            try {
                const enums = await req._adapter.getEnumsAsync('', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json(enums);
            } catch (error) {
                req._adapter.log.warn(`Cannot read enums: ${error}`);
                errorResponse(req, res, error);
            }
        }
    });
}

export function readEnums(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ enumId: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            // check if instance is alive
            try {
                const enums = await req._adapter.getEnumAsync(params.enumId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (enums && enums.result) {
                    res.json(
                        Object.keys(enums.result)
                            .filter(id => id.split('.').length > 2)
                            .map(id => ({
                                _id: id,
                                common: enums.result[id].common,
                            })),
                    );
                } else {
                    res.json([]);
                }
            } catch (error) {
                errorResponse(req, res, error);
            }
        }
    });
}
