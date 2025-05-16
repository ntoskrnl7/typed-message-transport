# `typed-message-transport` - Message Transport API

`typed-message-transport` is a TypeScript-based library designed for handling strongly-typed message exchanges between different environments, such as browser workers or Node.js processes. This library facilitates sending and receiving messages with a clear structure and type safety, using message channels (e.g., `MessageChannel` or `MessagePort`).

## Table of Contents

- [`typed-message-transport` - Message Transport API](#typed-message-transport---message-transport-api)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Key Features](#key-features)
  - [Usage](#usage)
    - [Installation](#installation)
    - [Basic Usage](#basic-usage)
    - [Message Types](#message-types)
    - [Sending Messages](#sending-messages)
    - [Receiving Messages](#receiving-messages)
      - [Setting up a Specific Handler](#setting-up-a-specific-handler)
      - [Setting up a General Handler](#setting-up-a-general-handler)
      - [Listening for Messages with `on`](#listening-for-messages-with-on)

## Overview

`typed-message-transport` provides a simple and type-safe way to send messages between different parts of your application. This can be used in various contexts, such as inter-process communication (IPC) or cross-environment communication between browsers, workers, or Node.js processes. It simplifies the task of dealing with `MessagePort` or `MessageChannel` while keeping your code clean and type-safe.

The library utilizes TypeScript's type system to ensure that the messages sent between different endpoints match expected types, reducing runtime errors.

### Key Features

- Type-safe message exchange using TypeScript's type system.
- Flexible integration with `MessagePort`, `MessageChannel`, or custom transport mechanisms.
- Supports sending requests and receiving responses with built-in promise handling.

## Usage

To use `typed-message-transport`, you need to import `MessageTransport` and instantiate it with a message map that defines the message types.

### Installation

You can install the package via npm or yarn:

```bash
npm install typed-message-transport
# or
yarn add typed-message-transport
```

### Basic Usage

First, import MessageTransport and define your message types in a MessageMap. The MessageMap allows you to define the structure of each message type, including both requests and responses.

```typescript
import { MessageTransport } from 'typed-message-transport';

type MessageMap = {
  'message-type': {
    request: [message: string, value: number];
    response: { replyMessage: string };
  };
};

const transport = new MessageTransport<MessageMap>({
  send(data: ArrayBuffer) {
    // send the data over a MessagePort or another transport mechanism
  },
  onMessage(onMessage) {
    // receive the message and invoke the provided callback
  },
});
```

### Message Types

In the MessageMap, you define each message type by specifying:

- A request structure, which defines the data sent when the message is initiated.
- A response structure, which defines the data returned in response to the message.

For example:

- The message type 'message-type' has a request with a tuple containing a string and a number.
- The response for 'message-type' will be an object with a success boolean.

### Sending Messages

To send a message, use the `send` method, passing the appropriate message type and payload.

```typescript
await transport.send('message-type', 'Hello', 42);
const result = await transport.sendAndWait('message-type', 'Hello', 42);
// result.replyMessage
```

- `send`: Sends a message without expecting a reply.
- `sendAndWait`: Sends a message and waits for a response, returning the result of the handler's reply.

The message will be sent over the transport mechanism, and the payload will be type-checked based on the `MessageMap`.

### Receiving Messages

#### Setting up a Specific Handler

To receive and handle messages, use the `setHandler` method to register a specific handler for a message type.

```typescript
transport.setHandler('message-type', async (message, value) => {
    message // 'Hello'
    value // 42
    return { replyMessage: message + value };
});
```

In this example, the handler processes incoming messages of type `'message-type'` with parameters message and value. The handler can return a response, which will be sent back if `sendAndWait` was used.

#### Setting up a General Handler

You can also use a general handler to handle multiple message types, enabling more flexible message handling based on `type`.

```typescript
transport.setHandler((type, args, done) => {
    switch (type) {
        case 'message-type':
            return done({ replyMessage: args[0] + args[1] });
        default:
            throw new Error('not supported');
            break;
    }
});
```

Here, setHandler processes different message types by evaluating type and handling arguments dynamically, supporting a more flexible approach for multiple message types.

#### Listening for Messages with `on`

For non-async handling or simpler message processing, use the `on` method. This method listens for the specified message type and triggers the callback whenever a message of that type is received.

```typescript
transport.on('message-type', (message, value) => {
    message // 'Hello'
    value // 42
});
```

The `on` method allows for direct handling of the `message-type` messages with immediate access to message and value parameters, ideal for non-blocking message handling.

For more detailed examples and test cases, refer to the message.transport.test.ts file in the typed-message-transport repository.
