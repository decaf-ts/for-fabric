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


## Contracts APIs (Chaincode)

The following examples are based on the contracts in for-fabric/src/contracts and reflect the patterns used by the unit/integration tests.

### FabricCrudContract<M>

Description: Base contract exposing CRUD endpoints for a model class. It uses Repository and DeterministicSerializer under the hood.

```typescript
import { Context, Transaction, Contract } from 'fabric-contract-api';
import { model, ModelArg, required } from '@decaf-ts/decorator-validation';
import { BaseModel, pk } from '@decaf-ts/core';
import { FabricCrudContract } from '@decaf-ts/for-fabric/contracts';

@model()
class Person extends BaseModel {
  @pk({ type: 'Number' })
  id!: number;
  @required() name!: string;
  constructor(arg?: ModelArg<Person>) { super(arg); }
}

export class PersonContract extends FabricCrudContract<Person> {
  constructor() {
    super('PersonContract', Person);
  }

  @Transaction(false)
  async ping(ctx: Context): Promise<string> {
    // Uses FabricCrudContract.logFor
    this.logFor(ctx).info('ping');
    return 'pong';
  }
}
```

Usage in tests: see tests/unit/contracts.test.ts pattern where a SerializedCrudContract subclass is exercised; FabricCrudContract is similar but takes/returns objects instead of JSON strings.

### SerializedCrudContract<M>

Description: Same endpoints as FabricCrudContract but takes and returns JSON strings. Useful for simple clients. Based on tests/unit/contracts.test.ts.

```typescript
import { Context } from 'fabric-contract-api';
import { model, ModelArg, required } from '@decaf-ts/decorator-validation';
import { BaseModel, pk } from '@decaf-ts/core';
import { SerializedCrudContract } from '@decaf-ts/for-fabric/contracts';

@model()
class TestModel extends BaseModel {
  @pk({ type: 'Number' }) id!: number;
  @required() name!: string;
  @required() nif!: string;
  constructor(arg?: ModelArg<TestModel>) { super(arg); }
}

export class TestModelContract extends SerializedCrudContract<TestModel> {
  constructor() {
    super('TestModelContract', TestModel);
  }
}

// Example invocation (mirrors unit test usage)
async function createExample(contract: TestModelContract, ctx: Context) {
  const payload = new TestModel({ name: 'Alice', nif: '123456789' }).serialize();
  const resultJson = await contract.create(ctx, payload);
  const created = new TestModel(JSON.parse(resultJson));
  return created;
}
```

### FabricContractRepository<M>

Description: Chaincode-side repository used inside contract methods to persist and query models.

```typescript
import { Context } from 'fabric-contract-api';
import { Repo } from '@decaf-ts/core';
import { model, required, ModelArg } from '@decaf-ts/decorator-validation';
import { BaseModel, pk } from '@decaf-ts/core';
import { FabricContractRepository } from '@decaf-ts/for-fabric/contracts';

@model()
class Asset extends BaseModel {
  @pk() id!: string;
  @required() owner!: string;
  constructor(arg?: ModelArg<Asset>) { super(arg); }
}

export class AssetContract extends Contract {
  private repo: Repo<Asset, any, any, any, any>;
  constructor() {
    super('AssetContract');
    this.repo = new FabricContractRepository<Asset>(new (require('@decaf-ts/for-fabric').contracts.FabricContractAdapter)(), Asset);
  }

  @Transaction()
  async Create(ctx: Context, id: string, owner: string): Promise<void> {
    const m = new Asset({ id, owner });
    await this.repo.create(m, ctx as any);
  }

  @Transaction(false)
  async Read(ctx: Context, id: string): Promise<Asset> {
    return this.repo.read(id, ctx as any);
  }

  @Transaction(false)
  async QueryByOwner(ctx: Context, owner: string): Promise<Asset[]> {
    return this.repo.raw({ selector: { owner } } as any, true, ctx as any);
  }
}
```

### FabricContractDBSequence

Description: World-state backed sequences for generating incremental values.

