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
            // check if instance is alive
            try {
                const enums = await req._adapter.getEnumAsync(params.enumId, {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner,
                });
                if (enums && enums.result) {
                    res.json(Object.keys(enums.result)
                        .filter(id => id.split('.').length > 2)
                        .map(id => ({
                        _id: id,
                        common: enums.result[id].common,
                    })));
                }
                else {
                    res.json([]);
                }
            }
            catch (error) {
                (0, common_1.errorResponse)(req, res, error);
            }
        }
    });
}
//# sourceMappingURL=enum.js.map