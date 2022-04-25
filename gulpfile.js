const gulp = require('gulp');
const fs = require('fs');
const {SocketCommandsAdmin: CommandsAdmin} = require("@iobroker/socket-classes");
const common = require('./lib/common');

const isFile = name => {
    return name.toLowerCase().includes('file')
    || name.toLowerCase().includes('folder')
    || name.toLowerCase().includes('dir')
    || name.toLowerCase().includes('unlink')
    || name.toLowerCase().includes('rename')
    ;
}

const isState = name => {
    return name.toLowerCase().includes('state');
}

const isObject = name => {
    return name.toLowerCase().includes('object');
}

const isAdmin = name => {
    return name.toLowerCase().includes('compact')
    || name.toLowerCase().includes('license')
    || name.toLowerCase().includes('user')
    || name.toLowerCase().includes('group')
    || name.toLowerCase().includes('password');
}

const isGroups = {
    admin: isAdmin,
    file: isFile,
    object: isObject,
    state: isState
}

const description = {
    'delState': 'delState',
    'getStates': 'getStates',
    'getState': 'getState',
    'setState': 'setState',
    'getBinaryState': 'getBinaryState',
    'setBinaryState': 'setBinaryState',
    'getForeignStates': 'getForeignStates',

    'getObject': 'getObject',
    'getObjects': 'getObjects',
    'getObjectView': 'getObjectView',
    'setObject': 'setObject',
    'getAllObjects': 'getAllObjects',
    'extendObject': 'extendObject',
    'getForeignObjects': 'getForeignObjects',
    'delObject': 'delObject',
    'delObjects': 'delObjects',

    'readFile': 'readFile',
    'readFile64': 'readFile64',
    'writeFile64': 'writeFile64',
    'writeFile': 'writeFile',
    'unlink': 'unlink',
    'deleteFile': 'deleteFile',
    'deleteFolder': 'deleteFolder',
    'renameFile': 'renameFile',
    'rename': 'rename',
    'mkdir': 'mkdir',
    'readDir': 'readDir',
    'chmodFile': 'chmodFile',
    'chownFile': 'chownFile',
    'fileExists': 'fileExists',

    'getUserPermissions': 'getUserPermissions',
    'updateLicenses': 'updateLicenses',
    'getCompactInstances': 'getCompactInstances',
    'getCompactAdapters': 'getCompactAdapters',
    'getCompactInstalled': 'getCompactInstalled',
    'getCompactSystemConfig': 'getCompactSystemConfig',
    'getCompactRepository': 'getCompactRepository',
    'getCompactHosts': 'getCompactHosts',
    'addUser': 'addUser',
    'delUser': 'delUser',
    'addGroup': 'addGroup',
    'delGroup': 'delGroup',
    'changePassword': 'changePassword',

    'log': 'log',
    'getHistory': 'getHistory',
    'httpGet': 'httpGet',
    'sendTo': 'sendTo',
    'sendToHost': 'sendToHost',
    'authEnabled': 'authEnabled',
    'listPermissions': 'listPermissions',
    'getVersion': 'getVersion',
    'getAdapterName': 'getAdapterName',
    'getHostByIp': 'getHostByIp',
    'requireLog': 'requireLog',
    'readLogs': 'readLogs',
    'cmdExec': 'cmdExec',
    'getRatings': 'getRatings',
    'getCurrentInstance': 'getCurrentInstance',
    'checkFeatureSupported': 'checkFeatureSupported',
    'decrypt': 'decrypt',
    'encrypt': 'encrypt',
    'getIsEasyModeStrict': 'getIsEasyModeStrict',
    'getEasyMode': 'getEasyMode',
    'getAdapterInstances': 'getAdapterInstances',
    'getAdapters': 'getAdapters',
};

gulp.task('generateList', done => {
    const CommandsAdmin = require('@iobroker/socket-classes').SocketCommandsAdmin;
    const commands   = new CommandsAdmin({config: {}});

    const ignore = ['authenticate', 'name', 'error', 'logout', 'eventsThreshold'];

    const groups = {
        state: [],
        object: [],
        file: [],
        admin: [],
        other: []
    };

    Object.keys(commands.commands).filter(name => !ignore.includes(name) && !name.includes('subscribe')).forEach(func => {
        let args = common.getParamNames(commands.commands[func]).map(item => item[0] === '_' ? item.substring(1) : item);

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
                    return name + '[' + common.DEFAULT_VALUES[func][name] + ']';
                } else {
                    return name;
                }
            })
        }

        const text = `${func}(${args.join(', ')})${noAnswer ? ' - no answer' : ''}${description[func] ? ' - ' + description[func] : ''}`;

        const group = Object.keys(isGroups).find(group => isGroups[group](func));
        if (group) {
            groups[group].push(text);
        } else {
            groups.other.push(text);
        }

        const parameters = [];
        args.forEach(arg => {
            parameters.push(
`        - name: "${arg}"
          in: "path"
          description: ""
          type: "string"
          required: true
`);
        });

        let prmsText = '';
        if (parameters.length) {
            prmsText = `
      parameters:
${parameters.join('\n')}`;
        }

        yaml.push(`  /command/${func}
    get:
      tags:
        - "commands"
      summary: "${description[func] || ''}"
      produces:
        - "application/json"${prmsText}        
      responses:
        200:
          description: "successful operation"    
`);

    });

    const allTextes = [];
    const yaml = [];

    Object.keys(groups).forEach(group => {
        allTextes.push('### ' + group[0].toUpperCase() + group.substring(1) + 's');
        groups[group].forEach(line => allTextes.push('- ' + line));
        allTextes.push('');
    })

    let file = fs.readFileSync(__dirname + '/README.md').toString('utf8').split('\n');
    // find <!-- START -->
    const newFile = [];
    let foundStart = false;
    let foundEnd = false;
    for (let f = 0; f < file.length; f++) {
        if (!foundStart && file[f].includes('<!-- START -->')) {
            foundStart = true;
            newFile.push(file[f]);
            allTextes.forEach(line => newFile.push(line));
            continue;
        } else
        if (file[f].includes('<!-- END -->')) {
            foundEnd = true;
        }
        if (!foundStart || foundEnd) {
            newFile.push(file[f]);
        }
    }

    fs.writeFileSync(__dirname + '/README.md', newFile.join('\n'));

    done();
});

gulp.task('default', gulp.series('generateList'));