```typescript
import { Context } from 'fabric-contract-api';
import { FabricContractDBSequence } from '@decaf-ts/for-fabric/contracts';
import { FabricContractAdapter } from '@decaf-ts/for-fabric/contracts';

const adapter = new FabricContractAdapter();

export class OrderContract extends Contract {
  private orderSeq = new FabricContractDBSequence({
    name: 'orderSeq',
    type: 'Number',
    startWith: 1,
    incrementBy: 1,
  }, adapter);

  @Transaction()
  async CreateOrder(ctx: Context): Promise<number> {
    const next = await this.orderSeq.next(ctx as any);
    // use next as order id
    return next as number;
  }

  @Transaction(false)
  async NextRange(ctx: Context, count: number): Promise<number[]> {
    return (await this.orderSeq.range(count, ctx as any)) as number[];
  }
}
```

### FabricStatement<M,R>

Description: Bridge to run Mango queries through the Fabric adapter and get typed models back; used internally by repositories and also directly in advanced cases. See tests/unit/erc20conttract.test.ts mocking CouchDBStatement processing.

```typescript
import { FabricStatement } from '@decaf-ts/for-fabric/contracts';
import { FabricContractAdapter } from '@decaf-ts/for-fabric/contracts';
import { FabricContractContext } from '@decaf-ts/for-fabric/contracts';
import { MangoQuery } from '@decaf-ts/for-couchdb';
import { Model } from '@decaf-ts/decorator-validation';

class MyModel extends Model {}

const adapter = new FabricContractAdapter();

async function query(ctx: FabricContractContext) {
  const stmt = new FabricStatement<MyModel, MyModel[]>(adapter, ctx);
  const models = await stmt.raw<MyModel[]>({ selector: { type: 'MyModel' } } as MangoQuery);
  return models;
}
```

### ContractLogger

Description: Context-aware logger bound to Fabric’s Context, honoring log levels.

```typescript
import { Context, Transaction } from 'fabric-contract-api';
import { Contract } from 'fabric-contract-api';
import { ContractLogger } from '@decaf-ts/for-fabric/contracts';

export class LoggableContract extends Contract {
  @Transaction()
  async DoWork(ctx: Context): Promise<void> {
    const log = new ContractLogger('LoggableContract', { level: 'info' }, ctx as any);
    log.info('Starting work');
    // ... work ...
    log.debug('Finished');
  }
}
```

### FabricContractRepositoryObservableHandler

Description: Emits Fabric events for repository operations. You can also use it directly to emit a custom event.

```typescript
import { FabricContractRepositoryObservableHandler } from '@decaf-ts/for-fabric/contracts';
import { OperationKeys } from '@decaf-ts/db-decorators';
import { FabricContractContext } from '@decaf-ts/for-fabric/contracts';
import { MiniLogger } from '@decaf-ts/logging';

async function emitExample(ctx: FabricContractContext) {
  const handler = new FabricContractRepositoryObservableHandler();
  const log = new MiniLogger('obs');
  await handler.updateObservers(log as any, 'assets', OperationKeys.CREATE, 'asset1', ctx);
}
```

### FabricContractContext

Description: Access Fabric-specific context inside contracts.

```typescript
import { FabricContractContext } from '@decaf-ts/for-fabric/contracts';

function readContext(ctx: FabricContractContext) {
  const ts = ctx.timestamp; // Date from stub.getDateTimestamp()
  const id = ctx.identity.getID();
  ctx.logger.info(`Tx by ${id} at ${ts.toISOString()}`);
}
```

### FabricERC20Contract (sample)

Description: Full ERC20 implementation used in tests (see tests/unit/erc20conttract.test.ts).

```typescript
import { FabricERC20Contract } from '@decaf-ts/for-fabric/contracts';
import { FabricContractContext } from '@decaf-ts/for-fabric/contracts';

const contract = new FabricERC20Contract('TestToken');

async function initAndRead(ctx: FabricContractContext) {
  const created = await contract.Initialize(ctx, 'TestToken', 'TT', 18);
  if (created) {
    const name = await contract.TokenName(ctx);
    const decimals = await contract.Decimals(ctx);
    return { name, decimals };
  }
  throw new Error('Init failed');
}
```

### Notes on tests as examples

- tests/unit/contracts.test.ts shows creating a SerializedCrudContract and calling create(ctx, jsonPayload) with a mocked Fabric Context.
- tests/unit/erc20conttract.test.ts demonstrates initializing the ERC20 contract and reading TokenName.
- tests/integration/Serialized-Contract.test.ts shows end-to-end JSON-based CRUD flows via the serialized contract, including create, read, update and rich queries.

These patterns are mirrored in the examples above to ensure correctness and consistency with the repository’s test suite.
