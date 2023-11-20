# aztec-dex

### Aztec simplest implementation of an AMM DEX

#### Prerequisites:

`Node.js >= v18 (recommend installing with nvm)`

`Docker and Docker Compose (Docker Desktop under WSL2 on windows)`

`Aztec Sandbox/cli: /bin/bash -c "$(curl -fsSL 'https://sandbox.aztec.network')"`

#### To build smart contract:

`aztec-cli compile --typescript ./../../test/fixtures contracts/dex`

#### To test smart contract:

`npm ci` (--force may be needed)

`yarn test`
