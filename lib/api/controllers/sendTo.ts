import { checkPermissions, errorResponse, parseUrl } from './common';
import type { RequestExt } from '../../types';
import type { Response } from 'express';

export function sendTo(req: RequestExt, res: Response): void {
    checkPermissions(req._adapter, req._user, [{ type: 'other', operation: 'sendto' }], async error => {
        if (error) {
            errorResponse(req, res, error);
        } else {
            const params = parseUrl<{ instance: string }>(req.url, req.swagger, req._adapter.WEB_EXTENSION_PREFIX);
            let message = req.query.message as string;
            let noResponseStr = req.query.noResponse as string;
            let timeout: string | number = req.query.timeout as string;
            let data: any = req.query.data as string;
            if (req.body?.message) {
                message = req.body.message;
            }
            if (req.body?.timeout) {
                timeout = req.body.timeout;
            }
            timeout = parseInt(timeout as string, 10) || 10000;
            if (req.body?.noResponse !== undefined) {
                noResponseStr = req.body.noResponse;
            }
            const noResponse = noResponseStr === 'true';

            if (req.body?.data !== undefined) {
                data = req.body.data;
            } else {
                if (data !== undefined && data !== null) {
                    if (data === 'null') {
                        data = null;
                    } else if (data === 'undefined') {
                        data = undefined;
                    } else if (data === 'true') {
                        data = true;
                    } else if (data === 'false') {
                        data = false;
                    } else if (isFinite(data)) {
                        data = parseFloat(data);
                    } else if (data.startsWith('{') && data.endsWith('}')) {
                        try {
                            data = JSON.parse(data);
                        } catch {
                            // ignore
                        }
                    } else if (data.startsWith('[') && data.endsWith(']')) {
                        try {
                            data = JSON.parse(data);
                        } catch {
                            // ignore
                        }
                    }
                }
            }

            const instance = params.instance;

            if (!instance) {
                res.status(422).json({ error: 'No instance provided' });
                return;
            }
            if (!message) {
                res.status(422).json({ error: 'No message provided' });
                return;
            }

            // check if instance is alive
            let state;
            try {
                state = await req._adapter.getForeignStateAsync(`system.adapter.${instance}.alive`);
                if (!state || !state.val) {
                    res.status(500).json({ error: 'instance is not online', instance });
                    return;
                }
            } catch {
                res.status(500).json({ error: 'invalid instance', instance });
                return;
            }
            if (noResponse) {
                req._adapter.sendTo(instance, message, data);
                res.json({ result: 'sent' });
            } else {
                let timer: NodeJS.Timeout | null = null;
                let answerDone = false;
                if (timeout) {
                    timer = setTimeout(() => {
                        timer = null;
                        if (!answerDone) {
                            answerDone = true;
                            res.status(408).json({ error: 'timeout' });
                        }
                    }, timeout);
                }

                req._adapter.sendTo(instance, message, data, (result: any): void => {
                    if (timer) {
                        clearTimeout(timer);
                    }
                    if (!answerDone) {
                        answerDone = true;
                        res.json(result);
                    }
                });
            }
        }
    });
}

export const sendToPost = sendTo;
