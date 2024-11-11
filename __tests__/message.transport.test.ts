import { MessageTransport, TransportChannel } from '..';
import SuperJSON from '../superJSON';
import { parse, stringify } from 'flatted';

const Flatted = { parse, stringify };

type Test1MessageMap = {
    'test1-message': {
        request: [a: string, b: string];
        response: { success: boolean };
    };
};

type Test2MessageMap = {
    'test2-message': {
        request: [a: number, b: number];
    };
};

describe('MessageTransport', () => {
    it('should send a message and wait for a response using sendAndWait()', async () => {
        const { port1, port2 } = new MessageChannel();
        try {
            const tp1 = new MessageTransport<Test2MessageMap, Test1MessageMap>({
                send: MessagePort.prototype.postMessage.bind(port1),
                onMessage: MessagePort.prototype.addEventListener.bind(port1, 'message')
            } as TransportChannel);
            const tp2 = new MessageTransport<Test1MessageMap, Test2MessageMap>({
                send(data: ArrayBuffer) { port2.postMessage(data); },
                onMessage(onmessage) { port2.onmessage = onmessage; }
            });
            tp1.setHandler('test1-message', async () => ({ success: true }));
            expect(await tp2.sendAndWait('test1-message', 'arg1', 'arg2')).toEqual({ success: true });
        } finally {
            port1.close();
            port2.close();
        }
    });

    it('should handle a message and respond using setHandler()', async () => {
        const { port1, port2 } = new MessageChannel();
        try {
            const tp1 = new MessageTransport<Test2MessageMap, Test1MessageMap>({
                send: MessagePort.prototype.postMessage.bind(port1),
                onMessage: MessagePort.prototype.addEventListener.bind(port1, 'message')
            } as TransportChannel);
            const tp2 = new MessageTransport<Test1MessageMap, Test2MessageMap>({
                send(data: ArrayBuffer) { port2.postMessage(data); },
                onMessage(onmessage) { port2.onmessage = onmessage; }
            });
            tp1.setHandler('test1-message', async (a, b) => {
                expect(a).toEqual('arg1');
                expect(b).toEqual('arg2');
                return { success: true };
            });
            await tp2.sendAndWait('test1-message', 'arg1', 'arg2');

            tp2.setHandler('test2-message', async (a, b) => {
                expect(a).toEqual(10);
                expect(b).toEqual(20);
            });
            await tp1.sendAndWait('test2-message', 10, 20);
        } finally {
            port1.close();
            port2.close();
        }
    });

    it('JSON', async () => {
        const { port1, port2 } = new MessageChannel();
        try {
            const tp1 = new MessageTransport<Test2MessageMap, Test1MessageMap>({
                send: MessagePort.prototype.postMessage.bind(port1),
                onMessage: MessagePort.prototype.addEventListener.bind(port1, 'message')
            } as TransportChannel, JSON);
            const tp2 = new MessageTransport<Test1MessageMap, Test2MessageMap>({
                send(data: ArrayBuffer) { port2.postMessage(data); },
                onMessage(onmessage) { port2.onmessage = onmessage; }
            }, JSON);
            tp1.setHandler('test1-message', async () => ({ success: true }));
            expect(await tp2.sendAndWait('test1-message', 'arg1', 'arg2')).toEqual({ success: true });
        } finally {
            port1.close();
            port2.close();
        }
    });

    it('SuperJSON', async () => {
        const { port1, port2 } = new MessageChannel();
        try {
            const tp1 = new MessageTransport<Test2MessageMap, Test1MessageMap>({
                send: MessagePort.prototype.postMessage.bind(port1),
                onMessage: MessagePort.prototype.addEventListener.bind(port1, 'message')
            } as TransportChannel, SuperJSON);
            const tp2 = new MessageTransport<Test1MessageMap, Test2MessageMap>({
                send(data: ArrayBuffer) { port2.postMessage(data); },
                onMessage(onmessage) { port2.onmessage = onmessage; }
            }, SuperJSON);
            tp1.setHandler('test1-message', async () => ({ success: true }));
            expect(await tp2.sendAndWait('test1-message', 'arg1', 'arg2')).toEqual({ success: true });
        } finally {
            port1.close();
            port2.close();
        }
    });

    it('flatted', async () => {
        const { port1, port2 } = new MessageChannel();
        try {
            const tp1 = new MessageTransport<Test2MessageMap, Test1MessageMap>({
                send: MessagePort.prototype.postMessage.bind(port1),
                onMessage: MessagePort.prototype.addEventListener.bind(port1, 'message')
            } as TransportChannel, Flatted);
            const tp2 = new MessageTransport<Test1MessageMap, Test2MessageMap>({
                send(data: ArrayBuffer) { port2.postMessage(data); },
                onMessage(onmessage) { port2.onmessage = onmessage; }
            }, Flatted);
            tp1.setHandler('test1-message', async () => ({ success: true }));
            expect(await tp2.sendAndWait('test1-message', 'arg1', 'arg2')).toEqual({ success: true });
        } finally {
            port1.close();
            port2.close();
        }
    });
});
