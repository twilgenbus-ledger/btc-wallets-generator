# btc-wallets-generator

This is a simple generator of BIP49 wallets in testnet

## Installation

Requires node v11

```
npm install
```

## Usage
```
npx ts-node src/index.ts --nb_addresses 1 --transactions 1
```
The output gives a transaction to fund the wallet. You can broadcast it from here: https://live.blockcypher.com/btc-testnet/pushtx/

## Funds

To allow the creation of the wallet with transactions, the script uses a pre-founded BIP49 wallet (only index 0 of HD wallet is used). It can be replaced by providing a new set of mnemonics with the option `--faucet_mnemonics`.
