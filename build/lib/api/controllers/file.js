"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readFile = readFile;
exports.deleteFile = deleteFile;
exports.writeFile = writeFile;
exports.readDir = readDir;
const common_1 = require("./common");
function readFile(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'file', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            try {
                const data = await req._adapter.readFileAsync(params.objectId, params.fileName, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (data && data.mimeType) {
                    res.set('Content-Type', data.mimeType);
                    res.send(data.file);
                }
                else {
                    res.status(404).send(Buffer.from(''));
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error);
            }
        }
    });
}
function deleteFile(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'file', operation: 'delete' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            try {
                await req._adapter.delFileAsync(params.objectId, params.fileName, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json({ success: true });
            }
            catch (err) {
                if (err.toString().includes('Not exists')) {
                    res.status(404).json({ error: err.toString() });
                }
                else {
                    (0, common_1.errorResponse)(req, res, err);
                }
            }
        }
    });
}
function writeFile(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'file', operation: 'write' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            if (req.files?.file[0].buffer) {
                try {
                    await req._adapter.writeFileAsync(params.objectId, params.fileName, req.files?.file[0].buffer, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.json({ success: true });
                }
                catch (err) {
                    (0, common_1.errorResponse)(req, res, err);
                }
            }
            else {
                (0, common_1.errorResponse)(req, res, 'No file provided.', 422);
            }
        }
    });
}
function readDir(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'file', operation: 'list' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            try {
                const response = await req._adapter.readDirAsync(params.objectId, params.dirName || '', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json(response);
            }
            catch (err) {
                (0, common_1.errorResponse)(req, res, err);
            }
        }
    });
}
//# sourceMappingURL=file.js.map