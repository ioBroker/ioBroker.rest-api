import type { Request, Response } from 'express';

export type UserName = `system.user.${string}`;
export interface Swagger {
    operation: {
        parameters: { in: string; name: string }[];
    };
    expressMiddleware: () => {
        register: (app: Express) => void;
    };
}

export interface RestApiAdapterConfig {
    port: number | string;
    auth?: boolean;
    secure: boolean;
    bind: string;
    certPublic: string;
    certPrivate: string;
    certChained: string;
    defaultUser?: `system.user.${string}`;
    ttl: number | string;
    onlyAllowWhenUserIsOwner: boolean;
    webInstance: string;
    leEnabled: boolean;
    leUpdate: boolean;
    leCheckPort: number;
    checkInterval: number | string;
    hookTimeout: number | string;
    noUI: boolean;
    dataSource: string;
    noCommands: boolean;
    noAdminCommands: boolean;
    leConfig?: boolean;
    certificates?: ioBroker.Certificates;
    language?: ioBroker.Languages;
}

export declare interface RestApiAdapter extends ioBroker.Adapter {
    WEB_EXTENSION_PREFIX: string;
    config: RestApiAdapterConfig;
    _addTimeout: ((task: { id: string; val: ioBroker.State; res: Response; timeout: number }) => Promise<void>) | null;
}

export type SubscribeMethod = 'polling' | 'POST' | 'GET' | 'PUT' | 'PATCH';

export type RequestExt = Request & {
    _adapter: RestApiAdapter;
    swagger: Swagger;
    _user: UserName;
    files?: { file: { buffer: Buffer | string }[] };
    _swaggerObject: {
        registerSubscribe: (
            urlHook: string,
            id: string,
            type: 'state' | 'object',
            user: `system.user.${string}`,
            options:
                | {
                      delta?: number | string;
                      method: SubscribeMethod;
                      onchange?: boolean | string;
                  }
                | SubscribeMethod,
        ) => Promise<string | void>;
        unregisterSubscribe: (
            urlHook: string,
            id: null | string,
            type: 'state' | 'object',
            user?: `system.user.${string}`,
        ) => Promise<void>;
        getSubscribes: (url: string, pattern: string, type: 'state' | 'object') => string[] | null;
    };
};
