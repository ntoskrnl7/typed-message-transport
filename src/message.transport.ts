import EventEmitter from "events";
import { compress, uncompress } from 'snappyjs';
import { Buffer } from 'buffer/';
import SuperJSON from './superJSON';

function loggingEnabled() {
    return (globalThis as any).loggingEnabled;
}

type CallId = string;

type MessageHeader<T> = {
    type: T;
    callId: CallId;
}

type PartialSendInit = MessageHeader<'partial-send-init'> & {
    totalLength: number;
};

type PartialSend = MessageHeader<'partial-send'> & {
    chunk: Uint8Array;
};

export interface TransportChannel {
    send(data: ArrayBuffer): void;
    onMessage(onmessage: (event: MessageEvent<ArrayBuffer>) => any): void;
}

type Type<MessageMap> = keyof MessageMap;

type Request<T extends Type<MessageMap>, MessageMap> = MessageMap[T] extends { request: infer Req } ? Req extends unknown[] ? Req : [] : never;

type Response<T extends Type<MessageMap>, MessageMap> = MessageMap[T] extends { response: infer Res } ? Res : unknown;

type Listener<T extends keyof MessageMap, MessageMap> = (...args: [...Request<T, MessageMap>]) => void;

type Handler<T extends keyof MessageMap, MessageMap> = (type: T, ...args: [...Request<T, MessageMap>]) => Promise<Response<T, MessageMap>>;

type TypeHandler<T extends keyof MessageMap, MessageMap> = (...args: [...Request<T, MessageMap>]) => Promise<Response<T, MessageMap>>;

export class MessageTransport<SendMessageMap, RecvMessageMap> {

    #channel: TransportChannel | RTCDataChannel | WebSocket;
    #seq: bigint = BigInt(0);

    #handler?: (...args: unknown[]) => Promise<unknown>;
    #handlerMap: Map<string, (...args: unknown[]) => Promise<unknown>> = new Map();
    #responseEmitter = new EventEmitter();
    #rejectionEmitter = new EventEmitter();
    #emitter: EventEmitter = new EventEmitter();

    #preparedTypes: string[] = [];
    #preparedTypesEmitter = new EventEmitter();

