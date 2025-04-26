import { checkPermissions, errorResponse, parseUrl } from './common';
import type { RequestExt } from '../../types';
import type { Response } from 'express';

export function readFile(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'read' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ objectId: string; fileName: string }>(
                req.url,
                req.swagger,
                req._adapter.WEB_EXTENSION_PREFIX,
            );
            try {
                const data = await req._adapter.readFileAsync(params.objectId, params.fileName, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (data && data.mimeType) {
                    res.set('Content-Type', data.mimeType);
                    res.send(data.file);
                } else {
                    res.status(404).send(Buffer.from(''));
                }
            } catch (error) {
                errorResponse(req, res, error);
            }
        }
    });
}

export function deleteFile(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'delete' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ objectId: string; fileName: string }>(
                req.url,
                req.swagger,
                req._adapter.WEB_EXTENSION_PREFIX,
            );
            try {
                await req._adapter.delFileAsync(params.objectId, params.fileName, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json({ success: true });
            } catch (err) {
                if (err.toString().includes('Not exists')) {
                    res.status(404).json({ error: err.toString() });
                } else {
                    errorResponse(req, res, err);
                }
            }
        }
    });
}

export function writeFile(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'write' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ objectId: string; fileName: string }>(
                req.url,
                req.swagger,
                req._adapter.WEB_EXTENSION_PREFIX,
            );
            if (req.files?.file[0].buffer) {
                try {
                    await req._adapter.writeFileAsync(params.objectId, params.fileName, req.files?.file[0].buffer, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.json({ success: true });
                } catch (err) {
                    errorResponse(req, res, err);
                }
            } else {
                errorResponse(req, res, 'No file provided.', 422);
            }
        }
    });
}

export function readDir(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'list' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ objectId: string; dirName?: string }>(
                req.url,
                req.swagger,
                req._adapter.WEB_EXTENSION_PREFIX,
            );
            try {
                const response = await req._adapter.readDirAsync(params.objectId, params.dirName || '', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json(response);
            } catch (err) {
                errorResponse(req, res, err);
            }
        }
    });
}
