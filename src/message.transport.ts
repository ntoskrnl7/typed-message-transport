import EventEmitter from "events";
import { compress, uncompress } from 'snappyjs';
import { Buffer } from 'buffer/';
import SuperJSON from './superJSON';

import JSBI from 'jsbi';

/**
 * A type that represents an empty message map.
 * This is used to represent a message map that has no message types.
 *
 * @public
 */
export type EmptyMessageMap = {
    never: { request: [] };
};

/**
 * Checks whether logging is enabled by looking up the `loggingEnabled` property
 * on the global object (`globalThis`).
 *
 * This function returns `true` if logging is enabled, and `false` otherwise.
 * The property `loggingEnabled` is expected to be a boolean flag that controls
 * whether log messages should be printed or not.
 *
 * @returns {boolean} `true` if logging is enabled, `false` otherwise.
 */
function loggingEnabled(): boolean {
    return globalThis.loggingEnabled;
}

/**
 * A type alias for a unique identifier used for tracking calls/messages.
 * This ID helps in correlating requests and responses, particularly in cases
 * of asynchronous communication (e.g., when waiting for a response to a sent message).
 *
 * @public
 */
export type CallId = `${string}-${string}`;

/**
 * Defines the header structure for a message, including a type and an optional callId.
 * The `type` field specifies the type of the message, and `callId` is a unique identifier for the message.
 * 
 * @public
 */
export type MessageHeader<T extends string> = {
    type?: T;  // Type of the message (e.g., 'partial-send-init', 'partial-send')
    callId?: CallId;  // Optional unique identifier for the message (used for tracking)
}

/**
 * Defines the structure for an initial partial message, which includes a `totalLength`
 * to specify the total length of the data being sent in chunks.
 */
type PartialSendInit = MessageHeader<'partial-send-init'> & {
    totalLength: number;  // Total length of the data being sent in chunks
};

/**
 * Defines the structure for a partial message chunk, which includes the actual data chunk
 * being sent as part of a larger message.
 */
type PartialSend = MessageHeader<'partial-send'> & {
    chunk: Uint8Array;  // The data chunk being sent as part of a larger message
};

/**
 * Interface for serializing and deserializing messages.
 * - `stringify` converts a message or data structure into a string format.
 * - `parse` converts a string back into a message structure, returning the message header and the corresponding data.
 * 
 * @public
 */
export interface MessageSerializer {
    /**
     * Converts data to a string format.
     *
     * @param data - The data to be serialized into a string.
     * @returns The serialized string representation of the data.
     */
    stringify(data: unknown): string;

    /**
     * Parses a string and converts it into a message structure (a header followed by the relevant data).
     *
     * @param data - The serialized string to be parsed.
     * @returns A tuple containing the message header and the corresponding data.
     */
    parse(data: string): [MessageHeader<string>, ...MessageRequestType];
}

/**
 * Interface for a communication channel to send/receive data.
 * 
 * @public
 */
export interface TransportChannel {
    /**
     * Method to send data over the channel.
     *
     * @param data - The data to be sent via MessageTransport.
     */
    send(data: ArrayBuffer): void;

    /**
     * Method to register a handler for receiving messages.
     *
     * @param onmessage - The handler function for receiving messages from MessageTransport.
     */
    onMessage(onmessage: (event: MessageEvent<ArrayBuffer>) => ReturnType<NonNullable<MessageEventTarget<TransportChannel>['onmessage']>>): void;
}

/**
 * Represents the expected types for request arguments in a message schema.
 *
 * - Each element in the array can be either `unknown` or `undefined`.
 * - `unknown` allows any type, making it flexible to accept various argument types.
 * - `undefined` indicates that an argument may be optional or not provided.
 *
 * This array type enables flexibility in defining the arguments for each message type.
 * 
 * @public
 */
export type MessageRequestType = (unknown | undefined)[];

