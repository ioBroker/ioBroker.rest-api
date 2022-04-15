'use strict';
const commonLib = require('./common.js');

module.exports = {
    getHistory: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                res.status(500).json({error: 'Not implemented'});
            }
        });
    },
    postHistory: function (req, res) {
        commonLib.checkPermissions(req._adapter, req._user, [{type: 'state', operation: 'write'}], err => {
            if (err) {
                res.status(403).json({error: err});
            } else {
                res.status(500).json({error: 'Not implemented'});
            }
        });
    },
};