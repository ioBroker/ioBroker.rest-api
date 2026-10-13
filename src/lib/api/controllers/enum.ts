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
            const enumId = params.enumId.startsWith('enum.') ? params.enumId : `enum.${params.enumId}`;
            try {
                const options = {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                };
                // getEnum returns only the sub-enums, so read the requested enum itself too
                let obj: ioBroker.Object | null | undefined = null;
                let denied = false;
                try {
                    obj = await req._adapter.getForeignObjectAsync(enumId, options);
                } catch (error) {
                    // The user may read the sub-enums even if the enum itself is not readable (like getEnum does)
                    if (!error?.toString().includes('permissionError')) {
                        throw error;
                    }
                    denied = true;
                }
                const enums = await req._adapter.getEnumAsync(enumId, options);

                const result: { _id: string; common: ioBroker.EnumCommon }[] = [];
                // Do not return the category itself (e.g. "enum.functions"), only real enums
                if (obj?.type === 'enum' && enumId.split('.').length > 2) {
                    result.push({ _id: enumId, common: obj.common });
                }
                if (enums?.result) {
                    Object.keys(enums.result)
                        .filter(id => id.split('.').length > 2)
                        .forEach(id => result.push({ _id: id, common: enums.result[id].common }));
                }

                if (denied && !result.length) {
                    errorResponse(req, res, 'permissionError', { enumId });
                } else if (obj?.type !== 'enum' && !result.length) {
                    res.status(404).json({ error: 'Enum not found', enumId });
                } else {
                    res.json(result);
                }
            } catch (error) {
                errorResponse(req, res, error, { enumId });
            }
        }
    });
}
