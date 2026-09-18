# Deployment

Standalone Hyperledger Fabric infrastructure deployment for decaf-ts.
Boots a 3-organization network (**orga**, **orgb**, **orgc**), deploys the
`simple-chaincode` contract, onboards the partner organizations, runs the
end-to-end test suites and shuts everything down again.

## Prerequisites

- **Node.js** >= 20.9.0
- **Docker** + **docker compose** (with the compose plugin) running locally
- Root workspace dependencies installed:

  ```bash
  # from the repository root (for-fabric/)
  npm install
  ```

- Deployment package dependencies installed:

  ```bash
  # from deployment/
  npm run do-install   # uses ../.npmtoken
  ```

> **Note:** the test suites are run with jest from the `deployment/` folder,
> but the e2e tests import library code that is compiled to `lib/cjs` in the
> repository root. If you have changed library sources, run `npm run build`
> in the repository root before running the tests.

## Ports

| Org  | TLS (apiserver) | CA    | Peer  |
| ---- | --------------- | ----- | ----- |
| orga | 7100            | 7110  | 7150  |
| orgb | 7200            | 7210  | 7250  |
| orgc | 7300            | 7310  | 7350  |

Make sure these ports are free before booting.

## 1. Boot the infrastructure (orga + orgb + orgc)

From the **repository root** (`for-fabric/`):

```bash
npm run test:infrastructure:up
```

This single command (≈ 5-6 minutes):

1. Boots the base network and orga's containers (orderers, peers, couchdbs,
   CA, tls CA, tools, ccaas).
2. Builds and deploys the `simple-chaincode` contract on channel
   `simple-channel`.
3. Onboards **orgb** and **orgc** (CA, TLS CA, peer, ccaas) and joins them to
   the channel.
4. Runs the org setup test suite (`deployment/tests/e2e/setup.test.ts`), which
   validates the deployed infrastructure and copies the orgb crypto material
   to `deployment/docker/docker-data`.

When it finishes you should see the three organizations' containers up
(`docker ps`) and the setup suite passing.

## 2. Run the tests

Still from the **repository root** (the scripts delegate into
`deployment/`):

```bash
# contract transaction tests against orga (peer localhost:7150)
npm run test:infrastructure:transactions

# client SDK tests against orgb (CA https://localhost:7210, peer localhost:7250)
npm run test:client
```

Or, equivalently, from inside `deployment/`:

```bash
npm run test:transactions
npm run test:client
```

- `transactions.test.ts` — registers/enrolls an admin on orga and performs
  create/read/update/delete operations through the client SDK.
- `orgb-client.test.ts` — configures the orgb CA and peer, enrolls a test
  user and creates/reads an `OtherProduct` record through the client SDK.

Both suites are expected to pass with the infrastructure up.

## 3. Shut the infrastructure down

From the **repository root**:

```bash
npm run test:infrastructure:down
```

This tears down **orgc** and **orgb** (onboard shutdown) and then the base
network and orga, removes the compose stack, networks, volumes and the local
`docker-data` folder.

To confirm everything is gone:

```bash
docker ps -a --format '{{.Names}}' | grep -E '^org[abc]-'   # empty
docker network ls --format '{{.Name}}' | grep -E '^org[abc]_' # empty
docker volume ls --format '{{.Name}}' | grep -E '^org[abc]-'  # empty
```

## Troubleshooting

- **Port conflicts** — stop any containers/processes bound to ports
  7100-7360 before booting.
- **Stale state** — if a previous run failed mid-way, run
  `npm run test:infrastructure:down` (and, if needed,
  `docker rm -f $(docker ps -aq --filter name=org)`), then boot again.
- **CA enrollment failures** — make sure `docker/docker-data` was freshly
  copied (`copy:crypto`) after the latest boot; stale certificates from a
  previous network are rejected.
