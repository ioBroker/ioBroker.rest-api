const { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } = require('node:fs');
const common = require('./dist/lib/common');
const pkg = require('./package.json');

const isFile = name => {
    return (
        name.toLowerCase().includes('file') ||
        name.toLowerCase().includes('folder') ||
        name.toLowerCase().includes('dir') ||
        name.toLowerCase().includes('unlink') ||
        name.toLowerCase().includes('rename')
    );
};

const isState = name => {
    return name.toLowerCase().includes('state');
};

const isObject = name => {
    return name.toLowerCase().includes('object');
};

const isAdmin = name => {
    return false;
    /*return name.toLowerCase().includes('compact')
    || name.toLowerCase().includes('license')
    || name.toLowerCase().includes('user')
    || name.toLowerCase().includes('group')
    || name.toLowerCase().includes('easy')
    || name.toLowerCase().includes('crypt')
    || name.toLowerCase().includes('exe')
    || name.toLowerCase().includes('sendtohost')
    || name.toLowerCase().includes('password');*/
};

const isGroups = {
    admin: isAdmin,
    file: isFile,
    object: isObject,
    state: isState,
};

const description = {
    delState: 'delete state and object. Same as delObject',
    getStates:
        'get the list of states for pattern (e.g. for system.adapter.admin.0.*). GUI can have problems by visualization of answer.',
    getState: 'get state value by ID',
    setState: 'set state value with JSON object (e.g. {\\"val\\": 1, \\"ack\\": true})',
    getBinaryState: 'get binary state by ID',
    setBinaryState: 'set binary state by ID',
    getForeignStates: 'same as getStates',

    getObject: 'get object by ID',
    getObjects: 'get all states and rooms. GUI can have problems by visualization of answer.',
    getObjectView:
        'get specific objects, e.g. design=system, search=state, params={\\"startkey\\": \\"system.adapter.admin.\\", \\"endkey\\": \\"system.adapter.admin.\\u9999\\"}',
    setObject:
        'set object with JSON object (e.g. {\\"common\\": {\\"type\\": \\"boolean\\"}, \\"native\\": {}, \\"type\\": \\"state\\"})',
    getAllObjects: 'read all objects as list. GUI can have problems by visualization of answer.',
    extendObject: 'modify object by ID with JSON. (.e.g. {\\"common\\":{\\"enabled\\": true}}) ',
    getForeignObjects: 'same as getObjects',
    delObject: 'delete object by ID',
    delObjects: 'delete objects by pattern',

    readFile:
        'read file, e.g. adapter=vis.0, fileName=main/vis-views.json. Additionally, you can set option in query binary=true to get answer as file and not as json',
    readFile64:
        'read file as base64 string, e.g. adapter=vis.0, fileName=main/vis-views.json. Additionally, you can set option in query binary=true to get answer as file and not as json',
    writeFile64: 'write file, e.g. adapter=vis.0, fileName=main/vis-test.json, data64=eyJhIjogMX0=',
    unlink: 'delete file or folder',
    deleteFile: 'delete file',
    deleteFolder: 'delete folder',
    renameFile: 'rename file',
    rename: 'rename file or folder',
    mkdir: 'create folder',
    readDir: 'read content of folder',
    chmodFile: 'change file mode. E.g. adapter=vis.0, fileName=main/*, options = {\\"mode\\": 0x644}',
    chownFile:
        'change file owner. E.g. adapter=vis.0, fileName=main/*, options = {\\"owner\\": \\"newOwner\\", \\"ownerGroup\\": \\"newgroup\\"}',
    fileExists: 'check if file exists',

    getUserPermissions: 'read object with user permissions',
    updateLicenses: 'read licenses from ioBroker.net portal',
    getCompactInstances: 'read list of instances with short information',
    getCompactAdapters: 'read list of installed adapters with short information',
    getCompactInstalled: 'read short information about installed adapters',
    getCompactSystemConfig: 'read short system config',
    getCompactRepository: 'read short repository',
    getCompactHosts: 'get short information about hosts',
    addUser: 'add new user',
    delUser: 'delete user',
    addGroup: 'create new group',
    delGroup: 'delete group',
    changePassword: 'change user password',

    log: 'add log entry to ioBroker log',
    getHistory:
        'read history. See for options: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter',
    httpGet: 'read URL from server. You can set binary=true to get answer as file',
    sendTo: 'send command to instance. E.g. adapterInstance=history.0, command=getHistory, message={\\"id\\": \\"system.adapter.admin.0.memRss\\",\\"options\\": {\\"aggregate\\": \\"onchange\\", \\"addId\\": true}}',
    listPermissions: 'read static information with function permissions',
    getVersion: 'read adapter name and version',
    getAdapterName: 'read adapter name (always rest-api)',
    getHostByIp: 'read host information by IP. e.g. by localhost',
    readLogs: 'read file name and size of log files. You can read them with http://ipaddress:8093/<fileName>',
    getRatings: 'read adapter ratings (as in admin)',
    getCurrentInstance: 'read adapter namespace (always rest-api.0)',
    checkFeatureSupported: 'check if feature is supported by js-controller.',
    decrypt: 'decrypt string with system secret',
    encrypt: 'encrypt string with system secret',
    getAdapterInstances: 'get objects of type \\"instance\\". You can define optionally adapterName',
    getAdapters: 'get objects of type \\"adapter\\". You can define optionally adapterName',
};

