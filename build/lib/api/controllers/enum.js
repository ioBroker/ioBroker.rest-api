"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMainEnums = readMainEnums;
exports.readEnums = readEnums;
const common_1 = require("./common");
function readMainEnums(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            // check if instance is alive
            try {
                const enums = await req._adapter.getEnumsAsync('', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                res.json(enums);
            }
            catch (error) {
                req._adapter.log.warn(`Cannot read enums: ${error}`);
                (0, common_1.errorResponse)(req, res, error);
            }
        }
    });
}
function readEnums(req, res) {
    (0, common_1.checkPermissions)(req._adapter, req._user, [{ type: 'object', operation: 'read' }], async (error) => {
        if (error) {
            (0, common_1.errorResponse)(req, res, error);
        }
        else {
            const params = (0, common_1.parseUrl)(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            const enumId = params.enumId.startsWith('enum.') ? params.enumId : `enum.${params.enumId}`;
            try {
                const options = {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                };
                // getEnum returns only the sub-enums, so read the requested enum itself too
                let obj = null;
                let denied = false;
                try {
                    obj = await req._adapter.getForeignObjectAsync(enumId, options);
                }
                catch (error) {
                    // The user may read the sub-enums even if the enum itself is not readable (like getEnum does)
                    if (!error?.toString().includes('permissionError')) {
                        throw error;
                    }
                    denied = true;
                }
                const enums = await req._adapter.getEnumAsync(enumId, options);
                const result = [];
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
                    (0, common_1.errorResponse)(req, res, 'permissionError', { enumId });
                }
                else if (obj?.type !== 'enum' && !result.length) {
                    res.status(404).json({ error: 'Enum not found', enumId });
                }
                else {
                    res.json(result);
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error, { enumId });
            }
        }
    });
}
//# sourceMappingURL=enum.js.map