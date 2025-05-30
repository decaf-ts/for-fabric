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