    #generateCallId() {
        return this.#seq++ + '-' + Math.random();
    }

    #partialMessageMap = new Map<CallId, { totalLength: number, receivedLength: number, chunks: Uint8Array[] }>();

    #processPartialMessage = (message: PartialSendInit | PartialSend | [MessageHeader<string>, ...unknown[]]): [MessageHeader<string>, ...unknown[]] | void => {
        if (Array.isArray(message)) {
            return message;
        }
        const { type, callId } = message;
        if (callId && type && type.startsWith('partial-send')) {
            if (message.type === 'partial-send-init') {
                this.#partialMessageMap.set(callId, {
                    totalLength: message.totalLength,
                    receivedLength: 0,
                    chunks: [],
                });
            } else if (type === 'partial-send') {
                const entry = this.#partialMessageMap.get(callId);
                if (entry) {
                    const chunk = Buffer.from(message.chunk);
                    entry.chunks.push(chunk);
                    entry.receivedLength += chunk.byteLength;
                    if (loggingEnabled()) console.log(`[${callId}] chunk: ${chunk.byteLength}, progress: ${entry.receivedLength}/${entry.totalLength}`);

                    if (entry.receivedLength === entry.totalLength) {
                        const fullData = new Uint8Array(entry.totalLength);
                        let offset = 0;
                        for (const chunk of entry.chunks) {
                            fullData.set(chunk, offset);
                            offset += chunk.byteLength;
                        }

                        if (loggingEnabled()) console.log(`[${callId}] Full data received`);

                        this.#partialMessageMap.delete(callId);

                        return SuperJSON.parse(Buffer.from(uncompress(Buffer.from(fullData))).toString());
                    }
                }
            }
            return;
        }
        return message as unknown as [MessageHeader<string>, ...unknown[]];
    }

    #sendRaw(args: unknown, callId?: CallId) {
        const data = compress(Buffer.from(SuperJSON.stringify(args)));
        const CHUNK_SIZE = 16 * 1024;

        if (data.byteLength <= CHUNK_SIZE) {
            return this.#channel.send(data);
        }

        if (this.#channel instanceof RTCDataChannel) {
            this.#channel.bufferedAmountLowThreshold = CHUNK_SIZE;
        }

        if (loggingEnabled()) console.log('large data', data.byteLength);

        if (callId === undefined) {
            callId = this.#generateCallId();
        }

        const init: PartialSendInit = {
            type: 'partial-send-init',
            callId,
            totalLength: data.byteLength,
        };

        this.#channel.send(compress(Buffer.from(SuperJSON.stringify(init))));

        let offset = 0;
        const sendChunk = () => {
            if (loggingEnabled()) console.log(offset, data.byteLength, this);
            if (offset < data.byteLength) {
                const end = Math.min(offset + CHUNK_SIZE, data.byteLength);
                const chunk = data.slice(offset, end);
                const partial: PartialSend = {
                    type: 'partial-send',
                    callId,
                    chunk
                };
                this.#channel.send(compress(Buffer.from(SuperJSON.stringify(partial))));
                offset = end;

                if ('bufferedAmount' in this.#channel && this.#channel.bufferedAmount > CHUNK_SIZE) {
                    if (loggingEnabled()) console.log(`bufferedAmount: ${this.#channel.bufferedAmount}`);
                    if (this.#channel instanceof RTCDataChannel) {
                        this.#channel.addEventListener('bufferedamountlow', sendChunk, { once: true });
                    } else {
                        const channel = this.#channel;
                        const h = setInterval(() => {
                            if (channel.bufferedAmount < CHUNK_SIZE) {
                                clearInterval(h);
                                sendChunk();
                            }
                        });
                    }
                } else {
                    if (loggingEnabled()) console.log('send');
                    sendChunk();
                }
            }
        }

        sendChunk();
    }

    constructor(channel: TransportChannel | WebSocket | RTCDataChannel) {
        this.#channel = channel;
        if ('binaryType' in channel && channel.binaryType !== 'arraybuffer') {
            channel.binaryType = 'arraybuffer';
        }
        const onmessage = async (event: MessageEvent<ArrayBuffer>) => {
            const message = this.#processPartialMessage(SuperJSON.parse(Buffer.from(uncompress(event.data)).toString()));
            if (message) {
                if (loggingEnabled()) console.assert(message.length !== 0, `invalid message : ${message}`);
                if (message.length === 0) {
                    return;
                }
                const type = message[0].type;
                const callId = message[0].callId;
                const args = message.slice(1);
                try {
                    if (type === 'handler-added') {
                        const preparedType = args[0] as string;
                        this.#preparedTypes.push(preparedType);
                        this.#preparedTypesEmitter.emit(preparedType);
                    } else if (type === 'rejection-error') {
                        this.#rejectionEmitter.emit(callId, ...args);
                    } else if (type) {
                        // on, once 등 처리 결과를 반환하지않는 이벤트를 발생시킵니다.
                        this.#emitter.emit(type, ...args);

                        // 핸들러를 호출합니다. (핸들러는 호출 결과를 반환하기 때문에 중복 호출이 되지 않아야합니다.)
                        // 타입에 대한 핸들러의 우선순위가 높도록 처리하여, 타입별 핸들링 작업이 용이하도록 합니다.
                        // 타입에 대한 핸들러가 없을 경우에만 범용 핸들러를 호출합니다.
                        const handler = this.#handlerMap.get(type);
                        if (handler) {
                            handler(...args).then(response => {
                                if (loggingEnabled()) console.log(type, callId, ...args, response);
                                this.#sendRaw([{ callId }, response], callId);
                            }).catch(reason => {
                                if (loggingEnabled()) console.warn(reason);
                                this.#sendRaw([{ type: 'rejection-error', callId }, reason], callId);
                            });
                        } else if (this.#handler) {
                            this.#handler(type, ...args).then(response => {
                                if (loggingEnabled()) console.log(type, callId, ...args, response);
                                this.#sendRaw([{ callId }, response], callId);
                            }).catch(reason => {
                                if (loggingEnabled()) console.warn(reason);
                                this.#sendRaw([{ type: 'rejection-error', callId }, reason], callId);
                            });
                        }
                    } else {
                        if (loggingEnabled()) console.log(callId, ...args);
                        this.#responseEmitter.emit(callId, ...args);
                    }
                } catch (error) {
                    if (loggingEnabled()) console.warn(error);
                    this.#sendRaw([{ type: 'rejection-error', callId }, error], callId);
                }
            }
        };
        if ('onmessage' in channel) {
            channel.onmessage = onmessage;
        } else {
            channel.onMessage(onmessage);
        }
    }


    /**
     * 메시지 종류에 대한 핸들러가 등록되지 않은 모든 메시지를 처리하기 위한 범용 핸들러를 등록합니다.
     *
     * @param handler 매시지를 처리할 핸들러
     */
    setHandler<T extends keyof RecvMessageMap>(handler: Handler<T, RecvMessageMap>): this;

    /**
     * 특정 메시지를 처리하기 위한 핸들러를 등록합니다.
     *
     * (메시지 종류 대한 핸들러가 없을 경우에는 범용 핸들러가 호출됩니다.)
     *
     * @param type 처리할 메시지 종류.
     * @param handler 특정 매시지를 처리할 핸들러
     */
    setHandler<T extends keyof RecvMessageMap>(type: T, handler: TypeHandler<T, RecvMessageMap>): this;

    setHandler<T extends keyof RecvMessageMap>(typeOrHandler: T | Handler<T, RecvMessageMap>, handler: TypeHandler<T, RecvMessageMap> | void) {
        if (typeof typeOrHandler === 'function') {
            this.#handler = typeOrHandler as (...args: unknown[]) => Promise<unknown>;
            this.#sendRaw([{ type: 'handler-added' }, '*']);
        } else {
            this.#handlerMap.set(typeOrHandler as string, handler as (...args: unknown[]) => Promise<unknown>);
            this.#sendRaw([{ type: 'handler-added' }, typeOrHandler as string]);
        }
        return this;
    }


    on<T extends keyof RecvMessageMap>(type: T, listener: Listener<T, RecvMessageMap>) {
        this.#emitter.on(type as string, listener as (...args: unknown[]) => void);
        this.#sendRaw([{ type: 'handler-added' }, type as string]);
        return this;
    }

    once<T extends keyof RecvMessageMap>(type: T, listener: Listener<T, RecvMessageMap>) {
        this.#emitter.once(type as string, listener as (...args: unknown[]) => void);
        this.#sendRaw([{ type: 'handler-added' }, type as string]);
        return this;
    }

    off<T extends keyof RecvMessageMap>(type: T, listener: Listener<T, RecvMessageMap>) {
        this.#emitter.off(type as string, listener as (...args: unknown[]) => void);
        return this;
    }

    #send<T extends Type<SendMessageMap>>(type: T, callId: CallId, ...args: Request<T, SendMessageMap>) {
        this.#sendRaw([{ callId, type }, ...args], callId);
    }

    /**
     * 원격지(서버)로 메시지를 전송합니다.
     *
     * @param type 메시지 종류.
     * @param args 메시지 내용.
     */
    send<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        this.waitUntilReady(type).then(() => this.#send(type, this.#generateCallId(), ...args));
    }

    /**
     * 원격지(서버)로 메시지를 전송 후 응답을 반환받습니다.
     *
     * @param type 메시지 종류.
     * @param args 메시지 내용.
     * @returns 응답 메시지.
     */
    async sendAndWait<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        await this.waitUntilReady(type);
        const callId = this.#generateCallId();
        const pr = new Promise<Response<T, SendMessageMap>>((resolve, reject) => {
            this.#responseEmitter.once(callId, resolve);
            this.#rejectionEmitter.once(callId, reject);
        });
        this.#send(type, callId, ...args);
        return pr;
    }

    /**
     * 핸들러가 등록될때까지 대기합니다.
     *
     * @param type 핸들러 메시지 종류
     */
    async waitUntilReady<T extends Type<SendMessageMap>>(type: T) {
        if (this.#preparedTypes.includes('*')) {
            return;
        }
        if (this.#preparedTypes.includes(type as string)) {
            return;
        }
        await new Promise<void>(resolve => this.#preparedTypesEmitter.once(type as string, resolve));
    }

    /**
     * 원격지(서버)로 메시지를 전송합니다.
     *
     * @param type 메시지 종류.
     * @param args 메시지 내용.
     */
    trySend<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        this.#send(type, this.#generateCallId(), ...args);
    }

    /**
     * 원격지(서버)로 메시지를 전송 후 응답을 반환받습니다.
     *
     * @param type 메시지 종류.
     * @param args 메시지 내용.
     * @returns 응답 메시지.
     */
    async trySendAndWait<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        const callId = this.#generateCallId();
        const pr = new Promise<Response<T, SendMessageMap>>((resolve, reject) => {
            this.#responseEmitter.once(callId, resolve);
            this.#rejectionEmitter.once(callId, reject);
        });
        this.#send(type, callId, ...args);
        return pr;
    }
}