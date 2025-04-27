"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_VALUES = void 0;
exports.getParamNames = getParamNames;
// taken from here: https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically
const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/gm;
const ARGUMENT_NAMES = /([^\s,]+)/g;
function getParamNames(func) {
    const fnStr = func.toString().replace(STRIP_COMMENTS, '');
    const result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
    return result || [];
}
exports.DEFAULT_VALUES = {
    log: { level: 'info' },
};
//# sourceMappingURL=common.js.map