/**
 * Represents the possible types for a response value in a message schema.
 *
 * - `unknown`: Allows any type, providing flexibility for various response types.
 * - `void`: Indicates that no response is expected for certain message types.
 * - `undefined`: Specifies that a response may be optional or not defined.
 *
 * This type union allows the flexibility needed to represent different response scenarios
 * within the message schema.
 * 
 * @public
 */
export type MessageResponseType = unknown | void | undefined;

/**
 * Defines the schema for messages exchanged between client and server.
 * The schema specifies the expected structure of requests and responses for each message type.
 *
 * - Each key represents a unique message type.
 * - The `request` is an array of arguments that are expected to be sent with the message.
 * - The `response` represents the expected type of the response for the given message.
 *
 * @example
 * ```ts
 * // Example of a message schema:
 * {
 *   'getData': {
 *     request: [string, number],  // expects a string and a number as arguments
 *     response: { data: string }  // expects an object with a 'data' field (string)
 *   }
 * }
 * ```
 * 
 * @public
 */
export type MessageSchema = {
    [key: string]: {
        request?: MessageRequestType;     // Arguments expected in the request for this message type
        response?: MessageResponseType;  // Expected response type for this message type
    };
};

/**
 * A type that represents the keys of the `MessageMap` excluding `number` and `symbol` types.
 * This is used to extract the message types from the `MessageMap` object.
 *
 * @example
 * ```ts
 * type MessageMap = { 'message-type': { request: [], response: string } };
 * type MessageType = Type<MessageMap>; // 'message-type'
 * ```
 * 
 * @public
 */
export type Type<MessageMap extends MessageSchema> = Exclude<keyof MessageMap, number | symbol>;

/**
 * A type that extracts the request arguments type from a given message type `T` in the `MessageMap`.
 *
 * If the message type `T` has a `request` field, the corresponding type is inferred and returned.
 * If no `request` field is found, it defaults to an empty array `[]`.
 *
 * @param T - A specific message type.
 * @param MessageMap - A map of message types and their corresponding request/response structures.
 *
 * @example
 * ```ts
 * type RequestArgs = Request<'message-type', MessageMap>; // RequestArgs would be `[]` (an empty array) in this case
 * ```
 * 
 * @public
 */
export type Request<T extends Type<MessageMap>, MessageMap extends MessageSchema> = MessageMap[T] extends { request: infer Req } ? Req extends MessageRequestType ? Req : [] : [];

/**
 * A type that extracts the response type for a given message type `T` from the `MessageMap`.
 *
 * If the message type `T` has a `response` field, the corresponding type is inferred and returned.
 * If no `response` field is found, it defaults to `void`.
 *
 * @param T - A specific message type.
 * @param MessageMap - A map of message types and their corresponding request/response structures.
 *
 * @example
 * ```ts
 * type ResponseType = Response<'message-type', MessageMap>; // ResponseType would be `string` in this case
 * ```
 * 
 * @public
 */
export type Response<T extends Type<MessageMap>, MessageMap extends MessageSchema> = MessageMap[T] extends { response: infer Res } ? Res : void;

/**
 * @public
 */
export type ListenerArgs<MessageMap extends MessageSchema> = {
    [T in keyof MessageMap]: MessageMap[T] extends { request: infer Request extends unknown[] }
    ? [type: T, args: Request]
    : [type: T, args: []]
}[keyof MessageMap];

/**
 * A type for a listener function that handles a specific message type `T`.
 * This listener function accepts the message type and its arguments, enabling flexible processing.
 * 
 * @public
 */
export type Listener<MessageMap extends MessageSchema> = (...args: ListenerArgs<MessageMap>) => void;

/**
 * A type for a listener function that handles a specific message type `T`.
 * The listener function accepts the request arguments corresponding to the message type `T` in the `MessageMap`.
 *
 * @param T - The message type that this listener will handle.
 * @param MessageMap - A map of message types and their corresponding request/response structures.
 *
 * @example
 * ```ts
 * const listener: Listener<'message-type', MessageMap> = (...args) => { handle the request };
 * ```
 * 
 * @public
 */
