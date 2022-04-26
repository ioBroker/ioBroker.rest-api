'use strict';
const commonLib = require('./common.js');

module.exports = {
    readMainEnums: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'object', operation: 'read'}],  async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                // check if instance is alive
                try {
                    const enums = await req._adapter.getEnumsAsync('', {user: req._user});
                    res.json(enums);
                } catch (error) {
                    res.status(500).json({error});
                }
            }
        });
    },
    readEnums: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'object', operation: 'read'}],  async err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                const params = commonLib.parseUrl(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
                // check if instance is alive
                try {
                    const enums = await req._adapter.getEnumAsync(params.enumId, {user: req._user});
                    if (enums && enums.result) {
                        res.json(Object.keys(enums.result).filter(id => id.split('.').length > 2).map(id => ({
                            _id: id,
                            common: enums.result[id].common
                        })));
                    } else {
                        res.json([]);
                    }
                } catch (error) {
                    res.status(500).json({error});
                }

            }
        });
    },
};