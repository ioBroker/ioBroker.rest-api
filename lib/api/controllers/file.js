'use strict';
const commonLib = require('./common.js');

module.exports = {
    readFile: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'read' }], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
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
                    commonLib.errorResponse(req, res, error);
                }
            }
        });
    },
    deleteFile: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'delete' }], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
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
                        commonLib.errorResponse(req, res, err);
                    }
                }
            }
        });
    },
    writeFile: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'write' }], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                try {
                    await req._adapter.writeFileAsync(params.objectId, params.fileName, req.files.file[0].buffer, {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.json({ success: true });
                } catch (err) {
                    commonLib.errorResponse(req, res, err);
                }
            }
        });
    },
    readDir: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{ type: 'file', operation: 'list' }], async error => {
            if (error) {
                commonLib.errorResponse(req, res, error);
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                try {
                    const response = await req._adapter.readDirAsync(params.objectId, params.dirName || '', {
                        user: req._user,
                        limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                    });
                    res.json(response);
                } catch (err) {
                    commonLib.errorResponse(req, res, err);
                }
            }
        });
    },
};