export type TypeListener<T extends Type<MessageMap>, MessageMap extends MessageSchema> = (...args: Request<T, MessageMap>) => void;

/**
 * A string literal type used to enforce returning the result of `done()` in a handler.
 *
 * This is used to produce a compiler error if `done()` is called without `return`.
 * 
 * @public
 */
export type MustReturnFromDone = {
    _$_$_: "You must call return done(<value>) in your setHandler callback."
}

/**
 * Defines the structure of arguments passed to the handler function registered with `setHandler`.
 *
 * For each message type `T` in `MessageMap`, this creates a tuple of:
 * - the message type key,
 * - its request arguments (spread into an array),
 * - and a `done` callback which must be returned from to ensure proper flow control.
 *
 * The return type of `done` is `MustReturnFromDone`, enforcing correct usage through TypeScript.
 *
 * @param MessageMap - A mapping of all message types and their request/response structures.
 * 
 * @public
 */
export type HandlerArgs<MessageMap extends MessageSchema> = {
    [T in keyof MessageMap]: MessageMap[T] extends { request: infer Request extends unknown[] }
    ? [type: T, args: Request, done: (value: MessageMap[T] extends { response: infer Response } ? Response : void) => MustReturnFromDone]
    : [type: T, args: [], done: (value: MessageMap[T] extends { response: infer Response } ? Response : void) => MustReturnFromDone]
}[keyof MessageMap];

/**
 * A generic handler function type used with `setHandler`.
 *
 * This function receives a message type, its arguments, and a `done` callback.
 * The handler **must** return the result of calling `done(...)`, which is enforced by the `MustReturnFromDone` type.
 *
 * This pattern prevents unintentional continuation of control flow after calling `done`.
 *
 * @param MessageMap - A mapping of all message types and their request/response structures.
 *
 * @example
 * ```ts
 * tp.setHandler((type, args, done) => {
 *   if (type === 'get-user') {
 *     return done({ id: 1, name: 'Alice' }); // ✅ Correct usage
 *   }
 * });
 * ```
 * 
 * @public
 */
export type Handler<MessageMap extends MessageSchema> = (...args: HandlerArgs<MessageMap>) => MustReturnFromDone | Promise<MustReturnFromDone>;

/**
 * A type for a handler function that handles a specific message type `T` and returns a promise of the response.
 * This is similar to the `Handler` type but omits the `type` argument and is used in cases where the message type is already inferred.
 *
 * @param T - The message type that this handler will process.
 * @param MessageMap - A map of message types and their corresponding request/response structures.
 * 
 * @public
 */
export type TypeHandler<T extends Type<MessageMap>, MessageMap extends MessageSchema> = (...args: Request<T, MessageMap>) => Response<T, MessageMap> | Promise<Response<T, MessageMap>>;

/**
 * @public
 */
export type WellknownChannel = RTCDataChannel | WebSocket;

/**
 * Class that handles message transportation with support for both sending and receiving messages.
 * Supports large message splitting and ensures message delivery in chunks.
 * 
 * @public
 */
export class MessageTransport<SendMessageMap extends MessageSchema = EmptyMessageMap, RecvMessageMap extends MessageSchema = EmptyMessageMap> {

    /**
     * Internal channel used for communication, which can be a custom TransportChannel,
     * RTCDataChannel, or WebSocket.
     */
    #channel: TransportChannel | WellknownChannel;

    /**
     * Sequence counter used to generate unique call IDs for each request.
     * This ensures that each request can be uniquely identified for proper response handling.
     */
    readonly #seq: JSBI = JSBI.BigInt(0);

    /**
     * A generic handler that processes incoming messages. This handler is invoked when no specific handler
     * is set for a particular message type.
     */
    #handler?: (...args: MessageRequestType) => Promise<MessageResponseType>;

    /**
     * A generic listener that gets called for all message types if registered.
     */
    #listener?: (...args: MessageRequestType) => void;

