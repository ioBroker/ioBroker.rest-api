'use strict';
var commonLib = require(__dirname + '/common.js');

module.exports = {
    listObjects: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'object', operation: 'list'}], function (err) {
            if (err) {
                res.status(403).json({error: err});
            } else {
                req._adapter.getForeignObjects(req.swagger.params.filter.value || '*', {
                    user: req._user,
                    limitToOwnerRights: req._adapter.config.onlyAllowWhenUserIsOwner
                }, function (err, list) {
                    if (err) {
                        res.status(500).json({error: err, filter: req.swagger.params.filter});
                    } else {
                        res.json(list || []);
                    }
                });
            }
        });
    },

    subscribe: function (req, res) {

    },

    unsubscribe: function (req, res) {

    }
};