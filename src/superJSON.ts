import SuperJSON from 'superjson';
import { Buffer as NodeBuffer } from 'buffer';
import { Buffer } from 'buffer/';

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

export { SuperJSON };

export default SuperJSON;