    /**
     * A map of message types to their corresponding handlers. Each message type has an associated handler function
     * that is called when a message of that type is received.
     */
    readonly #handlerMap: Map<string, (...args: MessageRequestType) => Promise<MessageResponseType>> = new Map();

    /**
     * Event emitter used to emit events for specific message types.
     * Used to notify listeners when a message of a particular type is received.
     */
    readonly #emitter = new EventEmitter();

    /**
     * Event emitter specifically for handling responses to messages that have been sent.
     * It listens for responses related to a specific `callId`.
     */
    readonly #responseEmitter = new EventEmitter();

    /**
     * Event emitter for handling error or rejection messages that occur during message processing.
     * It listens for errors and notifies listeners with the provided error message.
     */
    readonly #rejectionEmitter = new EventEmitter();

    /**
     * A list of message types that are considered "prepared" and ready for processing.
     * This is used to ensure that handlers are only added once for each message type.
     */
    readonly #preparedTypes: string[] = [];

    /**
     * Event emitter used to notify when message types are "prepared" and ready for processing.
     */
    readonly #preparedTypesEmitter = new EventEmitter();

    /**
     * Serializer used to convert messages to and from their string representation for transmission.
     * It can be customized (e.g., to use SuperJSON) for more advanced serialization needs.
     */
    readonly #serializer: MessageSerializer;

    /**
     * A map that stores partial messages that are being transmitted in chunks.
     * Each entry in the map corresponds to a `callId` and tracks the total length, received length,
     * and the chunks that have been received so far. This is used for reconstructing large messages
     * that are sent in multiple parts.
     */
    readonly #partialMessageMap = new Map<CallId, { totalLength: number, receivedLength: number, chunks: Uint8Array[] }>();

