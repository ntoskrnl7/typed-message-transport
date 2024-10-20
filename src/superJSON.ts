import SuperJSON from 'superjson';
import { Buffer as NodeBuffer } from 'buffer';
import { Buffer } from 'buffer/';

function toSerializable(obj: object | null, depth?: number): object | null {
    const toObjectI = (obj: object | null, current: number) => {
        if (obj === null) {
            return null;
        }
        if (depth === undefined) {
            depth = 1;
        }
        if (obj instanceof Error) {
            if (obj.stack === undefined) {
                return JSON.parse(JSON.stringify({
                    name: obj.name,
                    message: obj.message
                }));
            } else {
                return JSON.parse(JSON.stringify({
                    name: obj.name,
                    message: obj.message,
                    stack: obj.stack
                }));
            }
        } else if (obj instanceof Buffer) {
            return JSON.parse(JSON.stringify(obj));
        }
        if (current > depth) {
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch (error) {
                return null;
            }
        }
        const ret: { [key: string]: object | null } = {};
        for (const key in Object.getPrototypeOf(obj)) {
            const value = (obj as { [key: string]: object })[key];
            switch (typeof value) {
                case 'function':
                    break;
                case 'object':
                    if (value) {
                        ret[key] = toObjectI(value, current + 1);
                    }
                    break;
                default:
                    ret[key] = value;
                    break;
            }
        }
        for (const key in obj) {
            const value = (obj as { [key: string]: object })[key];
            switch (typeof value) {
                case 'function':
                    break;
                case 'object':
                    if (value) {
                        ret[key] = toObjectI(value, current + 1);
                    }
                    break;
                default:
                    ret[key] = value;
                    break;
            }
        }
        return ret;
    };
    return toObjectI(obj, 1);
}

SuperJSON.registerCustom<Event, string>(
    {
        isApplicable: (v): v is Event => v instanceof Event,
        serialize: (v) => SuperJSON.stringify(toSerializable(v)),
        deserialize: (v) => SuperJSON.parse(v),
    },
    'Event'
);

SuperJSON.registerCustom<NodeBuffer, number[]>(
    {
        isApplicable: (v): v is NodeBuffer => NodeBuffer.isBuffer(v),
        serialize: (v) => [...v],
        deserialize: (v) => NodeBuffer.from(v),
    },
    'NodeBuffer'
);

SuperJSON.registerCustom<Buffer, number[]>(
    {
        isApplicable: (v): v is Buffer => Buffer.isBuffer(v),
        serialize: (v) => [...v],
        deserialize: (v) => Buffer.from(v),
    },
    'Buffer'
);

SuperJSON.registerCustom<Uint8Array, number[]>(
    {
        isApplicable: (v): v is Uint8Array => v instanceof Uint8Array,
        serialize: (v) => [...v],
        deserialize: (v) => Uint8Array.from(v),
    },
    'Uint8Array'
);

export default SuperJSON;