function generateList() {
    const { SocketCommands } = require('@iobroker/socket-classes');
    const { SocketCommandsAdmin } = require('@iobroker/socket-classes');
    const commands = new SocketCommandsAdmin({ config: {} });
    const commandsCommon = new SocketCommands({ config: {} });

    const ignore = [
        'authenticate',
        'name',
        'error',
        'logout',
        'eventsThreshold',
        'writeFile',
        'getEasyMode',
        'authEnabled',
        'requireLog',
        'getIsEasyModeStrict',
        'cmdExec',
        'sendToHost',
    ];

    const groups = {
        state: [],
        object: [],
        file: [],
        admin: [],
        other: [],
    };

    const yamlGroups = {
        state: [],
        object: [],
        file: [],
        admin: [],
        other: [],
    };

    // list all commands
    Object.keys(commands.commands)
        .filter(name => !ignore.includes(name) && !name.includes('subscribe'))
        .forEach(func => {
            let args = common
                .getParamNames(commands.commands[func])
                .map(item => (item[0] === '_' ? item.substring(1) : item));

            args.shift(); // remove socket
            let noAnswer = false;
            if (args[args.length - 1] === 'callback') {
                args.pop(); // remove callback
            } else {
                noAnswer = true;
            }

            if (common.DEFAULT_VALUES[func]) {
                args = args.map(name => {
                    if (common.DEFAULT_VALUES[func].hasOwnProperty(name)) {
                        return `${name}[${common.DEFAULT_VALUES[func][name]}]`;
                    } else {
                        return name;
                    }
                });
            }

            const text = `\`${func}(${args.join(', ')})\`${noAnswer ? ' - no answer' : ''}${description[func] ? ' - ' + description[func].replace(/\\"/g, '"').replace(/{(.*)}/, '`{$1}`') : ''}`;

            let group = Object.keys(isGroups).find(group => isGroups[group](func));

            // if "func" does not found in commandsCommon, so it is "admin" group
            if (!Object.keys(commandsCommon.commands).includes(func)) {
                group = 'admin';
            }

            if (group) {
                groups[group].push(text);
            } else {
                groups.other.push(text);
            }

            const parameters = [];
            args.forEach(arg => {
                let type = 'string';
                let description = '';
                let required = true;

                if (arg === 'options' || arg === 'params' || arg === 'obj' || arg === 'message') {
                    type = 'string';
                    description = 'JSON object';
                }
                if (arg === 'update') {
                    type = 'boolean';
                }
                if (
                    func !== 'chmodFile' &&
                    func !== 'chownFile' &&
                    (arg === 'options' || arg === 'adapterName' || arg === 'update' || arg.includes('level'))
                ) {
                    required = false;
                }

                let text = `
        - name: "${arg.replace(/\[\w+]/, '')}"            
          in: "query"
          description: "${description}"
          type: "${type}"
          required: ${required}`;
                if (arg === 'feature') {
                    text += `
          enum: [ALIAS, ALIAS_SEPARATE_READ_WRITE_ID, ADAPTER_GETPORT_BIND, ADAPTER_DEL_OBJECT_RECURSIVE, ADAPTER_SET_OBJECT_SETS_DEFAULT_VALUE, ADAPTER_AUTO_DECRYPT_NATIVE, PLUGINS, CONTROLLER_NPM_AUTO_REBUILD, CONTROLLER_READWRITE_BASE_SETTINGS, CONTROLLER_MULTI_REPO, CONTROLLER_LICENSE_MANAGER, DEL_INSTANCE_CUSTOM]`;
                }

                parameters.push(text);
            });

            let paramsText = '';
            if (parameters.length) {
                paramsText = `
      parameters:
${parameters.join('\n')}`;
            }

            const yamlText = `  /command/${func}:
    get:
      tags:
        - "commands"
      summary: "${description[func] || ''}"
      produces:
        - "application/json"${paramsText}        
      responses:
        200:
          description: "successful operation"`;

            if (group) {
                yamlGroups[group].push(yamlText);
            } else {
                yamlGroups.other.push(yamlText);
            }
        });

    const allTextes = [];

    Object.keys(groups).forEach(group => {
        allTextes.push(`### ${group[0].toUpperCase()}${group.substring(1)}s`);
        groups[group].forEach(line => allTextes.push('- ' + line));
        allTextes.push('');
    });

    let file = readFileSync(`${__dirname}/README.md`).toString('utf8').split('\n');
    // find <!-- START -->
    let newFile = [];
    let foundStart = false;
    let foundEnd = false;
    for (let f = 0; f < file.length; f++) {
        if (!foundStart && file[f].includes('<!-- START -->')) {
            foundStart = true;
            newFile.push(file[f]);
            allTextes.forEach(line => newFile.push(line));
            continue;
        } else if (file[f].includes('<!-- END -->')) {
            foundEnd = true;
        }
        if (!foundStart || foundEnd) {
            newFile.push(file[f]);
        }
    }

    writeFileSync(`${__dirname}/README.md`, newFile.join('\n'));

    const yamlTextes = [];

    Object.keys(yamlGroups).forEach(group => {
        group === 'admin' && yamlTextes.push('# admin commands start');
        yamlGroups[group].forEach(line => yamlTextes.push(line));
        group === 'admin' && yamlTextes.push('# admin commands end');
    });

    file = readFileSync(`${__dirname}/src/lib/api/swagger/swagger.yaml`).toString('utf8').split('\n');
    // find <!-- START -->
    newFile = [];
    foundStart = false;
    foundEnd = false;
    for (let f = 0; f < file.length; f++) {
        if (!foundStart && file[f].includes('# commands start')) {
            foundStart = true;
            newFile.push(file[f]);
            yamlTextes.forEach(line => newFile.push(line));
            continue;
        } else if (file[f].includes('# commands stop')) {
            foundEnd = true;
        }
        if (!foundStart || foundEnd) {
            newFile.push(file[f]);
        }
    }

    writeFileSync(`${__dirname}/src/lib/api/swagger/swagger.yaml`, newFile.join('\n'));
}

function updateYamlVersion() {
    let yaml = readFileSync(`${__dirname}/src/lib/api/swagger/swagger.yaml`).toString('utf8');
    yaml = yaml.replace(/version: "\d+\.\d+.\d+"/, `version: "${pkg.version}"`);
    writeFileSync(`${__dirname}/src/lib/api/swagger/swagger.yaml`, yaml);
}

function copyYaml() {
    !existsSync(`${__dirname}/dist/lib/config`) && mkdirSync(`${__dirname}/dist/lib/config`);
    !existsSync(`${__dirname}/dist/lib/api/swagger`) && mkdirSync(`${__dirname}/dist/lib/api/swagger`);

    copyFileSync(`${__dirname}/src/lib/config/default.yaml`, `${__dirname}/dist/lib/config/default.yaml`);
    copyFileSync(`${__dirname}/src/lib/api/swagger/swagger.yaml`, `${__dirname}/dist/lib/api/swagger/swagger.yaml`);

}

if (process.argv.includes('--generate-list')) {
    generateList();
} else if (process.argv.includes('--update-yaml-version')) {
    updateYamlVersion();
} else if (process.argv.includes('--copy-yaml')) {
    copyYaml();
} else {
    generateList();
    updateYamlVersion();
    copyYaml();
}