    /**
     * Generates a unique call ID by combining a sequence number with a random value.
     *
     * This method is used to generate unique call IDs for tracking requests and responses.
     *
     * @returns {CallId} A unique call ID.
     */
    #generateCallId(): CallId {
        return (JSBI.add(this.#seq, JSBI.BigInt(1)).toString() + '-' + Math.random()) as CallId;
    }

    /**
     * Processes partial messages that are sent in chunks. Reconstructs the message once all chunks are received.
     *
     * @param message - A partial message or a full message.
     * @returns The reconstructed message if all chunks are received, or `undefined` if more chunks are expected.
     */
    #processPartialMessage(message: PartialSendInit | PartialSend | [MessageHeader<string>, ...MessageRequestType]): [MessageHeader<string>, ...MessageRequestType] | 'partial-message' {
        if (Array.isArray(message)) {
            return message;
        }
        const { type, callId } = message;
        if (callId && type?.startsWith('partial-send')) {
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

                        return this.#serializer.parse(Buffer.from(uncompress(Buffer.from(fullData))).toString());
                    }
                }
            }
            return 'partial-message';
        }
        return message as unknown as [MessageHeader<string>, ...MessageRequestType];
    }

    /**
     * Sends raw data over the channel, handling chunking if the data is large.
     *
     * @param args - The message and its parameters.
     * @param callId - The unique call ID for the message.
     */
    #sendRaw(args: [MessageHeader<string>, ...MessageRequestType], callId?: CallId) {
        const data = compress(Buffer.from(this.#serializer.stringify(args)));
        const CHUNK_SIZE = 16 * 1024;

        if (data.byteLength <= CHUNK_SIZE) {
            return this.#channel.send(data.buffer);
        }

        if (globalThis.RTCDataChannel && this.#channel instanceof RTCDataChannel) {
            this.#channel.bufferedAmountLowThreshold = CHUNK_SIZE;
        }

        if (loggingEnabled()) console.log('large data', data.byteLength);

        callId ??= this.#generateCallId();

        const init: PartialSendInit = {
            type: 'partial-send-init',
            callId,
            totalLength: data.byteLength,
        };

        this.#channel.send(compress(Buffer.from(this.#serializer.stringify(init))).buffer);

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
                this.#channel.send(compress(Buffer.from(this.#serializer.stringify(partial))).buffer);

                offset = end;

                if ('bufferedAmount' in this.#channel && this.#channel.bufferedAmount > CHUNK_SIZE) {
                    if (loggingEnabled()) console.log(`bufferedAmount: ${this.#channel.bufferedAmount}`);
                    if (globalThis.RTCDataChannel && this.#channel instanceof RTCDataChannel) {
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

    /**
     * Initializes the channel and sets up the onmessage handler.
     */
    #initialize() {
        const channel = this.#channel;
        if ('binaryType' in channel && channel.binaryType !== 'arraybuffer') {
            channel.binaryType = 'arraybuffer';
        }
        const onmessage = async (event: MessageEvent<ArrayBuffer>) => {
            try {
                const message = this.#processPartialMessage(this.#serializer.parse(Buffer.from(uncompress(event.data)).toString()));
                if (message === 'partial-message') {
                    event.stopImmediatePropagation();
                } else {
                    if (loggingEnabled()) console.assert(message.length !== 0, `invalid message : ${message}`);
                    if (message.length === 0) {
                        event.stopImmediatePropagation();
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
                            if (callId) {
                                this.#rejectionEmitter.emit(callId, ...args);
                            } else if (loggingEnabled()) {
                                console.warn(`Rejection error message is invalid: 'callId' is missing`, message);
                            }
                        } else if (type) {
                            // Triggers events that do not return results such as `on` or `once`
                            this.#emitter.emit(type, ...args);

                            if (this.#listener) {
                                this.#listener(type, args);
                            }

                            // Calls the handler (handlers should return results and be called only once)
                            const handler = this.#handlerMap.get(type)?.bind(this, ...args) ?? this.#handler?.bind(this, type, args, (response: unknown) => {
                                throw { _$handler_response$_: response };
                            });
                            if (handler) {
                                Promise.resolve().then(handler).then(response => {
                                    if (loggingEnabled()) console.log(type, callId, ...args, response);
                                    this.#sendRaw([{ callId }, response], callId);
                                }).catch(reason => {
                                    if ('_$handler_response$_' in reason) {
                                        if (loggingEnabled()) console.log(type, callId, ...args, reason._$handler_response$_);
                                        this.#sendRaw([{ callId }, reason._$handler_response$_], callId);
                                    } else {
                                        if (loggingEnabled()) console.warn(reason);
                                        this.#sendRaw([{ type: 'rejection-error', callId }, reason], callId);
                                    }
                                });
                            }
                        } else {
                            if (loggingEnabled()) console.log(callId, ...args);
                            if (callId) {
                                this.#responseEmitter.emit(callId, ...args);
                            } else {
                                if (loggingEnabled()) console.warn(`Response message is invalid: 'callId' is missing`, message);
                                event.stopImmediatePropagation();
                            }
                        }
                    } catch (error) {
                        if (loggingEnabled()) console.warn(error);
                        this.#sendRaw([{ type: 'rejection-error', callId }, error], callId);
                    }
                    event.stopImmediatePropagation();
                }
            } catch {
            }
        };
        if ('onmessage' in channel) {
            channel.onmessage = onmessage;
        } else {
            channel.onMessage(onmessage);
        }
    }

    /**
     * Constructor for initializing a `MessageTransport` instance.
     * This constructor sets up the transport channel, serializer, and prepares the internal state
     * for message sending and receiving operations.
     *
     * @param channel - The transport channel used to send and receive messages.
     *                  It can be either a custom `TransportChannel`, a `WebSocket`, or an `RTCDataChannel`.
     * @param serializer - An optional serializer for encoding and decoding messages.
     *                     By default, `SuperJSON` is used if no serializer is provided.
     *
     * The constructor also initializes listeners and sets up message handling for the provided `channel`.
     */
    constructor(channel: TransportChannel | WebSocket | RTCDataChannel, serializer: MessageSerializer = SuperJSON) {
        this.#responseEmitter.setMaxListeners(0);
        this.#rejectionEmitter.setMaxListeners(0);
        this.#preparedTypesEmitter.setMaxListeners(0);

        this.#channel = channel;
        this.#serializer = serializer;

        this.#initialize();
    }

    /**
     * Getter for the transport channel used for message sending and receiving.
     * This returns the current channel being used, which could be a custom `TransportChannel`, 
     * a `WebSocket`, or an `RTCDataChannel`.
     *
     * @returns The current transport channel.
     */
    get channel() {
        return this.#channel;
    }
    set channel(newChannel: TransportChannel | WebSocket | RTCDataChannel) {
        this.#channel = newChannel;
        this.#initialize();
    }

    /**
     * Sets the maximum number of event listeners for the message transport.
     * This allows controlling how many listeners can be added before a warning is shown.
     *
     * @param n - The maximum number of event listeners.
     * @returns The current instance of `MessageTransport` for method chaining.
     */
    setMaxListeners(n: number): this {
        this.#emitter.setMaxListeners(n);
        return this;
    }

    /**
     * Gets the current maximum number of event listeners for the message transport.
     * This returns the current limit for how many listeners can be attached to events before a warning is triggered.
     *
     * @returns The maximum number of event listeners.
     */
    getMaxListeners(): number {
        return this.#emitter.getMaxListeners();
    }


    /**
     * Registers a generic handler for messages of any type that doesn't have a specific handler.
     *
     * @param handler - The handler to process the message.
     */
    setHandler(handler: Handler<RecvMessageMap>): this;

    /**
     * Registers a handler for a specific message type.
     *
     * If a handler for the message type is not found, the generic handler will be called.
     *
     * @param type - The message type.
     * @param handler - The handler to process the message of that type.
     */
    setHandler<T extends Type<RecvMessageMap>>(type: T, handler: TypeHandler<T, RecvMessageMap>): this;

    setHandler<T extends Type<RecvMessageMap>>(typeOrHandler: T | Handler<RecvMessageMap>, handler: TypeHandler<T, RecvMessageMap> | void) {
        if (typeof typeOrHandler === 'function') {
            this.#handler = typeOrHandler as unknown as (...args: MessageRequestType) => Promise<MessageResponseType>;
            this.#sendRaw([{ type: 'handler-added' }, '*']);
        } else {
            this.#handlerMap.set(typeOrHandler as string, handler as (...args: MessageRequestType) => Promise<MessageResponseType>);
            this.#sendRaw([{ type: 'handler-added' }, typeOrHandler as string]);
        }
        return this;
    }

    /**
     * Registers a generic listener for all message types.
     * The listener will be called whenever any message is received.
     */
    on(listener: Listener<RecvMessageMap>): this;

    /**
     * Registers an event listener for the specified message type.
     * The listener will be called whenever a message of the given type is received.
     * Additionally, it notifies the remote side that the handler has been added.
     *
     * @param type - The type of message to listen for.
     * @param listener - The callback function to handle the message.
     * @returns The current instance of `MessageTransport` for method chaining.
     */
    on<T extends Type<RecvMessageMap>>(type: T, listener: TypeListener<T, RecvMessageMap>): this;

    on<T extends Type<RecvMessageMap>>(typeOrListener: T | Listener<RecvMessageMap>, listener: TypeListener<T, RecvMessageMap> | void) {
        if (typeof typeOrListener === 'function') {
            this.#listener = typeOrListener as (...args: MessageRequestType) => void;
            this.#sendRaw([{ type: 'handler-added' }, '*']);
        } else {
            this.#emitter.on(typeOrListener as string, listener as (...args: MessageRequestType) => void);
            this.#sendRaw([{ type: 'handler-added' }, typeOrListener as string]);
        }
        return this;
    }

    /**
     * Registers an event listener that will be called only once for the specified message type.
     * The listener will be automatically removed after being triggered once.
     * Additionally, it notifies the remote side that the handler has been added.
     *
     * @param type - The type of message to listen for.
     * @param listener - The callback function to handle the message.
     * @returns The current instance of `MessageTransport` for method chaining.
     */
    once<T extends Type<RecvMessageMap>>(type: T, listener: TypeListener<T, RecvMessageMap>) {
        this.#emitter.once(type as string, listener as (...args: MessageRequestType) => void);
        this.#sendRaw([{ type: 'handler-added' }, type as string]);
        return this;
    }

    /**
     * Unregisters an event listener for the specified message type.
     * The listener will no longer be called when the specified message type is received.
     *
     * @param type - The type of message for which the listener should be removed.
     * @param listener - The callback function to be removed.
     * @returns The current instance of `MessageTransport` for method chaining.
     */
    off<T extends Type<RecvMessageMap>>(type: T, listener: TypeListener<T, RecvMessageMap>) {
        this.#emitter.off(type as string, listener as (...args: MessageRequestType) => void);
        return this;
    }

    /**
     * Sends a message of a specific type with the given arguments to the remote side.
     * It also handles the call ID and passes the message to the appropriate transport channel.
     *
     * @param type - The type of message to send.
     * @param callId - A unique identifier for the message, used to track the request and response.
     * @param args - The arguments to be included with the message.
     */
    #send<T extends Type<SendMessageMap>>(type: T, callId: CallId, ...args: Request<T, SendMessageMap>) {
        this.#sendRaw([{ callId, type }, ...args], callId);
    }


    /**
     * Sends a message and waits until the handler for the message type is ready (when the handler is registered).
     *
     * This method ensures that the handler for the message type is prepared before sending the message.
     *
     * @param type - The message type.
     * @param args - The content of the message.
     */
    send<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        this.waitUntilReady(type).then(() => this.#send(type, this.#generateCallId(), ...args));
    }

    /**
     * Sends a message and waits for a response. It waits until the handler for the message type is ready
     * before sending the message and then returns the response once received.
     *
     * @param type - The message type.
     * @param args - The content of the message.
     * @returns A promise that resolves with the response message.
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
     * Waits until the handler for a specific message type is registered (ready).
     * If the handler is not ready, the method will wait for the handler to be registered.
     *
     * @param type - The message type.
     */
    async waitUntilReady<T extends Type<SendMessageMap>>(type: T) {
        if (this.isHandlerReady(type)) {
            return;
        }
        await new Promise<void>(resolve => {
            this.#preparedTypesEmitter.once('*', resolve);
            this.#preparedTypesEmitter.once(type as string, resolve);
        });
    }

    /**
     * Checks if the handler for the specific message type is registered and ready.
     *
     * This method checks if the handler for the given message type has been prepared.
     *
     * @param type - The message type.
     * @returns `true` if the handler is ready; otherwise, `false`.
     */
    isHandlerReady<T extends Type<SendMessageMap>>(type: T) {
        return this.#preparedTypes.includes('*') || this.#preparedTypes.includes(type as string);
    }

    /**
     * Attempts to send a message without waiting for a response.
     *
     * This method sends the message immediately without waiting for any handler to be ready.
     *
     * @param type - The message type.
     * @param args - The content of the message.
     */
    trySend<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        this.#send(type, this.#generateCallId(), ...args);
    }

    /**
     * Attempts to send a message and waits for a response. If the handler is not prepared,
     * the method will not send the message and will return `undefined`.
     *
     * @param type - The message type.
     * @param args - The content of the message.
     * @returns A promise that resolves with the response message, or `undefined` if the handler is not prepared.
     */
    async trySendAndWait<T extends Type<SendMessageMap>>(type: T, ...args: Request<T, SendMessageMap>) {
        if (!this.isHandlerReady(type)) {
            return undefined;
        }
        const callId = this.#generateCallId();
        const pr = new Promise<Response<T, SendMessageMap>>((resolve, reject) => {
            this.#responseEmitter.once(callId, resolve);
            this.#rejectionEmitter.once(callId, reject);
        });
        this.#send(type, callId, ...args);
        return pr;
    }
}