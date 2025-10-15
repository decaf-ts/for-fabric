[![Banner](./workdocs/assets/Banner.png)](https://decaf-ts.github.io/ts-workspace/)
## Hyperledger Fabric Integration for DECAF

A TypeScript library that provides seamless integration with Hyperledger Fabric networks, offering both client-side connectivity and chaincode contract development capabilities. It extends the DECAF database abstraction framework to work with Fabric's ledger, enabling consistent data access patterns across different storage technologies.


![Licence](https://img.shields.io/github/license/decaf-ts/for-fabric.svg?style=plastic)
![GitHub language count](https://img.shields.io/github/languages/count/decaf-ts/for-fabric?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/decaf-ts/for-fabric?style=plastic)

[![Build & Test](https://github.com/decaf-ts/for-fabric/actions/workflows/nodejs-build-prod.yaml/badge.svg)](https://github.com/decaf-ts/for-fabric/actions/workflows/nodejs-build-prod.yaml)
[![CodeQL](https://github.com/decaf-ts/for-fabric/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/decaf-ts/for-fabric/actions/workflows/codeql-analysis.yml)[![Snyk Analysis](https://github.com/decaf-ts/for-fabric/actions/workflows/snyk-analysis.yaml/badge.svg)](https://github.com/decaf-ts/for-fabric/actions/workflows/snyk-analysis.yaml)
[![Pages builder](https://github.com/decaf-ts/for-fabric/actions/workflows/pages.yaml/badge.svg)](https://github.com/decaf-ts/for-fabric/actions/workflows/pages.yaml)
[![.github/workflows/release-on-tag.yaml](https://github.com/decaf-ts/for-fabric/actions/workflows/release-on-tag.yaml/badge.svg?event=release)](https://github.com/decaf-ts/for-fabric/actions/workflows/release-on-tag.yaml)

![Open Issues](https://img.shields.io/github/issues/decaf-ts/for-fabric.svg)
![Closed Issues](https://img.shields.io/github/issues-closed/decaf-ts/for-fabric.svg)
![Pull Requests](https://img.shields.io/github/issues-pr-closed/decaf-ts/for-fabric.svg)
![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

![Forks](https://img.shields.io/github/forks/decaf-ts/for-fabric.svg)
![Stars](https://img.shields.io/github/stars/decaf-ts/for-fabric.svg)
![Watchers](https://img.shields.io/github/watchers/decaf-ts/for-fabric.svg)

![Node Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=Node&query=$.engines.node&colorB=blue)
![NPM Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=NPM&query=$.engines.npm&colorB=purple)

Documentation available [here](https://decaf-ts.github.io/for-fabric/)

### Description

The @decaf-ts/for-fabric library provides a comprehensive integration layer between the DECAF framework and Hyperledger Fabric blockchain networks. It is designed to simplify the development of both client applications that interact with Fabric networks and chaincode (smart contracts) that run on those networks.

#### Client-Side Features

The client module offers a robust set of tools for connecting to and interacting with Fabric networks:

- **FabricAdapter**: Extends the CouchDBAdapter to provide a familiar interface for CRUD operations against Fabric chaincode. It handles connection management, transaction submission, and query evaluation.

- **FabricDispatch**: Listens for and processes events emitted by Fabric chaincode, enabling real-time updates and event-driven architectures.

- **Fabric File System Utilities**: Simplifies working with Fabric identities, certificates, and private keys, with support for both Node.js and browser environments.

#### Chaincode Features

The contracts module provides a framework for developing Fabric chaincode with TypeScript:

- **FabricContractAdapter**: Adapts the DECAF database interface to work within Fabric chaincode, providing access to the state database.

- **FabricContractRepository**: Implements the Repository pattern for Fabric chaincode, enabling model-driven data access.

- **FabricCrudContract**: An abstract base class that provides standard CRUD operations for chaincode models, reducing boilerplate code.

- **Event Handling**: Built-in support for emitting and handling chaincode events, facilitating communication between chaincode and client applications.

#### Integration with DECAF

This library seamlessly integrates with other DECAF components:

- Uses the decorator-validation library for model validation
- Extends the db-decorators framework for consistent data access
- Leverages the core DECAF patterns and abstractions

By providing a consistent interface across different storage technologies, @decaf-ts/for-fabric enables developers to write applications that can work with both traditional databases and blockchain ledgers with minimal code changes.


### How to Use

## Installation

```bash
npm install @decaf-ts/for-fabric
```

## Client-Side Usage

### Connecting to a Fabric Network

```typescript
import { FabricAdapter, PeerConfig } from '@decaf-ts/for-fabric';

// Configure connection to a Fabric peer
const config: PeerConfig = {
  mspId: 'Org1MSP',
  peerEndpoint: 'localhost:7051',
  channelName: 'mychannel',
  chaincodeName: 'mycc',
  contractName: 'mycontract',
  tlsCertPath: '/path/to/tls/cert',
  certDirectoryPath: '/path/to/cert/dir',
  keyDirectoryPath: '/path/to/key/dir',
  cryptoPath: '/path/to/crypto',
  peerHostAlias: 'peer0.org1.example.com',
  caEndpoint: 'localhost:7054',
  caTlsCertificate: '/path/to/ca/tls/cert',
  caCert: '/path/to/ca/cert',
  caKey: '/path/to/ca/key',
  ca: 'ca.org1.example.com'
};

// Create an adapter instance
const adapter = new FabricAdapter(config, 'org1-adapter');

// Use the adapter to interact with the Fabric network
async function createAsset() {
  const asset = { id: 'asset1', value: 'Asset 1 Value' };
  return await adapter.create('assets', 'asset1', asset, {}, mySerializer);
}

async function readAsset(id: string) {
  return await adapter.read('assets', id, mySerializer);
}

async function updateAsset(id: string, newValue: string) {
  const asset = await readAsset(id);
  asset.value = newValue;
  return await adapter.update('assets', id, asset, {}, mySerializer);
}

async function deleteAsset(id: string) {
  return await adapter.delete('assets', id, mySerializer);
}

async function queryAssets(owner: string) {
  const query = {
    selector: {
      owner: owner
    }
  };
  return await adapter.raw(query, true);
}
```

### Listening for Chaincode Events

```typescript
import { FabricAdapter, FabricDispatch } from '@decaf-ts/for-fabric';

async function setupEventListener(config: PeerConfig) {
  // Create a client
  const client = await FabricAdapter.getClient(config);

  // Create a dispatch instance
  const dispatch = new FabricDispatch(client);

  // Configure the dispatch with peer configuration
  dispatch.configure(config);

  // Register an observer for a specific table and event
  dispatch.observe('assets', 'create', (id) => {
    console.log(`Asset created: ${id}`);
    // Fetch the new asset or update UI
  });

  // Start listening for events
  await dispatch.start();

  // When done, close the connection
  // await dispatch.close();
}
```

### Working with Identities and Certificates

```typescript
import { 
  getIdentity, 
  getSigner, 
  readFile, 
  getCAUser 
} from '@decaf-ts/for-fabric';

async function setupIdentity() {
  // Read a certificate file
  const tlsCert = await readFile('/path/to/tls/cert');

  // Get an identity from a certificate directory
  const identity = await getIdentity('Org1MSP', '/path/to/cert/dir');

  // Get a signer from a key directory
  const signer = await getSigner('/path/to/key/dir');

  // Create a CA user
  const user = await getCAUser(
    'user1', 
    privateKeyPem, 
    certificatePem, 
    'Org1MSP'
  );

  return { identity, signer, user };
}
```

## Chaincode Development

### Creating a Model

```typescript
import { Model, id, property, table } from '@decaf-ts/decorator-validation';

@table('assets')
export class Asset extends Model {
  @id()
  id: string;

  @property()
  value: string;

  @property()
  owner: string;

  @property()
  createdAt: number;
}
```

### Creating a CRUD Contract

```typescript
import { FabricCrudContract } from '@decaf-ts/for-fabric';
import { Context, Contract, Info, Transaction } from 'fabric-contract-api';
import { Asset } from './asset';

@Info({ title: 'AssetContract', description: 'Smart contract for trading assets' })
export class AssetContract extends FabricCrudContract<Asset> {
  constructor() {
    super('AssetContract', Asset);
  }

  // The base class already provides standard CRUD operations:
  // create, read, update, delete, createAll, readAll, updateAll, deleteAll

  // Add custom methods as needed
  @Transaction()
  async getAssetHistory(ctx: Context, id: string): Promise<any[]> {
    const stub = ctx.stub;
    const iterator = await stub.getHistoryForKey(id);

    const results = [];
    let result = await iterator.next();

    while (!result.done) {
      const value = result.value;
      results.push({
        txId: value.txId,
        timestamp: value.timestamp,
        value: JSON.parse(value.value.toString('utf8'))
      });

      result = await iterator.next();
    }

    await iterator.close();
    return results;
  }

  @Transaction()
  async transferAsset(ctx: Context, id: string, newOwner: string): Promise<Asset> {
    const asset = await this.read(ctx, id);
    asset.owner = newOwner;
    return await this.update(ctx, asset);
  }
}
```

### Using the Contract Adapter Directly

```typescript
import { FabricContractAdapter } from '@decaf-ts/for-fabric';
import { Context, Contract, Transaction } from 'fabric-contract-api';

export class CustomContract extends Contract {
  private adapter: FabricContractAdapter;

  constructor() {
    super('CustomContract');
    this.adapter = new FabricContractAdapter();
  }

  @Transaction()
  async createRecord(ctx: Context, id: string, data: string): Promise<any> {
    const record = { id, data, timestamp: Date.now() };
    return await this.adapter.create(
      'records',
      id,
      record,
      {},
      { stub: ctx.stub, logger: ctx.logging }
    );
  }

  @Transaction(false)
  async queryRecords(ctx: Context, owner: string): Promise<any[]> {
    const query = {
      selector: {
        owner: owner
      }
    };

    return await this.adapter.raw(
      query,
      true,
      { stub: ctx.stub, logger: ctx.logging }
    );
  }
}
```

### Emitting and Handling Events

```typescript
import { 
  FabricContractRepositoryObservableHandler,
  generateFabricEventName,
  parseEventName
} from '@decaf-ts/for-fabric';
import { Context } from 'fabric-contract-api';
import { OperationKeys } from '@decaf-ts/db-decorators';

// In chaincode: Emit an event
async function emitEvent(ctx: Context, tableName: string, id: string) {
  const handler = new FabricContractRepositoryObservableHandler();
  const logger = ctx.logging.getLogger('EventHandler');

  await handler.updateObservers(
    logger,
    tableName,
    OperationKeys.CREATE,
    id,
    { stub: ctx.stub }
  );
}

// In client: Parse an event name
function handleEvent(eventName: string, payload: Buffer) {
  const { table, event, owner } = parseEventName(eventName);
  const data = JSON.parse(payload.toString());

  console.log(`Received ${event} event for ${table} with ID ${data.id}`);
  if (owner) {
    console.log(`Event owner: ${owner}`);
  }
}
```

For more detailed examples and API documentation, refer to the [API Reference](./docs/api/index.html).


### Related

[![Readme Card](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=ts-workspace)](https://github.com/decaf-ts/ts-workspace)

### Social

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/decaf-ts/)




#### Languages

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ShellScript](https://img.shields.io/badge/Shell_Script-121011?style=for-the-badge&logo=gnu-bash&logoColor=white)

## Getting help

If you have bug reports, questions or suggestions please [create a new issue](https://github.com/decaf-ts/ts-workspace/issues/new/choose).

## Contributing

I am grateful for any contributions made to this project. Please read [this](./workdocs/98-Contributing.md) to get started.

## Supporting

The first and easiest way you can support it is by [Contributing](./workdocs/98-Contributing.md). Even just finding a typo in the documentation is important.

Financial support is always welcome and helps keep both me and the project alive and healthy.

So if you can, if this project in any way. either by learning something or simply by helping you save precious time, please consider donating.

## License

This project is released under MIT with an AGPL-3.0 trigger for AI-generated code usage; see [LICENSE.md](./LICENSE.md) for full terms.

By developers, for developers...